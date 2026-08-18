<?php
/**
 * Plugin Name: Leapmotor Formidable Dealer Assignment
 * Description: Ordnet Formidable-Formular 7 per PLZ dem nächsten Leapmotor-Händler zu und exportiert LEAD_EMEA_PERM.
 * Version: 0.1.0
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
	const API_URL = 'https://leapmotor.tt.kevingarre.de/rest/v1/rpc/nearest_dealer_for_zip';
	const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImxlYXAtcmFsbHkifQ.FbPOePASGJO6vN73Cs1jwdot17Uo3s-2NK52RyN0-xM';

	private static $lookup_cache = array();

	public static function boot() {
		register_activation_hook( __FILE__, array( __CLASS__, 'activate' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'frm_validate_field_entry', array( __CLASS__, 'validate_zip' ), 8, 3 );
		add_action( 'frm_after_create_entry', array( __CLASS__, 'save_assignment' ), 20, 2 );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 30 );
		add_action( 'admin_post_leapmotor_emea_export', array( __CLASS__, 'export' ) );
	}

	public static function table_name() {
		global $wpdb;
		return $wpdb->prefix . 'leapmotor_dealer_assignments';
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
			assigned_at datetime NOT NULL,
			PRIMARY KEY  (entry_id)
		) {$charset};" );
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
		wp_enqueue_script( 'leapmotor-formidable-dealer', plugins_url( 'assets/form.js', __FILE__ ), array(), '0.1.0', true );
		wp_localize_script( 'leapmotor-formidable-dealer', 'LeapmotorDealer', array(
			'formId' => self::FORM_ID,
			'zipField' => self::FIELD_ZIP,
			'cityField' => self::FIELD_CITY,
			'endpoint' => esc_url_raw( rest_url( 'leapmotor/v1/dealer' ) ),
			'labels' => array( 'loading' => 'Händler wird ermittelt …', 'error' => 'Für diese PLZ konnte kein Händler ermittelt werden.', 'prefix' => 'Nächster Leapmotor-Händler:' ),
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
		$assignment = self::lookup( $zip );
		if ( is_wp_error( $assignment ) ) {
			$errors[ 'field' . self::FIELD_ZIP ] = 'Die Händlerzuordnung ist gerade nicht verfügbar. Bitte versuche es erneut.';
			return $errors;
		}
		$_POST['item_meta'][ self::FIELD_ZIP ] = $zip;
		$_POST['item_meta'][ self::FIELD_CITY ] = $assignment['lead_city'];
		return $errors;
	}

	public static function save_assignment( $entry_id, $form_id ) {
		if ( (int) $form_id !== self::FORM_ID ) { return; }
		$zip = isset( $_POST['item_meta'][ self::FIELD_ZIP ] ) ? trim( sanitize_text_field( wp_unslash( $_POST['item_meta'][ self::FIELD_ZIP ] ) ) ) : '';
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { return; }
		$a = self::lookup( $zip );
		if ( is_wp_error( $a ) ) { return; }
		self::persist_assignment( $entry_id, $zip, $a );
	}

	private static function persist_assignment( $entry_id, $zip, $a ) {
		global $wpdb;
		$wpdb->replace( self::table_name(), array(
			'entry_id' => (int) $entry_id, 'lead_zip' => $zip, 'lead_city' => $a['lead_city'],
			'dealer_code' => $a['dealer_code'], 'dealer_site_code' => $a['site_code'], 'dealer_name' => $a['name'],
			'dealer_address' => $a['address'], 'dealer_city' => $a['city'], 'dealer_zip' => $a['zip'],
			'dealer_distance_km' => $a['distance_km'], 'dealer_data_version' => $a['data_version'],
			'assigned_at' => current_time( 'mysql', true ),
		), array( '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%f', '%s', '%s' ) );
	}

	public static function lookup( $zip ) {
		$zip = trim( (string) $zip );
		if ( ! preg_match( '/^[0-9]{5}$/', $zip ) ) { return new WP_Error( 'invalid_zip', 'Ungültige PLZ.', array( 'status' => 400 ) ); }
		if ( isset( self::$lookup_cache[ $zip ] ) ) { return self::$lookup_cache[ $zip ]; }
		$cached = get_transient( 'leapmotor_dealer_' . $zip );
		if ( is_array( $cached ) ) { self::$lookup_cache[ $zip ] = $cached; return $cached; }
		$response = wp_remote_post( self::API_URL, array(
			'timeout' => 8,
			'headers' => array( 'apikey' => self::API_KEY, 'Content-Type' => 'application/json', 'Accept' => 'application/json' ),
			'body' => wp_json_encode( array( 'p_zip' => $zip ) ),
		) );
		if ( is_wp_error( $response ) ) { return new WP_Error( 'lookup_unavailable', 'Lookup nicht erreichbar.', array( 'status' => 503 ) ); }
		$code = wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		$required = array( 'dealer_code', 'name', 'address', 'city', 'zip', 'distance_km', 'lead_city', 'data_version' );
		if ( $code !== 200 || ! is_array( $data ) || array_diff( $required, array_keys( $data ) ) ) {
			return new WP_Error( 'lookup_failed', 'Keine Händlerzuordnung gefunden.', array( 'status' => $code === 400 ? 400 : 503 ) );
		}
		self::$lookup_cache[ $zip ] = array_map( 'sanitize_text_field', $data );
		set_transient( 'leapmotor_dealer_' . $zip, self::$lookup_cache[ $zip ], DAY_IN_SECONDS );
		return self::$lookup_cache[ $zip ];
	}

	private static function public_assignment( $a ) {
		return array( 'name' => $a['name'], 'city' => $a['city'], 'distance_km' => (float) $a['distance_km'], 'lead_city' => $a['lead_city'] );
	}

	public static function admin_menu() {
		add_submenu_page( 'formidable', 'LEAD_EMEA_PERM Export', 'LEAD_EMEA_PERM Export', 'manage_options', 'leapmotor-emea-export', array( __CLASS__, 'admin_page' ) );
	}

	public static function admin_page() {
		if ( ! current_user_can( 'manage_options' ) ) { return; }
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=leapmotor_emea_export' ), 'leapmotor_emea_export' );
		echo '<div class="wrap"><h1>LEAD_EMEA_PERM Export</h1><p>Exportiert Formidable-Formular 7 mit der beim Eingang gespeicherten Händlerzuordnung.</p><p><a class="button button-primary" href="' . esc_url( $url ) . '">CSV exportieren</a></p></div>';
	}

	public static function headers() {
		return array( 'LEADDATE','NAME','SURNAME','ADDRESS','ZIPCODE','CITY','PROVINCECODE','COUNTRYCODE','MAIL','PHONE','MOBILE','MARKETINGPOST','MARKETINGEMAIL','MARKETINGSMS','MARKETINGPHONE','MODELCODE','MODELDESCRIPTION','OWNBRANDCODE','OWNMODELCODE','OWNBRANDDESCR','OWNMODELDESCR','EXTERNID','CAMPAIGN','OFFER','LEVEL1','LEVEL2','LEVEL3','LEVEL4','BRAND','LANGUAGE','MARKET','CTA','NOTE','DEVICEUSED','DEALERCODE','DEALERCITY','DEALER','DEALERADDRESS','DEALERSITE','DEALERMKT','DEALERPHONE','DEALERMAIL','APPOINTMENTDATE','APPNOTEDEALER','APPOINTMENTNOTES','APPOINTEMENTSUBJECT','GENDER','COMPANYNAME','BUSINESSAREA','EVENTNAME','EVENTLOCATION','PRIVACYPROFILATION','PRIVACYTHIRDPARTY','PRIVACYEXTRAUE','PRIVACYGEOLOCATION','BIRTHDATE','FLEETNUMBEROFOWNEDVEHICLES','DISCLAIMERID','OWNEDCARVIN','VATNUMBER','COMMUNICATIONCHANNEL' );
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
				$lookup = self::lookup( $entry_zip );
				if ( ! is_wp_error( $lookup ) ) {
					self::persist_assignment( $item['id'], $entry_zip, $lookup );
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
				'MODELCODE' => $model[0], 'MODELDESCRIPTION' => $model[1], 'BRAND' => 'LEAP', 'LANGUAGE' => 'DE',
				'CTA' => $meta[ self::FIELD_CONTACT ] ?? '', 'DEALERCODE' => $a['dealer_code'] ?? '', 'DEALERCITY' => $a['dealer_city'] ?? '',
				'DEALER' => $a['dealer_name'] ?? '', 'DEALERADDRESS' => $a['dealer_address'] ?? '', 'DEALERSITE' => $a['dealer_site_code'] ?? '',
				'PRIVACYPROFILATION' => self::consent( $meta[ self::FIELD_CONSENT_PROFILE ] ?? '' ),
				'PRIVACYTHIRDPARTY' => self::consent( $meta[ self::FIELD_CONSENT_PARTNER ] ?? '' ),
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
