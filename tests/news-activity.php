<?php
declare(strict_types=1);
// Synthetic accounts, media and random database only. No hosting credentials.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-news-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';mkdir($privateRoot.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8783);$server=null;$checks=0;$failures=0;
function iv_assert(bool $ok,string $message):void{global $checks,$failures;$checks++;if(!$ok)$failures++;echo($ok?'PASS: ':'FAIL: ').$message."\n";}
function iv_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $c;}
function iv_request(CurlHandle $c,string $method,string $path,?array $body=null,?string $from=null):array{global $origin;curl_setopt_array($c,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>['Origin: '.($from??$origin),'Content-Type: application/json']]);$raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));return[(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];}
function iv_ok(array $r,string $message):array{iv_assert($r[0]===200,$message);if($r[0]!==200||!is_array($r[1]))throw new RuntimeException($message.': '.json_encode($r));return $r[1];}
function iv_query(string $sql,array $args=[]):PDOStatement{global $pdo;$s=$pdo->prepare($sql);$s->execute($args);return $s;}
function iv_count(string $sql,array $args=[]):int{return(int)iv_query($sql,$args)->fetchColumn();}
function iv_upgrade(string $sql):array{
    global $pdo;$truncations=[];
    // Check each statement immediately: a later statement clears SQL warnings.
    foreach(explode(';',$sql) as $statement){
        if(trim($statement)==='')continue;$pdo->exec($statement);
        foreach($pdo->query('SHOW WARNINGS')->fetchAll() as $warning)if(in_array((int)$warning['Code'],[1265,1406],true))$truncations[]=$warning;
    }
    return $truncations;
}
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
    $member=iv_client();$memberData=iv_ok(iv_request($admin,'POST','/admin/invitations',['name'=>'News member','email'=>'news@example.test','gallery_id'=>$ids['A']]),'Invite news member');
    $joined=iv_ok(iv_request($member,'POST','/accept',['token'=>iv_token($memberData),'password'=>'long-news-member-password']),'Member completes actual account login');$memberId=$joined['id'];
    $galleries=iv_ok(iv_request($member,'GET','/galleries'),'Read initial gallery baseline');iv_assert((int)$galleries[0]['new_count']===0,'Existing archive is not falsely announced as new on first use');
    $eventsBefore=iv_count('SELECT COUNT(*) FROM activity_events WHERE user_id=?',[$memberId]);
    $new=bin2hex(random_bytes(16));$hidden=bin2hex(random_bytes(16));iv_seed($new,$ids['A'],$adminId);iv_seed($hidden,$ids['C'],$adminId);
    $news=iv_ok(iv_request($member,'GET','/news?gallery_id='.$ids['A']),'Check new-media summary');iv_assert(count($news['galleries'])===1&&(int)$news['galleries'][0]['new_count']===1&&$news['photo_ids']===[$new],'Notification includes only visible albums and unseen media');
    iv_assert(iv_request($member,'GET','/news?gallery_id='.$ids['C'])[0]===403,'New-media endpoint rejects an inaccessible gallery');
    $loaded=iv_ok(iv_request($member,'GET','/galleries/'.$ids['A'].'/photos'),'Load gallery snapshot');$flags=array_column($loaded['photos'],'is_new','id');iv_assert($flags[$new]===true&&$flags[$photoA]===false,'Only the newly published photo gets a new marker');
    iv_assert(iv_request($member,'GET','/photos/'.$new.'/image')[0]===200,'Load a normal thumbnail');
    iv_assert(iv_count('SELECT COUNT(*) FROM activity_events WHERE user_id=?',[$memberId])===$eventsBefore,'Metadata and lazy thumbnail reads do not log gallery or photo views');
    iv_assert(iv_count('SELECT COUNT(*) FROM media_seen WHERE user_id=? AND photo_id=?',[$memberId,$new])===0,'Reading metadata alone does not consume a notification');
    $arrived=bin2hex(random_bytes(16));iv_seed($arrived,$ids['A'],$adminId);
    $body=['photo_ids'=>[$new]];
    iv_assert(iv_request($anonymous,'POST','/galleries/'.$ids['A'].'/visit',$body)[0]===401,'Anonymous visit recording denied');
    iv_assert(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',$body,'https://evil.example')[0]===403,'Cross-origin visit recording denied');
    iv_assert(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',['photo_ids'=>[$new],'user_id'=>$adminId])[0]===400,'Client cannot forge the acting user or event metadata');
    iv_assert(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',['photo_ids'=>[$new,$hidden]])[0]===409&&iv_count('SELECT COUNT(*) FROM media_seen WHERE user_id=? AND photo_id=?',[$memberId,$new])===0,'Mixed-gallery snapshot fails atomically without marking a partial selection');
    iv_ok(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',$body),'A displayed snapshot acknowledges its own new photos');
    $news=iv_ok(iv_request($member,'GET','/news?gallery_id='.$ids['A']),'Check an arrival during an existing gallery visit');iv_assert((int)$news['galleries'][0]['new_count']===1&&$news['photo_ids']===[$arrived],'A photo arriving after the snapshot remains new');
    iv_ok(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',$body),'Repeated snapshot is idempotent');
    iv_assert(iv_count("SELECT COUNT(*) FROM activity_events WHERE user_id=? AND kind='gallery'",[$memberId])===1,'Repeated refreshes are grouped into one gallery activity event');
    iv_assert(iv_request($member,'POST','/galleries/'.$ids['A'].'/visit',['photo_ids'=>array_fill(0,501,$new)])[0]===400,'Snapshot request is bounded to 500 photo IDs');
    $own=bin2hex(random_bytes(16));iv_seed($own,$ids['A'],$memberId);$news=iv_ok(iv_request($member,'GET','/news'),'Read own-upload policy');iv_assert((int)$news['galleries'][0]['new_count']===1,'Own uploads do not notify their uploader');
    iv_assert(iv_request($member,'GET','/admin/activity')[0]===403,'Members cannot read other members activity');
    iv_assert(iv_request($pending,'GET','/admin/activity')[0]===401,'Pending administrator MFA cannot read activity');
    $adminLogins=iv_count("SELECT COUNT(*) FROM activity_events WHERE user_id=? AND kind='login'",[$adminId]);
    iv_ok(iv_request($pending,'POST','/login',['email'=>'invite-admin@example.test','password'=>'long-invite-admin-password']),'Begin an admin password-only challenge');
    iv_assert(iv_count("SELECT COUNT(*) FROM activity_events WHERE user_id=? AND kind='login'",[$adminId])===$adminLogins,'A password-only MFA challenge is never reported as a successful login');
    $again=iv_client();iv_ok(iv_request($again,'POST','/login',['email'=>'news@example.test','password'=>'long-news-member-password']),'Returning member logs in normally');
    iv_assert(iv_count("SELECT COUNT(*) FROM activity_events WHERE user_id=? AND kind='login'",[$memberId])===2,'Only complete logins are recorded, once for each actual login');
    iv_assert((int)iv_ok(iv_request($again,'GET','/news'),'Login keeps unread state')['galleries'][0]['new_count']===1,'Logging in again does not erase unread reminders');
    $detail=iv_ok(iv_request($admin,'GET','/admin/activity?user_id='.$memberId),'Admin reads a member activity summary');
    iv_assert(count($detail['events'])===3&&count(array_filter($detail['events'],fn($e)=>!in_array($e['kind'],['login','gallery'],true)))===0,'Admin sees login and gallery events, never individual photo/video events');
    iv_assert(count(array_filter($detail['uploads'],fn($p)=>$p['id']===$arrived))===1,'Admin can review newly added photos with their album and uploader');
    $oldKey=bin2hex(random_bytes(32));iv_query("INSERT INTO activity_events(user_id,kind,gallery_id,occurred_at,event_key) VALUES(?,'gallery',?,DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 31 DAY),?)",[$memberId,$ids['A'],$oldKey]);
    iv_ok(iv_request($admin,'GET','/admin/activity'),'Apply bounded retention cleanup');iv_assert(iv_count('SELECT COUNT(*) FROM activity_events WHERE event_key=?',[$oldKey])===0,'Activity older than 30 days is removed');
    iv_ok(iv_request($admin,'DELETE','/admin/users/'.$memberId,['confirm'=>true]),'Delete an account with news and activity data');
    iv_assert(iv_count('SELECT COUNT(*) FROM activity_events WHERE user_id=?',[$memberId])===0&&iv_count('SELECT COUNT(*) FROM media_seen WHERE user_id=?',[$memberId])===0&&iv_count('SELECT COUNT(*) FROM activity_users WHERE user_id=?',[$memberId])===0,'Account deletion clears activity history and notification receipts');
    $upgrade=file_get_contents($root.'/private/migrations/008_gallery_news_activity.sql');
    iv_assert(iv_upgrade($upgrade)===[],'Palette migration has no data-truncation warning');
    preg_match("/INSERT IGNORE INTO themes\\(id,document\\) VALUES\\('([a-f0-9]+)'/",$upgrade,$palette);
    $paletteId=$palette[1]??'';iv_assert(strlen($paletteId)===32&&iv_count('SELECT COUNT(*) FROM themes WHERE id=?',[$paletteId])===1,'Full palette identifier fits CHAR(32) and identifies exactly one stored theme');
    $theme=iv_ok(iv_request($admin,'GET','/theme'),'Read approved warm palette');iv_assert($theme['colors']['accent']==='#a54f3d','Upgrade applies the approved brick-red palette');
    $theme['name']='Keep my later theme';$theme['colors']['accent']='#304c72';iv_query("UPDATE settings SET value=? WHERE `key`='theme'",[json_encode($theme)]);
    iv_assert(iv_upgrade($upgrade)===[],'Re-running migration with the existing truncated legacy identifier has no data truncation');
    iv_assert(iv_count('SELECT COUNT(*) FROM themes')===1,'Re-running migration reuses the existing theme without creating a duplicate');
    iv_assert(iv_ok(iv_request($admin,'GET','/theme'),'Read preserved theme')['colors']['accent']==='#304c72','Re-running the migration preserves subsequent admin theme choices');
    $pdo->exec('RENAME TABLE activity_events TO synthetic_saved_activity');$status=iv_ok(iv_request($anonymous,'GET','/status'),'Check incomplete activity migration');
    iv_assert(!$status['capabilities']['gallery_news']&&!$status['capabilities']['member_activity'],'Incomplete schema disables activity and new-media capabilities');
    iv_assert(iv_request($admin,'GET','/admin/activity')[0]===503&&iv_request($admin,'GET','/news')[0]===503,'Incomplete schema never becomes a false empty successful activity or notification list');
    iv_ok(iv_request($admin,'GET','/galleries'),'Core gallery access remains available before activity migration completes');$pdo->exec('RENAME TABLE synthetic_saved_activity TO activity_events');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');iv_remove($temp);}
exit($failures?1:0);
