<?php
define( 'ABSPATH', __DIR__ . '/' );
function register_activation_hook() {}
function add_action() {}
function add_filter() {}
function sanitize_text_field( $value ) { return trim( strip_tags( (string) $value ) ); }
function sanitize_email( $value ) { return filter_var( $value, FILTER_SANITIZE_EMAIL ); }
function get_transient() { return false; }
function set_transient() {}
define( 'DAY_IN_SECONDS', 86400 );
require dirname( __DIR__ ) . '/wordpress/leapmotor-formidable-dealer/leapmotor-formidable-dealer.php';

function assert_same( $expected, $actual, $message ) {
	if ( $expected !== $actual ) {
		fwrite( STDERR, $message . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true ) . "\n" );
		exit( 1 );
	}
}

$headers = Leapmotor_Formidable_Dealer::headers();
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
assert_same( 130, $form8['zip'], 'Form 8 ZIP mapping failed.' );
assert_same( 131, $form8['city'], 'Form 8 city mapping failed.' );
assert_same( null, $form8['contact'], 'Form 8 must not invent a contact-intent field.' );
assert_same( null, $form8['model'], 'Form 8 must not invent a vehicle-interest field.' );

$payload8 = Leapmotor_Formidable_Dealer::build_sync_payload( 123, $form8, array(
	130 => '01234', 132 => array( 'first' => 'Max', 'last' => 'Muster' ), 133 => 'max@example.test', 134 => '+49123',
	137 => 'Stimme ich zu', 139 => 'Stimme ich NICHT zu', 141 => 'Stimme ich zu',
), 'client', 'token', array( 'dealer_code' => 'D-1' ) );
assert_same( '8', $payload8['p_source_form_id'], 'Form 8 source form ID failed.' );
assert_same( 'leapmotor-e4-testival', $payload8['p_source_event'], 'Form 8 source event payload failed.' );
assert_same( '', $payload8['p_contact_intent'], 'Form 8 contact intent must stay empty.' );
assert_same( '', $payload8['p_vehicle_interest'], 'Form 8 vehicle interest must stay empty.' );
assert_same( '01234', $payload8['p_zip'], 'Form 8 ZIP lost its leading zero.' );
assert_same( true, $payload8['p_consent_stay'], 'Form 8 stay-in-touch consent failed.' );
assert_same( false, $payload8['p_consent_offers'], 'Form 8 offers consent failed.' );
assert_same( true, $payload8['p_consent_partners'], 'Form 8 partner consent failed.' );

echo "formidable-plugin: ok\n";
