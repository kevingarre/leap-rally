<?php
define( 'ABSPATH', __DIR__ . '/' );
function register_activation_hook() {}
function add_action() {}
function add_filter() {}
function sanitize_text_field( $value ) { return trim( strip_tags( (string) $value ) ); }
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
assert_same( 61, count( $headers ), 'EMEA export must contain exactly 61 columns.' );
assert_same( 'LEADDATE', $headers[0], 'First EMEA column changed.' );
assert_same( 'COMMUNICATIONCHANNEL', $headers[60], 'Last EMEA column changed.' );
assert_same( '1', Leapmotor_Formidable_Dealer::consent( 'Stimme ich zu' ), 'Positive consent mapping failed.' );
assert_same( '0', Leapmotor_Formidable_Dealer::consent( 'Stimme ich NICHT zu' ), 'Negative consent mapping failed.' );
assert_same( 't03', Leapmotor_Formidable_Dealer::model_key( 'Leapmotor T03' ), 'Central model mapping failed.' );
assert_same( array( 'Kevin', 'Garre' ), Leapmotor_Formidable_Dealer::name_parts( '{"first":"Kevin","last":"Garre"}' ), 'JSON name mapping failed.' );
assert_same( '"A;B";"He said ""ja"""', Leapmotor_Formidable_Dealer::csv_row( array( 'A;B', 'He said "ja"' ) ), 'CSV escaping failed.' );
$dealers = array(
	array( 'dealer_code' => 'A', 'rank' => '1' ),
	array( 'dealer_code' => 'B', 'rank' => '2' ),
	array( 'dealer_code' => 'C', 'rank' => '3' ),
);
assert_same( $dealers[1], Leapmotor_Formidable_Dealer::select_assignment( $dealers, 'B' ), 'Chosen top-three dealer was not selected.' );
assert_same( null, Leapmotor_Formidable_Dealer::select_assignment( $dealers, 'MANIPULATED' ), 'Dealer outside top three was accepted.' );

echo "formidable-plugin: ok\n";
