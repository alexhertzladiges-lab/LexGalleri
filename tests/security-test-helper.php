<?php
declare(strict_types=1);
// Synthetic test accounts only. These helpers exercise the real enrollment
// endpoints; they never mark a session authenticated or bypass MFA in SQL.
function security_test_base32_decode(string $encoded): string {
    $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$buffer=0;$bits=0;$decoded='';
    foreach(str_split(strtoupper($encoded)) as $character){
        $value=strpos($alphabet,$character);if($value===false)throw new RuntimeException('Invalid synthetic TOTP secret');
        $buffer=($buffer<<5)|$value;$bits+=5;
        if($bits>=8){$bits-=8;$decoded.=chr(($buffer>>$bits)&255);$buffer&=(1<<$bits)-1;}
    }
    return $decoded;
}
function security_test_totp(string $secret,?int $step=null): string {
    $step??=intdiv(time(),30);$counter=pack('N2',intdiv($step,4294967296),$step%4294967296);
    $hash=hash_hmac('sha1',$counter,security_test_base32_decode($secret),true);$offset=ord($hash[19])&15;
    $number=unpack('N',substr($hash,$offset,4))[1]&0x7fffffff;return str_pad((string)($number%1000000),6,'0',STR_PAD_LEFT);
}
function security_test_previous_totp(string $secret): string {
    // Exercise the previous-step tolerance without racing its expiry while the
    // HTTP request crosses a 30-second boundary on a busy CI runner.
    $remaining=30-fmod(microtime(true),30);
    if($remaining<3)usleep((int)(($remaining+0.1)*1000000));
    return security_test_totp($secret,intdiv(time(),30)-1);
}
function security_test_complete_admin(CurlHandle $client,array $response,callable $request): array {
    if($response[0]!==200||!is_array($response[1])||empty($response[1]['mfa_required']))return $response;
    if(empty($response[1]['mfa_enrollment_required']))throw new RuntimeException('Synthetic first-admin fixture unexpectedly requires an existing authenticator');
    $setup=$request($client,'POST','/mfa/setup',[]);
    if($setup[0]!==200||!is_string($setup[1]['secret']??null))throw new RuntimeException('Synthetic admin enrollment failed: '.json_encode($setup));
    $confirmed=$request($client,'POST','/mfa/confirm',['code'=>security_test_totp($setup[1]['secret'])]);
    if($confirmed[0]!==200||!is_array($confirmed[1])||empty($confirmed[1]['id']))throw new RuntimeException('Synthetic admin confirmation failed: '.json_encode($confirmed));
    return $confirmed;
}
