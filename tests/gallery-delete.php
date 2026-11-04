<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
// All accounts, media, journals and SQL mutations are isolated synthetic data.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-gallery-delete-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';
mkdir($privateRoot.'/config',0700,true);$database='lexgalleri_test_'.bin2hex(random_bytes(6));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$checks=0;$failures=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8772);
function gd_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if($ok)echo "PASS: $label\n";else{$failures++;fwrite(STDERR,"FAIL: $label\n");}}
function gd_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>15]);return $c;}
function gd_request(CurlHandle $client,string $method,string $path,?array $body=null,?string $requestOrigin=null,array $extra=[]):array{
    global $origin;$headers=['Content-Type: application/json'];if($requestOrigin!=='')$headers[]='Origin: '.($requestOrigin??$origin);
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>array_merge($headers,$extra)]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function gd_ok(array $response,string $label):array{gd_assert($response[0]===200,$label);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));return $response[1];}
function gd_remove(string $path):void{if(is_link($path)||!is_dir($path)){unlink($path);return;}foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')gd_remove($path.'/'.$name);rmdir($path);}
function gd_paths(string $id):array{global $privateRoot;return[$privateRoot.'/originals/'.$id.'.bin',$privateRoot.'/previews/'.$id.'.jpg',$privateRoot.'/thumbnails/'.$id.'.jpg'];}
function gd_count(string $sql,array $args=[]):int{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return(int)$s->fetchColumn();}
function gd_seed(string $id,string $gallery,string $owner,string $mime,string $bytes):void{
    global $pdo;$s=$pdo->prepare('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $s->execute([$id,$gallery,'Synthetic media '.$id,$mime==='video/mp4'?'synthetic.mp4':'synthetic.jpg',$mime,$owner,'2026-01-01T00:00:00Z','','unknown','Synthetic',null,null,hash('sha256',$bytes)]);
    foreach(gd_paths($id) as $i=>$path)file_put_contents($path,$i===0?$bytes:'Private synthetic preview '.$i.' '.$id);
}
function gd_stage(string $id):string{
    global $privateRoot,$pdo;$directory=$privateRoot.'/.deletions/'.$id;if(!is_dir($directory))mkdir($directory,0700,true);
    $s=$pdo->prepare('SELECT * FROM photos WHERE id=?');$s->execute([$id]);$photo=$s->fetch();
    file_put_contents($directory.'/receipt.json',json_encode(['version'=>1,'photo_id'=>$id,'photo'=>$photo,'created'=>'synthetic']));
    foreach(array_combine(['original.bin','view.jpg','thumb.jpg'],gd_paths($id)) as $name=>$path)if(is_file($path))rename($path,$directory.'/'.$name);
    return $directory;
}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('delete-test-',4)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');
    foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    $server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated delete test server');
    $owner=gd_client();$guest=gd_client();$anonymous=gd_client();$pending=gd_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(gd_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Delete test server did not become ready');
    gd_assert(gd_request($owner,'GET','/status')[1]['capabilities']['media_delete']===true,'Deletion capability is advertised by the upgraded private backend');
    gd_ok(security_test_complete_admin($owner,gd_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Delete admin','email'=>'delete-admin@example.test','password'=>'long-admin-password']),'gd_request'),'Real administrator setup includes Authenticator confirmation');
    $ownerId=gd_request($owner,'GET','/me')[1]['id'];$gallery=gd_ok(gd_request($owner,'POST','/galleries',['name'=>'Delete tests']),'Create synthetic gallery')['id'];
    $otherGallery=gd_ok(gd_request($owner,'POST','/galleries',['name'=>'Other gallery']),'Create separate gallery')['id'];
    $invitation=gd_ok(gd_request($owner,'POST','/admin/invitations',['name'=>'Delete member','email'=>'delete-member@example.test','gallery_id'=>$gallery,'upload'=>true,'download'=>true,'gps'=>true]),'Invite a member with all ordinary gallery permissions');
    parse_str((string)parse_url($invitation['path'],PHP_URL_QUERY),$invite);
    $guestId=gd_ok(gd_request($guest,'POST','/accept',['token'=>$invite['invite'],'password'=>'long-member-password']),'Member accepts invitation')['id'];

    function gd_plan(CurlHandle $c,string $g):array{$p=gd_ok(gd_request($c,'GET','/galleries/'.$g.'/deletion'),'Deletion preview');return ['confirm_name'=>$p['name'],'version'=>$p['version']];}
    function gd_exists(string $g):bool{return gd_count('SELECT COUNT(*) FROM galleries WHERE id=?',[$g])===1;}
    $own=gd_ok(gd_request($guest,'POST','/galleries',['name'=>'Mit ægte galleri']),'Member creates gallery')['id'];$plan=gd_plan($owner,$own);
    gd_assert(gd_request($anonymous,'DELETE','/galleries/'.$own,$plan)[0]===401,'Anonymous cannot delete gallery');
    gd_assert(gd_request($pending,'POST','/login',['email'=>'delete-admin@example.test','password'=>'long-admin-password'])[1]['mfa_required']===true,'Password alone remains pending MFA');
    gd_assert(gd_request($pending,'DELETE','/galleries/'.$own,$plan)[0]===401,'Pending MFA cannot delete gallery');
    gd_assert(gd_request($guest,'DELETE','/galleries/'.$own,$plan)[0]===403,'Owner cannot directly delete gallery');
    gd_assert(gd_request($guest,'POST','/galleries/'.$gallery.'/deletion-request',[])[0]===403,'Shared uploader is not owner');
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$plan,'https://evil.example')[0]===403,'Cross-origin deletion refused');
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$plan,'')[0]===403,'Missing origin refused');
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$plan,null,['Sec-Fetch-Site: cross-site'])[0]===403,'Cross-site refused');
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,['confirm_name'=>'forkert','version'=>$plan['version']])[0]===400,'Exact name required');
    gd_assert(gd_exists($own),'Denied requests preserve gallery');
    $r=gd_ok(gd_request($guest,'POST','/galleries/'.$own.'/deletion-request',[]),'Owner requests deletion')['request'];
    $again=gd_ok(gd_request($guest,'POST','/galleries/'.$own.'/deletion-request',[]),'Repeated request')['request'];
    gd_assert($r['id']===$again['id']&&gd_exists($own),'Request idempotent and nondestructive');
    gd_assert(count(gd_ok(gd_request($owner,'GET','/admin/gallery-deletion-requests'),'Admin queue')['requests'])===1,'Admin sees request');
    gd_assert(gd_request($guest,'GET','/admin/gallery-deletion-requests')[0]===403,'Member cannot read admin queue');
    gd_ok(gd_request($guest,'DELETE','/galleries/'.$own.'/deletion-request',[]),'Owner cancels');gd_assert(gd_exists($own),'Cancel preserves gallery');
    $r=gd_ok(gd_request($guest,'POST','/galleries/'.$own.'/deletion-request',[]),'New request')['request'];
    gd_assert(gd_request($guest,'POST','/admin/galleries/'.$own.'/deletion-reject',['request_id'=>$r['id']])[0]===403,'Member cannot decide');
    gd_ok(gd_request($owner,'POST','/admin/galleries/'.$own.'/deletion-reject',['request_id'=>$r['id']]),'Admin rejects');gd_assert(gd_exists($own),'Reject preserves gallery');
    $r=gd_ok(gd_request($guest,'POST','/galleries/'.$own.'/deletion-request',[]),'Resubmit')['request'];
    for($i=1;$i<=13;$i++)gd_seed(str_pad(dechex($i),32,'0',STR_PAD_LEFT),$own,$i===1?$ownerId:$guestId,$i===2?'video/mp4':'image/jpeg','Synthetic '.$i);
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$plan)[0]===409,'Added media invalidates confirmation');
    $otherId=str_repeat('f',32);gd_seed($otherId,$otherGallery,$ownerId,'image/jpeg','Keep other gallery');
    $pdo->prepare('INSERT INTO favorites(photo_id,user_id) VALUES(?,?)')->execute([str_pad('1',32,'0',STR_PAD_LEFT),$ownerId]);
    $pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));
    $job=str_repeat('b',32);$pdo->prepare('INSERT INTO lychee_import_jobs VALUES(?,?,?,?,?,?,?,?,?)')->execute([$job,str_repeat('c',64),'6.6.12','completed','',1,$ownerId,'synthetic','synthetic']);
    $pdo->prepare('INSERT INTO lychee_import_albums VALUES(?,?,?,?,?,?,?,?)')->execute([$job,'source-album',null,'Imported','Desc','Imported','{}',$own]);
    // Imported album and invitation references must not either block deletion
    // or widen the rights of invitations that also cover another gallery.
    $multi=gd_ok(gd_request($owner,'POST','/admin/invitations',['name'=>'Multi','email'=>'multi@example.test','galleries'=>[['gallery_id'=>$own,'upload'=>true,'download'=>true,'gps'=>true],['gallery_id'=>$otherGallery,'upload'=>false,'download'=>false,'gps'=>false]]]),'Multi-gallery invitation');
    parse_str((string)parse_url($multi['path'],PHP_URL_QUERY),$multiQuery);$multiHash=hash('sha256',$multiQuery['invite']);
    $single=gd_ok(gd_request($owner,'POST','/admin/invitations',['name'=>'Single','email'=>'single@example.test','gallery_id'=>$own]),'Single-gallery invitation');
    parse_str((string)parse_url($single['path'],PHP_URL_QUERY),$singleQuery);$singleHash=hash('sha256',$singleQuery['invite']);
    $oldRequest=$r['id'];$ownerChange=$pdo->prepare('UPDATE settings SET value=? WHERE `key`=?');$ownerChange->execute([$ownerId,'gallery_owner_'.$own]);
    $ownerPlan=gd_plan($owner,$own);$ownerPlan['request_id']=$r['id'];
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$ownerPlan)[0]===409,'Changed owner invalidates old member request');
    gd_assert(gd_request($guest,'POST','/galleries/'.$own.'/deletion-request',[])[0]===403,'Former owner cannot request deletion');
    $ownerChange->execute([$guestId,'gallery_owner_'.$own]);
    $pdo->prepare('DELETE FROM gallery_editors WHERE gallery_id=? AND user_id=?')->execute([$own,$guestId]);
    $rightsPlan=gd_plan($owner,$own);$rightsPlan['request_id']=$r['id'];
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,$rightsPlan)[0]===409,'Revoked owner editing rights invalidate approval');
    $pdo->prepare('INSERT INTO gallery_editors(gallery_id,user_id) VALUES(?,?)')->execute([$own,$guestId]);
    $plan=gd_plan($owner,$own);$plan['request_id']=$r['id'];
    $result=gd_ok(gd_request($owner,'DELETE','/galleries/'.$own,$plan),'Admin starts approved deletion');
    gd_assert(!$result['done']&&$result['processed']===10&&$result['remaining']===3,'Deletion is bounded to ten files');
    gd_assert(gd_request($guest,'GET','/galleries/'.$own.'/photos')[0]===409,'Started deletion locks access');
    gd_assert(gd_request($guest,'DELETE','/galleries/'.$own.'/deletion-request',[])[0]===409,'Started deletion cannot cancel');
    gd_assert(count(gd_ok(gd_request($owner,'GET','/admin/gallery-deletion-requests'),'Resume queue')['deletions'])===1,'Interrupted job visible');
    $pdo->prepare('UPDATE users SET admin=0 WHERE id=?')->execute([$ownerId]);
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$own,['job_id'=>$result['job_id']])[0]===403,'A revoked admin cannot continue deletion');
    gd_assert(gd_count('SELECT COUNT(*) FROM photos WHERE gallery_id=?',[$own])===3,'Revoked admin leaves remainder unchanged');
    $pdo->prepare('UPDATE users SET admin=1 WHERE id=?')->execute([$ownerId]);
    $done=gd_ok(gd_request($owner,'DELETE','/galleries/'.$own,['job_id'=>$result['job_id']]),'Resume deletion');
    gd_assert($done['done']&&$done['processed']===13&&!gd_exists($own),'Whole gallery and all media removed');
    gd_assert(gd_count('SELECT COUNT(*) FROM grants WHERE gallery_id=?',[$own])===0,'Grants and editors removed');
    gd_assert(gd_count('SELECT COUNT(*) FROM favorites')===0,'Favorites removed');
    gd_assert(gd_count('SELECT COUNT(*) FROM invitations WHERE token=?',[$singleHash])===0,'Single-gallery invitation revoked');
    gd_assert(gd_count('SELECT COUNT(*) FROM invitation_galleries WHERE gallery_id=?',[$own])===0,'Deleted gallery removed from all invitations');
    gd_assert(gd_count('SELECT COUNT(*) FROM invitations WHERE token=? AND gallery_id=? AND upload=0 AND download=0 AND gps=0',[$multiHash,$otherGallery])===1,'Other-gallery invitation survives with its own restricted flags');
    gd_assert(gd_count('SELECT COUNT(*) FROM lychee_import_albums WHERE target_gallery_id=?',[$own])===0,'Import mapping removed without recreation');
    gd_assert(gd_count('SELECT COUNT(*) FROM photos WHERE id=?',[$otherId])===1&&file_get_contents(gd_paths($otherId)[0])==='Keep other gallery','Other gallery preserved');
    for($i=1;$i<=13;$i++)gd_assert(array_filter(gd_paths(str_pad(dechex($i),32,'0',STR_PAD_LEFT)),'file_exists')===[],'All three private files gone '.$i);
    gd_assert(gd_ok(gd_request($owner,'DELETE','/galleries/'.$own,['job_id'=>$result['job_id']]),'Repeated completion')['done'],'Completion is idempotent');
    gd_assert(gd_request($owner,'GET','/galleries/'.$own.'/photos')[0]===404,'Deleted gallery unavailable');
    $empty=gd_ok(gd_request($owner,'POST','/galleries',['name'=>'Tomt galleri']),'Empty gallery')['id'];
    gd_assert(gd_ok(gd_request($owner,'DELETE','/galleries/'.$empty,gd_plan($owner,$empty)),'Delete empty gallery')['done'],'Admin deletes empty gallery');

    $blocked=gd_ok(gd_request($owner,'POST','/galleries',['name'=>'Fejl før afslutning']),'Failure fixture')['id'];
    $pdo->exec("CREATE TRIGGER stop_gallery_delete BEFORE DELETE ON galleries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic gallery failure'");
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$blocked,gd_plan($owner,$blocked))[0]===500,'Database failure never reports completion');
    gd_assert(gd_exists($blocked),'Failed final transaction preserves gallery');
    $pdo->exec('DROP TRIGGER stop_gallery_delete');
    $resume=gd_ok(gd_request($owner,'GET','/galleries/'.$blocked.'/deletion'),'Read interrupted job');
    gd_assert(gd_ok(gd_request($owner,'DELETE','/galleries/'.$blocked,['job_id'=>$resume['job']['id']]),'Resume after database failure')['done'],'Finalization retry succeeds');
    $obstructed=gd_ok(gd_request($owner,'POST','/galleries',['name'=>'Genoptag filoprydning']),'Cleanup gallery')['id'];$obstructedId=str_repeat('9',32);
    gd_seed($obstructedId,$obstructed,$ownerId,'image/jpeg','Preserved until retry');$stage=gd_stage($obstructedId);file_put_contents($stage.'/unrelated.txt','Must never be removed');
    gd_assert(gd_request($owner,'DELETE','/galleries/'.$obstructed,gd_plan($owner,$obstructed))[0]===500,'Unexpected journal file aborts deletion');
    gd_assert(gd_exists($obstructed)&&is_file($stage.'/unrelated.txt'),'Gallery and unrelated staging data preserved');
    unlink($stage.'/unrelated.txt');$resume=gd_ok(gd_request($owner,'GET','/galleries/'.$obstructed.'/deletion'),'Read failed cleanup job');
    gd_assert(gd_ok(gd_request($owner,'DELETE','/galleries/'.$obstructed,['job_id'=>$resume['job']['id']]),'Retry safe cleanup')['done'],'Cleanup retry finishes gallery');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');gd_remove($temp);}
exit($failures?1:0);
