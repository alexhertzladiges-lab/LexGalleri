<?php
declare(strict_types=1);
// Disposable public assets and a legacy private HTML template; no database or
// hosting connection is used. The test never changes application source files.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-assets-'.bin2hex(random_bytes(6));
mkdir($temp.'/public/static',0700,true);mkdir($temp.'/private/config',0700,true);
$server=null;$checks=0;$failures=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8777);
function av_assert(bool $ok,string $label):void{global $checks,$failures;$checks++;if(!$ok)$failures++;echo($ok?'PASS: ':'FAIL: ').$label."\n";}
function av_request(string $path):array{global $origin;$c=curl_init($origin.$path);curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_HEADER=>true]);$raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));$length=(int)curl_getinfo($c,CURLINFO_HEADER_SIZE);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);return[$status,substr($raw,$length),substr($raw,0,$length)];}
function av_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))av_remove($child);else unlink($child);}rmdir($path);}
try{
    copy($root.'/public/index.php',$temp.'/public/index.php');
    file_put_contents($temp.'/private/config/config.php','<?php return [];');file_put_contents($temp.'/private/security.php','<?php');
    $legacy=<<<'PHP'
<?php
const LEXGALLERI_SECURITY_VERSION = 1;
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_contains($path,'/api/status')){header('Content-Type: application/json');echo '{"ready":true,"example":"static/app.js?v=legacy"}';exit;}
if(str_contains($path,'/api/video')){header('Content-Type: video/mp4');echo "\x00\x01synthetic static/app.js?v=legacy\xff";exit;}
if(str_ends_with($path,'/plain')){header('Content-Type: text/plain');echo 'static/app.js?v=legacy';exit;}
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><link rel="stylesheet" href="/lexgalleri/static/style.css?v=legacy"><script src="/lexgalleri/static/qrcode.js?v=2.0.4"></script><script src="/lexgalleri/static/app.js?v=legacy"></script><script src="/lexgalleri/static/pwa.js?v=legacy"></script>';
PHP;
    file_put_contents($temp.'/private/app.php',$legacy);$legacyHash=hash_file('sha256',$temp.'/private/app.php');
    foreach(['app.js','pwa.js','qrcode.js','style.css'] as $name)file_put_contents($temp.'/public/static/'.$name,'synthetic first '.$name);
    file_put_contents($temp.'/router.php','<?php require __DIR__."/public/index.php";');
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$temp.'/private';
    $server=proc_open([PHP_BINARY,'-d','display_errors=0','-S',parse_url($origin,PHP_URL_HOST).':'.parse_url($origin,PHP_URL_PORT),$temp.'/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$temp,$env);
    if(!is_resource($server))throw new RuntimeException('Could not start disposable asset server');
    $ready=false;for($i=0;$i<60;$i++){usleep(100000);try{if(av_request('/lexgalleri/api/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Disposable asset server did not start');
    $first=av_request('/lexgalleri/');av_assert($first[0]===200,'Legacy private HTML loads through public bootstrap');
    $versions=[];
    foreach(['app.js','pwa.js','qrcode.js','style.css'] as $name){$versions[$name]=substr(hash_file('sha256',$temp.'/public/static/'.$name),0,16);av_assert(str_contains($first[1],'/static/'.$name.'?v='.$versions[$name].'"'),'Legacy HTML uses current public hash for '.$name);}
    file_put_contents($temp.'/public/static/app.js','synthetic updated application');$updated=substr(hash_file('sha256',$temp.'/public/static/app.js'),0,16);
    $second=av_request('/lexgalleri/');av_assert($updated!==$versions['app.js']&&str_contains($second[1],'/static/app.js?v='.$updated.'"')&&!str_contains($second[1],'/static/app.js?v='.$versions['app.js'].'"'),'Public app update changes its URL automatically');
    av_assert(str_contains($second[1],'/static/style.css?v='.$versions['style.css'].'"'),'Unchanged assets keep their current content version');
    av_assert(hash_file('sha256',$temp.'/private/app.php')===$legacyHash,'Refreshing public assets requires no private program change');
    $json=av_request('/lexgalleri/api/status');av_assert($json[1]==='{"ready":true,"example":"static/app.js?v=legacy"}'&&str_contains($json[2],'application/json'),'JSON API bytes and MIME stay unchanged');
    $video=av_request('/lexgalleri/api/video');av_assert($video[1]==="\x00\x01synthetic static/app.js?v=legacy\xff"&&str_contains($video[2],'video/mp4'),'Streamed media bytes and MIME stay unchanged');
    $plain=av_request('/lexgalleri/plain');av_assert($plain[1]==='static/app.js?v=legacy'&&str_contains($plain[2],'text/plain'),'Non-HTML output stays unchanged');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $error){$failures++;fwrite(STDERR,$error->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}av_remove($temp);}
exit($failures?1:0);
