<?php
declare(strict_types=1);
// Creates and drops its own randomly named test database. Never uses the real app config.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and TEST_DB_HOST/USER/PASSWORD to an isolated test database server.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-test-'.bin2hex(random_bytes(6));mkdir($temp,0700,true);mkdir($temp.'/config',0700);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$dbuser=getenv('TEST_DB_USER')?:'root';$pw=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$pw,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$server=null;$errors=0;$count=0;
function assertion(bool $ok,string $label):void {global $errors,$count;$count++;if(!$ok){$errors++;fwrite(STDERR,"FAIL: $label\n");}else echo "PASS: $label\n";}
function client():CurlHandle {$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>15]);return $c;}
function request(CurlHandle $c,string $method,string $path,mixed $body=null,bool $multipart=false,string $origin=''):array {
    global $originBase;$headers=['Origin: '.($origin?:$originBase)];
    curl_setopt($c,CURLOPT_URL,$originBase.'/LexGalleri/api'.$path);curl_setopt($c,CURLOPT_CUSTOMREQUEST,$method);
    if($body!==null){if(!$multipart){$headers[]='Content-Type: application/json';$body=json_encode($body);}curl_setopt($c,CURLOPT_POSTFIELDS,$body);}else curl_setopt($c,CURLOPT_POSTFIELDS,null);
    curl_setopt($c,CURLOPT_HTTPHEADER,$headers);$raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));
    return [(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function remove_tree(string $path):void {foreach(scandir($path) as $p){if($p==='.'||$p==='..')continue;$f=$path.'/'.$p;if(is_dir($f))remove_tree($f);else unlink($f);}rmdir($path);}
try {
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$pdo->exec('USE `'.$database.'`');
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$dbuser,'db_password'=>$pw,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('test-setup-',5)];
    file_put_contents($temp.'/config/config.php','<?php return '.var_export($config,true).';');copy($root.'/private/app.php',$temp.'/app.php');copy($root.'/private/schema.sql',$temp.'/schema.sql');
    $httpPort=(int)(getenv('TEST_HTTP_PORT')?:8765);$originBase='http://127.0.0.1:'.$httpPort;
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$temp;
    $server=proc_open([PHP_BINARY,'-d','upload_max_filesize=25M','-d','post_max_size=26M','-d','memory_limit=256M','-S','127.0.0.1:'.$httpPort,$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Could not start PHP server');
    $owner=client();$guest=client();$stranger=client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Server unavailable: '.file_get_contents($temp.'/server.log'));
    assertion(request($owner,'GET','/status')[1]['setup']===true,'Initial setup status');
    assertion(request($owner,'POST','/setup',['token'=>'wrong'])[0]===403,'Setup requires secret');
    $setup=['token'=>$config['setup_token'],'name'=>'Admin','email'=>'admin@example.test','password'=>'long-admin-password'];
    $r=request($owner,'POST','/setup',$setup);assertion($r[0]===200,'Create first admin');
    assertion(request($owner,'POST','/setup',$setup)[0]===409,'No second first-admin setup');
    $g=request($owner,'POST','/galleries',['name'=>'Sommer','description'=>'Familien'])[1]['id'];
    $hidden=request($owner,'POST','/galleries',['name'=>'Kun admin'])[1]['id'];
    $im=imagecreatetruecolor(120,80);imagefill($im,0,0,imagecolorallocate($im,20,100,70));imagejpeg($im,$temp.'/test.jpg');
    // Build a small EXIF APP1 containing GPS (55 N, 12 E), a timestamp and orientation.
    $entry=fn(int $tag,int $type,int $n,int $v)=>pack('vvVV',$tag,$type,$n,$v);
    $tiff='II'.pack('vV',42,8).pack('v',3).$entry(0x0112,3,1,6).$entry(0x8769,4,1,50).$entry(0x8825,4,1,68).pack('V',0);
    $tiff.=pack('v',1).$entry(0x9003,2,20,122).pack('V',0);
    $tiff.=pack('v',4).$entry(1,2,2,ord('N')).$entry(2,5,3,142).$entry(3,2,2,ord('E')).$entry(4,5,3,166).pack('V',0);
    $tiff.="2020:07:14 12:30:00\0".pack('VVVVVV',55,1,0,1,0,1).pack('VVVVVV',12,1,0,1,0,1);
    $jpeg=file_get_contents($temp.'/test.jpg');$exif="Exif\0\0".$tiff;$jpeg=substr($jpeg,0,2)."\xff\xe1".pack('n',strlen($exif)+2).$exif.substr($jpeg,2);file_put_contents($temp.'/test.jpg',$jpeg);
    $upload=fn()=>['file'=>new CURLFile($temp.'/test.jpg','image/jpeg','familie.jpg')];
    $r=request($owner,'POST',"/galleries/$g/photos",$upload(),true);assertion($r[0]===200,'JPEG upload');if($r[0]!==200)throw new RuntimeException(json_encode($r));$id=$r[1]['id'];
    assertion(request($owner,'POST',"/galleries/$g/photos",$upload(),true)[0]===409,'Duplicate rejected');
    $p=request($owner,'GET',"/galleries/$g/photos")[1]['photos'][0];
    assertion($p['taken']==='2020-07-14T12:30:00' && $p['lat']===55 && $p['lon']===12,'EXIF date and GPS imported');
    $file=request($owner,'GET',"/photos/$id/image?size=view");file_put_contents($temp.'/view.jpg',$file[1]);$preview=getimagesize($temp.'/view.jpg');$ex=@exif_read_data($temp.'/view.jpg');
    assertion($preview[0]===80 && $preview[1]===120,'EXIF orientation applied');
    assertion(!isset($ex['GPSLatitude'])&&!isset($ex['DateTimeOriginal']),'Preview has no original EXIF');
    assertion(request($stranger,'GET',"/photos/$id/image")[0]===401,'Anonymous image denied');
    $r=request($owner,'POST','/admin/invitations',['email'=>'guest@example.test','name'=>'Gæst','gallery_id'=>$g]);$token=explode('=',$r[1]['path'])[1];
    assertion(str_starts_with($r[1]['path'],'/LexGalleri/?invite='),'Invitation uses subfolder');
    assertion(request($guest,'POST','/accept',['token'=>$token,'password'=>'long-guest-password'])[0]===200,'Guest accepts invitation');
    assertion(request($guest,'POST','/accept',['token'=>$token,'password'=>'long-guest-password'])[0]===400,'Invitation only once');
    assertion(count(request($guest,'GET','/galleries')[1])===1,'Gallery list filtered');
    assertion(request($guest,'GET',"/galleries/$hidden/photos")[0]===403,'Other gallery hidden');
    assertion(request($guest,'GET',"/photos/$id/image")[0]===200,'Allowed thumbnail');
    assertion(request($guest,'GET',"/galleries/$g/photos")[1]['photos'][0]['lat']===null,'GPS hidden for guest');
    assertion(request($guest,'POST',"/galleries/$g/photos",$upload(),true)[0]===403,'Upload permission checked');
    assertion(request($guest,'GET',"/photos/$id/image?size=original")[0]===403,'Original denied');
    assertion(request($guest,'GET','/admin/users')[0]===403,'Guest cannot administer');
    assertion(request($guest,'PATCH',"/photos/$id",['title'=>'bad'])[0]===403,'Guest cannot edit metadata');
    assertion(request($guest,'POST','/admin/themes',['file'=>new CURLFile($temp.'/test.jpg','image/jpeg','bad.json')],true)[0]===403,'Guest cannot install themes');
    $guestId=request($guest,'GET','/me')[1]['id'];
    request($owner,'PUT','/admin/grants',['gallery_id'=>$g,'user_id'=>$guestId,'view'=>true,'download'=>true]);
    assertion(request($guest,'GET',"/photos/$id/image?size=original")[0]===403,'Original needs GPS permission too');
    request($owner,'PUT','/admin/grants',['gallery_id'=>$g,'user_id'=>$guestId,'view'=>true,'download'=>true,'gps'=>true]);
    assertion(request($guest,'GET',"/photos/$id/image?size=original")[1]===$jpeg,'Original preserved byte for byte');
    assertion(request($guest,'GET',"/galleries/$g/photos")[1]['photos'][0]['lat']===55,'Granted GPS visible');
    assertion(request($guest,'POST',"/photos/$id/favorite")[0]===200,'Favorite added');
    request($owner,'PUT','/admin/grants',['gallery_id'=>$g,'user_id'=>$guestId,'view'=>false]);
    assertion(request($guest,'GET',"/photos/$id/image")[0]===403,'Revocation takes effect on image');
    $metadata=['title'=>'Sommer','taken'=>'1984','precision'=>'circa','place'=>'Skagen','lat'=>57.72,'lon'=>10.58];
    assertion(request($owner,'PATCH',"/photos/$id",$metadata)[0]===200,'Edit partial date');
    foreach([['0000','year'],['2026-13','month'],['2026-02-30','day']] as [$date,$precision])assertion(request($owner,'PATCH',"/photos/$id",array_replace($metadata,['taken'=>$date,'precision'=>$precision]))[0]===400,'Reject invalid date '.$date);
    assertion(request($owner,'POST','/galleries',['name'=>'bad'],false,'https://evil.example')[0]===403,'Cross-origin write denied');
    curl_setopt($owner,CURLOPT_URL,$originBase.'/LexGalleri/api/galleries');curl_setopt($owner,CURLOPT_CUSTOMREQUEST,'POST');curl_setopt($owner,CURLOPT_POSTFIELDS,'{"name":"bad"}');curl_setopt($owner,CURLOPT_HTTPHEADER,['Content-Type: application/json']);curl_exec($owner);
    assertion(curl_getinfo($owner,CURLINFO_RESPONSE_CODE)===403,'Missing Origin denied');
    file_put_contents($temp.'/bad.txt','This is not an image');
    assertion(request($owner,'POST',"/galleries/$g/photos",['file'=>new CURLFile($temp.'/bad.txt','image/jpeg','fake.jpg')],true)[0]===400,'Fake image rejected');
    $theme=['version'=>1,'name'=>'Hav','colors'=>['background'=>'#f2f6f8','surface'=>'#ffffff','text'=>'#203e50','accent'=>'#336b87'],'font'=>'sans','radius'=>14,'density'=>'comfortable'];
    file_put_contents($temp.'/theme.json',json_encode($theme));
    $tid=request($owner,'POST','/admin/themes',['file'=>new CURLFile($temp.'/theme.json','application/json','theme.json')],true)[1]['id'];
    assertion(request($owner,'POST',"/admin/themes/$tid/activate")[0]===200,'Activate uploaded design');
    assertion(request($guest,'GET','/theme')[1]['name']==='Hav','Theme shared across accounts');
    $z=new ZipArchive();$z->open($temp.'/bad.zip',ZipArchive::CREATE);$z->addFromString('../theme.json',json_encode($theme));$z->close();
    assertion(request($owner,'POST','/admin/themes',['file'=>new CURLFile($temp.'/bad.zip','application/zip','bad.zip')],true)[0]===400,'ZIP traversal rejected');
    $z=new ZipArchive();$z->open($temp.'/good.zip',ZipArchive::CREATE);$z->addFromString('theme.json',json_encode($theme));$z->close();
    assertion(request($owner,'POST','/admin/themes',['file'=>new CURLFile($temp.'/good.zip','application/zip','good.zip')],true)[0]===200,'Valid ZIP installed');
    $theme['colors']['accent']='url(https://evil.example)';file_put_contents($temp.'/theme.json',json_encode($theme));
    assertion(request($owner,'POST','/admin/themes',['file'=>new CURLFile($temp.'/theme.json','application/json','theme.json')],true)[0]===400,'CSS injection rejected');
    assertion(request($owner,'POST','/logout')[0]===200 && request($owner,'GET','/me')[0]===401,'Logout invalidates session');
    echo "\n$count checks, $errors failures\n";
} catch(Throwable $e) {$errors++;fwrite(STDERR,$e->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally {if(is_resource($server)){proc_terminate($server);proc_close($server);}$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');remove_tree($temp);}
exit($errors?1:0);
