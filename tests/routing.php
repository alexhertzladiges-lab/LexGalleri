<?php
declare(strict_types=1);
// Creates only synthetic accounts in its own random database and private folder.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
require_once __DIR__.'/security-test-helper.php';
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-routing-php-'.bin2hex(random_bytes(6));mkdir($temp.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$pdo=null;$server=null;$created=false;$checks=0;$failures=0;
$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8774);
function lr_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if($ok)echo 'PASS: '.$label."\n";else{$failures++;fwrite(STDERR,'FAIL: '.$label."\n");}}
function lr_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>false]);return $c;}
function lr_request(CurlHandle $c,string $method,string $path,?array $body=null,?string $host=null):array{
    global $origin;$headers=['Origin: '.$origin,'Content-Type: application/json'];if($host!==null)$headers[]='Host: '.$host;
    curl_setopt_array($c,[CURLOPT_URL=>$origin.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>$headers,CURLOPT_HEADER=>true]);
    $raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));$length=(int)curl_getinfo($c,CURLINFO_HEADER_SIZE);$header=substr($raw,0,$length);$body=substr($raw,$length);
    return[(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($body,true)??$body,$header];
}
function lr_api(CurlHandle $c,string $method,string $path,?array $body=null):array{return lr_request($c,$method,'/lexgalleri/api'.$path,$body);}
function lr_ok(array $r,string $label):array{lr_assert($r[0]===200,$label);if($r[0]!==200||!is_array($r[1]))throw new RuntimeException($label.': '.json_encode($r));return $r[1];}
function lr_cookie_lower(CurlHandle $c):bool{foreach(curl_getinfo($c,CURLINFO_COOKIELIST) as $line){$parts=explode("\t",$line);if(($parts[5]??'')==='lexgalleri'&&($parts[2]??'')==='/lexgalleri')return true;}return false;}
function lr_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))lr_remove($child);else unlink($child);}rmdir($path);}
try{
    $host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$user=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
    $pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$user,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$created=true;
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$user,'db_password'=>$password,'base_path'=>'/lexgalleri','secure_cookies'=>false,'setup_token'=>str_repeat('routing-test-setup-',3)];
    file_put_contents($temp.'/config/config.php','<?php return '.var_export($config,true).';');foreach(['app.php','security.php','schema.sql'] as $file)copy($root.'/private/'.$file,$temp.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$temp;$server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S',parse_url($origin,PHP_URL_HOST).':'.parse_url($origin,PHP_URL_PORT),$root.'/tests/fixtures/routing/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start routing PHP server');$owner=lr_client();$member=lr_client();$anonymous=lr_client();$ready=false;
    for($i=0;$i<70;$i++){usleep(100000);try{if(lr_api($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Disposable PHP routing server unavailable');
    foreach(['lexan.dk','www.lexan.dk','lexan.dk:443'] as $validHost)foreach(['/','/index.php'] as $path){$r=lr_request($anonymous,'GET',$path.'?invite=synthetic%2Btoken&probe=1',null,$validHost);lr_assert($r[0]===308&&str_contains($r[2],'Location: https://lexan.dk/lexgalleri/?invite=synthetic%2Btoken&probe=1'),'Root PHP helper preserves raw query at '.$validHost.$path);lr_assert(str_contains(strtolower($r[2]),'cache-control: no-store'),'Root PHP helper does not cache installation redirects');}
    $post=lr_request($anonymous,'POST','/?probe=post',['synthetic'=>'body'],'lexan.dk');lr_assert($post[0]===308,'Root PHP helper preserves the POST method with 308');
    foreach(['evil.example.test','lexan.dk.evil.example.test'] as $invalidHost)lr_assert(lr_request($anonymous,'GET','/',null,$invalidHost)[0]===404,'Root PHP helper refuses unrelated host '.$invalidHost);
    lr_assert(lr_request($anonymous,'GET','/?probe=%0d%0aLocation%3Ahttps%3A%2F%2Fevil.example.test',null,'lexan.dk')[0]===400,'Root PHP helper refuses encoded header-injection characters');
    $page=lr_request($anonymous,'GET','/lexgalleri/');lr_assert($page[0]===200&&str_contains($page[1],'href="/lexgalleri/manifest.webmanifest"'),'Lowercase app page opens without a 404');lr_assert(!str_contains($page[1],'src="/LexGalleri/')&&!str_contains($page[1],'href="/LexGalleri/'),'App document emits only lowercase gallery URLs');
    foreach(['app.js','pwa.js','qrcode.js','style.css'] as $assetName){$version=substr(hash_file('sha256',$root.'/public/static/'.$assetName),0,16);lr_assert(str_contains($page[1],'/lexgalleri/static/'.$assetName.'?v='.$version.'"'),'Public bootstrap versions '.$assetName.' from its deployed content despite a legacy private HTML template');}
    lr_assert(!str_contains($page[1],'?v=20261028-accounts'),'Old private asset query versions are replaced without reinstalling the private app');
    $setup=lr_api($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Routing Admin','email'=>'routing-admin@example.test','password'=>'long-routing-admin-password']);lr_assert($setup[0]===200&&!empty($setup[1]['mfa_required']),'Lowercase first admin setup still requires Authenticator');$authenticated=security_test_complete_admin($owner,$setup,'lr_api');lr_assert($authenticated[0]===200&&!empty($authenticated[1]['admin']),'Real Authenticator enrollment completes through lowercase API');lr_assert(lr_cookie_lower($owner),'Administrator session cookie is scoped to /lexgalleri');
    $gallery=lr_ok(lr_api($owner,'POST','/galleries',['name'=>'Routing family','description'=>'Synthetic lowercase test']),'Admin can create a gallery using lowercase API')['id'];
    $invitation=lr_ok(lr_api($owner,'POST','/admin/invitations',['name'=>'Routing Member','email'=>'routing-member@example.test','gallery_id'=>$gallery]),'Admin can create a lowercase invitation');lr_assert(str_starts_with($invitation['path'],'/lexgalleri/?invite=')&&!str_contains($invitation['path'],'/LexGalleri'),'Generated invitations use the lowercase public address');
    $token=explode('=',$invitation['path'],2)[1];lr_ok(lr_api($member,'POST','/accept',['token'=>$token,'password'=>'long-routing-member-password']),'Member can accept invitation through lowercase API');lr_assert(lr_cookie_lower($member),'Member session cookie is scoped to /lexgalleri');$galleries=lr_ok(lr_api($member,'GET','/galleries'),'Member can open the shared lowercase gallery API');lr_assert(count($galleries)===1&&$galleries[0]['id']===$gallery,'Lowercase invitation retains its separate gallery permissions');
    foreach(['static/app.js'=>'javascript','static/pwa.js'=>'javascript','manifest.webmanifest'=>'application/manifest+json','service-worker.js'=>'javascript'] as $asset=>$type){$r=lr_request($member,'GET','/lexgalleri/'.$asset);lr_assert($r[0]===200&&str_contains(strtolower($r[2]),$type),'Lowercase public asset resolves with correct MIME: '.$asset);}
    unset($config['base_path']);file_put_contents($temp.'/config/config.php','<?php return '.var_export($config,true).';');$default=lr_request($anonymous,'GET','/lexgalleri/');lr_assert($default[0]===200&&str_contains($default[1],'href="/lexgalleri/manifest.webmanifest"'),'An omitted base_path defaults to lowercase');lr_assert(lr_api($owner,'GET','/profile')[0]===200,'Existing lowercase session still works with the new lowercase default');
    echo "\nRouting PHP: $checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}if($pdo&&$created)$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');lr_remove($temp);}
exit($failures?1:0);
