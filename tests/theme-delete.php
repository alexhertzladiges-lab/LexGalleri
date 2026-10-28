<?php
declare(strict_types=1);
// Synthetic databases and accounts only. No production config or hosting access.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-theme-test-'.bin2hex(random_bytes(6));$privateRoot=$temp.'/private';mkdir($privateRoot.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8779);$server=null;$checks=0;$failures=0;
function td_assert(bool $condition,string $message):void{global $checks,$failures;$checks++;if($condition)echo 'PASS: '.$message."\n";else{$failures++;fwrite(STDERR,'FAIL: '.$message."\n");}}
function td_client():CurlHandle{$client=curl_init();curl_setopt_array($client,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20]);return $client;}
function td_request(CurlHandle $client,string $method,string $path,mixed $body=null,bool $multipart=false):array{
    global $origin;$headers=['Origin: '.$origin];if(!$multipart)$headers[]='Content-Type: application/json';
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/lexgalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:($multipart?$body:json_encode($body)),CURLOPT_HTTPHEADER=>$headers]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function td_ok(array $response,string $message):array{td_assert($response[0]===200,$message);if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($message.': '.json_encode($response));return $response[1];}
function td_upload(CurlHandle $owner,array $theme):array{global $temp;file_put_contents($temp.'/theme.json',json_encode($theme));return td_ok(td_request($owner,'POST','/admin/themes',['file'=>new CURLFile($temp.'/theme.json','application/json','theme.json')],true),'Install synthetic package '.$theme['name']);}
function td_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))td_remove($child);else unlink($child);}rmdir($path);}
try{
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('theme-test-setup-',3)];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');foreach(['app.php','schema.sql','security.php'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;$server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S','127.0.0.1:'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated theme server');
    $owner=td_client();$member=td_client();$anonymous=td_client();$pending=td_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(td_request($anonymous,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Theme server unavailable');
    $setup=td_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Theme Admin','email'=>'theme-admin@example.test','password'=>'long-theme-admin-password']);
    td_ok(security_test_complete_admin($owner,$setup,'td_request'),'Admin completes real Authenticator setup');
    $status=td_ok(td_request($owner,'GET','/status'),'Status is available');td_assert(($status['capabilities']['theme_delete']??false)===true,'Status advertises theme deletion capability');
    $default=td_ok(td_request($owner,'GET','/theme'),'Read default active design');
    $themeA=$default;$themeA['name']='Package A';$themeA['colors']['accent']='#135724';
    $themeB=$default;$themeB['name']='Package B';$themeB['font']='serif';
    $a=td_upload($owner,$themeA);$b=td_upload($owner,$themeB);
    $gallery=td_ok(td_request($owner,'POST','/galleries',['name'=>'Synthetic family']),'Create synthetic invitation gallery')['id'];
    $invite=td_ok(td_request($owner,'POST','/admin/invitations',['name'=>'Member','email'=>'theme-member@example.test','gallery_id'=>$gallery]),'Invite a synthetic member');
    td_ok(td_request($member,'POST','/accept',['token'=>explode('=',$invite['path'])[1],'password'=>'long-theme-member-password']),'Member accepts invitation');
    td_ok(td_request($pending,'POST','/login',['email'=>'theme-admin@example.test','password'=>'long-theme-admin-password']),'Password-only admin starts MFA challenge');
    td_assert(td_request($anonymous,'DELETE','/admin/themes/'.$a['id'])[0]===401,'Anonymous callers cannot delete design packages');
    td_assert(td_request($pending,'DELETE','/admin/themes/'.$a['id'])[0]===401,'Password-only pending admin cannot delete packages');
    td_assert(td_request($member,'DELETE','/admin/themes/'.$a['id'])[0]===403,'Members cannot delete packages');
    td_assert(td_request($owner,'DELETE','/admin/themes/default')[0]===409,'Standard package cannot be deleted');
    td_assert(td_request($owner,'DELETE','/admin/themes/'.str_repeat('f',32))[0]===404,'Unknown package deletion returns not found');
    td_assert(td_request($owner,'DELETE','/admin/themes/not-a-valid-id')[0]===404,'Invalid package IDs are not accepted');
    td_ok(td_request($owner,'POST','/admin/themes/'.$a['id'].'/activate'),'Activate package A');
    $deleted=td_ok(td_request($owner,'DELETE','/admin/themes/'.$b['id']),'Delete inactive package B');
    td_assert(($deleted['ok']??false)===true&&$deleted['reset_to_default']===false&&$deleted['theme']==$themeA,'Inactive deletion acknowledges and preserves active custom design');
    td_assert(td_request($owner,'GET','/theme')[1]==$themeA,'Public active theme remains A after deleting B');
    $ids=array_column(td_ok(td_request($owner,'GET','/admin/themes'),'List remaining packages'),'id');td_assert(in_array('default',$ids,true)&&in_array($a['id'],$ids,true)&&!in_array($b['id'],$ids,true),'Only the selected package disappears from package list');
    td_assert(td_request($owner,'POST','/admin/themes/'.$b['id'].'/activate')[0]===404,'Deleted package cannot be activated later');
    $pdo->exec("CREATE TRIGGER prevent_theme_delete BEFORE DELETE ON themes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic-delete-failure'");
    td_assert(td_request($owner,'DELETE','/admin/themes/'.$a['id'])[0]===500,'Database deletion error does not acknowledge success');
    td_assert(td_request($owner,'GET','/theme')[1]==$themeA,'Failed deletion rolls back the default fallback');
    td_assert($pdo->query("SELECT value FROM settings WHERE `key`='theme_package_id'")->fetchColumn()===$a['id'],'Failed deletion also rolls back the active package identity');
    $statement=$pdo->prepare('SELECT count(*) FROM themes WHERE id=?');$statement->execute([$a['id']]);td_assert((int)$statement->fetchColumn()===1,'Failed deletion preserves the installed package');
    $pdo->exec('DROP TRIGGER prevent_theme_delete');
    $lock='lexgalleri-theme-'.substr(hash('sha256',$database),0,32);$statement=$pdo->prepare('SELECT GET_LOCK(?,0)');$statement->execute([$lock]);td_assert((int)$statement->fetchColumn()===1,'Independent database connection holds the theme operation lock');
    td_assert(td_request($owner,'DELETE','/admin/themes/'.$a['id'])[0]===409,'Deletion waits for an in-flight theme operation and reports conflict');
    td_assert(td_request($owner,'POST','/admin/themes/default/activate')[0]===409,'Activation uses the same serialization lock');
    $statement=$pdo->prepare('SELECT RELEASE_LOCK(?)');$statement->execute([$lock]);
    td_assert(td_request($owner,'GET','/theme')[1]==$themeA,'Contended operations preserve the active design');
    $deleted=td_ok(td_request($owner,'DELETE','/admin/themes/'.$a['id']),'Delete active package A after lock release');
    td_assert($deleted['reset_to_default']===true&&$deleted['theme']==$default,'Active package deletion switches to the standard design');
    td_assert(td_request($owner,'GET','/theme')[1]==$default,'Default fallback is persisted for subsequent requests');
    td_assert($pdo->query("SELECT value FROM settings WHERE `key`='theme_package_id'")->fetchColumn()==='default','Default fallback stores its protected package identity');
    td_assert(array_column(td_request($owner,'GET','/admin/themes')[1],'id')===['default'],'Protected default remains after deleting every installed package');
    td_assert(td_request($owner,'DELETE','/admin/themes/'.$a['id'])[0]===404,'Deleting an already removed package returns not found');
    $a=td_upload($owner,$themeA);td_ok(td_request($owner,'POST','/admin/themes/'.$a['id'].'/activate'),'Activate A for duplicate package check');
    td_assert($pdo->query("SELECT value FROM settings WHERE `key`='theme_package_id'")->fetchColumn()===$a['id'],'Activation records package identity separately from its JSON snapshot');
    $duplicate=td_upload($owner,array_reverse($themeA,true));
    $deleted=td_ok(td_request($owner,'DELETE','/admin/themes/'.$duplicate['id']),'Delete inactive duplicate with reordered JSON keys');
    td_assert($deleted['reset_to_default']===false&&$deleted['theme']==$themeA&&td_request($owner,'GET','/theme')[1]==$themeA,'Deleting an inactive identical package preserves the active package');
    td_assert($pdo->query("SELECT value FROM settings WHERE `key`='theme_package_id'")->fetchColumn()===$a['id'],'Inactive duplicate deletion preserves active package identity');
    // Existing installations have no package ID until their next activation.
    // Retain the snapshot fallback only for those legacy settings.
    $duplicate=td_upload($owner,array_reverse($themeA,true));$pdo->exec("DELETE FROM settings WHERE `key`='theme_package_id'");
    $deleted=td_ok(td_request($owner,'DELETE','/admin/themes/'.$duplicate['id']),'Delete legacy equal snapshot without a recorded package ID');
    td_assert($deleted['reset_to_default']===true&&td_request($owner,'GET','/theme')[1]==$default,'Legacy snapshots still reset consistently regardless of JSON key order');
    $statement=$pdo->prepare('SELECT count(*) FROM themes WHERE id=?');$statement->execute([$a['id']]);td_assert((int)$statement->fetchColumn()===1,'Snapshot fallback leaves the other installed duplicate package intact');
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");}
finally{if(is_resource($server)){proc_terminate($server);proc_close($server);}try{$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');}catch(Throwable){}if(is_dir($temp))td_remove($temp);}
echo "$checks checks, $failures failures\n";exit($failures?1:0);
