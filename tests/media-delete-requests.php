<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
// Only synthetic accounts, files and a randomly named disposable database.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-delete-requests-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';
mkdir($privateRoot.'/config',0700,true);$database='lexgalleri_test_'.bin2hex(random_bytes(6));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$checks=0;$failures=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8772);
function mr_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if($ok)echo "PASS: $label\n";else{$failures++;fwrite(STDERR,"FAIL: $label\n");}}
function mr_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $c;}
function mr_request(CurlHandle $client,string $method,string $path,?array $body=null,?string $requestOrigin=null,array $extra=[]):array{
    global $origin;$headers=['Content-Type: application/json'];if($requestOrigin!=='')$headers[]='Origin: '.($requestOrigin??$origin);
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>array_merge($headers,$extra)]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function mr_ok(array $response,string $label):array{mr_assert($response[0]===200,$label);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));return $response[1];}
function mr_remove(string $path):void{if(is_link($path)||!is_dir($path)){unlink($path);return;}foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')mr_remove($path.'/'.$name);rmdir($path);}
function mr_paths(string $id):array{global $privateRoot;return[$privateRoot.'/originals/'.$id.'.bin',$privateRoot.'/previews/'.$id.'.jpg',$privateRoot.'/thumbnails/'.$id.'.jpg'];}
function mr_query(string $sql,array $args=[]):PDOStatement{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return $s;}
function mr_count(string $sql,array $args=[]):int{return(int)mr_query($sql,$args)->fetchColumn();}
function mr_seed(string $id,string $gallery,string $owner,string $mime='image/jpeg'):void{
    $bytes='Synthetic original '.$id;
    mr_query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$gallery,'Synthetic media '.$id,$mime==='video/mp4'?'synthetic.mp4':'synthetic.jpg',$mime,$owner,'2026-01-01T00:00:00Z','','unknown','Synthetic',null,null,hash('sha256',$bytes)]);
    foreach(mr_paths($id) as $i=>$path)file_put_contents($path,$i===0?$bytes:'Synthetic derivative '.$i.' '.$id);
}
function mr_preserved(string $id):bool{return mr_count('SELECT COUNT(*) FROM photos WHERE id=?',[$id])===1&&count(array_filter(mr_paths($id),'is_file'))===3&&file_get_contents(mr_paths($id)[0])==='Synthetic original '.$id;}
function mr_gone(string $id):bool{return mr_count('SELECT COUNT(*) FROM photos WHERE id=?',[$id])===0&&array_filter(mr_paths($id),'file_exists')===[];}
function mr_invite(CurlHandle $admin,CurlHandle $member,string $gallery,string $email):string{
    $reply=mr_ok(mr_request($admin,'POST','/admin/invitations',['name'=>$email,'email'=>$email,'gallery_id'=>$gallery,'upload'=>true,'download'=>true,'gps'=>true]),'Invite synthetic member '.$email);
    parse_str((string)parse_url($reply['path'],PHP_URL_QUERY),$query);
    return mr_ok(mr_request($member,'POST','/accept',['token'=>$query['invite'],'password'=>'long-member-password']),'Accept synthetic invitation '.$email)['id'];
}
function mr_stage_committed(string $id,bool $committed=true):string{
    global $privateRoot;$directory=$privateRoot.'/.deletions/'.$id;mkdir($directory,0700,true);
    $photo=mr_query('SELECT * FROM photos WHERE id=?',[$id])->fetch();
    file_put_contents($directory.'/receipt.json',json_encode(['version'=>1,'photo_id'=>$id,'photo'=>$photo,'created'=>'synthetic']));
    foreach(array_combine(['original.bin','view.jpg','thumb.jpg'],mr_paths($id)) as $name=>$path)rename($path,$directory.'/'.$name);
    if($committed)mr_query('DELETE FROM photos WHERE id=?',[$id]);return $directory;
}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('request-test-',4)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');
    foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    $server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated deletion-request server');
    $admin=mr_client();$member=mr_client();$otherMember=mr_client();$anonymous=mr_client();$pending=mr_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(mr_request($admin,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Deletion-request test server did not become ready');
    mr_ok(security_test_complete_admin($admin,mr_request($admin,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Request admin','email'=>'request-admin@example.test','password'=>'long-admin-password']),'mr_request'),'Administrator setup requires Authenticator confirmation');
    $adminId=mr_ok(mr_request($admin,'GET','/me'),'Read synthetic admin identity')['id'];
    $gallery=mr_ok(mr_request($admin,'POST','/galleries',['name'=>'Requests gallery']),'Create shared request gallery')['id'];
    $hiddenGallery=mr_ok(mr_request($admin,'POST','/galleries',['name'=>'No member access']),'Create unshared gallery')['id'];
    $memberId=mr_invite($admin,$member,$gallery,'request-member@example.test');$otherId=mr_invite($admin,$otherMember,$gallery,'request-other@example.test');
    $adminPhoto=str_repeat('1',32);$own=str_repeat('2',32);$otherPhoto=str_repeat('3',32);$hiddenOwn=str_repeat('4',32);$video=str_repeat('5',32);
    mr_seed($adminPhoto,$gallery,$adminId);mr_seed($own,$gallery,$memberId);mr_seed($otherPhoto,$gallery,$otherId);mr_seed($hiddenOwn,$hiddenGallery,$memberId);mr_seed($video,$gallery,$memberId,'video/mp4');
    mr_assert(mr_request($admin,'GET','/status')[1]['capabilities']['media_delete_requests']===true,'Fresh installation advertises deletion-request support');
    $migration=file_get_contents($root.'/private/migrations/005_media_delete_requests.sql');$pdo->exec($migration);$pdo->exec($migration);
    mr_assert(mr_count('SELECT COUNT(*) FROM media_delete_requests')===0,'Request migration is idempotent on the new schema');
    mr_assert(mr_request($anonymous,'POST','/photos/'.$own.'/deletion-request',[])[0]===401,'Anonymous users cannot mark a file');
    mr_assert(mr_request($anonymous,'GET','/deletion-requests')[0]===401,'Anonymous users cannot see request history');
    mr_assert(mr_request($pending,'POST','/login',['email'=>'request-admin@example.test','password'=>'long-admin-password'])[1]['mfa_required']===true,'Password-only admin remains pending Authenticator');
    mr_assert(mr_request($pending,'GET','/admin/deletion-requests')[0]===401,'Pending admin cannot read the approval queue');
    mr_assert(mr_request($member,'POST','/photos/'.$adminPhoto.'/deletion-request',[])[0]===403,'Members cannot mark administrator uploads');
    mr_assert(mr_request($member,'POST','/photos/'.$otherPhoto.'/deletion-request',['requester_id'=>$otherId])[0]===403,'Members cannot mark another member upload or forge ownership');
    mr_assert(mr_request($member,'POST','/photos/'.$hiddenOwn.'/deletion-request',[])[0]===403,'Ownership alone cannot bypass gallery access');
    mr_assert(mr_request($member,'DELETE','/photos/'.$own)[0]===403,'Members cannot directly delete even their own files');
    mr_assert(mr_request($member,'POST','/photos/'.$own.'/deletion-request',[],'https://evil.example')[0]===403,'Cross-origin marking is rejected');
    mr_assert(mr_request($member,'POST','/photos/'.$own.'/deletion-request',[],'')[0]===403,'Marking requires same-origin protection');
    mr_assert(mr_request($member,'POST','/photos/'.str_repeat('z',32).'/deletion-request',[])[0]===404,'Malformed photo identifiers cannot select files');
    mr_assert(mr_preserved($adminPhoto)&&mr_preserved($own)&&mr_preserved($otherPhoto),'Denied attempts preserve every original and derivative');
    $marked=mr_ok(mr_request($member,'POST','/photos/'.$own.'/deletion-request',['requester_id'=>$adminId,'status'=>'approved']),'Owner marks their image for admin approval');$request=$marked['request'];$requestId=$request['id'];
    mr_assert($marked['ok']===true&&$request['status']==='pending'&&$request['requester_id']===$memberId&&$request['photo_id']===$own,'Server stores pending status and actual authenticated requester');
    mr_assert(mr_preserved($own),'Marking leaves the database row and all three original media files intact');
    $duplicate=mr_ok(mr_request($member,'POST','/photos/'.$own.'/deletion-request',[]),'Repeated marking is idempotent')['request'];
    mr_assert($duplicate['id']===$requestId&&mr_count('SELECT COUNT(*) FROM media_delete_requests WHERE photo_id=?',[$own])===1,'Duplicate marking creates one pending request');
    $galleryPhotos=mr_ok(mr_request($member,'GET','/galleries/'.$gallery.'/photos'),'Member still sees ordinary gallery media')['photos'];
    $found=array_values(array_filter($galleryPhotos,fn($photo)=>$photo['id']===$own))[0];
    mr_assert($found['deletion_request']['id']===$requestId&&$found['deletion_request']['status']==='pending','Gallery photo carries its pending deletion marker');
    mr_assert(mr_request($member,'GET','/photos/'.$own.'/image')[0]===200,'Marked image remains viewable while awaiting approval');
    $videoRequest=mr_ok(mr_request($member,'POST','/photos/'.$video.'/deletion-request',[]),'Owner can mark MP4 files too')['request'];
    mr_assert(mr_preserved($video)&&$videoRequest['mime']==='video/mp4','Marking a video preserves its original and posters');
    $otherRequest=mr_ok(mr_request($otherMember,'POST','/photos/'.$otherPhoto.'/deletion-request',[]),'Second member marks their own upload')['request'];
    $ownHistory=mr_ok(mr_request($member,'GET','/deletion-requests'),'Member reads only own request history');
    mr_assert(count($ownHistory)===2&&!array_filter($ownHistory,fn($row)=>$row['requester_id']!==$memberId),'Other member requests remain private from the member');
    mr_assert(mr_request($member,'GET','/admin/deletion-requests')[0]===403,'Members cannot open the administrator queue');
    foreach(['approve','reject'] as $action)mr_assert(mr_request($member,'POST','/admin/deletion-requests/'.$requestId.'/'.$action,[])[0]===403,'Members cannot '.$action.' deletion requests');
    mr_assert(mr_request($otherMember,'DELETE','/photos/'.$own.'/deletion-request')[0]===403,'Members cannot cancel another owner request');
    $queue=mr_ok(mr_request($admin,'GET','/admin/deletion-requests'),'Admin sees pending approval queue');
    mr_assert(count($queue)===3&&array_filter($queue,fn($row)=>$row['id']===$requestId&&$row['requester_name']==='request-member@example.test'),'Queue identifies the requester and selected media');
    $queueJson=json_encode($queue);
    mr_assert(!preg_match('/"(?:password|filename|digest|db_password|totp_secret)"/',$queueJson)&&!str_contains($queueJson,$privateRoot),'Approval queue exposes no file paths, password fields or private configuration');
    mr_assert(mr_request($pending,'POST','/admin/deletion-requests/'.$requestId.'/approve',[])[0]===401,'Pending Authenticator admin cannot approve');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/approve',[],'')[0]===403,'Approval requires same-origin protection');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/reject',[],'https://evil.example')[0]===403,'Cross-origin rejection is blocked');
    $cancelled=mr_ok(mr_request($member,'DELETE','/photos/'.$video.'/deletion-request'),'Owner can remove their pending video marking')['request'];
    mr_assert($cancelled['status']==='cancelled'&&mr_preserved($video),'Cancelling a marking preserves the video files');
    $rejected=mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/reject',[]),'Admin can reject a deletion request')['request'];
    mr_assert($rejected['status']==='rejected'&&$rejected['resolved_by']===$adminId&&mr_preserved($own),'Rejection records the admin decision and preserves all media');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/approve',[])[0]===409,'A rejected request cannot later be silently approved');
    $requestId=mr_ok(mr_request($member,'POST','/photos/'.$own.'/deletion-request',[]),'Member can submit a new marking after rejection')['request']['id'];
    mr_assert($requestId!==$rejected['id']&&mr_count('SELECT COUNT(*) FROM media_delete_requests WHERE photo_id=?',[$own])===2,'A fresh request retains the rejected audit record');
    $approved=mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/approve',[]),'Admin approval performs the actual image deletion')['request'];
    mr_assert($approved['status']==='approved'&&$approved['resolved_by']===$adminId&&mr_gone($own),'Approved image row and only its own original and derivatives are removed');
    mr_assert(mr_preserved($adminPhoto)&&mr_preserved($otherPhoto)&&mr_preserved($video),'Approval preserves administrator uploads, other members uploads and unapproved video');
    mr_assert(mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/approve',[]),'Repeated approval is safe')['request']['status']==='approved','Approval retries do not select another file');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$requestId.'/reject',[])[0]===409,'A completed approval cannot be rewritten as rejection');
    $videoRequest=mr_ok(mr_request($member,'POST','/photos/'.$video.'/deletion-request',[]),'Member resubmits a previously cancelled video')['request'];
    mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$videoRequest['id'].'/approve',[]),'Admin approval deletes an MP4');mr_assert(mr_gone($video),'Approved MP4 original and both posters are removed');
    mr_ok(mr_request($admin,'DELETE','/photos/'.$otherPhoto),'Direct admin deletion remains available for a marked file');
    mr_assert(mr_query('SELECT status FROM media_delete_requests WHERE id=?',[$otherRequest['id']])->fetchColumn()==='approved','Direct admin deletion resolves its outstanding marking');
    mr_assert(mr_ok(mr_request($admin,'GET','/admin/deletion-requests'),'Read queue after decisions')===[],'Resolved, cancelled and rejected requests leave the pending queue');

    $recovery=str_repeat('6',32);mr_seed($recovery,$gallery,$memberId,'video/mp4');$recoverRequest=mr_ok(mr_request($member,'POST','/photos/'.$recovery.'/deletion-request',[]),'Create a request before simulated interrupted file cleanup')['request'];
    $journal=mr_stage_committed($recovery);file_put_contents($journal.'/unrelated.txt','Synthetic cleanup blocker');
    $incomplete=mr_request($admin,'POST','/admin/deletion-requests/'.$recoverRequest['id'].'/approve',[]);
    mr_assert($incomplete[0]===503,'Approval never reports success while file cleanup is unfinished');
    mr_assert(mr_query('SELECT status FROM media_delete_requests WHERE id=?',[$recoverRequest['id']])->fetchColumn()==='pending'&&is_file($journal.'/receipt.json')&&is_file($journal.'/original.bin'),'Unfinished cleanup retains pending approval and durable recovery receipt');
    mr_assert(mr_request($member,'DELETE','/photos/'.$recovery.'/deletion-request')[0]===409,'Owner cannot cancel a partially committed approval instead of finishing cleanup');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$recoverRequest['id'].'/reject',[])[0]===409,'Admin cannot reject a partially committed approval instead of finishing cleanup');
    unlink($journal.'/unrelated.txt');mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$recoverRequest['id'].'/approve',[]),'Admin can retry the same approval after cleanup is repaired');
    mr_assert(!is_dir($journal)&&mr_query('SELECT status FROM media_delete_requests WHERE id=?',[$recoverRequest['id']])->fetchColumn()==='approved','Cleanup retry finishes only that request and records approval');

    $stagedPending=str_repeat('a',32);mr_seed($stagedPending,$gallery,$memberId);$stagedRequest=mr_ok(mr_request($member,'POST','/photos/'.$stagedPending.'/deletion-request',[]),'Mark a file before simulated interruption before database commit')['request'];
    $pendingJournal=mr_stage_committed($stagedPending,false);
    mr_assert(mr_request($member,'DELETE','/photos/'.$stagedPending.'/deletion-request')[0]===409,'Owner cannot cancel an interrupted staged approval while its database row remains');
    mr_assert(mr_request($admin,'POST','/admin/deletion-requests/'.$stagedRequest['id'].'/reject',[])[0]===409,'Admin cannot hide an interrupted staged approval by rejecting it');
    mr_assert(mr_count('SELECT COUNT(*) FROM photos WHERE id=?',[$stagedPending])===1&&file_get_contents($pendingJournal.'/original.bin')==='Synthetic original '.$stagedPending,'Interrupted staged approval preserves the exact original and remaining database row');
    mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$stagedRequest['id'].'/approve',[]),'Approval retry resumes a staged deletion before its database commit');
    mr_assert(mr_gone($stagedPending)&&!is_dir($pendingJournal),'Resumed approval completes the database deletion and journal cleanup');

    $resolveRetry=str_repeat('8',32);mr_seed($resolveRetry,$gallery,$memberId);$resolveRequest=mr_ok(mr_request($member,'POST','/photos/'.$resolveRetry.'/deletion-request',[]),'Mark a file before simulated decision-record failure')['request'];
    $pdo->exec("CREATE TRIGGER synthetic_request_resolution_failure BEFORE UPDATE ON media_delete_requests FOR EACH ROW BEGIN IF NEW.photo_id='$resolveRetry' AND NEW.status='approved' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic request update failure'; END IF; END");
    mr_assert(mr_request($admin,'DELETE','/photos/'.$resolveRetry)[0]===500,'Direct admin deletion never acknowledges a failed decision-record update');
    mr_assert(mr_gone($resolveRetry)&&mr_query('SELECT status FROM media_delete_requests WHERE id=?',[$resolveRequest['id']])->fetchColumn()==='pending','Failed audit update retains a pending receipt even after media cleanup succeeds');
    $pdo->exec('DROP TRIGGER synthetic_request_resolution_failure');
    mr_ok(mr_request($admin,'DELETE','/photos/'.$resolveRetry),'Retry direct deletion repairs its pending decision record after media is gone');
    mr_assert(mr_query('SELECT status FROM media_delete_requests WHERE id=?',[$resolveRequest['id']])->fetchColumn()==='approved','Direct deletion retry records approval without selecting unrelated files');
    mr_assert(mr_request($admin,'DELETE','/photos/'.str_repeat('9',32))[0]===404,'Unrelated missing media still returns 404 rather than a false deletion success');

    $revoked=str_repeat('7',32);mr_seed($revoked,$gallery,$memberId);$revokedRequest=mr_ok(mr_request($member,'POST','/photos/'.$revoked.'/deletion-request',[]),'Mark a file before revoking its gallery access')['request'];
    mr_query('DELETE FROM grants WHERE gallery_id=? AND user_id=?',[$gallery,$memberId]);
    mr_assert(mr_request($member,'POST','/photos/'.$revoked.'/deletion-request',[])[0]===403&&mr_preserved($revoked),'Revoked gallery access blocks new markings even for the uploader');
    mr_assert(mr_request($member,'DELETE','/photos/'.$revoked.'/deletion-request')[0]===403,'Revoked access also prevents cancellation from exposing private gallery metadata');
    mr_assert(mr_ok(mr_request($member,'GET','/deletion-requests'),'Read request history after gallery access is revoked')===[],'Revoked gallery titles and request metadata disappear from member history');
    mr_query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,1,1,1)',[$gallery,$memberId]);
    mr_ok(mr_request($admin,'POST','/admin/deletion-requests/'.$revokedRequest['id'].'/reject',[]),'Admin can reject a marking after the member gallery grant changes');
    $pdo->exec('RENAME TABLE media_delete_requests TO media_delete_requests_saved');
    $status=mr_ok(mr_request($admin,'GET','/status'),'Ordinary status survives missing request migration');
    mr_assert($status['capabilities']['media_delete_requests']===false&&$status['capabilities']['media_delete']===true,'Missing request table disables only approval support');
    mr_assert(mr_request($member,'POST','/photos/'.$revoked.'/deletion-request',[])[0]===503,'Missing migration fails marking closed with setup error');
    mr_assert(mr_request($member,'GET','/deletion-requests')[0]===503&&mr_request($admin,'GET','/admin/deletion-requests')[0]===503,'Missing migration cannot expose an incomplete request queue');
    mr_ok(mr_request($admin,'DELETE','/photos/'.$revoked),'Admin deletion still works without the optional requests table');
    mr_assert(mr_gone($revoked)&&mr_preserved($adminPhoto),'Missing request migration never grants members deletion rights or blocks admin cleanup');
    $pdo->exec('RENAME TABLE media_delete_requests_saved TO media_delete_requests');$pdo->exec($migration);
    mr_assert(mr_count('SELECT COUNT(*) FROM media_delete_requests')>=6,'Migration preserves existing approval history');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');mr_remove($temp);}
exit($failures?1:0);
