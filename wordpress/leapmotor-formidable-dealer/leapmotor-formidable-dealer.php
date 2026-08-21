<?php
/**
 * Plugin Name: Leapmotor Formidable Dealer Assignment
 * Description: Bietet Formidable-Formular 7 die drei nächsten Leapmotor-Händler an und überträgt Leads zentral.
 * Version: 2.0.4
 * Author: DriveDesk
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

final class Leapmotor_Formidable_Dealer {
	const FORM_ID = 7;
	const FIELD_CONTACT = 96;
	const FIELD_MODEL = 97;
	const FIELD_ZIP = 98;
	const FIELD_NAME = 99;
	const FIELD_EMAIL = 100;
	const FIELD_PHONE = 101;
	const FIELD_CONSENT_EMAIL = 104;
	const FIELD_CONSENT_PROFILE = 106;
	const FIELD_CONSENT_PARTNER = 108;
	const FIELD_CITY = 125;
	const API_URL = 'https://leapmotor.tt.kevingarre.de/rest/v1/rpc/nearest_dealers_for_zip';
	const SYNC_URL = 'https://leapmotor.tt.kevingarre.de/rest/v1/rpc/submit_external_lead';
	const OPTION_CLIENT_ID = 'leapmotor_integration_client_id';
	const OPTION_TOKEN = 'leapmotor_integration_token';
	const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImxlYXAtcmFsbHkifQ.FbPOePASGJO6vN73Cs1jwdot17Uo3s-2NK52RyN0-xM';

	private static $lookup_cache = array();
	private static $validated_assignment = null;

	public static function boot() {
		register_activation_hook( __FILE__, array( __CLASS__, 'activate' ) );
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_upgrade' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'frm_validate_field_entry', array( __CLASS__, 'validate_zip' ), 8, 3 );
		add_action( 'frm_after_create_entry', array( __CLASS__, 'save_assignment' ), 20, 2 );
		add_action( 'frm_before_destroy_entry', array( __CLASS__, 'delete_assignment' ), 20, 1 );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 30 );
		add_action( 'admin_post_leapmotor_emea_export', array( __CLASS__, 'export' ) );
		add_action( 'admin_post_leapmotor_integration_settings', array( __CLASS__, 'save_settings' ) );
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
		wp_enqueue_style( 'leapmotor-formidable-dealer', plugins_url( 'assets/form.css', __FILE__ ), array(), '2.0.2' );
		wp_enqueue_script( 'leapmotor-formidable-dealer', plugins_url( 'assets/form.js', __FILE__ ), array(), '2.0.2', true );
		wp_localize_script( 'leapmotor-formidable-dealer', 'LeapmotorDealer', array(
			'formId' => self::FORM_ID,
			'zipField' => self::FIELD_ZIP,
			'cityField' => self::FIELD_CITY,
			'endpoint' => esc_url_raw( rest_url( 'leapmotor/v1/dealer' ) ),
			'labels' => array( 'loading' => 'Händler werden ermittelt …', 'error' => 'Für diese PLZ konnten keine Händler ermittelt werden.', 'title' => 'Wähle deinen Leapmotor-Händler' ),
		) );
	}

	public static function validate_zip( $errors, $field, $value ) {
		if ( (int) $field->form_id !== self::FORM_ID || (int) $field->id !== self::FIELD_ZIP ) { return $errors; }
		$zip = trim( (string) $value );
		$contact = isset( $_POST['item_meta'][ self::FIELD_CONTACT ] ) ? sanitize_text_field( wp_unslash( $_POST['item_meta'][ self::FIELD_CONTACT ] ) ) : '';
		if ( $contact === 'nein, vorerst nicht' && $zip === '' ) { return $errors; }
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) {
			$errors[ 'field' . self::FIELD_ZIP ] = 'Bitte gib eine gültige fünfstellige PLZ ein.';
			return $errors;
		}
		$dealers = self::lookup( $zip );
		if ( is_wp_error( $dealers ) ) {
			$errors[ 'field' . self::FIELD_ZIP ] = 'Die Händlerzuordnung ist gerade nicht verfügbar. Bitte versuche es erneut.';
			return $errors;
		}
		$selected_code = isset( $_POST['leapmotor_dealer_code'] ) ? sanitize_text_field( wp_unslash( $_POST['leapmotor_dealer_code'] ) ) : '';
		$assignment = self::select_assignment( $dealers, $selected_code );
		if ( ! $assignment ) {
			$errors[ 'field' . self::FIELD_ZIP ] = 'Bitte wähle einen der drei angezeigten Händler aus.';
			return $errors;
		}
		self::$validated_assignment = $assignment;
		$_POST['item_meta'][ self::FIELD_ZIP ] = $zip;
		$_POST['item_meta'][ self::FIELD_CITY ] = $assignment['lead_city'];
		return $errors;
	}

	public static function save_assignment( $entry_id, $form_id ) {
		if ( (int) $form_id !== self::FORM_ID ) { return; }
		$zip = isset( $_POST['item_meta'][ self::FIELD_ZIP ] ) ? trim( sanitize_text_field( wp_unslash( $_POST['item_meta'][ self::FIELD_ZIP ] ) ) ) : '';
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { return; }
		$a = self::$validated_assignment;
		if ( ! is_array( $a ) ) {
			$dealers = self::lookup( $zip );
			$selected_code = isset( $_POST['leapmotor_dealer_code'] ) ? sanitize_text_field( wp_unslash( $_POST['leapmotor_dealer_code'] ) ) : '';
			$a = is_wp_error( $dealers ) ? null : self::select_assignment( $dealers, $selected_code );
		}
		if ( ! is_array( $a ) ) { return; }
		self::persist_assignment( $entry_id, $zip, $a );
		self::sync_entry( $entry_id, $a );
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

	private static function sync_entry( $entry_id, $a ) {
		global $wpdb;
		list( $client, $token ) = self::integration_credentials();
		if ( $client === '' || $token === '' ) { self::mark_sync( $entry_id, 'pending', 'Integration noch nicht konfiguriert.' ); return; }
		$meta = isset( $_POST['item_meta'] ) && is_array( $_POST['item_meta'] ) ? wp_unslash( $_POST['item_meta'] ) : array();
		$name = self::name_parts( $meta[ self::FIELD_NAME ] ?? '' );
		$payload = array(
			'p_client_id' => $client, 'p_token' => $token, 'p_source_form_id' => (string) self::FORM_ID,
			'p_source_entry_id' => (string) $entry_id, 'p_source_event' => 'leapmotor-tischtennis-gewinnspiel', 'p_lead_date' => gmdate( 'c' ),
			'p_contact_intent' => sanitize_text_field( $meta[ self::FIELD_CONTACT ] ?? '' ), 'p_vehicle_interest' => self::model_key( $meta[ self::FIELD_MODEL ] ?? '' ),
			'p_zip' => sanitize_text_field( $meta[ self::FIELD_ZIP ] ?? '' ), 'p_first_name' => $name[0], 'p_last_name' => $name[1],
			'p_email' => sanitize_email( $meta[ self::FIELD_EMAIL ] ?? '' ), 'p_phone' => sanitize_text_field( $meta[ self::FIELD_PHONE ] ?? '' ),
			'p_consent_stay' => self::consent( $meta[ self::FIELD_CONSENT_EMAIL ] ?? '' ) === '1',
			'p_consent_offers' => self::consent( $meta[ self::FIELD_CONSENT_PROFILE ] ?? '' ) === '1',
			'p_consent_partners' => self::consent( $meta[ self::FIELD_CONSENT_PARTNER ] ?? '' ) === '1', 'p_dealer_code' => $a['dealer_code'],
		);
		$response = wp_remote_post( self::SYNC_URL, array( 'timeout' => 10, 'headers' => array( 'apikey' => self::API_KEY, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ), 'body' => wp_json_encode( $payload ) ) );
		if ( is_wp_error( $response ) ) { self::mark_sync( $entry_id, 'error', $response->get_error_message() ); return; }
		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) { self::mark_sync( $entry_id, 'error', 'Backend HTTP ' . (int) $code ); return; }
		$wpdb->update( self::table_name(), array( 'sync_status' => 'synced', 'sync_error' => null, 'synced_at' => current_time( 'mysql', true ) ), array( 'entry_id' => (int) $entry_id ), array( '%s', '%s', '%s' ), array( '%d' ) );
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
		echo '<hr><p><a class="button" href="' . esc_url( $url ) . '">Lokale LEAD_EMEA_PERM-CSV exportieren</a></p></div>';
	}

	public static function save_settings() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Nicht erlaubt.', 403 ); }
		check_admin_referer( 'leapmotor_integration_settings' );
		update_option( self::OPTION_CLIENT_ID, sanitize_text_field( wp_unslash( $_POST['client_id'] ?? '' ) ), false );
		$token = sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) ); if ( $token !== '' ) { update_option( self::OPTION_TOKEN, $token, false ); }
		wp_safe_redirect( admin_url( 'admin.php?page=leapmotor-emea-export&updated=1' ) ); exit;
	}

	public static function headers() {
		return array( 'LEADDATE','NAME','SURNAME','ADDRESS','ZIPCODE','CITY','PROVINCECODE','COUNTRYCODE','MAIL','PHONE','MOBILE','MARKETINGPOST','MARKETINGEMAIL','MARKETINGSMS','MARKETINGPHONE','MODELCODE','MODELDESCRIPTION','OWNBRANDCODE','OWNMODELCODE','OWNBRANDDESCR','OWNMODELDESCR','EXTERNID','CAMPAIGN','OFFER','LEVEL1','LEVEL2','LEVEL3','LEVEL4','PROCESSTYPE','BRAND','LANGUAGE','MARKET','CTA','NOTE','DEVICEUSED','DEALERCODE','DEALERCITY','DEALER','DEALERADDRESS','DEALERSITE','DEALERMKT','DEALERPHONE','DEALERMAIL','APPOINTMENTDATE','APPNOTEDEALER','APPOINTMENTNOTES','APPOINTEMENTSUBJECT','GENDER','COMPANYNAME','BUSINESSAREA','EVENTNAME','EVENTLOCATION','PRIVACYPROFILATION','PRIVACYTHIRDPARTY','PRIVACYEXTRAUE','PRIVACYGEOLOCATION','BIRTHDATE','FLEETNUMBEROFOWNEDVEHICLES','DISCLAIMERID','OWNEDCARVIN','VATNUMBER','COMMUNICATIONCHANNEL' );
	}

	public static function export() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Nicht erlaubt.', 403 ); }
		check_admin_referer( 'leapmotor_emea_export' );
		global $wpdb;
		$items = $wpdb->get_results( $wpdb->prepare( "SELECT id, created_at FROM {$wpdb->prefix}frm_items WHERE form_id=%d AND is_draft=0 ORDER BY created_at, id", self::FORM_ID ), ARRAY_A );
		$models = array( 'Leapmotor B03x' => array( '485', 'B03X' ), 'Leapmotor B05' => array( '486', 'B05' ), 'Leapmotor B10' => array( 'B108', 'B10' ), 'Leapmotor C10' => array( 'B118', 'C10' ), 'Leapmotor T03' => array( '489', 'T03' ) );
		$lines = array( self::csv_row( self::headers() ) );
		foreach ( $items as $item ) {
			$meta_rows = $wpdb->get_results( $wpdb->prepare( "SELECT field_id, meta_value FROM {$wpdb->prefix}frm_item_metas WHERE item_id=%d", $item['id'] ), ARRAY_A );
			$meta = array(); foreach ( $meta_rows as $m ) { $meta[ (int) $m['field_id'] ] = maybe_unserialize( $m['meta_value'] ); }
			$a = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table_name() . ' WHERE entry_id=%d', $item['id'] ), ARRAY_A );
			$entry_zip = isset( $meta[ self::FIELD_ZIP ] ) ? trim( (string) $meta[ self::FIELD_ZIP ] ) : '';
			if ( ! $a && preg_match( '/^[0-9]{5}$/', $entry_zip ) ) {
				$dealers = self::lookup( $entry_zip );
				if ( ! is_wp_error( $dealers ) && isset( $dealers[0] ) ) {
					self::persist_assignment( $item['id'], $entry_zip, $dealers[0] );
					$a = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table_name() . ' WHERE entry_id=%d', $item['id'] ), ARRAY_A );
				}
			}
			$name = self::name_parts( isset( $meta[ self::FIELD_NAME ] ) ? $meta[ self::FIELD_NAME ] : '' );
			$model = isset( $models[ $meta[ self::FIELD_MODEL ] ?? '' ] ) ? $models[ $meta[ self::FIELD_MODEL ] ] : array( '', '' );
			$data = array_fill_keys( self::headers(), '' );
			$data = array_merge( $data, array(
				'LEADDATE' => gmdate( 'c', strtotime( $item['created_at'] . ' UTC' ) ), 'NAME' => $name[0], 'SURNAME' => $name[1],
				'ZIPCODE' => $meta[ self::FIELD_ZIP ] ?? '', 'CITY' => $a['lead_city'] ?? '', 'COUNTRYCODE' => 'DE',
				'MAIL' => $meta[ self::FIELD_EMAIL ] ?? '', 'PHONE' => $meta[ self::FIELD_PHONE ] ?? '',
				'MARKETINGEMAIL' => self::consent( $meta[ self::FIELD_CONSENT_EMAIL ] ?? '' ),
				'MODELCODE' => $model[0], 'MODELDESCRIPTION' => $model[1], 'CAMPAIGN' => '17646', 'OFFER' => 'EARNED MEDIA',
				'LEVEL1' => 'EVENTS', 'LEVEL2' => 'QR', 'LEVEL3' => 'WWW', 'LEVEL4' => 'LEAPMOTOR', 'PROCESSTYPE' => 'Lead Self',
				'BRAND' => 'LEAPMOTOR', 'LANGUAGE' => 'Tedesco', 'MARKET' => '8803',
				'CTA' => self::cta( $meta[ self::FIELD_CONTACT ] ?? '' ), 'DEALERCODE' => $a['dealer_code'] ?? '', 'DEALERCITY' => $a['dealer_city'] ?? '',
				'DEALER' => $a['dealer_name'] ?? '', 'DEALERADDRESS' => $a['dealer_address'] ?? '', 'DEALERSITE' => self::site_code( $a['dealer_site_code'] ?? '' ),
				'PRIVACYPROFILATION' => self::consent( $meta[ self::FIELD_CONSENT_PROFILE ] ?? '' ),
				'PRIVACYTHIRDPARTY' => self::consent( $meta[ self::FIELD_CONSENT_PARTNER ] ?? '' ),
				'DISCLAIMERID' => '1699', 'COMMUNICATIONCHANNEL' => '',
			) );
			if ( ! preg_match( '/^[0-9]{3}$/', (string) $data['DEALERSITE'] ) ) { wp_die( 'Händler-Standortkennung fehlt oder ist nicht dreistellig.', 422 ); }
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
