<?php
declare(strict_types=1);
// A disposable real PHP/MySQL fixture for the browser test. No production
// configuration, accounts, media or hosting connection is ever read.
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-account-browser-'.bin2hex(random_bytes(6));
$private=$temp.'/private';mkdir($private.'/config',0700,true);
$database='lexgalleri_test_'.bin2hex(random_bytes(6));$pdo=null;$server=null;$created=false;$exit=0;
function account_browser_remove(string $path):void {
    if(!is_dir($path))return;
    foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$child=$path.'/'.$name;if(is_dir($child)&&!is_link($child))account_browser_remove($child);else unlink($child);}rmdir($path);
}
try {
    $host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);$user=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
    $pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$user,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$created=true;$pdo->exec('USE `'.$database.'`');
    foreach(explode(';',file_get_contents($root.'/private/schema.sql')) as $statement)if(trim($statement)!=='')$pdo->exec($statement);
    $adminId=bin2hex(random_bytes(16));$memberId=bin2hex(random_bytes(16));$galleryId=bin2hex(random_bytes(16));
    $adminEmail='browser-admin@example.test';$adminPassword='browser-admin-long-password';$memberEmail='browser-member@example.test';$memberPassword='browser-member-long-password';
    $insert=$pdo->prepare('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,?)');
    $insert->execute([$adminId,$adminEmail,'Browser Admin',password_hash($adminPassword,PASSWORD_DEFAULT),1]);
    $insert->execute([$memberId,$memberEmail,'Browser Member',password_hash($memberPassword,PASSWORD_DEFAULT),0]);
    $pdo->prepare('INSERT INTO galleries VALUES(?,?,?,?)')->execute([$galleryId,'Browser testgalleri','Kun syntetiske browserdata',gmdate('Y-m-d\TH:i:s\Z')]);
    $pdo->prepare('INSERT INTO grants VALUES(?,?,1,0,0)')->execute([$galleryId,$memberId]);
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$database,'db_user'=>$user,'db_password'=>$password,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('browser-test-setup-',3)];
    file_put_contents($private.'/config/config.php','<?php return '.var_export($config,true).';');
    foreach(['app.php','security.php','schema.sql','lychee-import.php'] as $file)copy($root.'/private/'.$file,$private.'/'.$file);
    $httpPort=(int)(getenv('TEST_HTTP_PORT')?:8890);$bind=getenv('TEST_HTTP_BIND')?:'127.0.0.1';$origin='http://127.0.0.1:'.$httpPort;
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$private;
    $server=proc_open([PHP_BINARY,'-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S',$bind.':'.$httpPort,$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start disposable PHP browser server');
    $ready=false;$context=stream_context_create(['http'=>['timeout'=>0.3,'ignore_errors'=>true]]);
    for($i=0;$i<80;$i++){$status=@file_get_contents($origin.'/LexGalleri/api/status',false,$context);if(is_string($status)&&str_contains($status,'"setup":false')){$ready=true;break;}usleep(100000);}
    if(!$ready)throw new RuntimeException('Disposable PHP browser server did not become ready');
    $videoPath=$temp.'/browser-video.mp4';file_put_contents($videoPath,base64_decode(file_get_contents($root.'/tests/fixtures/tiny.mp4.b64'),true));
    echo json_encode(['video_path'=>$videoPath,'origin'=>$origin,'admin_email'=>$adminEmail,'admin_password'=>$adminPassword,'member_email'=>$memberEmail,'member_password'=>$memberPassword,'member_id'=>$memberId,'gallery_id'=>$galleryId],JSON_THROW_ON_ERROR)."\n";flush();
    // Parent sends a line (or EOF) after closing Chromium, including on failure.
    fgets(STDIN);
}catch(Throwable $error){$exit=1;fwrite(STDERR,'Account browser fixture: '.$error->getMessage()."\n");}
finally {
    if(is_resource($server)){proc_terminate($server);foreach($pipes??[] as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($server);}
    if($pdo&&$created)$pdo->exec('DROP DATABASE IF EXISTS `'.$database.'`');
    account_browser_remove($temp);
}
exit($exit);
