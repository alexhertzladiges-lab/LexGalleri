<?php
declare(strict_types=1);
// Isolated synthetic accounts, SQL and media. Never uses production config.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-member-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';mkdir($privateRoot.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8781);$server=null;$checks=0;$failures=0;
function um_assert(bool $ok,string $message):void{global $checks,$failures;$checks++;if(!$ok)$failures++;echo($ok?'PASS: ':'FAIL: ').$message."\n";}
function um_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $c;}
function um_request(CurlHandle $c,string $method,string $path,?array $body=null,?string $from=null):array{global $origin;curl_setopt_array($c,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>['Origin: '.($from??$origin),'Content-Type: application/json']]);$raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));return[(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];}
function um_ok(array $r,string $message):array{um_assert($r[0]===200,$message);if($r[0]!==200||!is_array($r[1]))throw new RuntimeException($message.': '.json_encode($r));return $r[1];}
function um_query(string $sql,array $args=[]):PDOStatement{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return $s;}
function um_count(string $sql,array $args=[]):int{return(int)um_query($sql,$args)->fetchColumn();}
function um_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))um_remove($child);else unlink($child);}rmdir($path);}
function um_paths(string $id):array{global $privateRoot;return[$privateRoot.'/originals/'.$id.'.bin',$privateRoot.'/previews/'.$id.'.jpg',$privateRoot.'/thumbnails/'.$id.'.jpg'];}
function um_seed(string $id,string $gallery,string $uploader,string $mime):void{um_query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$gallery,'Synthetic family media '.$id,'synthetic.bin',$mime,$uploader,'2026-01-01T00:00:00Z','','unknown','',null,null,hash('sha256',$id)]);foreach(um_paths($id) as $i=>$path)file_put_contents($path,'Synthetic original/preview '.$id.' '.$i);}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('member-test-setup-',3)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;$server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start disposable member-delete server');
    $admin=um_client();$member=um_client();$member2=um_client();$other=um_client();$anonymous=um_client();$pending=um_client();$ready=false;
    for($i=0;$i<60;$i++){usleep(100000);try{if(um_request($anonymous,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Disposable member-delete server unavailable');
    $owner=um_ok(security_test_complete_admin($admin,um_request($admin,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Synthetic Admin','email'=>'member-admin@example.test','password'=>'long-member-admin-password']),'um_request'),'Administrator completes Authenticator enrollment');$adminId=$owner['id'];
    $gallery=um_ok(um_request($admin,'POST','/galleries',['name'=>'Preserved gallery']),'Create gallery')['id'];
    $otherGallery=um_ok(um_request($admin,'POST','/galleries',['name'=>'Other gallery']),'Create unrelated gallery')['id'];
    $invite=um_ok(um_request($admin,'POST','/admin/invitations',['name'=>'Original uploader','email'=>'original-member@example.test','gallery_id'=>$gallery,'upload'=>true,'download'=>true,'gps'=>true]),'Invite target member');
    $memberId=um_ok(um_request($member,'POST','/accept',['token'=>explode('=',$invite['path'])[1],'password'=>'long-original-password']),'Member accepts invitation')['id'];
    um_ok(um_request($member2,'POST','/login',['email'=>'original-member@example.test','password'=>'long-original-password']),'Member starts a second independent session');
    $otherInvite=um_ok(um_request($admin,'POST','/admin/invitations',['name'=>'Other member','email'=>'other-member@example.test','gallery_id'=>$otherGallery]),'Invite unrelated member');
    $otherId=um_ok(um_request($other,'POST','/accept',['token'=>explode('=',$otherInvite['path'])[1],'password'=>'long-other-password']),'Other member accepts')['id'];
    um_query('INSERT INTO grants VALUES(?,?,1,1,1)',[$otherGallery,$memberId]);
    $unusedInvite=um_ok(um_request($admin,'POST','/admin/invitations',['name'=>'Original uploader','email'=>'original-member@example.test','gallery_id'=>$otherGallery]),'Create an unused invitation for target email');
    $keptInvite=um_ok(um_request($admin,'POST','/admin/invitations',['name'=>'Unrelated future member','email'=>'future@example.test','gallery_id'=>$gallery]),'Create unrelated unused invitation');
    $jpeg=str_repeat('1',32);$video=str_repeat('2',32);$adminPhoto=str_repeat('3',32);um_seed($jpeg,$gallery,$memberId,'image/jpeg');um_seed($video,$gallery,$memberId,'video/mp4');um_seed($adminPhoto,$gallery,$adminId,'image/jpeg');
    um_query('INSERT INTO favorites VALUES(?,?),(?,?)',[$jpeg,$memberId,$jpeg,$adminId]);
    um_query('INSERT INTO user_recovery_codes VALUES(?,?,?,NULL,?)',[bin2hex(random_bytes(16)),$memberId,hash('sha256','synthetic-unused-code'),'synthetic']);
    $requestId=str_repeat('4',32);um_query('INSERT INTO media_delete_requests(id,photo_id,gallery_id,gallery_name,requester_id,requester_name,title,mime,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$requestId,$jpeg,$gallery,'Preserved gallery',$memberId,'Original uploader','Synthetic family media','image/jpeg','pending','synthetic','synthetic']);
    $hashes=[];foreach([$jpeg,$video,$adminPhoto] as $id)$hashes[$id]=array_map(fn($path)=>hash_file('sha256',$path),um_paths($id));
    $tables=$pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);$version=um_count('SELECT session_version FROM user_security WHERE user_id=?',[$memberId]);
    um_assert(um_request($admin,'GET','/status')[1]['capabilities']['member_delete']===true,'Status advertises deletion only from the matching security module');
    um_assert(um_request($anonymous,'DELETE','/admin/users/'.$memberId,['confirm'=>true])[0]===401,'Anonymous deletion is denied');
    um_ok(um_request($pending,'POST','/login',['email'=>'member-admin@example.test','password'=>'long-member-admin-password']),'Password-only administrator starts pending MFA');
    um_assert(um_request($pending,'DELETE','/admin/users/'.$memberId,['confirm'=>true])[0]===401,'Pending administrator cannot delete a member');
    um_assert(um_request($member,'DELETE','/admin/users/'.$otherId,['confirm'=>true])[0]===403&&um_request($member,'DELETE','/admin/users/'.$memberId,['confirm'=>true])[0]===403,'Members cannot delete another account or themselves');
    um_assert(um_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>true],'https://evil.example')[0]===403,'Cross-origin member deletion is denied');
    um_assert(um_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>false])[0]===400,'An explicit confirmation is required');
    um_assert(um_request($admin,'DELETE','/admin/users/'.$adminId,['confirm'=>true])[0]===409,'The active administrator is protected from deletion');
    $anotherAdmin=str_repeat('a',32);um_query('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,1)',[$anotherAdmin,'protected-admin@example.test','Protected admin',password_hash('long-protected-password',PASSWORD_DEFAULT)]);
    um_assert(um_request($admin,'DELETE','/admin/users/'.$anotherAdmin,['confirm'=>true])[0]===409,'Other administrator accounts are protected too');
    um_assert(um_request($admin,'DELETE','/admin/users/'.str_repeat('f',32),['confirm'=>true])[0]===404,'Unknown accounts are not acknowledged as deleted');
    $pdo->exec("CREATE TRIGGER synthetic_member_failure BEFORE UPDATE ON users FOR EACH ROW BEGIN IF OLD.id='$memberId' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic member deletion failure'; END IF; END");
    um_assert(um_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>true])[0]===500,'A database failure is not acknowledged as success');
    um_assert(um_count('SELECT COUNT(*) FROM grants WHERE user_id=?',[$memberId])===2&&um_count('SELECT COUNT(*) FROM favorites WHERE user_id=?',[$memberId])===1,'Failure rolls back membership and favorites changes');
    um_assert(um_count('SELECT COUNT(*) FROM invitations WHERE email=?',['original-member@example.test'])===2&&um_count('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id=?',[$memberId])===1,'Failure preserves invitations and recovery data');
    um_assert(um_count('SELECT session_version FROM user_security WHERE user_id=?',[$memberId])===$version&&um_request($member,'GET','/me')[0]===200,'Failure preserves the existing session and security epoch');
    um_assert(um_count('SELECT COUNT(*) FROM settings WHERE `key`=?',['deleted_user_'.$memberId])===0,'Failure leaves no deletion marker');$pdo->exec('DROP TRIGGER synthetic_member_failure');
    $deleted=um_ok(um_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>true]),'Admin confirms member deletion');um_assert($deleted===['ok'=>true,'id'=>$memberId],'Successful acknowledgment identifies only the selected account');
    $list=um_ok(um_request($admin,'GET','/admin/users'),'Read remaining members');$ids=array_column($list['users'],'id');um_assert(!in_array($memberId,$ids,true)&&in_array($otherId,$ids,true)&&in_array($adminId,$ids,true),'Only the target leaves the member list');
    um_assert(um_count('SELECT COUNT(*) FROM grants WHERE user_id=?',[$memberId])===0&&um_count('SELECT COUNT(*) FROM favorites WHERE user_id=?',[$memberId])===0,'Target gallery access and favorites are removed');
    um_assert(um_count('SELECT COUNT(*) FROM favorites WHERE user_id=?',[$adminId])===1&&um_count('SELECT COUNT(*) FROM grants WHERE user_id=?',[$otherId])===1,'Other accounts retain their favorites and access');
    um_assert(um_count('SELECT COUNT(*) FROM invitations WHERE email=?',['original-member@example.test'])===0&&um_count('SELECT COUNT(*) FROM invitations WHERE email=?',['future@example.test'])===1,'Only the target email invitations are revoked');
    um_assert(um_count('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id=?',[$memberId])===0&&um_count('SELECT session_version FROM user_security WHERE user_id=?',[$memberId])===$version+1,'Recovery codes are removed and all previous session epochs invalidated');
    $retained=um_query('SELECT * FROM users WHERE id=?',[$memberId])->fetch();um_assert($retained['name']==='Original uploader'&&$retained['email']!=='original-member@example.test'&&!password_verify('long-original-password',$retained['password']),'Uploader identity remains while contact details and usable credentials are removed');
    foreach([$jpeg,$video,$adminPhoto] as $id)um_assert(array_map(fn($path)=>hash_file('sha256',$path),um_paths($id))===$hashes[$id],'All original/preview/thumbnail bytes remain unchanged for '.$id);
    um_assert(um_count('SELECT COUNT(*) FROM photos WHERE uploader=?',[$memberId])===2&&um_count('SELECT COUNT(*) FROM galleries')===2,'Uploaded photos, MP4 and galleries remain');
    um_assert(um_query('SELECT status FROM media_delete_requests WHERE id=?',[$requestId])->fetchColumn()==='pending','Existing media deletion requests stay available for independent admin review');
    foreach(['/me','/profile','/galleries','/galleries/'.$gallery.'/photos','/photos/'.$jpeg.'/image','/photos/'.$video.'/video'] as $path)um_assert(um_request($member,'GET',$path)[0]===401,'Deleted session cannot access '.$path);
    um_assert(um_request($member2,'GET','/me')[0]===401,'A second previously authenticated device is also denied');
    um_assert(um_request($member2,'POST','/galleries',['name'=>'Forbidden after deletion'])[0]===401,'Deleted sessions cannot create new galleries');
    um_assert(um_request(um_client(),'POST','/login',['email'=>'original-member@example.test','password'=>'long-original-password'])[0]===401,'Former credentials cannot log in');
    um_assert(um_request(um_client(),'POST','/login',['email'=>$retained['email'],'password'=>'!deleted-account!'])[0]===401,'Retained history identity cannot log in using its invalid credential marker');
    um_assert(um_request($admin,'GET','/admin/users/'.$memberId)[0]===404,'A deleted profile cannot be reopened as an active account');
    um_assert(um_request($admin,'PUT','/admin/grants',['user_id'=>$memberId,'gallery_id'=>$gallery,'view'=>true])[0]===404,'A deleted identity cannot be regranted access');
    um_ok(um_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>true]),'A repeated confirmed deletion is idempotent');
    um_assert(um_request($anonymous,'POST','/accept',['token'=>explode('=',$unusedInvite['path'])[1],'password'=>'long-original-password'])[0]===400,'A revoked old invitation cannot restore access');
    $media=um_ok(um_request($admin,'GET','/galleries/'.$gallery.'/photos'),'Admin can still see all gallery media');$uploaders=array_column($media['photos'],'uploader_name','id');um_assert($uploaders[$jpeg]==='Original uploader'&&$uploaders[$video]==='Original uploader','Photo and MP4 uploader names remain historically accurate');
    um_assert(um_request($admin,'GET','/photos/'.$jpeg.'/image?size=original')[0]===200&&um_request($admin,'GET','/photos/'.$video.'/video')[0]===200,'Preserved originals and videos remain accessible to admin');
    um_assert(um_request($other,'GET','/me')[0]===200,'Unrelated member session stays valid');
    $newInvite=um_ok(um_request($admin,'POST','/admin/invitations',['name'=>'New invitation','email'=>'original-member@example.test','gallery_id'=>$otherGallery]),'The former email can be invited again');
    $new=um_ok(um_request(um_client(),'POST','/accept',['token'=>explode('=',$newInvite['path'])[1],'password'=>'long-new-member-password']),'Reinvitation creates a new member');um_assert($new['id']!==$memberId,'New membership has a new account identity');
    um_assert(um_count('SELECT COUNT(*) FROM grants WHERE user_id=?',[$new['id']])===1&&um_count('SELECT COUNT(*) FROM photos WHERE uploader=?',[$new['id']])===0,'Reinvitation grants only the selected gallery and never takes ownership of historical media');
    um_assert($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN)===$tables,'Member deletion requires no schema migration');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');um_remove($temp);}
exit($failures?1:0);
