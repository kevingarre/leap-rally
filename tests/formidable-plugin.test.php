<?php
define( 'ABSPATH', __DIR__ . '/' );
function register_activation_hook() {}
$registered_actions = array();
function add_action( $hook, $callback ) { global $registered_actions; $registered_actions[] = $hook; }
function add_filter() {}
function sanitize_text_field( $value ) { return trim( strip_tags( (string) $value ) ); }
function sanitize_email( $value ) { return filter_var( $value, FILTER_SANITIZE_EMAIL ); }
function wp_unslash( $value ) { return $value; }
function maybe_unserialize( $value ) { return $value; }
function get_transient() { return false; }
function set_transient() {}
define( 'DAY_IN_SECONDS', 86400 );
define( 'ARRAY_A', 'ARRAY_A' );
require dirname( __DIR__ ) . '/wordpress/leapmotor-formidable-dealer/leapmotor-formidable-dealer.php';

function assert_same( $expected, $actual, $message ) {
	if ( $expected !== $actual ) {
		fwrite( STDERR, $message . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true ) . "\n" );
		exit( 1 );
	}
}

$headers = Leapmotor_Formidable_Dealer::headers();
assert_same( '2.1.4', Leapmotor_Formidable_Dealer::VERSION, 'Plugin version was not bumped.' );
assert_same( true, in_array( 'frm_after_create_entry', $registered_actions, true ), 'Create hook is missing.' );
assert_same( true, in_array( 'frm_after_update_entry', $registered_actions, true ), 'Update hook is missing.' );
assert_same( true, in_array( 'admin_post_leapmotor_resync', $registered_actions, true ), 'Resync action is missing.' );
assert_same( 62, count( $headers ), 'EMEA export must contain exactly 62 columns.' );
assert_same( array_search( 'LEVEL4', $headers, true ) + 1, array_search( 'PROCESSTYPE', $headers, true ), 'PROCESSTYPE must follow LEVEL4.' );
assert_same( 'LEADDATE', $headers[0], 'First EMEA column changed.' );
assert_same( 'COMMUNICATIONCHANNEL', $headers[61], 'Last EMEA column changed.' );
assert_same( '1', Leapmotor_Formidable_Dealer::consent( 'Stimme ich zu' ), 'Positive consent mapping failed.' );
assert_same( '0', Leapmotor_Formidable_Dealer::consent( 'Stimme ich NICHT zu' ), 'Negative consent mapping failed.' );
assert_same( 't03', Leapmotor_Formidable_Dealer::model_key( 'Leapmotor T03' ), 'Central model mapping failed.' );
assert_same( 'TD', Leapmotor_Formidable_Dealer::cta( 'Probefahrt' ), 'Test-drive CTA mapping failed.' );
assert_same( 'RP', Leapmotor_Formidable_Dealer::cta( 'Angebot' ), 'Offer CTA mapping failed.' );
assert_same( '001', Leapmotor_Formidable_Dealer::site_code( '1' ), 'Dealer site code must be three digits.' );
assert_same( '', Leapmotor_Formidable_Dealer::site_code( 'AB' ), 'Invalid dealer site code was accepted.' );
assert_same( array( 'Kevin', 'Garre' ), Leapmotor_Formidable_Dealer::name_parts( '{"first":"Kevin","last":"Garre"}' ), 'JSON name mapping failed.' );
assert_same( '"A;B";"He said ""ja"""', Leapmotor_Formidable_Dealer::csv_row( array( 'A;B', 'He said "ja"' ) ), 'CSV escaping failed.' );
assert_same( '"Düsseldorf";"Nürnberg"', Leapmotor_Formidable_Dealer::csv_row( array( 'Düsseldorf', 'Nürnberg' ) ), 'UTF-8 umlauts must survive CSV generation.' );
$dealers = array(
	array( 'dealer_code' => 'A', 'rank' => '1' ),
	array( 'dealer_code' => 'B', 'rank' => '2' ),
	array( 'dealer_code' => 'C', 'rank' => '3' ),
);
assert_same( $dealers[1], Leapmotor_Formidable_Dealer::select_assignment( $dealers, 'B' ), 'Chosen top-three dealer was not selected.' );
assert_same( null, Leapmotor_Formidable_Dealer::select_assignment( $dealers, 'MANIPULATED' ), 'Dealer outside top three was accepted.' );

$form7 = Leapmotor_Formidable_Dealer::form_config( 7 );
$form8 = Leapmotor_Formidable_Dealer::form_config( 8 );
assert_same( 'leapmotor-tischtennis-gewinnspiel', $form7['source_event'], 'Form 7 source event changed.' );
assert_same( 98, $form7['zip'], 'Form 7 ZIP mapping changed.' );
assert_same( 'leapmotor-e4-testival', $form8['source_event'], 'Form 8 source event mapping failed.' );
assert_same( 'b7be91e4-f2d4-4134-ab39-d025f5f93843', $form7['event_id'], 'Form 7 backend event mapping failed.' );
assert_same( $form7['event_id'], $form8['event_id'], 'Both WordPress forms must target the same backend event.' );
assert_same( 130, $form8['zip'], 'Form 8 ZIP mapping failed.' );
assert_same( 131, $form8['city'], 'Form 8 city mapping failed.' );
assert_same( null, $form8['contact'], 'Form 8 must not invent a contact-intent field.' );
assert_same( null, $form8['model'], 'Form 8 must not invent a vehicle-interest field.' );
assert_same( 'leapmotor-tischtennis-gewinnspiel', Leapmotor_Formidable_Dealer::export_source( $form7 ), 'Form 7 CSV source mapping failed.' );
assert_same( 'leapmotor-e4-testival', Leapmotor_Formidable_Dealer::export_source( $form8 ), 'Form 8 CSV source mapping failed.' );
assert_same( '', Leapmotor_Formidable_Dealer::cta( $form8['contact'] ? 'Probefahrt' : '' ), 'Form 8 must not claim a future test-drive request.' );

$wpdb = new class {
	public $prefix = 'wp_';
	public function prepare( $sql, $entry_id ) { return $sql . ' /* ' . (int) $entry_id . ' */'; }
	public function get_results() {
		return array(
			array( 'field_id' => '130', 'meta_value' => '01234' ),
			array( 'field_id' => '132', 'meta_value' => '{"first":"Max","last":"Muster"}' ),
			array( 'field_id' => '133', 'meta_value' => 'max@example.test' ),
		);
	}
};
$_POST['item_meta'] = array();
$stored8 = Leapmotor_Formidable_Dealer::entry_meta( 123, $form8 );
assert_same( '01234', $stored8[130], 'Stored Formidable ZIP fallback failed.' );
assert_same( 'max@example.test', $stored8[133], 'Stored Formidable email fallback failed.' );
assert_same( '01234', Leapmotor_Formidable_Dealer::lead_zip( array(), 130, array( 'leapmotor_lead_zip' => '01234' ) ), 'Plugin POST ZIP fallback failed.' );
assert_same( '', Leapmotor_Formidable_Dealer::lead_zip( array(), 130, array( 'leapmotor_lead_zip' => '12AB' ) ), 'Invalid plugin POST ZIP was accepted.' );
assert_same( '01234', Leapmotor_Formidable_Dealer::export_zip( '01234', '98765' ), 'Stored Formidable ZIP must take precedence in export.' );
assert_same( '98765', Leapmotor_Formidable_Dealer::export_zip( '', '98765' ), 'Assignment ZIP fallback failed in export.' );
assert_same( '', Leapmotor_Formidable_Dealer::export_zip( 'invalid', '12AB' ), 'Invalid ZIP was accepted in export.' );

$payload8 = Leapmotor_Formidable_Dealer::build_sync_payload( 123, $form8, array(
	130 => '01234', 132 => array( 'first' => 'Max', 'last' => 'Muster' ), 133 => 'max@example.test', 134 => '+49123',
	137 => 'Stimme ich zu', 139 => 'Stimme ich NICHT zu', 141 => 'Stimme ich zu',
), 'client', 'token', array( 'dealer_code' => 'D-1' ) );
assert_same( '8', $payload8['p_source_form_id'], 'Form 8 source form ID failed.' );
assert_same( 'leapmotor-e4-testival', $payload8['p_source_event'], 'Form 8 source event payload failed.' );
assert_same( 'b7be91e4-f2d4-4134-ab39-d025f5f93843', $payload8['p_event_id'], 'Form 8 backend event payload failed.' );
assert_same( '', $payload8['p_contact_intent'], 'Form 8 contact intent must stay empty.' );
assert_same( '', $payload8['p_vehicle_interest'], 'Form 8 vehicle interest must stay empty.' );
assert_same( '01234', $payload8['p_zip'], 'Form 8 ZIP lost its leading zero.' );
assert_same( true, $payload8['p_consent_stay'], 'Form 8 stay-in-touch consent failed.' );
assert_same( false, $payload8['p_consent_offers'], 'Form 8 offers consent failed.' );
assert_same( true, $payload8['p_consent_partners'], 'Form 8 partner consent failed.' );

echo "formidable-plugin: ok\n";
