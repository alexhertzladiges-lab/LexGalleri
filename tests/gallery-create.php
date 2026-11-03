<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
// Synthetic accounts, galleries, image bytes and an isolated, disposable database.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-create-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';
mkdir($privateRoot.'/config',0700,true);$database='lexgalleri_test_'.bin2hex(random_bytes(6));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$checks=0;$failures=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8774);
function gc_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if($ok)echo "PASS: $label\n";else{$failures++;fwrite(STDERR,"FAIL: $label\n");}}
function gc_client():CurlHandle{$client=curl_init();curl_setopt_array($client,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>15]);return $client;}
function gc_request(CurlHandle $client,string $method,string $path,mixed $body=null,?string $requestOrigin=null,bool $multipart=false,array $extra=[]):array{
    global $origin;$headers=[];if($requestOrigin!=='')$headers[]='Origin: '.($requestOrigin??$origin);
    if($body!==null&&!$multipart){$headers[]='Content-Type: application/json';$body=json_encode($body);}
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_POSTFIELDS=>$body,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>array_merge($headers,$extra)]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function gc_ok(array $response,string $label):array{gc_assert($response[0]===200,$label);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));return $response[1];}
function gc_count(string $sql,array $args=[]):int{global $pdo;$statement=$pdo->prepare($sql);$statement->execute($args);return(int)$statement->fetchColumn();}
function gc_remove(string $path):void{if(is_link($path)||!is_dir($path)){unlink($path);return;}foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')gc_remove($path.'/'.$name);rmdir($path);}
function gc_join(CurlHandle $admin,CurlHandle $member,string $gallery,string $email):array{
    $invitation=gc_ok(gc_request($admin,'POST','/admin/invitations',['name'=>'Synthetic member','email'=>$email,'gallery_id'=>$gallery]),'Create synthetic member invitation');
    parse_str((string)parse_url($invitation['path'],PHP_URL_QUERY),$query);
    return gc_ok(gc_request($member,'POST','/accept',['token'=>$query['invite'],'password'=>'long-member-password']),'Accept synthetic member invitation');
}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('create-test-',4)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');
    foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    $server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated gallery creation test server');
    $admin=gc_client();$creator=gc_client();$other=gc_client();$anonymous=gc_client();$pending=gc_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(gc_request($admin,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Gallery creation test server did not become ready');
    gc_assert(gc_request($admin,'GET','/status')[1]['capabilities']['gallery_create']===true,'Upgraded backend advertises member gallery creation');
    $owner=gc_ok(security_test_complete_admin($admin,gc_request($admin,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Create admin','email'=>'create-admin@example.test','password'=>'long-admin-password']),'gc_request'),'Administrator setup uses real Authenticator confirmation');
    $shared=gc_ok(gc_request($admin,'POST','/galleries',['name'=>'Invitation gallery']),'Administrator retains gallery creation')['id'];
    $member=gc_join($admin,$creator,$shared,'creator@example.test');$another=gc_join($admin,$other,$shared,'other@example.test');
    gc_assert($member['admin']===0&&$another['admin']===0,'Both invited accounts are ordinary members');
    gc_assert(gc_request($anonymous,'POST','/galleries',['name'=>'Anonymous'])[0]===401,'Anonymous visitors cannot create galleries');
    gc_assert(gc_request($pending,'POST','/login',['email'=>'create-admin@example.test','password'=>'long-admin-password'])[1]['mfa_required']===true,'Password-only administrator remains pending Authenticator');
    gc_assert(gc_request($pending,'POST','/galleries',['name'=>'Pending admin'])[0]===401,'Pending administrator cannot create galleries');
    gc_assert(gc_request($creator,'POST','/galleries',['name'=>'Cross origin'],'https://evil.example')[0]===403,'Cross-origin gallery creation is rejected');
    gc_assert(gc_request($creator,'POST','/galleries',['name'=>'No origin'],'')[0]===403,'Missing Origin is rejected for gallery creation');
    gc_assert(gc_request($creator,'POST','/galleries',['name'=>'Cross site'],null,false,['Sec-Fetch-Site: cross-site'])[0]===403,'Cross-site browser gallery creation is rejected');

    $beforeGalleries=gc_count('SELECT COUNT(*) FROM galleries');$beforeGrants=gc_count('SELECT COUNT(*) FROM grants');
    foreach([['name'=>'  '],['name'=>str_repeat('x',101)],['name'=>['invalid']],['name'=>'Valid','description'=>str_repeat('x',1001)]] as $invalid)
        gc_assert(gc_request($creator,'POST','/galleries',$invalid)[0]===400,'Invalid gallery fields are rejected before creation');
    gc_assert(gc_count('SELECT COUNT(*) FROM galleries')===$beforeGalleries&&gc_count('SELECT COUNT(*) FROM grants')===$beforeGrants,'Invalid and rejected requests leave no galleries or grants');

    $created=gc_ok(gc_request($creator,'POST','/galleries',['name'=>'  Gæstens kapitel  ','description'=>'  Private memories  ','user_id'=>$another['id'],'owner_id'=>$owner['id'],'admin'=>true,'upload'=>false,'download'=>false,'gps'=>false]),'An invited member can create a gallery');
    gc_assert(array_keys($created)===['id']&&preg_match('/^[a-f0-9]{32}$/D',$created['id'])===1,'Creation keeps the existing {id} response contract');$id=$created['id'];
    $grants=$pdo->prepare('SELECT user_id,upload,download,gps FROM grants WHERE gallery_id=?');$grants->execute([$id]);$access=$grants->fetchAll();
    gc_assert(count($access)===1&&$access[0]['user_id']===$member['id']&&(int)$access[0]['upload']===1&&(int)$access[0]['download']===1&&(int)$access[0]['gps']===1,'Only the authenticated creator receives full rights to the new gallery');
    gc_assert(gc_count('SELECT COUNT(*) FROM users WHERE id=? AND admin=0',[$member['id']])===1,'Creation cannot elevate a member to administrator');
    gc_assert(gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=? AND upload=0 AND download=0 AND gps=0',[$shared,$member['id']])===1,'Creation does not expand rights in previously shared galleries');
    $creatorList=gc_ok(gc_request($creator,'GET','/galleries'),'Creator can list accessible galleries');$own=array_values(array_filter($creatorList,fn(array $gallery):bool=>$gallery['id']===$id));
    gc_assert(count($own)===1&&$own[0]['name']==='Gæstens kapitel'&&$own[0]['description']==='Private memories','Creator sees the new gallery with trimmed metadata');
    gc_assert(in_array($id,array_column(gc_ok(gc_request($admin,'GET','/galleries'),'Administrator can list galleries'),'id'),true),'Administrator sees member-created galleries');
    $otherList=gc_ok(gc_request($other,'GET','/galleries'),'Another member can list only shared galleries');
    gc_assert(!in_array($id,array_column($otherList,'id'),true)&&!str_contains(json_encode($otherList),'Gæstens kapitel'),'Other members receive neither the new gallery nor its metadata');
    gc_assert(gc_request($other,'GET','/galleries/'.$id.'/photos')[0]===403,'Other members cannot enter the new gallery directly');
    $contents=gc_ok(gc_request($creator,'GET','/galleries/'.$id.'/photos'),'Creator can enter the new gallery');
    gc_assert($contents['photos']===[]&&$contents['permissions']['upload']===true&&$contents['permissions']['download']===true&&$contents['permissions']['gps']===true,'The creator can upload and access their own originals and locations');
    $image=imagecreatetruecolor(16,16);imagefill($image,0,0,imagecolorallocate($image,30,110,70));imagejpeg($image,$temp.'/synthetic.jpg');imagedestroy($image);
    $photo=gc_ok(gc_request($creator,'POST','/galleries/'.$id.'/photos',['file'=>new CURLFile($temp.'/synthetic.jpg','image/jpeg','synthetic.jpg')],null,true),'Creator can upload a real synthetic JPEG to the new gallery');
    $uploaded=gc_ok(gc_request($creator,'GET','/galleries/'.$id.'/photos'),'Creator can list the uploaded image')['photos'];
    gc_assert(count($uploaded)===1&&$uploaded[0]['id']===$photo['id']&&$uploaded[0]['uploader']===$member['id'],'Uploaded image belongs to the actual authenticated creator');
    $original=gc_request($creator,'GET','/photos/'.$photo['id'].'/image?size=original');
    gc_assert($original[0]===200&&$original[1]===file_get_contents($temp.'/synthetic.jpg'),'Creator can download the unchanged original');
    gc_assert(gc_request($other,'GET','/photos/'.$photo['id'].'/image')[0]===403,'Another member cannot fetch the new gallery thumbnail');
    gc_assert(gc_request($creator,'POST','/admin/invitations',['name'=>'Escalation','email'=>'no@example.test','gallery_id'=>$id])[0]===403,'Creating a gallery does not grant administrator sharing powers');

    gc_assert(gc_count('SELECT COUNT(*) FROM settings WHERE `key`=? AND value=?',['gallery_owner_'.$id,$member['id']])===1,'The trusted creator is recorded as owner despite forged owner_id input');
    gc_assert(strlen('gallery_owner_'.$id)<=50,'Owner metadata fits the existing settings key width');
    gc_assert($contents['permissions']['share_members']===true,'Only the owner receives member-sharing permission');
    gc_assert(gc_request($other,'GET','/galleries/'.$id.'/members')[0]===403,'A non-owner cannot enumerate gallery recipients');
    gc_assert(gc_request($other,'POST','/galleries/'.$id.'/members',['user_ids'=>[$member['id']]])[0]===403,'A non-owner cannot add recipients');
    gc_assert(gc_request($anonymous,'GET','/galleries/'.$id.'/members')[0]===401,'Anonymous directory access is rejected');
    gc_assert(gc_request($pending,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id']]])[0]===401,'Pending admin MFA cannot share a gallery');
    $directory=gc_ok(gc_request($creator,'GET','/galleries/'.$id.'/members'),'Owner reads existing member names');
    gc_assert(count($directory['members'])===1&&array_keys($directory['members'][0])===['id','name','has_access']&&!str_contains(json_encode($directory),'other@example.test'),'Recipient list exposes names and access only, never login/contact/secrets');
    gc_assert($directory['owner_id']===$member['id']&&$directory['can_assign_owner']===false,'A member cannot assign ownership');
    $countUsers=gc_count('SELECT COUNT(*) FROM users');$countInvites=gc_count('SELECT COUNT(*) FROM invitations');
    foreach([
        ['email'=>'new@example.test'],['phone'=>'20000009'],['user_ids'=>[$another['id']],'upload'=>true],
        ['user_ids'=>[$another['id']],'owner_id'=>$another['id']],['user_ids'=>[]],['user_ids'=>array_fill(0,51,$another['id'])],['user_ids'=>[['id'=>$another['id']]]]
    ] as $bad)gc_assert(gc_request($creator,'POST','/galleries/'.$id.'/members',$bad)[0]===400,'Arbitrary invitations, role fields and invalid member batches are rejected');
    gc_assert(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id']]],'https://evil.example')[0]===403,'Forged Origin cannot change gallery membership');
    gc_assert(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id']]],'')[0]===403,'Missing Origin cannot change gallery membership');
    gc_assert(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id'],str_repeat('0',32)]])[0]===409&&gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=?',[$id,$another['id']])===0,'One invalid recipient aborts the entire batch');
    $added=gc_ok(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id'],$another['id']]]),'Owner shares only with an already accepted member');
    gc_assert($added['added']===1&&gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=? AND upload=0 AND download=0 AND gps=0',[$id,$another['id']])===1,'Shared recipient receives view-only access exactly once');
    gc_assert(gc_count('SELECT COUNT(*) FROM gallery_editors WHERE gallery_id=? AND user_id=?',[$id,$another['id']])===0,'Sharing never grants editing');
    $recipient=gc_ok(gc_request($other,'GET','/galleries/'.$id.'/photos'),'Recipient can now view the shared gallery');
    gc_assert($recipient['permissions']['share_members']===false&&$recipient['permissions']['upload']===false&&$recipient['permissions']['download']===false&&$recipient['permissions']['gps']===false,'A recipient cannot upload, download originals, inspect GPS or pass on access');
    gc_assert(gc_request($other,'GET','/photos/'.$photo['id'].'/image?size=original')[0]===403,'Sharing does not expose original files');
    gc_assert(gc_request($other,'POST','/galleries/'.$id.'/members',['user_ids'=>[$member['id']]])[0]===403,'A shared recipient cannot grant onward access');
    $again=gc_ok(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id']]]),'Repeated share is idempotent');gc_assert($again['added']===0&&$again['already_had_access']===1,'Retry creates no duplicate access or invitation');
    gc_assert(gc_count('SELECT COUNT(*) FROM users')===$countUsers&&gc_count('SELECT COUNT(*) FROM invitations')===$countInvites,'Member sharing creates neither accounts nor invitations');
    gc_ok(gc_request($admin,'PUT','/admin/grants',['gallery_id'=>$id,'user_id'=>$another['id'],'view'=>true,'upload'=>true,'download'=>true,'gps'=>true,'edit'=>true]),'Admin sets additional recipient permissions');
    gc_ok(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$another['id']]]),'Owner retries an admin-managed recipient');
    gc_assert(gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=? AND upload=1 AND download=1 AND gps=1',[$id,$another['id']])===1&&gc_count('SELECT COUNT(*) FROM gallery_editors WHERE gallery_id=? AND user_id=?',[$id,$another['id']])===1,'Member sharing preserves existing admin-assigned permissions');
    gc_assert(gc_request($other,'GET','/galleries/'.$id.'/members')[0]===403,'An editor is not automatically an owner');
    gc_assert(gc_request($creator,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$another['id'],'expected_owner_id'=>$member['id']])[0]===403,'Only admin can transfer ownership');
    gc_assert(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$another['id'],'expected_owner_id'=>null])[0]===409,'A stale ownership edit cannot replace a newer owner');
    gc_ok(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$another['id'],'expected_owner_id'=>$member['id']]),'Admin explicitly transfers ownership');
    gc_assert(gc_request($creator,'GET','/galleries/'.$id.'/members')[0]===403,'The old owner immediately loses the ability to grant access');
    gc_assert(gc_request($other,'GET','/galleries/'.$id.'/members')[0]===200,'The assigned owner can manage existing members');
    gc_ok(gc_request($admin,'PUT','/admin/grants',['gallery_id'=>$id,'user_id'=>$another['id'],'view'=>true,'upload'=>true,'download'=>true,'gps'=>true,'edit'=>false]),'Admin removes owner editing authority');
    gc_assert(gc_request($other,'GET','/galleries/'.$id.'/members')[0]===403,'Admin revocation also blocks sharing despite the owner marker');
    gc_ok(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>null,'expected_owner_id'=>$another['id']]),'Admin can leave a legacy gallery without a member owner');
    gc_assert(gc_ok(gc_request($admin,'GET','/galleries/'.$id.'/members'),'Admin sees a gallery with unknown ownership')['owner_id']===null,'Unknown legacy ownership is never guessed from upload or editing permissions');
    $deadClient=gc_client();$dead=gc_join($admin,$deadClient,$shared,'deleted-sharing@example.test');
    gc_ok(gc_request($admin,'DELETE','/admin/users/'.$dead['id'],['confirm'=>true]),'Admin removes a synthetic member');
    $list=gc_ok(gc_request($admin,'GET','/galleries/'.$id.'/members'),'Admin refreshes active recipients');
    gc_assert(!in_array($dead['id'],array_column($list['members'],'id'),true),'Deleted member is absent from recipient search');
    gc_assert(gc_request($admin,'POST','/galleries/'.$id.'/members',['user_ids'=>[$dead['id']]])[0]===409,'A stale deleted member selection is rejected without restoring the account');
    gc_assert(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$dead['id'],'expected_owner_id'=>null])[0]===409,'Deleted accounts cannot become owners');
    gc_assert(gc_ok(gc_request($admin,'GET','/galleries/'.$id.'/members?q=not-a-real-name'),'Search filters member names')['members']===[],'Search is bounded and does not leak contact details');
    gc_ok(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$member['id'],'expected_owner_id'=>null]),'Restore trusted owner for rollback checks');
    $freshClient=gc_client();$freshUser=gc_join($admin,$freshClient,$shared,'sharing-rollback@example.test');
    $pdo->exec("CREATE TRIGGER synthetic_share_failure BEFORE INSERT ON grants FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic share failure'");
    gc_assert(gc_request($creator,'POST','/galleries/'.$id.'/members',['user_ids'=>[$freshUser['id']]])[0]===500&&gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=?',[$id,$freshUser['id']])===0,'A database failure leaves no acknowledged or partial recipient grant');
    gc_assert(gc_request($admin,'PUT','/admin/galleries/'.$id.'/owner',['user_id'=>$freshUser['id'],'expected_owner_id'=>$member['id']])[0]===500&&gc_count('SELECT COUNT(*) FROM settings WHERE `key`=? AND value=?',['gallery_owner_'.$id,$member['id']])===1,'A failed ownership grant rolls back the owner record as well');
    $pdo->exec('DROP TRIGGER synthetic_share_failure');
    // Force recipient deletion to commit while the HTTP request waits for its
    // user-row lock. This reproduces an actual concurrent operation, not a delay
    // assumption: SHOW PROCESSLIST confirms the request entered the locked query.
    $pdo->beginTransaction();$pdo->query("SELECT id FROM users WHERE id='".$freshUser['id']."' FOR UPDATE")->fetchAll();
    $multi=curl_multi_init();curl_setopt_array($creator,[CURLOPT_URL=>$origin.'/lexgalleri/api/galleries/'.$id.'/members',CURLOPT_CUSTOMREQUEST=>'POST',CURLOPT_POSTFIELDS=>json_encode(['user_ids'=>[$freshUser['id']]]),CURLOPT_HTTPHEADER=>['Origin: '.$origin,'Content-Type: application/json']]);curl_multi_add_handle($multi,$creator);
    $running=0;$blocked=false;
    for($i=0;$i<100;$i++){
        curl_multi_exec($multi,$running);
        foreach($pdo->query('SHOW FULL PROCESSLIST')->fetchAll() as $process)if(($process['db']??null)===$database&&str_contains((string)($process['Info']??''),'SELECT u.* FROM users u WHERE u.id IN')&&str_contains((string)$process['Info'],'FOR UPDATE'))$blocked=true;
        if($blocked)break;usleep(20000);
    }
    gc_assert($blocked,'Concurrent test observes the real HTTP request waiting for its recipient lock');
    $statement=$pdo->prepare('INSERT INTO settings(`key`,value) VALUES(?,?)');$statement->execute(['deleted_user_'.$freshUser['id'],'synthetic concurrent deletion']);
    $pdo->prepare('UPDATE users SET password=? WHERE id=?')->execute(['!deleted-account!',$freshUser['id']]);$pdo->commit();
    $until=microtime(true)+10;do{curl_multi_exec($multi,$running);if($running)curl_multi_select($multi,0.05);}while($running&&microtime(true)<$until);
    $status=(int)curl_getinfo($creator,CURLINFO_RESPONSE_CODE);curl_multi_remove_handle($multi,$creator);curl_multi_close($multi);
    if($status!==409&&is_file($temp.'/server.log')){preg_match_all('/[^\n]*(?:SQLSTATE|Deadlock|deadlock)[^\n]*/',file_get_contents($temp.'/server.log'),$details);foreach(array_slice($details[0],-2) as $line)fwrite(STDERR,$line."\n");}
    gc_assert($status===409&&gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=?',[$id,$freshUser['id']])===0,'Deleting a selected recipient during the request cannot restore that account or grant access (HTTP '.$status.')');


    $beforeGalleries=gc_count('SELECT COUNT(*) FROM galleries');$beforeGrants=gc_count('SELECT COUNT(*) FROM grants');
    $beforeOwners=gc_count("SELECT COUNT(*) FROM settings WHERE LOCATE('gallery_owner_',`key`)=1");
    $pdo->exec("CREATE TRIGGER synthetic_create_grant_failure BEFORE INSERT ON grants FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic creator grant failure'");
    gc_assert(gc_request($creator,'POST','/galleries',['name'=>'Must roll back'])[0]===500,'A creator-grant failure is not acknowledged as creation');
    gc_assert(gc_count('SELECT COUNT(*) FROM galleries')===$beforeGalleries&&gc_count('SELECT COUNT(*) FROM grants')===$beforeGrants&&gc_count('SELECT COUNT(*) FROM galleries WHERE name=?',['Must roll back'])===0,'The gallery and creator grant roll back together without an orphan');
    gc_assert(gc_count("SELECT COUNT(*) FROM settings WHERE LOCATE('gallery_owner_',`key`)=1")===$beforeOwners,'Failed gallery creation leaves no orphan owner marker');
    $pdo->exec('DROP TRIGGER synthetic_create_grant_failure');
    $retry=gc_ok(gc_request($creator,'POST','/galleries',['name'=>'After failure']),'A member can retry after a database problem is resolved');
    gc_assert(gc_count('SELECT COUNT(*) FROM grants WHERE gallery_id=? AND user_id=?',[$retry['id'],$member['id']])===1,'Successful retry creates the matching creator grant');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');gc_remove($temp);}
exit($failures?1:0);
