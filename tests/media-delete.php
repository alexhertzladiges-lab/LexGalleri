<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
// All accounts, media, journals and SQL mutations are isolated synthetic data.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-delete-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';
mkdir($privateRoot.'/config',0700,true);$database='lexgalleri_test_'.bin2hex(random_bytes(6));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$checks=0;$failures=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8772);
function md_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if($ok)echo "PASS: $label\n";else{$failures++;fwrite(STDERR,"FAIL: $label\n");}}
function md_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>15]);return $c;}
function md_request(CurlHandle $client,string $method,string $path,?array $body=null,?string $requestOrigin=null,array $extra=[]):array{
    global $origin;$headers=['Content-Type: application/json'];if($requestOrigin!=='')$headers[]='Origin: '.($requestOrigin??$origin);
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>array_merge($headers,$extra)]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function md_ok(array $response,string $label):array{md_assert($response[0]===200,$label);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));return $response[1];}
function md_remove(string $path):void{if(is_link($path)||!is_dir($path)){unlink($path);return;}foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')md_remove($path.'/'.$name);rmdir($path);}
function md_paths(string $id):array{global $privateRoot;return[$privateRoot.'/originals/'.$id.'.bin',$privateRoot.'/previews/'.$id.'.jpg',$privateRoot.'/thumbnails/'.$id.'.jpg'];}
function md_count(string $sql,array $args=[]):int{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return(int)$s->fetchColumn();}
function md_seed(string $id,string $gallery,string $owner,string $mime,string $bytes):void{
    global $pdo;$s=$pdo->prepare('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $s->execute([$id,$gallery,'Synthetic media '.$id,$mime==='video/mp4'?'synthetic.mp4':'synthetic.jpg',$mime,$owner,'2026-01-01T00:00:00Z','','unknown','Synthetic',null,null,hash('sha256',$bytes)]);
    foreach(md_paths($id) as $i=>$path)file_put_contents($path,$i===0?$bytes:'Private synthetic preview '.$i.' '.$id);
}
function md_stage(string $id):string{
    global $privateRoot,$pdo;$directory=$privateRoot.'/.deletions/'.$id;if(!is_dir($directory))mkdir($directory,0700,true);
    $s=$pdo->prepare('SELECT * FROM photos WHERE id=?');$s->execute([$id]);$photo=$s->fetch();
    file_put_contents($directory.'/receipt.json',json_encode(['version'=>1,'photo_id'=>$id,'photo'=>$photo,'created'=>'synthetic']));
    foreach(array_combine(['original.bin','view.jpg','thumb.jpg'],md_paths($id)) as $name=>$path)if(is_file($path))rename($path,$directory.'/'.$name);
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
    $owner=md_client();$guest=md_client();$anonymous=md_client();$pending=md_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(md_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Delete test server did not become ready');
    md_assert(md_request($owner,'GET','/status')[1]['capabilities']['media_delete']===true,'Deletion capability is advertised by the upgraded private backend');
    md_ok(security_test_complete_admin($owner,md_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Delete admin','email'=>'delete-admin@example.test','password'=>'long-admin-password']),'md_request'),'Real administrator setup includes Authenticator confirmation');
    $ownerId=md_request($owner,'GET','/me')[1]['id'];$gallery=md_ok(md_request($owner,'POST','/galleries',['name'=>'Delete tests']),'Create synthetic gallery')['id'];
    $otherGallery=md_ok(md_request($owner,'POST','/galleries',['name'=>'Other gallery']),'Create separate gallery')['id'];
    $invitation=md_ok(md_request($owner,'POST','/admin/invitations',['name'=>'Delete member','email'=>'delete-member@example.test','gallery_id'=>$gallery,'upload'=>true,'download'=>true,'gps'=>true]),'Invite a member with all ordinary gallery permissions');
    parse_str((string)parse_url($invitation['path'],PHP_URL_QUERY),$invite);
    $guestId=md_ok(md_request($guest,'POST','/accept',['token'=>$invite['invite'],'password'=>'long-member-password']),'Member accepts invitation')['id'];
    $jpegId=str_repeat('1',32);$jpegBytes="Synthetic JPEG original\0";md_seed($jpegId,$gallery,$ownerId,'image/jpeg',$jpegBytes);
    md_assert(md_request($anonymous,'DELETE','/photos/'.$jpegId)[0]===401,'Anonymous requests cannot delete media');
    md_assert(md_request($guest,'DELETE','/photos/'.$jpegId)[0]===403,'Upload/download/GPS permissions never grant deletion');
    md_assert(md_request($pending,'POST','/login',['email'=>'delete-admin@example.test','password'=>'long-admin-password'])[1]['mfa_required']===true,'Password-only administrator is pending Authenticator');
    md_assert(md_request($pending,'DELETE','/photos/'.$jpegId)[0]===401,'Pending administrator cannot delete media');
    md_assert(md_request($owner,'DELETE','/photos/'.$jpegId,null,'https://evil.example')[0]===403,'Cross-origin deletion is rejected');
    md_assert(md_request($owner,'DELETE','/photos/'.$jpegId,null,'')[0]===403,'Missing Origin cannot delete media');
    md_assert(md_request($owner,'DELETE','/photos/'.$jpegId,null,null,['Sec-Fetch-Site: cross-site'])[0]===403,'Cross-site browser deletion is rejected');
    md_assert(md_request($owner,'DELETE','/photos/'.str_repeat('z',32))[0]===404,'Malformed identifiers do not select filesystem paths');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$jpegId])===1&&file_get_contents(md_paths($jpegId)[0])===$jpegBytes,'Rejected deletions preserve metadata and original bytes');
    md_assert(md_ok(md_request($owner,'DELETE','/photos/'.$jpegId),'Admin can delete an image without optional import tables')['ok']===true,'Image deletion is acknowledged');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$jpegId])===0&&array_filter(md_paths($jpegId),'file_exists')===[],'Image deletion removes its row and all three private files');
    md_assert(md_request($owner,'DELETE','/photos/'.$jpegId)[0]===404,'Unknown or already fully deleted media returns 404');

    $pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));$pdo->exec(file_get_contents($root.'/private/migrations/003_lychee_move.sql'));
    $imported=str_repeat('2',32);$other=str_repeat('3',32);$anchor=str_repeat('a',32);$bytes="Shared imported original\0";
    md_seed($imported,$gallery,$ownerId,'image/jpeg',$bytes);md_seed($other,$otherGallery,$ownerId,'image/jpeg',$bytes);
    unlink(md_paths($other)[0]);link(md_paths($imported)[0],md_paths($other)[0]);link(md_paths($imported)[0],$privateRoot.'/originals/'.$anchor.'.bin');
    $source=$temp.'/lychee-source-original.jpg';file_put_contents($source,$bytes);$beforeLinks=stat(md_paths($imported)[0])['nlink'];
    $job=str_repeat('b',32);$metadata=json_encode(['id'=>'source-photo','_move_original_id'=>$anchor,'_transfer_mode'=>'move']);
    $s=$pdo->prepare('INSERT INTO lychee_import_jobs VALUES(?,?,?,?,?,?,?,?,?)');$s->execute([$job,str_repeat('c',64),'6.6.12','completed','',1,$ownerId,'synthetic','synthetic']);
    $s=$pdo->prepare('INSERT INTO lychee_import_items(job_id,source_photo_id,source_album_id,status,target_photo_id,planned_photo_id,source_metadata,error,updated) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach(['imported','duplicate'] as $state)$s->execute([$job,'source-photo',$state,$state,$imported,$imported,$metadata,'','synthetic']);
    md_ok(md_request($guest,'POST','/photos/'.$imported.'/favorite'),'Member can favorite the imported item before deletion');
    md_ok(md_request($owner,'POST','/photos/'.$imported.'/favorite'),'Admin can favorite the imported item before deletion');
    md_ok(md_request($owner,'DELETE','/photos/'.$imported),'Admin deletes an imported gallery placement');
    md_assert(md_count('SELECT COUNT(*) FROM favorites WHERE photo_id=?',[$imported])===0,'Deletion removes all members’ favorite references');
    $receipts=$pdo->query('SELECT status,target_photo_id,planned_photo_id,source_metadata FROM lychee_import_items ORDER BY id')->fetchAll();
    md_assert(count($receipts)===2&&array_column($receipts,'target_photo_id')===[null,null]&&array_column($receipts,'status')===['imported','duplicate'],'Import foreign keys are detached while completed receipts remain completed');
    md_assert(array_column($receipts,'planned_photo_id')===[$imported,$imported]&&array_column($receipts,'source_metadata')===[$metadata,$metadata],'Import source history and planned identifiers are preserved');
    md_assert(file_get_contents(md_paths($other)[0])===$bytes&&file_get_contents($privateRoot.'/originals/'.$anchor.'.bin')===$bytes&&stat(md_paths($other)[0])['nlink']===$beforeLinks-1,'Other gallery hardlinks and the durable import anchor remain intact');
    md_assert(file_get_contents($source)===$bytes,'Lychee source files are never deleted');
    md_assert(md_request($owner,'GET','/photos/'.$imported.'/image')[0]===404,'Deleted image cannot be fetched through its old URL');
    $video=str_repeat('4',32);$mp4=base64_decode(file_get_contents($root.'/tests/fixtures/tiny.mp4.b64'),true);if($mp4===false)throw new RuntimeException('Invalid synthetic video fixture');
    md_seed($video,$gallery,$ownerId,'video/mp4',$mp4);md_ok(md_request($owner,'DELETE','/photos/'.$video),'Admin can delete MP4 media');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$video])===0&&array_filter(md_paths($video),'file_exists')===[],'MP4 deletion removes its row, original and posters');
    md_assert(md_request($owner,'GET','/photos/'.$video.'/video')[0]===404,'Deleted MP4 is no longer streamable');
    $missing=str_repeat('5',32);md_seed($missing,$gallery,$ownerId,'image/jpeg','Missing files case');foreach(md_paths($missing) as $path)unlink($path);
    md_ok(md_request($owner,'DELETE','/photos/'.$missing),'An orphaned row can be removed when media files are already missing');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$missing])===0,'Missing files do not leave a ghost gallery item');
    $unsafe=str_repeat('6',32);md_seed($unsafe,$gallery,$ownerId,'image/jpeg','Unsafe path case');unlink(md_paths($unsafe)[0]);symlink($source,md_paths($unsafe)[0]);
    md_assert(md_request($owner,'DELETE','/photos/'.$unsafe)[0]===409,'A symlink is rejected before destructive filesystem actions');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$unsafe])===1&&file_get_contents($source)===$bytes&&is_file(md_paths($unsafe)[1]),'Unsafe path failure preserves the row, source and derivatives');
    $blocked=str_repeat('7',32);md_seed($blocked,$gallery,$ownerId,'image/jpeg','Directory path case');unlink(md_paths($blocked)[0]);mkdir(md_paths($blocked)[0]);
    md_assert(md_request($owner,'DELETE','/photos/'.$blocked)[0]===409,'A directory in place of media aborts deletion');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$blocked])===1&&is_file(md_paths($blocked)[1])&&is_file(md_paths($blocked)[2]),'Filesystem preflight failure preserves all existing files and metadata');
    $rollback=str_repeat('8',32);md_seed($rollback,$gallery,$ownerId,'image/jpeg','Rollback case');$hashes=array_map('hash_file',array_fill(0,3,'sha256'),md_paths($rollback));
    md_ok(md_request($owner,'POST','/photos/'.$rollback.'/favorite'),'Prepare a favorite for transaction rollback');
    $s=$pdo->prepare('INSERT INTO lychee_import_items(job_id,source_photo_id,source_album_id,status,target_photo_id,planned_photo_id,source_metadata,error,updated) VALUES(?,?,?,?,?,?,?,?,?)');$s->execute([$job,'rollback-photo','rollback-album','imported',$rollback,$rollback,'{"synthetic":"rollback"}','','synthetic']);
    $pdo->exec("CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON photos FOR EACH ROW BEGIN IF OLD.id='$rollback' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic delete failure'; END IF; END");
    md_assert(md_request($owner,'DELETE','/photos/'.$rollback)[0]===500,'Database deletion failure is never acknowledged as success');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$rollback])===1&&md_count('SELECT COUNT(*) FROM favorites WHERE photo_id=?',[$rollback])===1,'Database rollback preserves photo and favorites');
    md_assert(md_count('SELECT COUNT(*) FROM lychee_import_items WHERE target_photo_id=? AND status=\'imported\'',[$rollback])===1,'Database rollback restores imported-media foreign key references');
    md_assert(array_map('hash_file',array_fill(0,3,'sha256'),md_paths($rollback))===$hashes&&!is_dir($privateRoot.'/.deletions/'.$rollback),'Database rollback restores exact original and derivative bytes');
    $pdo->exec('DROP TRIGGER synthetic_delete_failure');md_ok(md_request($owner,'DELETE','/photos/'.$rollback),'Deletion can be retried after the database problem is resolved');
    $resume=str_repeat('9',32);md_seed($resume,$gallery,$ownerId,'image/jpeg','Interrupted before commit');$staged=md_stage($resume);
    md_ok(md_request($owner,'DELETE','/photos/'.$resume),'Retry resumes a staged deletion whose database row still exists');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$resume])===0&&!is_dir($staged),'Recovered deletion removes the row and staging receipt');
    $committed=str_repeat('d',32);md_seed($committed,$gallery,$ownerId,'video/mp4',$mp4);$staged=md_stage($committed);$pdo->prepare('DELETE FROM photos WHERE id=?')->execute([$committed]);
    md_ok(md_request($owner,'DELETE','/photos/'.$committed),'Retry finishes interrupted cleanup after a committed delete');
    md_assert(!is_dir($staged),'Post-commit cleanup removes staged media and its durable receipt');
    $conflict=str_repeat('e',32);md_seed($conflict,$gallery,$ownerId,'image/jpeg','Unexpected journal entry');$conflictDirectory=$privateRoot.'/.deletions/'.$conflict;mkdir($conflictDirectory,0700);
    file_put_contents($conflictDirectory.'/receipt.json',json_encode(['version'=>1,'photo_id'=>$conflict]));file_put_contents($conflictDirectory.'/unrelated.txt','Never delete unrelated staging data');
    md_assert(md_request($owner,'DELETE','/photos/'.$conflict)[0]===500,'Unexpected journal entries abort before database deletion');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$conflict])===1&&is_file(md_paths($conflict)[0])&&file_get_contents($conflictDirectory.'/unrelated.txt')==='Never delete unrelated staging data','Unexpected staging files and the existing media remain intact');
    $cleanup=str_repeat('f',32);md_seed($cleanup,$gallery,$ownerId,'video/mp4',$mp4);$staged=md_stage($cleanup);$pdo->prepare('DELETE FROM photos WHERE id=?')->execute([$cleanup]);file_put_contents($staged.'/unrelated.txt','Cleanup must stop');
    $incomplete=md_request($owner,'DELETE','/photos/'.$cleanup);
    md_assert($incomplete[0]===503&&str_contains($incomplete[1]['detail']??'','filoprydningen er ikke afsluttet'),'Incomplete post-commit cleanup is never reported as fully successful');
    md_assert(is_file($staged.'/receipt.json')&&is_file($staged.'/original.bin'),'Failed cleanup retains its durable receipt and remaining media');
    unlink($staged.'/unrelated.txt');md_ok(md_request($owner,'DELETE','/photos/'.$cleanup),'Cleanup retry succeeds after its filesystem obstruction is removed');
    $redirected=str_repeat('a1',16);$outside=$temp.'/outside-journal';mkdir($outside,0700);file_put_contents($outside.'/receipt.json',json_encode(['version'=>1,'photo_id'=>$redirected]));file_put_contents($outside.'/original.bin','Outside media must survive');symlink($outside,$privateRoot.'/.deletions/'.$redirected);
    md_assert(md_request($owner,'DELETE','/photos/'.$redirected)[0]===409,'A symlinked staging directory is rejected before cleanup');
    md_assert(file_get_contents($outside.'/original.bin')==='Outside media must survive'&&is_file($outside.'/receipt.json'),'Staging symlink rejection never unlinks files outside the fixed private journal');
    md_assert(md_count('SELECT COUNT(*) FROM photos WHERE id=?',[$other])===1&&file_get_contents(md_paths($other)[0])===$bytes,'Other gallery remains unchanged after all delete and recovery cases');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');md_remove($temp);}
exit($failures?1:0);
