<?php
/**
 * Plugin Name: Leapmotor Formidable Dealer Assignment
 * Description: Bietet den Leapmotor-Formularen die drei nächsten Händler an und überträgt Leads zentral.
 * Version: 2.1.3
 * Author: DriveDesk
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

final class Leapmotor_Formidable_Dealer {
	const VERSION = '2.1.3';
	const API_URL = 'https://leapmotor.tt.kevingarre.de/rest/v1/rpc/nearest_dealers_for_zip';
	const SYNC_URL = 'https://leapmotor.tt.kevingarre.de/rest/v1/rpc/submit_external_lead';
	const OPTION_CLIENT_ID = 'leapmotor_integration_client_id';
	const OPTION_TOKEN = 'leapmotor_integration_token';
	const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImxlYXAtcmFsbHkifQ.FbPOePASGJO6vN73Cs1jwdot17Uo3s-2NK52RyN0-xM';

	private static $lookup_cache = array();
	private static $validated_assignments = array();

	public static function forms() {
		return array(
			7 => array(
				'form_id' => 7, 'form_key' => 'leaptischte26', 'source_event' => 'leapmotor-tischtennis-gewinnspiel',
				'event_id' => 'b7be91e4-f2d4-4134-ab39-d025f5f93843',
				'contact' => 96, 'model' => 97, 'zip' => 98, 'name' => 99, 'email' => 100, 'phone' => 101,
				'consent_email' => 104, 'consent_profile' => 106, 'consent_partner' => 108, 'city' => 125,
			),
			8 => array(
				'form_id' => 8, 'form_key' => 'leape42026', 'source_event' => 'leapmotor-e4-testival',
				'event_id' => 'b7be91e4-f2d4-4134-ab39-d025f5f93843',
				'contact' => null, 'model' => null, 'zip' => 130, 'name' => 132, 'email' => 133, 'phone' => 134,
				'consent_email' => 137, 'consent_profile' => 139, 'consent_partner' => 141, 'city' => 131,
			),
		);
	}

	public static function form_config( $form_id ) {
		$forms = self::forms();
		return $forms[ (int) $form_id ] ?? null;
	}

	public static function boot() {
		register_activation_hook( __FILE__, array( __CLASS__, 'activate' ) );
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_upgrade' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'frm_validate_field_entry', array( __CLASS__, 'validate_zip' ), 8, 3 );
		add_action( 'frm_after_create_entry', array( __CLASS__, 'save_assignment' ), 20, 2 );
		add_action( 'frm_after_update_entry', array( __CLASS__, 'save_assignment' ), 20, 2 );
		add_action( 'frm_before_destroy_entry', array( __CLASS__, 'delete_assignment' ), 20, 1 );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 30 );
		add_action( 'admin_post_leapmotor_emea_export', array( __CLASS__, 'export' ) );
		add_action( 'admin_post_leapmotor_integration_settings', array( __CLASS__, 'save_settings' ) );
		add_action( 'admin_post_leapmotor_resync', array( __CLASS__, 'resync' ) );
	}

	public static function table_name() {
		global $wpdb;
		return $wpdb->prefix . 'leapmotor_dealer_assignments';
	}

	public static function delete_assignment( $entry_id ) {
		global $wpdb; $wpdb->delete( self::table_name(), array( 'entry_id' => (int) $entry_id ), array( '%d' ) );
	}

	public static function activate() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table = self::table_name();
		$charset = $wpdb->get_charset_collate();
		dbDelta( "CREATE TABLE {$table} (
			entry_id bigint(20) unsigned NOT NULL,
			lead_zip varchar(5) NOT NULL,
			lead_city varchar(190) NOT NULL,
			dealer_code varchar(64) NOT NULL,
			dealer_site_code varchar(64) NULL,
			dealer_name varchar(255) NOT NULL,
			dealer_address varchar(255) NOT NULL,
			dealer_city varchar(190) NOT NULL,
			dealer_zip varchar(5) NOT NULL,
			dealer_distance_km decimal(8,2) NOT NULL,
			dealer_data_version varchar(64) NOT NULL,
			dealer_selection_mode varchar(16) NOT NULL DEFAULT 'user',
			dealer_rank smallint NOT NULL DEFAULT 1,
			sync_status varchar(16) NOT NULL DEFAULT 'pending',
			sync_error text NULL,
			synced_at datetime NULL,
			assigned_at datetime NOT NULL,
			PRIMARY KEY  (entry_id)
		) {$charset};" );
		update_option( 'leapmotor_formidable_dealer_db_version', '2.0.0', false );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'leapmotor_formidable_dealer_db_version' ) !== '2.0.0' ) { self::activate(); }
	}

	public static function register_rest() {
		register_rest_route( 'leapmotor/v1', '/dealer', array(
			'methods' => 'GET',
			'permission_callback' => '__return_true',
			'args' => array( 'zip' => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ) ),
			'callback' => function( WP_REST_Request $request ) {
				$result = self::lookup( $request->get_param( 'zip' ) );
				return is_wp_error( $result ) ? $result : rest_ensure_response( self::public_assignment( $result ) );
			},
		) );
	}

	public static function enqueue() {
		if ( is_admin() ) { return; }
		wp_enqueue_style( 'leapmotor-formidable-dealer', plugins_url( 'assets/form.css', __FILE__ ), array(), self::VERSION );
		wp_enqueue_script( 'leapmotor-formidable-dealer', plugins_url( 'assets/form.js', __FILE__ ), array(), self::VERSION, true );
		$forms = array();
		foreach ( self::forms() as $config ) {
			$forms[] = array( 'formId' => $config['form_id'], 'formKey' => $config['form_key'], 'zipField' => $config['zip'], 'cityField' => $config['city'] );
		}
		wp_localize_script( 'leapmotor-formidable-dealer', 'LeapmotorDealer', array(
			'forms' => $forms,
			'endpoint' => esc_url_raw( rest_url( 'leapmotor/v1/dealer' ) ),
			'labels' => array( 'loading' => 'Händler werden ermittelt …', 'error' => 'Für diese PLZ konnten keine Händler ermittelt werden.', 'title' => 'Wähle deinen Leapmotor-Händler' ),
		) );
	}

	public static function validate_zip( $errors, $field, $value ) {
		$config = self::form_config( $field->form_id );
		if ( ! $config || (int) $field->id !== $config['zip'] ) { return $errors; }
		$zip = trim( (string) $value );
		$contact = $config['contact'] && isset( $_POST['item_meta'][ $config['contact'] ] ) ? sanitize_text_field( wp_unslash( $_POST['item_meta'][ $config['contact'] ] ) ) : '';
		if ( $contact === 'nein, vorerst nicht' && $zip === '' ) { return $errors; }
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) {
			$errors[ 'field' . $config['zip'] ] = 'Bitte gib eine gültige fünfstellige PLZ ein.';
			return $errors;
		}
		$dealers = self::lookup( $zip );
		if ( is_wp_error( $dealers ) ) {
			$errors[ 'field' . $config['zip'] ] = 'Die Händlerzuordnung ist gerade nicht verfügbar. Bitte versuche es erneut.';
			return $errors;
		}
		$selected_code = isset( $_POST['leapmotor_dealer_code'] ) ? sanitize_text_field( wp_unslash( $_POST['leapmotor_dealer_code'] ) ) : '';
		$assignment = self::select_assignment( $dealers, $selected_code );
		if ( ! $assignment ) {
			$errors[ 'field' . $config['zip'] ] = 'Bitte wähle einen der drei angezeigten Händler aus.';
			return $errors;
		}
		self::$validated_assignments[ $config['form_id'] ] = $assignment;
		$_POST['item_meta'][ $config['zip'] ] = $zip;
		$_POST['item_meta'][ $config['city'] ] = $assignment['lead_city'];
		return $errors;
	}

	public static function save_assignment( $entry_id, $form_id ) {
		$config = self::form_config( $form_id );
		if ( ! $config ) { return; }
		$meta = self::entry_meta( $entry_id, $config );
		$zip = self::lead_zip( $meta, $config['zip'], $_POST );
		$meta[ $config['zip'] ] = $zip;
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { return; }
		$a = self::$validated_assignments[ $config['form_id'] ] ?? null;
		if ( ! is_array( $a ) ) {
			$dealers = self::lookup( $zip );
			$selected_code = isset( $_POST['leapmotor_dealer_code'] ) ? sanitize_text_field( wp_unslash( $_POST['leapmotor_dealer_code'] ) ) : '';
			$a = is_wp_error( $dealers ) ? null : self::select_assignment( $dealers, $selected_code );
		}
		if ( ! is_array( $a ) ) { return; }
		self::persist_entry_meta( $entry_id, $config['zip'], $zip );
		self::persist_entry_meta( $entry_id, $config['city'], $a['lead_city'] );
		self::persist_assignment( $entry_id, $zip, $a );
		$meta[ $config['city'] ] = $a['lead_city'];
		self::sync_entry( $entry_id, $config, $a, $meta );
	}

	public static function lead_zip( $meta, $field_id, $post ) {
		$zip = isset( $meta[ $field_id ] ) ? trim( sanitize_text_field( $meta[ $field_id ] ) ) : '';
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) && isset( $post['leapmotor_lead_zip'] ) ) { $zip = trim( sanitize_text_field( wp_unslash( $post['leapmotor_lead_zip'] ) ) ); }
		return preg_match( '/^[0-9]{5}$/', $zip ) ? $zip : '';
	}

	public static function entry_meta( $entry_id, $config ) {
		$posted = isset( $_POST['item_meta'] ) && is_array( $_POST['item_meta'] ) ? wp_unslash( $_POST['item_meta'] ) : array();
		$ids = array_filter( array( $config['contact'], $config['model'], $config['zip'], $config['city'], $config['name'], $config['email'], $config['phone'], $config['consent_email'], $config['consent_profile'], $config['consent_partner'] ) );
		$meta = array();
		foreach ( $ids as $field_id ) {
			if ( array_key_exists( $field_id, $posted ) ) { $meta[ $field_id ] = $posted[ $field_id ]; }
		}
		if ( count( $meta ) < count( $ids ) ) {
			global $wpdb;
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT field_id,meta_value FROM {$wpdb->prefix}frm_item_metas WHERE item_id=%d", (int) $entry_id ), ARRAY_A );
			foreach ( $rows as $row ) {
				$field_id = (int) $row['field_id'];
				if ( in_array( $field_id, $ids, true ) && ! array_key_exists( $field_id, $meta ) ) { $meta[ $field_id ] = maybe_unserialize( $row['meta_value'] ); }
			}
		}
		return $meta;
	}

	private static function persist_entry_meta( $entry_id, $field_id, $value ) {
		if ( class_exists( 'FrmEntryMeta' ) ) { FrmEntryMeta::update_entry_meta( (int) $entry_id, (int) $field_id, null, sanitize_text_field( $value ) ); }
	}

	public static function export_zip( $meta_zip, $assignment_zip ) {
		$meta_zip = trim( sanitize_text_field( $meta_zip ) );
		if ( preg_match( '/^[0-9]{5}$/', $meta_zip ) ) { return $meta_zip; }
		$assignment_zip = trim( sanitize_text_field( $assignment_zip ) );
		return preg_match( '/^[0-9]{5}$/', $assignment_zip ) ? $assignment_zip : '';
	}

	private static function persist_assignment( $entry_id, $zip, $a ) {
		global $wpdb;
		$wpdb->replace( self::table_name(), array(
			'entry_id' => (int) $entry_id, 'lead_zip' => $zip, 'lead_city' => $a['lead_city'],
			'dealer_code' => $a['dealer_code'], 'dealer_site_code' => $a['site_code'], 'dealer_name' => $a['name'],
			'dealer_address' => $a['address'], 'dealer_city' => $a['city'], 'dealer_zip' => $a['zip'],
			'dealer_distance_km' => $a['distance_km'], 'dealer_data_version' => $a['data_version'],
			'dealer_selection_mode' => 'user', 'dealer_rank' => (int) $a['rank'], 'sync_status' => 'pending', 'sync_error' => null,
			'assigned_at' => current_time( 'mysql', true ),
		), array( '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%f', '%s', '%s', '%d', '%s', '%s', '%s' ) );
	}

	public static function lookup( $zip ) {
		$zip = trim( (string) $zip );
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { return new WP_Error( 'invalid_zip', 'Ungültige PLZ.', array( 'status' => 400 ) ); }
		if ( isset( self::$lookup_cache[ $zip ] ) ) { return self::$lookup_cache[ $zip ]; }
		$cached = get_transient( 'leapmotor_dealers_v2_' . $zip );
		if ( is_array( $cached ) && isset( $cached[0]['dealer_code'], $cached[0]['rank'] ) ) { self::$lookup_cache[ $zip ] = $cached; return $cached; }
		$response = wp_remote_post( self::API_URL, array(
			'timeout' => 8,
			'headers' => array( 'apikey' => self::API_KEY, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ),
			'body' => wp_json_encode( array( 'p_zip' => $zip, 'p_limit' => 3 ) ),
		) );
		if ( is_wp_error( $response ) ) { return new WP_Error( 'lookup_unavailable', 'Lookup nicht erreichbar.', array( 'status' => 503 ) ); }
		$code = wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		$required = array( 'dealer_code', 'site_code', 'name', 'address', 'city', 'zip', 'distance_km', 'lead_city', 'data_version', 'rank' );
		if ( $code !== 200 || ! is_array( $data ) || count( $data ) < 1 || count( $data ) > 3 ) {
			return new WP_Error( 'lookup_failed', 'Keine Händlerzuordnung gefunden.', array( 'status' => $code === 400 ? 400 : 503 ) );
		}
		foreach ( $data as &$dealer ) {
			if ( ! is_array( $dealer ) || array_diff( $required, array_keys( $dealer ) ) ) { return new WP_Error( 'lookup_failed', 'Ungültige Händlerantwort.', array( 'status' => 503 ) ); }
			$dealer = array_map( 'sanitize_text_field', $dealer );
			if ( ! preg_match( '/^[0-9]{1,3}$/', $dealer['site_code'] ) ) { return new WP_Error( 'lookup_failed', 'Ungültige Händler-Standortkennung.', array( 'status' => 503 ) ); }
			$dealer['site_code'] = str_pad( $dealer['site_code'], 3, '0', STR_PAD_LEFT );
		} unset( $dealer );
		self::$lookup_cache[ $zip ] = $data;
		set_transient( 'leapmotor_dealers_v2_' . $zip, self::$lookup_cache[ $zip ], DAY_IN_SECONDS );
		return self::$lookup_cache[ $zip ];
	}

	private static function public_assignment( $dealers ) {
		return array_map( function( $a ) { return array( 'dealer_code' => $a['dealer_code'], 'name' => $a['name'], 'address' => $a['address'], 'city' => $a['city'], 'distance_km' => (float) $a['distance_km'], 'lead_city' => $a['lead_city'], 'rank' => (int) $a['rank'] ); }, $dealers );
	}

	public static function select_assignment( $dealers, $dealer_code ) {
		foreach ( $dealers as $dealer ) { if ( hash_equals( (string) $dealer['dealer_code'], (string) $dealer_code ) ) { return $dealer; } }
		return null;
	}

	private static function integration_credentials() {
		$client = defined( 'LEAPMOTOR_INTEGRATION_CLIENT_ID' ) ? LEAPMOTOR_INTEGRATION_CLIENT_ID : get_option( self::OPTION_CLIENT_ID, '' );
		$token = defined( 'LEAPMOTOR_INTEGRATION_TOKEN' ) ? LEAPMOTOR_INTEGRATION_TOKEN : get_option( self::OPTION_TOKEN, '' );
		return array( trim( (string) $client ), trim( (string) $token ) );
	}

	private static function sync_entry( $entry_id, $config, $a, $meta = null ) {
		global $wpdb;
		list( $client, $token ) = self::integration_credentials();
		if ( $client === '' || $token === '' ) { self::mark_sync( $entry_id, 'pending', 'Integration noch nicht konfiguriert.' ); return; }
		if ( ! is_array( $meta ) ) { $meta = self::entry_meta( $entry_id, $config ); }
		$payload = self::build_sync_payload( $entry_id, $config, $meta, $client, $token, $a );
		$response = wp_remote_post( self::SYNC_URL, array( 'timeout' => 10, 'headers' => array( 'apikey' => self::API_KEY, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ), 'body' => wp_json_encode( $payload ) ) );
		if ( is_wp_error( $response ) ) { self::mark_sync( $entry_id, 'error', $response->get_error_message() ); return; }
		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) { self::mark_sync( $entry_id, 'error', 'Backend HTTP ' . (int) $code ); return; }
		$wpdb->update( self::table_name(), array( 'sync_status' => 'synced', 'sync_error' => null, 'synced_at' => current_time( 'mysql', true ) ), array( 'entry_id' => (int) $entry_id ), array( '%s', '%s', '%s' ), array( '%d' ) );
	}

	public static function build_sync_payload( $entry_id, $config, $meta, $client, $token, $a ) {
		$name = self::name_parts( $meta[ $config['name'] ] ?? '' );
		$contact = $config['contact'] ? sanitize_text_field( $meta[ $config['contact'] ] ?? '' ) : '';
		$model = $config['model'] ? self::model_key( $meta[ $config['model'] ] ?? '' ) : '';
		return array(
			'p_client_id' => $client, 'p_token' => $token, 'p_source_form_id' => (string) $config['form_id'],
			'p_source_entry_id' => (string) $entry_id, 'p_source_event' => $config['source_event'], 'p_event_id' => $config['event_id'], 'p_lead_date' => gmdate( 'c' ),
			'p_contact_intent' => $contact, 'p_vehicle_interest' => $model,
			'p_zip' => sanitize_text_field( $meta[ $config['zip'] ] ?? '' ), 'p_first_name' => $name[0], 'p_last_name' => $name[1],
			'p_email' => sanitize_email( $meta[ $config['email'] ] ?? '' ), 'p_phone' => sanitize_text_field( $meta[ $config['phone'] ] ?? '' ),
			'p_consent_stay' => self::consent( $meta[ $config['consent_email'] ] ?? '' ) === '1',
			'p_consent_offers' => self::consent( $meta[ $config['consent_profile'] ] ?? '' ) === '1',
			'p_consent_partners' => self::consent( $meta[ $config['consent_partner'] ] ?? '' ) === '1', 'p_dealer_code' => $a['dealer_code'],
		);
	}

	private static function mark_sync( $entry_id, $status, $error ) {
		global $wpdb;
		$wpdb->update( self::table_name(), array( 'sync_status' => $status, 'sync_error' => substr( sanitize_text_field( $error ), 0, 1000 ) ), array( 'entry_id' => (int) $entry_id ), array( '%s', '%s' ), array( '%d' ) );
	}

	public static function admin_menu() {
		add_submenu_page( 'formidable', 'LEAD_EMEA_PERM Export', 'LEAD_EMEA_PERM Export', 'manage_options', 'leapmotor-emea-export', array( __CLASS__, 'admin_page' ) );
	}

	public static function admin_page() {
		if ( ! current_user_can( 'manage_options' ) ) { return; }
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=leapmotor_emea_export' ), 'leapmotor_emea_export' );
		list( $client, $token ) = self::integration_credentials();
		global $wpdb;
		$wpdb->query( 'DELETE a FROM ' . self::table_name() . ' a LEFT JOIN ' . $wpdb->prefix . 'frm_items i ON i.id=a.entry_id WHERE i.id IS NULL' );
		$counts = $wpdb->get_results( 'SELECT sync_status,COUNT(*) count FROM ' . self::table_name() . ' GROUP BY sync_status', ARRAY_A );
		$status = array(); foreach ( $counts as $row ) { $status[] = esc_html( $row['sync_status'] . ': ' . $row['count'] ); }
		echo '<div class="wrap"><h1>Leapmotor Lead-Integration</h1><p>Neue Formidable-Leads werden zentral im Tischtennis-Backend gespeichert. Der lokale CSV-Export bleibt als Rückfalloption erhalten.</p><p><strong>Synchronisierung:</strong> ' . ( $status ? implode( ' · ', $status ) : 'noch keine Einträge' ) . '</p>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="leapmotor_integration_settings">'; wp_nonce_field( 'leapmotor_integration_settings' );
		echo '<table class="form-table"><tr><th><label for="lm-client">Client-ID</label></th><td><input class="regular-text" id="lm-client" name="client_id" value="' . esc_attr( $client ) . '"></td></tr><tr><th><label for="lm-token">Token</label></th><td><input class="regular-text" type="password" id="lm-token" name="token" placeholder="' . ( $token ? 'Gespeichert – leer lassen zum Beibehalten' : '' ) . '"></td></tr></table>'; submit_button( 'Integration speichern' ); echo '</form>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="leapmotor_resync">'; wp_nonce_field( 'leapmotor_resync' ); submit_button( 'Fehlende/fehlerhafte Synchronisierungen erneut senden', 'secondary' ); echo '</form>';
		echo '<hr><p><a class="button" href="' . esc_url( $url ) . '">Lokale LEAD_EMEA_PERM-CSV exportieren</a></p></div>';
	}

	public static function save_settings() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Nicht erlaubt.', 403 ); }
		check_admin_referer( 'leapmotor_integration_settings' );
		update_option( self::OPTION_CLIENT_ID, sanitize_text_field( wp_unslash( $_POST['client_id'] ?? '' ) ), false );
		$token = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) ); if ( $token !== '' ) { update_option( self::OPTION_TOKEN, $token, false ); }
		wp_safe_redirect( admin_url( 'admin.php?page=leapmotor-emea-export&updated=1' ) ); exit;
	}

	public static function resync() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Nicht erlaubt.', 403 ); }
		check_admin_referer( 'leapmotor_resync' );
		global $wpdb;
		$items = $wpdb->get_results( "SELECT i.id,i.form_id FROM {$wpdb->prefix}frm_items i LEFT JOIN " . self::table_name() . " a ON a.entry_id=i.id WHERE i.form_id IN (7,8) AND i.is_draft=0 AND (a.entry_id IS NULL OR a.sync_status<>'synced') ORDER BY i.id", ARRAY_A );
		foreach ( $items as $item ) {
			$config = self::form_config( $item['form_id'] );
			$meta = self::entry_meta( $item['id'], $config );
			$zip = trim( sanitize_text_field( $meta[ $config['zip'] ] ?? '' ) );
			if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { continue; }
			$dealers = self::lookup( $zip );
			if ( is_wp_error( $dealers ) ) { continue; }
			$stored_code = $wpdb->get_var( $wpdb->prepare( 'SELECT dealer_code FROM ' . self::table_name() . ' WHERE entry_id=%d', $item['id'] ) );
			$a = $stored_code ? self::select_assignment( $dealers, $stored_code ) : ( $dealers[0] ?? null );
			if ( ! is_array( $a ) ) { continue; }
			self::persist_entry_meta( $item['id'], $config['zip'], $zip );
			self::persist_entry_meta( $item['id'], $config['city'], $a['lead_city'] );
			self::persist_assignment( $item['id'], $zip, $a );
			$meta[ $config['city'] ] = $a['lead_city'];
			self::sync_entry( $item['id'], $config, $a, $meta );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=leapmotor-emea-export&resynced=1' ) ); exit;
	}

	public static function headers() {
		return array( 'LEADDATE','NAME','SURNAME','ADDRESS','ZIPCODE','CITY','PROVINCECODE','COUNTRYCODE','MAIL','PHONE','MOBILE','MARKETINGPOST','MARKETINGEMAIL','MARKETINGSMS','MARKETINGPHONE','MODELCODE','MODELDESCRIPTION','OWNBRANDCODE','OWNMODELCODE','OWNBRANDDESCR','OWNMODELDESCR','EXTERNID','CAMPAIGN','OFFER','LEVEL1','LEVEL2','LEVEL3','LEVEL4','PROCESSTYPE','BRAND','LANGUAGE','MARKET','CTA','NOTE','DEVICEUSED','DEALERCODE','DEALERCITY','DEALER','DEALERADDRESS','DEALERSITE','DEALERMKT','DEALERPHONE','DEALERMAIL','APPOINTMENTDATE','APPNOTEDEALER','APPOINTMENTNOTES','APPOINTEMENTSUBJECT','GENDER','COMPANYNAME','BUSINESSAREA','EVENTNAME','EVENTLOCATION','PRIVACYPROFILATION','PRIVACYTHIRDPARTY','PRIVACYEXTRAUE','PRIVACYGEOLOCATION','BIRTHDATE','FLEETNUMBEROFOWNEDVEHICLES','DISCLAIMERID','OWNEDCARVIN','VATNUMBER','COMMUNICATIONCHANNEL' );
	}

	public static function export() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Nicht erlaubt.', 403 ); }
		check_admin_referer( 'leapmotor_emea_export' );
		global $wpdb;
		$items = $wpdb->get_results( "SELECT id, form_id, created_at FROM {$wpdb->prefix}frm_items WHERE form_id IN (7,8) AND is_draft=0 ORDER BY created_at, id", ARRAY_A );
		$models = array( 'Leapmotor B03x' => array( '485', 'B03X' ), 'Leapmotor B05' => array( '486', 'B05' ), 'Leapmotor B10' => array( 'B108', 'B10' ), 'Leapmotor C10' => array( 'B118', 'C10' ), 'Leapmotor T03' => array( '489', 'T03' ) );
		$lines = array( self::csv_row( self::headers() ) );
		foreach ( $items as $item ) {
			$config = self::form_config( $item['form_id'] );
			if ( ! $config ) { continue; }
			$meta_rows = $wpdb->get_results( $wpdb->prepare( "SELECT field_id, meta_value FROM {$wpdb->prefix}frm_item_metas WHERE item_id=%d", $item['id'] ), ARRAY_A );
			$meta = array(); foreach ( $meta_rows as $m ) { $meta[ (int) $m['field_id'] ] = maybe_unserialize( $m['meta_value'] ); }
			$a = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table_name() . ' WHERE entry_id=%d', $item['id'] ), ARRAY_A );
			$entry_zip = self::export_zip( $meta[ $config['zip'] ] ?? '', $a['lead_zip'] ?? '' );
			if ( ( ! $a || ! self::site_code( $a['dealer_site_code'] ?? '' ) ) && preg_match( '/^[0-9]{5}$/', $entry_zip ) ) {
				$dealers = self::lookup( $entry_zip );
				$selected = ! is_wp_error( $dealers ) && $a ? self::select_assignment( $dealers, $a['dealer_code'] ?? '' ) : null;
				if ( ! is_wp_error( $dealers ) && ( $selected || isset( $dealers[0] ) ) ) {
					self::persist_assignment( $item['id'], $entry_zip, $selected ?: $dealers[0] );
					$a = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table_name() . ' WHERE entry_id=%d', $item['id'] ), ARRAY_A );
				}
			}
			$name = self::name_parts( isset( $meta[ $config['name'] ] ) ? $meta[ $config['name'] ] : '' );
			$model_value = $config['model'] ? ( $meta[ $config['model'] ] ?? '' ) : '';
			$model = isset( $models[ $model_value ] ) ? $models[ $model_value ] : array( '', '' );
			$data = array_fill_keys( self::headers(), '' );
			$data = array_merge( $data, array(
				'LEADDATE' => gmdate( 'c', strtotime( $item['created_at'] . ' UTC' ) ), 'NAME' => $name[0], 'SURNAME' => $name[1],
				'ZIPCODE' => $entry_zip, 'CITY' => $a['lead_city'] ?? '', 'COUNTRYCODE' => 'DE',
				'MAIL' => $meta[ $config['email'] ] ?? '', 'PHONE' => $meta[ $config['phone'] ] ?? '',
				'MARKETINGEMAIL' => self::consent( $meta[ $config['consent_email'] ] ?? '' ),
				'MODELCODE' => $model[0], 'MODELDESCRIPTION' => $model[1], 'CAMPAIGN' => '17646', 'OFFER' => 'EARNED MEDIA',
				'LEVEL1' => 'EVENTS', 'LEVEL2' => 'QR', 'LEVEL3' => 'WWW', 'LEVEL4' => 'LEAPMOTOR', 'PROCESSTYPE' => 'Lead Self',
				'BRAND' => 'LEAPMOTOR', 'LANGUAGE' => 'Tedesco', 'MARKET' => '8803',
				'CTA' => self::cta( $config['contact'] ? ( $meta[ $config['contact'] ] ?? '' ) : '' ), 'DEALERCODE' => $a['dealer_code'] ?? '', 'DEALERCITY' => $a['dealer_city'] ?? '',
				'DEALER' => $a['dealer_name'] ?? '', 'DEALERADDRESS' => $a['dealer_address'] ?? '', 'DEALERSITE' => self::site_code( $a['dealer_site_code'] ?? '' ) ?: '000',
				'PRIVACYPROFILATION' => self::consent( $meta[ $config['consent_profile'] ] ?? '' ),
				'PRIVACYTHIRDPARTY' => self::consent( $meta[ $config['consent_partner'] ] ?? '' ),
				'DISCLAIMERID' => '1699', 'COMMUNICATIONCHANNEL' => '',
			) );
			$lines[] = self::csv_row( array_values( $data ) );
		}
		nocache_headers();
		header( 'Content-Type: text/csv; charset=UTF-8' );
		header( 'Content-Disposition: attachment; filename="LEAD_EMEA_PERM_' . gmdate( 'Y-m-d' ) . '.csv"' );
		echo "\xEF\xBB\xBF" . implode( "\r\n", $lines );
		exit;
	}

	public static function consent( $value ) { return $value === 'Stimme ich zu' ? '1' : '0'; }
	public static function cta( $value ) {
		$value = strtolower( trim( (string) $value ) );
		if ( $value === 'probefahrt' || $value === 'td' ) { return 'TD'; }
		if ( $value === 'angebot' || $value === 'rp' ) { return 'RP'; }
		return '';
	}
	public static function site_code( $value ) {
		$value = trim( (string) $value );
		return preg_match( '/^[0-9]{1,3}$/', $value ) ? str_pad( $value, 3, '0', STR_PAD_LEFT ) : '';
	}
	public static function model_key( $value ) {
		$models = array( 'Leapmotor B03x' => 'b03x', 'Leapmotor B05' => 'b05', 'Leapmotor B10' => 'b10', 'Leapmotor C10' => 'c10', 'Leapmotor T03' => 't03' );
		return $models[ (string) $value ] ?? strtolower( trim( (string) $value ) );
	}
	public static function name_parts( $value ) {
		if ( is_array( $value ) ) { return array( sanitize_text_field( $value['first'] ?? '' ), sanitize_text_field( $value['last'] ?? '' ) ); }
		$json = json_decode( (string) $value, true );
		if ( is_array( $json ) ) { return array( sanitize_text_field( $json['first'] ?? '' ), sanitize_text_field( $json['last'] ?? '' ) ); }
		return array( '', '' );
	}
	public static function csv_row( $values ) {
		return implode( ';', array_map( function( $value ) { return '"' . str_replace( '"', '""', (string) $value ) . '"'; }, $values ) );
	}
}

Leapmotor_Formidable_Dealer::boot();
