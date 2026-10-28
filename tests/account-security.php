<?php
declare(strict_types=1);
// All accounts, passwords, authenticator keys and databases here are synthetic.
// Nothing reads the production configuration or connects to the webhotel.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
require_once dirname(__DIR__).'/private/security.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-security-test-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';mkdir($privateRoot.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8772);$server=null;$checks=0;$failures=0;
function as_assert(bool $condition,string $message):void{global $checks,$failures;$checks++;if($condition)echo 'PASS: '.$message."\n";else{$failures++;fwrite(STDERR,'FAIL: '.$message."\n");}}
function as_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $c;}
function as_request(CurlHandle $client,string $method,string $path,?array $body=null):array{
    global $origin;curl_setopt_array($client,[CURLOPT_URL=>$origin.'/LexGalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>['Origin: '.$origin,'Content-Type: application/json']]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function as_ok(array $response,string $message):array{as_assert($response[0]===200,$message);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($message.': '.json_encode($response));return $response[1];}
function as_denied(array $response,string $message):void{as_assert(in_array($response[0],[400,401,403,409,429],true),$message);}
function as_login(CurlHandle $client,string $email,string $password):array{return as_request($client,'POST','/login',['email'=>$email,'password'=>$password]);}
function as_bad_code(string $secret):string{$valid=[];for($offset=-1;$offset<=1;$offset++)$valid[]=security_test_totp($secret,intdiv(time(),30)+$offset);foreach(['000000','111111','222222','999999'] as $candidate)if(!in_array($candidate,$valid,true))return $candidate;throw new RuntimeException('Cannot select a synthetic incorrect code');}
function as_recovery(array &$codes):string{if(!$codes)throw new RuntimeException('Synthetic recovery code budget exhausted');return array_shift($codes);}
function as_clean_profile(array $data,array $forbidden,string $message):void{$json=json_encode($data);as_assert(!preg_match('/"(?:password|totp_secret|code_hash|security_version|recovery_codes)"/',$json)&&!array_filter($forbidden,fn($value)=>is_string($value)&&$value!==''&&str_contains($json,$value)),$message);}
function as_cookie(CurlHandle $client):string{foreach(curl_getinfo($client,CURLINFO_COOKIELIST) as $line){$parts=explode("\t",$line);if(($parts[5]??'')==='lexgalleri')return $parts[6];}throw new RuntimeException('Synthetic session cookie missing');}
function as_expire_pending(CurlHandle $client):void{global $privateRoot;$path=$privateRoot.'/sessions/sess_'.as_cookie($client);$session=file_get_contents($path);$updated=preg_replace('/lg_pending_expires\|i:[0-9]+;/','lg_pending_expires|i:1;',$session,-1,$count);if($count!==1)throw new RuntimeException('Expected one isolated pending expiry');file_put_contents($path,$updated);}
function as_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))as_remove($child);else unlink($child);}rmdir($path);}
// Pure helper calls run in this CLI process; the HTTP app has its own fail().
function fail(int $status,string $message):never{throw new RuntimeException($message,$status);}
function as_crypto_denied(callable $operation,string $message):void{try{$operation();as_assert(false,$message);}catch(RuntimeException $error){as_assert($error->getCode()===503,$message);}}
try{
    // Independent RFC 6238 SHA-1 vectors, reduced to the supported six digits.
    $rfcSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    foreach([59=>'287082',1111111109=>'081804',1111111111=>'050471',1234567890=>'005924',2000000000=>'279037',20000000000=>'353130'] as $time=>$expected){
        as_assert(lg_security_totp($rfcSecret,intdiv($time,30))===$expected,'TOTP matches RFC 6238 at '.$time);
        as_assert(security_test_totp($rfcSecret,intdiv($time,30))===$expected,'Independent test generator matches RFC at '.$time);
    }
    as_assert(lg_security_base32_decode($rfcSecret)==='12345678901234567890'&&lg_security_base32_encode('12345678901234567890')===$rfcSecret,'Base32 round trip matches the standard vector');
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('security-test-setup-',3)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');foreach(['app.php','schema.sql','security.php'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;$server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S',parse_url($origin,PHP_URL_HOST).':'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated security server');
    $owner=as_client();$guest=as_client();$stranger=as_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(as_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Security server unavailable');
    // Updating public code must also close direct old password-only API access
    // while the owner installs matching private programs, before any session.
    $appProgram=file_get_contents($privateRoot.'/app.php');
    file_put_contents($privateRoot.'/app.php',str_replace('const LEXGALLERI_SECURITY_VERSION = 1;','',$appProgram));
    try {
        as_assert(as_login($stranger,'admin@example.test','synthetic-password')[0]===503,'Public bootstrap blocks password-only login from an unversioned private app');
        as_assert(as_request($stranger,'GET','/galleries')[0]===503,'Public bootstrap also blocks direct legacy gallery API access');
    }finally{file_put_contents($privateRoot.'/app.php',$appProgram);}
    rename($privateRoot.'/security.php',$privateRoot.'/security.php.saved');
    try {
        as_assert(as_login($stranger,'admin@example.test','synthetic-password')[0]===503,'Public bootstrap fails closed while the owner security module is missing');
        as_assert(as_request($stranger,'GET','/galleries')[0]===503,'Missing private module never falls back to an old authenticated API');
    }finally{rename($privateRoot.'/security.php.saved',$privateRoot.'/security.php');}
    $adminPassword='long-security-admin-password';$adminEmail='admin-security@example.test';
    $challenge=as_ok(as_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Security Admin','email'=>$adminEmail,'password'=>$adminPassword]),'First admin setup starts an MFA challenge');
    as_assert(($challenge['mfa_required']??false)===true&&($challenge['mfa_enrollment_required']??false)===true&&!isset($challenge['id']),'Password setup gives no fully authenticated identity');
    foreach(['/me','/galleries','/admin/users','/photos/'.str_repeat('a',32).'/image'] as $path)as_assert(as_request($owner,'GET',$path)[0]===401,'Pending admin cannot access '.$path);
    $pending=as_ok(as_request($owner,'GET','/mfa/status'),'Pending enrollment survives a fresh request');as_assert(!isset($pending['secret'])&&!isset($pending['id']),'Pending status reveals neither secret nor authenticated user');
    $enrollment=as_ok(as_request($owner,'POST','/mfa/setup',[]),'Generate an authenticator secret');$secret=$enrollment['secret'];
    as_assert(preg_match('/^[A-Z2-7]{32}$/D',$secret)===1&&str_starts_with($enrollment['otpauth_uri'],'otpauth://totp/'),'Enrollment supplies a standard local authenticator URI');
    as_denied(as_request($owner,'POST','/mfa/confirm',['code'=>as_bad_code($secret)]),'Wrong enrollment code is rejected');
    as_assert(as_request($owner,'GET','/me')[0]===401,'Wrong enrollment code grants no session');
    $confirmed=as_ok(as_request($owner,'POST','/mfa/confirm',['code'=>security_test_previous_totp($secret)]),'Previous adjacent TOTP step confirms enrollment');$adminId=$confirmed['id'];$codes=$confirmed['recovery_codes'];
    as_assert(count($codes)===10&&count(array_unique($codes))===10,'Activation returns ten distinct recovery codes once');
    as_assert(!array_filter($codes,fn($code)=>strlen(preg_replace('/[^a-f0-9]/i','',$code))!==32),'Each recovery code carries 128 bits of printable recovery material');
    $state=$pdo->query("SELECT * FROM user_security WHERE user_id='$adminId'")->fetch();
    as_assert((int)$state['totp_enabled']===1&&!str_contains($state['totp_secret'],$secret),'Database stores an encrypted enabled TOTP secret');
    $keyPath=$privateRoot.'/config/mfa.key';as_assert(is_file($keyPath)&&filesize($keyPath)===32&&(fileperms($keyPath)&0777)===0600,'Encryption key is private, 32 bytes and mode 0600');
    $private=$privateRoot;$bound=lg_security_encrypt($secret,$adminId);as_assert(lg_security_decrypt($bound,$adminId)===$secret,'Encrypted authenticator round trips for its bound account');
    as_crypto_denied(fn()=>lg_security_decrypt($bound,str_repeat('f',32)),'Encrypted authenticator cannot be swapped into another account');
    $tampered=base64_decode(substr($bound,3),true);$tampered[30]=chr(ord($tampered[30])^1);as_crypto_denied(fn()=>lg_security_decrypt('v1:'.base64_encode($tampered),$adminId),'Modified encrypted authenticator data fails authentication');
    $codeRows=$pdo->query("SELECT * FROM user_recovery_codes WHERE user_id='$adminId'")->fetchAll();
    as_assert(count($codeRows)===10&&!array_filter($codeRows,fn($row)=>in_array($row['code_hash'],$codes,true)),'Recovery codes are stored as hashes rather than displayed values');
    $expectedHashes=array_map(fn($code)=>hash('sha256',strtoupper(preg_replace('/[^a-f0-9]/i','',$code))),$codes);$actualHashes=array_column($codeRows,'code_hash');sort($expectedHashes);sort($actualHashes);as_assert($expectedHashes===$actualHashes,'Stored recovery hashes match the normalized one-use codes');
    $profile=as_ok(as_request($owner,'GET','/profile'),'Admin can view their own profile');as_assert($profile['id']===$adminId&&!empty($profile['mfa_enabled']),'Own profile identifies the account and MFA status');as_clean_profile($profile,[$secret,...$codes],'Own profile excludes passwords and MFA material');
    $all=as_ok(as_request($owner,'GET','/admin/users'),'Admin can list family profiles');as_clean_profile($all,[$secret,...$codes],'Family list contains only safe account fields');
    $owner2=as_client();$login=as_ok(as_login($owner2,$adminEmail,$adminPassword),'Existing admin password starts MFA verification');as_assert(!empty($login['mfa_required'])&&empty($login['mfa_enrollment_required']),'Enrolled admin must verify rather than enroll again');
    as_denied(as_request($owner2,'POST','/mfa/verify',['code'=>as_bad_code($secret)]),'Incorrect login TOTP is rejected');as_assert(as_request($owner2,'GET','/admin/users')[0]===401,'Wrong second factor cannot administer users');
    $consumedTotp=security_test_totp($secret);as_ok(as_request($owner2,'POST','/mfa/verify',['code'=>$consumedTotp]),'Current TOTP completes a real login');
    $replayed=as_client();as_ok(as_login($replayed,$adminEmail,$adminPassword),'Start a second real pending login');as_denied(as_request($replayed,'POST','/mfa/verify',['code'=>$consumedTotp]),'A consumed TOTP cannot authenticate another session');as_assert(as_request($replayed,'GET','/me')[0]===401,'TOTP replay leaves the session unauthenticated');
    $usedCode=as_recovery($codes);as_ok(as_request($replayed,'POST','/mfa/verify',['code'=>$usedCode]),'A recovery code can complete pending admin login');
    $reuse=as_client();as_ok(as_login($reuse,$adminEmail,$adminPassword),'Start recovery replay check');as_denied(as_request($reuse,'POST','/mfa/verify',['code'=>$usedCode]),'A used recovery code cannot be reused');
    $security=as_ok(as_request($owner,'GET','/security/mfa'),'Read safe MFA status');as_assert((int)$security['recovery_codes_remaining']===9,'Only the used recovery code is consumed');
    $expiry=as_client();as_ok(as_login($expiry,$adminEmail,$adminPassword),'Start a pending expiry check');as_expire_pending($expiry);as_assert(as_request($expiry,'GET','/mfa/status')[0]===401,'Pending MFA expires after its deadline');as_assert(as_request($expiry,'POST','/mfa/verify',['code'=>as_recovery($codes)])[0]===401,'Expired pending session cannot use a correct recovery code');
    $logoutPending=as_client();as_ok(as_login($logoutPending,$adminEmail,$adminPassword),'Start a pending logout check');as_ok(as_request($logoutPending,'POST','/logout',[]),'Logout works before MFA is complete');as_assert(as_request($logoutPending,'GET','/mfa/status')[0]===401,'Logout destroys pending authentication');
    $legacy=as_client();$legacyId=bin2hex(random_bytes(24));file_put_contents($privateRoot.'/sessions/sess_'.$legacyId,'uid|s:32:"'.$adminId.'";expires|i:'.(time()+3600).';');curl_setopt($legacy,CURLOPT_COOKIE,'lexgalleri='.$legacyId);as_assert(as_request($legacy,'GET','/admin/users')[0]===401,'An old password-only admin session cannot bypass mandatory MFA');
    $gallery=as_ok(as_request($owner,'POST','/galleries',['name'=>'Security family gallery']),'Create a gallery for profile permissions')['id'];
    $invitation=as_ok(as_request($owner,'POST','/admin/invitations',['name'=>'Daughter','email'=>'daughter@example.test','gallery_id'=>$gallery,'upload'=>true]),'Create a member invitation');$token=explode('=',$invitation['path'])[1];$guestPassword='long-daughter-password';
    $member=as_ok(as_request($guest,'POST','/accept',['token'=>$token,'password'=>$guestPassword]),'Member invitation authenticates without admin-only MFA');$guestId=$member['id'];
    $guestProfile=as_ok(as_request($guest,'GET','/profile'),'Member sees their own profile');as_assert($guestProfile['id']===$guestId&&count($guestProfile['galleries'])===1,'Member profile shows only their account and granted gallery');
    as_assert(as_request($guest,'GET','/admin/users')[0]===403&&as_request($guest,'GET','/admin/users/'.$adminId)[0]===403,'Member cannot read other account profiles');
    as_assert(as_request($guest,'PATCH','/admin/users/'.$adminId,['name'=>'Intruder','current_password'=>$guestPassword])[0]===403,'Member cannot modify another account');
    as_assert(as_request($guest,'PATCH','/profile',['admin'=>1,'current_password'=>$guestPassword])[0]===400,'Profile mass assignment cannot promote a member');
    as_denied(as_request($guest,'PATCH','/profile',['name'=>'Wrong password','current_password'=>'wrong-password']),'Member edits require their current password');
    as_assert(as_request($guest,'GET','/profile')[1]['name']==='Daughter','Rejected profile update preserves the member name');
    $renamed=as_ok(as_request($guest,'PATCH','/profile',['name'=>'Daughter edited','current_password'=>$guestPassword]),'Member can edit their own name');as_assert(!empty($renamed['reauthentication_required']),'Self edit explicitly requests a fresh login');as_assert(as_request($guest,'GET','/me')[0]===401,'Self edit invalidates the old member session');as_ok(as_login($guest,'daughter@example.test',$guestPassword),'Member logs in after their profile change');
    $adminMember=as_ok(as_request($owner,'GET','/admin/users/'.$guestId),'Admin can inspect a member profile');as_assert($adminMember['name']==='Daughter edited','Admin sees updated member details');as_clean_profile($adminMember,[$secret,...$codes],'Member profile exposes no account security internals');
    as_denied(as_request($owner,'PATCH','/admin/users/'.$guestId,['email'=>'new-daughter@example.test','current_password'=>'wrong-admin-password','mfa_code'=>as_recovery($codes)]),'Admin changes require their own correct password');
    as_denied(as_request($owner,'PATCH','/admin/users/'.$guestId,['email'=>'new-daughter@example.test','current_password'=>$adminPassword,'mfa_code'=>as_bad_code($secret)]),'Admin changes also require a fresh second factor');
    $dupe=as_request($owner,'PATCH','/admin/users/'.$guestId,['email'=>$adminEmail,'current_password'=>$adminPassword,'mfa_code'=>as_recovery($codes)]);as_assert($dupe[0]===409,'Duplicate email change returns a conflict without merging identities');
    // Rotate backup codes through real reauthentication before further changes.
    $oldUnused=$codes[0];$rotated=as_ok(as_request($owner,'POST','/security/mfa/recovery-codes',['current_password'=>$adminPassword,'mfa_code'=>as_recovery($codes)]),'Admin regenerates recovery codes with two-factor reauthentication');$codes=$rotated['recovery_codes'];as_assert(count($codes)===10&&!in_array($oldUnused,$codes,true),'Rotated recovery codes replace previous values');
    as_assert(as_request($owner2,'GET','/me')[0]===401&&as_request($replayed,'GET','/me')[0]===401,'Regenerating recovery codes revokes other administrator sessions');
    as_ok(as_login($reuse,$adminEmail,$adminPassword),'Start a current challenge after recovery rotation');as_denied(as_request($reuse,'POST','/mfa/verify',['code'=>$oldUnused]),'Old recovery codes stop working after rotation');
    as_ok(as_login($owner2,$adminEmail,$adminPassword),'Reauthenticate a second admin session after rotation');as_ok(as_request($owner2,'POST','/mfa/verify',['code'=>as_recovery($codes)]),'New recovery codes work after rotation');
    as_ok(as_login($replayed,$adminEmail,$adminPassword),'Reauthenticate a third admin session after rotation');as_ok(as_request($replayed,'POST','/mfa/verify',['code'=>as_recovery($codes)]),'Another current recovery code establishes the third session');
    $newGuestPassword='new-long-daughter-password';$reset=as_ok(as_request($owner,'PATCH','/admin/users/'.$guestId,['name'=>'Daughter by admin','email'=>'new-daughter@example.test','password'=>$newGuestPassword,'current_password'=>$adminPassword,'mfa_code'=>as_recovery($codes)]),'Admin edits member name, email and password');
    as_assert(as_request($guest,'GET','/me')[0]===401,'Admin password reset immediately revokes an existing member session');as_assert(as_login($guest,'daughter@example.test',$guestPassword)[0]===401,'Old member email and password no longer authenticate');as_ok(as_login($guest,'new-daughter@example.test',$newGuestPassword),'Updated member credentials authenticate');
    $inviteOld=as_ok(as_request($owner,'POST','/admin/invitations',['name'=>'Daughter','email'=>'new-daughter@example.test','gallery_id'=>$gallery]),'Create a pending invite at the old member email');$oldToken=explode('=',$inviteOld['path'])[1];
    $selfEmail=as_ok(as_request($guest,'PATCH','/profile',['email'=>'daughter-final@example.test','current_password'=>$newGuestPassword]),'Member updates their own email');as_assert(!empty($selfEmail['reauthentication_required']),'Email change requires the member to log in again');
    as_assert(as_request($stranger,'POST','/accept',['token'=>$oldToken,'password'=>'another-long-password'])[0]===400,'Email change revokes outstanding invitations addressed to the old identity');as_ok(as_login($guest,'daughter-final@example.test',$newGuestPassword),'Member uses their final email');
    $adminInvite=as_ok(as_request($owner,'POST','/admin/invitations',['name'=>'Admin','email'=>$adminEmail,'gallery_id'=>$gallery]),'Invite an already existing admin account');$adminInviteClient=as_client();$adminToken=explode('=',$adminInvite['path'])[1];$adminAccept=as_ok(as_request($adminInviteClient,'POST','/accept',['token'=>$adminToken,'password'=>$adminPassword]),'Existing admin invitation acceptance returns a challenge');as_assert(!empty($adminAccept['mfa_required'])&&as_request($adminInviteClient,'GET','/admin/users')[0]===401,'Accepting an invitation cannot bypass administrator MFA');
    // Two correctly password-verified sessions may begin first-time enrollment,
    // but the later confirmation must never overwrite an enabled authenticator.
    $pdo->exec('DELETE FROM login_limits'); // Independent enrollment/concurrency fixture, not a login bypass.
    $otherId=bin2hex(random_bytes(16));$q=$pdo->prepare('INSERT INTO users VALUES(?,?,?,?,1)');$q->execute([$otherId,'second-admin@example.test','Second admin',password_hash('long-second-admin-password',PASSWORD_DEFAULT)]);
    $firstEnroll=as_client();$secondEnroll=as_client();as_ok(as_login($firstEnroll,'second-admin@example.test','long-second-admin-password'),'Start first parallel administrator enrollment');as_ok(as_login($secondEnroll,'second-admin@example.test','long-second-admin-password'),'Start second parallel administrator enrollment');
    $e1=as_ok(as_request($firstEnroll,'POST','/mfa/setup',[]),'Generate first parallel secret');$e2=as_ok(as_request($secondEnroll,'POST','/mfa/setup',[]),'Generate second parallel secret');as_assert($e1['secret']!==$e2['secret'],'Parallel pending sessions have distinct random secrets');
    $otherConfirmed=as_ok(as_request($firstEnroll,'POST','/mfa/confirm',['code'=>security_test_previous_totp($e1['secret'])]),'First enrollment can activate its authenticator');as_denied(as_request($secondEnroll,'POST','/mfa/confirm',['code'=>security_test_totp($e2['secret'])]),'Late enrollment cannot replace an already enabled authenticator');as_assert(as_request($secondEnroll,'GET','/me')[0]===401,'Rejected parallel enrollment has no authenticated session');
    $otherLogin=as_client();as_ok(as_login($otherLogin,'second-admin@example.test','long-second-admin-password'),'Log in with the first parallel authenticator');as_ok(as_request($otherLogin,'POST','/mfa/verify',['code'=>security_test_totp($e1['secret'])]),'Originally confirmed secret remains the valid second factor');
    $replace=as_ok(as_request($otherLogin,'POST','/security/mfa/replace',['current_password'=>'long-second-admin-password','mfa_code'=>$otherConfirmed['recovery_codes'][0]]),'Changing authenticator requires the existing password and second factor');as_assert(!empty($replace['mfa_enrollment_required'])&&as_request($otherLogin,'GET','/me')[0]===401,'Authenticator replacement enters a restricted pending enrollment');
    $whileReplacing=as_client();as_ok(as_login($whileReplacing,'second-admin@example.test','long-second-admin-password'),'Password-only login while replacement is pending');as_assert(as_request($whileReplacing,'POST','/mfa/setup',[])[0]===409,'A pending replacement never enables password-only authenticator setup');
    $newAuthenticator=as_ok(as_request($otherLogin,'POST','/mfa/setup',[]),'Prepare the replacement authenticator');as_assert($newAuthenticator['secret']!==$e1['secret'],'Replacement generates a new random secret');as_ok(as_request($otherLogin,'POST','/mfa/confirm',['code'=>security_test_previous_totp($newAuthenticator['secret'])]),'Replacement needs a valid code from the new authenticator');
    $newFactorLogin=as_client();as_ok(as_login($newFactorLogin,'second-admin@example.test','long-second-admin-password'),'Start login after authenticator replacement');as_denied(as_request($newFactorLogin,'POST','/mfa/verify',['code'=>security_test_totp($e1['secret'])]),'Previous authenticator cannot authenticate after replacement');as_ok(as_request($newFactorLogin,'POST','/mfa/verify',['code'=>security_test_totp($newAuthenticator['secret'])]),'New authenticator completes login after replacement');
    // Sensitive changes revoke both fully authenticated and pending sessions.
    $pendingReset=as_client();as_ok(as_login($pendingReset,$adminEmail,$adminPassword),'Start a password-verified session before changing the admin account');
    $newAdminPassword='new-long-security-admin-password';$changed=as_ok(as_request($owner,'PATCH','/profile',['email'=>'admin-security-new@example.test','password'=>$newAdminPassword,'current_password'=>$adminPassword,'mfa_code'=>as_recovery($codes)]),'Admin changes their own email and password with two factors');
    as_assert(!empty($changed['reauthentication_required']),'Own admin credential change explicitly asks for authentication again');as_assert(as_request($owner,'GET','/me')[0]===401&&as_request($owner2,'GET','/me')[0]===401&&as_request($replayed,'GET','/me')[0]===401,'Admin credential change revokes all earlier full sessions');
    as_assert(as_request($pendingReset,'GET','/mfa/status')[0]===401&&as_request($pendingReset,'POST','/mfa/verify',['code'=>as_recovery($codes)])[0]===401,'Admin credential change also revokes unfinished password-verified MFA sessions');
    as_assert(as_login($owner,$adminEmail,$adminPassword)[0]===401,'Old admin credentials are invalid');as_ok(as_login($owner,'admin-security-new@example.test',$newAdminPassword),'New admin credentials still require the second factor');as_ok(as_request($owner,'POST','/mfa/verify',['code'=>as_recovery($codes)]),'A current recovery code finishes login after credential changes');
    rename($keyPath,$keyPath.'.saved');$lostKey=as_client();as_ok(as_login($lostKey,'admin-security-new@example.test',$newAdminPassword),'Start a recovery check while the encryption key is unavailable');as_assert(as_request($lostKey,'POST','/mfa/verify',['code'=>security_test_totp($secret)])[0]===503,'A missing encryption key fails closed for authenticator verification');as_assert(!file_exists($keyPath),'Enabled accounts never silently receive a newly generated encryption key');as_ok(as_request($lostKey,'POST','/mfa/verify',['code'=>as_recovery($codes)]),'An unused recovery code still works when the encryption key is unavailable');rename($keyPath.'.saved',$keyPath);
    as_assert(!str_contains(file_get_contents($temp.'/server.log'),$secret),'Private server log does not contain the authenticator secret');
    // A missing migration must never revert to password-only authentication.
    $pdo->exec('RENAME TABLE user_recovery_codes TO test_hidden_recovery_codes, user_security TO test_hidden_user_security');
    as_assert(as_login(as_client(),'admin-security-new@example.test',$newAdminPassword)[0]===503,'Missing security tables fail closed during admin login');as_assert(as_request($owner,'GET','/admin/users')[0]===503,'Missing security tables fail closed for an existing administrator session');
    $pdo->exec('RENAME TABLE test_hidden_user_security TO user_security, test_hidden_recovery_codes TO user_recovery_codes');
    // Independent rate-limit fixture after successful account tests.
    $pdo->exec('DELETE FROM login_limits');$brute=as_client();as_ok(as_login($brute,'admin-security-new@example.test',$newAdminPassword),'Start isolated second-factor rate limit fixture');$limited=false;
    for($i=0;$i<25;$i++){$attempt=as_request($brute,'POST','/mfa/verify',['code'=>as_bad_code($secret)]);if($attempt[0]===429){$limited=true;break;}as_assert(in_array($attempt[0],[400,401,403],true),'Incorrect second factor attempt remains unauthenticated');}
    as_assert($limited&&as_request($brute,'GET','/admin/users')[0]!==200,'Repeated second-factor failures are rate limited and grant no administration');
    echo "\nAccount security: $checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');as_remove($temp);}
exit($failures?1:0);
