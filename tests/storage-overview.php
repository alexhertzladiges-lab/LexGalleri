<?php
declare(strict_types=1);
// Synthetic accounts, media and random database only. No hosting credentials.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-storage-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';mkdir($privateRoot.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8783);$server=null;$checks=0;$failures=0;
function iv_assert(bool $ok,string $message):void{global $checks,$failures;$checks++;if(!$ok)$failures++;echo($ok?'PASS: ':'FAIL: ').$message."\n";}
function iv_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $c;}
function iv_request(CurlHandle $c,string $method,string $path,?array $body=null,?string $from=null):array{global $origin;curl_setopt_array($c,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>['Origin: '.($from??$origin),'Content-Type: application/json']]);$raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));return[(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];}
function iv_ok(array $r,string $message):array{iv_assert($r[0]===200,$message);if($r[0]!==200||!is_array($r[1]))throw new RuntimeException($message.': '.json_encode($r));return $r[1];}
function iv_query(string $sql,array $args=[]):PDOStatement{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return $s;}
function iv_count(string $sql,array $args=[]):int{return(int)iv_query($sql,$args)->fetchColumn();}
function iv_token(array $reply):string{parse_str((string)parse_url($reply['path'],PHP_URL_QUERY),$q);return$q['invite'];}
function iv_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))iv_remove($child);else unlink($child);}rmdir($path);}
function iv_seed(string $id,string $gallery,string $uploader):void{global $privateRoot;iv_query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$gallery,'Original title','synthetic.jpg','image/jpeg',$uploader,'2026-01-01T00:00:00Z','','unknown','Original place',55.67,12.56,hash('sha256',$id)]);foreach(['originals/'.$id.'.bin','previews/'.$id.'.jpg','thumbnails/'.$id.'.jpg'] as $path)file_put_contents($privateRoot.'/'.$path,'Synthetic image bytes '.$id);}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('invite-test-setup-',3)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;$server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start disposable invitation server');
    $admin=iv_client();$member=iv_client();$anonymous=iv_client();$pending=iv_client();$ready=false;
    for($i=0;$i<60;$i++){usleep(100000);try{if(iv_request($anonymous,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Disposable invitation server unavailable');
    $owner=iv_ok(security_test_complete_admin($admin,iv_request($admin,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Invite admin','email'=>'invite-admin@example.test','password'=>'long-invite-admin-password']),'iv_request'),'Admin completes Authenticator enrollment');$adminId=$owner['id'];
    $migration=file_get_contents($root.'/private/migrations/006_gallery_permissions.sql');$pdo->exec($migration);$pdo->exec($migration);iv_assert(true,'Gallery permission migration can be applied repeatedly');
    $pdo->exec("ALTER TABLE users DROP COLUMN phone");$pdo->exec("ALTER TABLE users MODIFY email VARCHAR(254) NOT NULL");$pdo->exec("ALTER TABLE invitations DROP COLUMN phone, DROP COLUMN accepted_user_id");$pdo->exec("ALTER TABLE invitations MODIFY email VARCHAR(254) NOT NULL");$pdo->exec("DELETE FROM settings WHERE `key`='invitation_version'");
    $upgrade=file_get_contents($root.'/private/migrations/007_reusable_phone_invitations.sql');$pdo->exec($upgrade);$pdo->exec($upgrade);iv_assert(true,'Phone invitation migration upgrades the previous schema and is repeatable');
    $ids=[];foreach(['A','B','C'] as $name)$ids[$name]=iv_ok(iv_request($admin,'POST','/galleries',['name'=>'Gallery '.$name]),'Create gallery '.$name)['id'];
    $photoA=str_repeat('1',32);$photoB=str_repeat('2',32);iv_seed($photoA,$ids['A'],$adminId);iv_seed($photoB,$ids['B'],$adminId);
    $status=iv_ok(iv_request($anonymous,'GET','/status'),'Read capabilities');iv_assert($status['capabilities']['multi_gallery_invitations']===true&&$status['capabilities']['gallery_edit']===true,'Completed private installation enables invitations and gallery editing');
    $rootMedia=$privateRoot;
    $sum=function(string $id)use($rootMedia):int{return strlen(file_get_contents($rootMedia.'/originals/'.$id.'.bin'))+strlen(file_get_contents($rootMedia.'/previews/'.$id.'.jpg'))+strlen(file_get_contents($rootMedia.'/thumbnails/'.$id.'.jpg'));};
    $expected=$sum($photoA)+$sum($photoB);
    $s=iv_ok(iv_request($admin,'GET','/admin/storage'),'Read first media-space snapshot');
    iv_assert($s['limit_bytes']===25000000000&&$s['total_bytes']===$expected&&$s['complete']===true,'Default is 25 decimal GB and only the actual media files are counted');
    $sizes=array_column($s['galleries'],'bytes','id');iv_assert($sizes[$ids['A']]===$sum($photoA)&&$sizes[$ids['B']]===$sum($photoB)&&$sizes[$ids['C']]===0,'Each gallery has its own measured file usage including empty galleries');
    $invite=iv_ok(iv_request($admin,'POST','/admin/invitations',['name'=>'Storage guest','email'=>'storage@example.test','gallery_id'=>$ids['A']]),'Invite an ordinary member');
    iv_ok(iv_request($member,'POST','/accept',['token'=>iv_token($invite),'password'=>'long-storage-member-password']),'Ordinary member logs in');
    iv_assert(iv_request($anonymous,'GET','/admin/storage')[0]===401&&iv_request($member,'GET','/admin/storage')[0]===403,'Only authenticated administrators can see global space and private gallery sizes');
    iv_ok(iv_request($pending,'POST','/login',['email'=>'invite-admin@example.test','password'=>'long-invite-admin-password']),'Start pending administrator login');
    iv_assert(iv_request($pending,'GET','/admin/storage')[0]===401,'Pending MFA cannot read disk usage');
    iv_assert(iv_request($member,'PUT','/admin/storage/limit',['limit_gb'=>'50'])[0]===403&&iv_request($member,'POST','/admin/storage/refresh',[])[0]===403,'Members cannot change the capacity or trigger filesystem scans');
    file_put_contents($rootMedia.'/originals/not-assigned.bin',str_repeat('x',123));
    $cached=iv_ok(iv_request($admin,'GET','/admin/storage'),'Read short-lived cached snapshot');iv_assert($cached['cached']===true&&$cached['total_bytes']===$expected,'Normal reads reuse the snapshot rather than scanning on every request');
    $s=iv_ok(iv_request($admin,'POST','/admin/storage/refresh',[]),'Refresh actual file measurement');$expected+=123;iv_assert($s['total_bytes']===$expected&&$s['other_bytes']===123,'Unassigned or temporary media bytes remain included in the total');
    $photoC=bin2hex(random_bytes(16));iv_seed($photoC,$ids['C'],$adminId);$original=$rootMedia.'/originals/'.$photoC.'.bin';unlink($original);link($rootMedia.'/originals/'.$photoA.'.bin',$original);
    mkdir($rootMedia.'/originals/.shared',0700);link($original,$rootMedia.'/originals/.shared/anchor.bin');
    $extra=strlen(file_get_contents($rootMedia.'/previews/'.$photoC.'.jpg'))+strlen(file_get_contents($rootMedia.'/thumbnails/'.$photoC.'.jpg'));$expected+=$extra;
    $s=iv_ok(iv_request($admin,'POST','/admin/storage/refresh',[]),'Measure a shared imported original and its anchor');$sizes=array_column($s['galleries'],'bytes','id');
    iv_assert($s['total_bytes']===$expected&&$s['shared_bytes']===strlen(file_get_contents($original)),'Hard-linked originals count only once physically, including hidden import anchors');
    iv_assert($sizes[$ids['A']]===$sum($photoA)&&$sizes[$ids['C']]===$sum($photoC),'Each sharing gallery still shows the files associated with its own media');
    iv_assert(array_sum($sizes)>$s['total_bytes']-$s['other_bytes'],'The shared-file explanation is necessary because gallery figures can overlap');
    mkdir($rootMedia.'/.deletions/'.str_repeat('d',32),0700,true);file_put_contents($rootMedia.'/.deletions/'.str_repeat('d',32).'/original.bin','pending-delete');$expected+=14;
    file_put_contents($rootMedia.'/outside-sentinel',str_repeat('private',100));symlink($rootMedia.'/outside-sentinel',$rootMedia.'/originals/external-link.bin');
    $s=iv_ok(iv_request($admin,'POST','/admin/storage/refresh',[]),'Measure pending deletion and a non-followed symbolic link');iv_assert($s['total_bytes']===$expected&&$s['complete']===false&&$s['skipped_entries']===1,'Pending cleanup counts; external symlinks are never followed and partial results are labelled');unlink($rootMedia.'/originals/external-link.bin');
    $cache=(string)iv_query("SELECT value FROM settings WHERE `key`='storage_snapshot_v1'")->fetchColumn();
    $lock='lexgalleri-storage-'.substr(hash('sha256',$database),0,32);iv_query('SELECT GET_LOCK(?,0)',[$lock]);
    iv_assert(iv_request($admin,'POST','/admin/storage/refresh',[])[0]===409&&(string)iv_query("SELECT value FROM settings WHERE `key`='storage_snapshot_v1'")->fetchColumn()===$cache,'A concurrent scan is refused without overwriting the last measured snapshot');iv_query('SELECT RELEASE_LOCK(?)',[$lock]);
    foreach(['0','-1','abc','1e9','25; DROP TABLE photos','100000.001',[],null] as $invalid)iv_assert(iv_request($admin,'PUT','/admin/storage/limit',['limit_gb'=>$invalid])[0]===400,'Invalid capacity is rejected');
    iv_assert(iv_request($admin,'PUT','/admin/storage/limit',['limit_gb'=>'50','root'=>'/home'])[0]===400&&iv_request($admin,'POST','/admin/storage/refresh',['root'=>'/home'])[0]===400,'Client cannot select a filesystem root or inject additional settings');
    iv_assert(iv_request($admin,'PUT','/admin/storage/limit',['limit_gb'=>'50'],'https://evil.example')[0]===403,'Cross-origin capacity changes are denied');
    $saved=iv_ok(iv_request($admin,'PUT','/admin/storage/limit',['limit_gb'=>'30,5']),'Save a larger capacity using Danish decimal notation');iv_assert($saved['limit_bytes']===30500000000&&iv_ok(iv_request($admin,'GET','/admin/storage'),'Read persisted capacity')['limit_bytes']===30500000000,'Capacity persists exactly without floating-point rounding');
    $sparse=fopen($rootMedia.'/originals/budget-test.bin','wb');ftruncate($sparse,31000000000);fclose($sparse);$expected+=31000000000;
    $s=iv_ok(iv_request($admin,'POST','/admin/storage/refresh',[]),'Measure a synthetic sparse file beyond the selected budget');iv_assert($s['total_bytes']===$expected&&$s['total_bytes']>$s['limit_bytes']&&$s['complete']===true,'Over-budget usage is reported honestly without clamping the byte count');
    iv_ok(iv_request($admin,'PUT','/admin/storage/limit',['limit_gb'=>'0.001']),'A display budget can be lowered below actual usage');iv_ok(iv_request($admin,'POST','/galleries',['name'=>'Budget does not change hosting or upload rights']),'Changing the display budget does not silently block existing application actions');
    $raw=json_encode($s);iv_assert(!str_contains($raw,$privateRoot)&&!str_contains($raw,'db_password')&&!str_contains($raw,'outside-sentinel'),'API exposes sizes and gallery names, never private paths, credentials or unrelated files');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');iv_remove($temp);}
exit($failures?1:0);
