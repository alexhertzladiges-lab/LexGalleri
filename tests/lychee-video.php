<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
/**
 * Real HTTP/byte tests using a synthetic, playable H.264 MP4. All destructive
 * operations use a random temporary tree and isolated test databases/accounts.
 * The committed fixture needs no ffmpeg on CI or the destination webhotel.
 */
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);$temp=sys_get_temp_dir().'/lexgalleri-video-test-'.bin2hex(random_bytes(6));
$privateRoot=$temp.'/private';$uploadsRoot=$temp.'/lychee/uploads';$copyRoot=$temp.'/lychee-copy/uploads';
mkdir($privateRoot.'/config',0700,true);mkdir($uploadsRoot.'/original/01/09',0700,true);mkdir($copyRoot.'/original/01/09',0700,true);
$targetName='lexgalleri_test_'.bin2hex(random_bytes(6));$sourceName='lexgalleri_test_'.bin2hex(random_bytes(6));
$sourceUser='lychee_ro_'.bin2hex(random_bytes(5));$sourcePassword=bin2hex(random_bytes(24));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);
$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$failures=0;$checks=0;$origin='http://127.0.0.1:'.(int)(getenv('TEST_HTTP_PORT')?:8768);

function lv_assert(bool $ok,string $label):void{
    global $checks,$failures;$checks++;
    if($ok)echo 'PASS: '.$label."\n";else{$failures++;fwrite(STDERR,'FAIL: '.$label."\n");}
}
function lv_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>30]);return $c;}
function lv_request(CurlHandle $client,string $method,string $path,?array $body=null,array $extra=[]):array{
    global $origin;$headers=[];
    curl_setopt_array($client,[CURLOPT_URL=>$origin.'/LexGalleri/api'.$path,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_NOBODY=>$method==='HEAD',CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>array_merge(['Origin: '.$origin,'Content-Type: application/json'],$extra),CURLOPT_HEADERFUNCTION=>static function($c,string $line)use(&$headers):int{if(str_contains($line,':')){[$key,$value]=explode(':',$line,2);$headers[strtolower(trim($key))]=trim($value);}return strlen($line);}]);
    $raw=curl_exec($client);if($raw===false)throw new RuntimeException(curl_error($client));
    return[(int)curl_getinfo($client,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw,$headers,$raw];
}
function lv_ok(array $response,string $label):array{
    lv_assert($response[0]===200,$label);
    if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));
    return $response[1];
}
function lv_step(CurlHandle $client,array $status):array{
    $response=lv_request($client,'POST','/admin/lychee-import/step',['job_id'=>$status['job']['id']]);
    if($response[0]!==200||!is_array($response[1]))throw new RuntimeException('Video step failed: '.json_encode($response));return $response[1];
}
function lv_steps(CurlHandle $client,array $status,string $until):array{
    for($i=0;$i<100;$i++){
        $state=$status['job']['state']??'';if($state===$until)return $status;
        if(!in_array($state,['scanning','running'],true))throw new RuntimeException('Unexpected video job state: '.$state);
        $status=lv_step($client,$status);
    }
    throw new RuntimeException('Video test exceeded bounded request count');
}
function lv_remove(string $path):void{foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$p=$path.'/'.$name;if(is_link($p)||!is_dir($p))unlink($p);else lv_remove($p);}rmdir($path);}
function lv_id(int $n):string{return str_pad('video-photo-'.$n,24,'0');}
function lv_snapshot(PDO $pdo,string $database):string{
    $data=[];foreach(['configs','users','base_albums','albums','photos','photo_album','size_variants'] as $table)$data[$table]=$pdo->query('SELECT * FROM `'.$database.'`.`'.$table.'` ORDER BY 1')->fetchAll();return json_encode($data,JSON_UNESCAPED_UNICODE);
}
function lv_pad_mp4(string $bytes,string $path,int $size):void{
    $offset=0;$lastType='';$lastOffset=0;
    while($offset<strlen($bytes)){
        $box=unpack('Nlength/a4type',substr($bytes,$offset,8));
        if(!$box||$box['length']<8||$offset+$box['length']>strlen($bytes))throw new RuntimeException('Malformed synthetic MP4 fixture');
        $lastType=$box['type'];$lastOffset=$offset;$offset+=$box['length'];
    }
    if($lastType!=='mdat'||$size<strlen($bytes)||$size-$lastOffset>0xffffffff)throw new RuntimeException('Expected a final normal-size mdat box');
    $bytes=substr_replace($bytes,pack('N',$size-$lastOffset),$lastOffset,4);file_put_contents($path,$bytes);
    $f=fopen($path,'r+b');if(!$f||!ftruncate($f,$size))throw new RuntimeException('Cannot extend the synthetic MP4');fclose($f);
}
function lv_expected(string $path,int $start,int $length):string{$f=fopen($path,'rb');fseek($f,$start);$bytes=fread($f,$length);fclose($f);return $bytes;}

try{
    foreach([$targetName,$sourceName] as $database)$pdo->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE `'.$sourceName.'`');
    $pdo->exec(<<<'SQL'
CREATE TABLE configs (`key` VARCHAR(50) PRIMARY KEY,value TEXT);
CREATE TABLE users (id INT UNSIGNED PRIMARY KEY,username VARCHAR(100),email VARCHAR(100),password VARCHAR(255));
CREATE TABLE base_albums (id CHAR(24) PRIMARY KEY,title VARCHAR(100),description TEXT,owner_id INT UNSIGNED,created_at DATETIME(6),updated_at DATETIME(6));
CREATE TABLE albums (id CHAR(24) PRIMARY KEY,parent_id CHAR(24) NULL);
CREATE TABLE photos (id CHAR(24) PRIMARY KEY,title VARCHAR(100),description TEXT,owner_id INT UNSIGNED,type VARCHAR(30),tags TEXT,taken_at DATETIME(6),taken_at_orig_tz VARCHAR(31),initial_taken_at DATETIME,initial_taken_at_orig_tz VARCHAR(31),latitude DECIMAL(10,8),longitude DECIMAL(11,8),location VARCHAR(255),checksum VARCHAR(40),original_checksum VARCHAR(40),is_starred TINYINT,created_at DATETIME(6),updated_at DATETIME(6),old_album_id CHAR(24));
CREATE TABLE photo_album (photo_id CHAR(24),album_id CHAR(24),PRIMARY KEY(photo_id,album_id));
CREATE TABLE size_variants (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,photo_id CHAR(24),type INT UNSIGNED,short_path VARCHAR(255),storage_disk VARCHAR(255),width INT,height INT,filesize BIGINT,ratio FLOAT);
SQL);
    $pdo->exec("INSERT INTO configs VALUES('version','060612')");$pdo->exec("INSERT INTO users VALUES(7,'Synthetic video owner','video-owner@example.test','NEVER_COPY_VIDEO_PASSWORD')");
    $albumA=str_pad('video-root',24,'0');$albumB=str_pad('video-child',24,'0');
    $q=$pdo->prepare('INSERT INTO base_albums VALUES(?,?,?,7,?,?)');
    foreach([[$albumA,'Video familie'],[$albumB,'Video ferie']] as [$id,$title])$q->execute([$id,$title,'Synthetic album','2010-01-01 00:00:00','2020-01-01 00:00:00']);
    $q=$pdo->prepare('INSERT INTO albums VALUES(?,?)');$q->execute([$albumA,null]);$q->execute([$albumB,$albumA]);
    $fixture=base64_decode(file_get_contents($root.'/tests/fixtures/tiny.mp4.b64'),true);if($fixture===false)throw new RuntimeException('Cannot decode synthetic MP4 fixture');
    $paths=[1=>'original/01/09/large.mp4',2=>'original/01/09/previously-unsupported.mp4',3=>'original/01/09/fake.mp4',4=>'original/01/09/oversized.mp4'];
    // Exercise the distinct video limit, not the old 25 MiB image limit. The
    // padding extends mdat without changing the playable frame's chunk offsets.
    lv_pad_mp4($fixture,$uploadsRoot.'/'.$paths[1],25*1024*1024+65536);
    file_put_contents($uploadsRoot.'/'.$paths[2],$fixture);file_put_contents($uploadsRoot.'/'.$paths[3],'This is plain text, not an MP4 container.');
    lv_pad_mp4($fixture,$uploadsRoot.'/'.$paths[4],2*1024*1024*1024+1);
    $sourceStats=[];$sourceHashes=[];
    foreach([1,2,3] as $n){$sourceStats[$n]=stat($uploadsRoot.'/'.$paths[$n]);$sourceHashes[$n]=hash_file('sha256',$uploadsRoot.'/'.$paths[$n]);copy($uploadsRoot.'/'.$paths[$n],$copyRoot.'/'.$paths[$n]);}
    lv_pad_mp4($fixture,$copyRoot.'/'.$paths[4],2*1024*1024*1024+1);
    $photoInsert=$pdo->prepare('INSERT INTO photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $variantInsert=$pdo->prepare('INSERT INTO size_variants(photo_id,type,short_path,storage_disk,width,height,filesize,ratio) VALUES(?,0,?,\'images\',32,32,?,1)');$membership=$pdo->prepare('INSERT INTO photo_album VALUES(?,?)');
    foreach($paths as $n=>$path){
        $sha1=$n===4?str_repeat('0',40):sha1_file($uploadsRoot.'/'.$path);
        $photoInsert->execute([lv_id($n),'Video '.$n,'Source video caption',7,'video/mp4','family,film','2001-02-03 04:05:06.000000','Europe/Copenhagen','1999-01-01 00:00:00','UTC','55.70000000','12.60000000','København',$sha1,$sha1,0,'2010-05-06 07:08:09.000000','2020-06-07 08:09:10.000000',$albumA]);
        $variantInsert->execute([lv_id($n),$path,filesize($uploadsRoot.'/'.$path)]);$membership->execute([lv_id($n),$albumB]);if($n===1)$membership->execute([lv_id($n),$albumA]);
    }
    $quotedUser=$pdo->quote($sourceUser);$pdo->exec('CREATE USER '.$quotedUser."@'%' IDENTIFIED BY ".$pdo->quote($sourcePassword));$pdo->exec('GRANT SELECT ON `'.$sourceName.'`.* TO '.$quotedUser."@'%'");
    $sourceSnapshot=lv_snapshot($pdo,$sourceName);
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$targetName,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('video-test-setup-',4)];
    $importConfig=['enabled'=>true,'expected_version'=>'6.6.12','db_host'=>$host,'db_port'=>$port,'db_name'=>$sourceName,'db_user'=>$sourceUser,'db_password'=>$sourcePassword,'table_prefix'=>'','uploads_root'=>$uploadsRoot];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($importConfig,true).';');
    foreach(['app.php','security.php','schema.sql','lychee-import.php'] as $file)copy($root.'/private/'.$file,$privateRoot.'/'.$file);
    $env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    $server=proc_open([PHP_BINARY,'-d','memory_limit=128M','-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S',parse_url($origin,PHP_URL_HOST).':'.parse_url($origin,PHP_URL_PORT),$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Cannot start isolated video test server');
    $owner=lv_client();$guest=lv_client();$anonymous=lv_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(lv_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Video test server did not become ready');
    lv_ok(security_test_complete_admin($owner,lv_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Video admin','email'=>'video-admin@example.test','password'=>'long-video-password']),'lv_request'),'Create video test admin');
    $ownerId=lv_request($owner,'GET','/me')[1]['id'];$pdo->exec('USE `'.$targetName.'`');
    $pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));$pdo->exec(file_get_contents($root.'/private/migrations/003_lychee_move.sql'));
    $guestId=bin2hex(random_bytes(16));$q=$pdo->prepare('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,0)');$q->execute([$guestId,'video-guest@example.test','Video guest',password_hash('long-guest-password',PASSWORD_DEFAULT)]);
    lv_ok(lv_request($guest,'POST','/login',['email'=>'video-guest@example.test','password'=>'long-guest-password']),'Video guest login');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/scan',[]),'Build MP4 move preview');$status=lv_steps($owner,$status,'preview');$jobId=$status['job']['id'];
    lv_assert((int)$status['job']['totals']['unsupported']===0,'MP4 originals are recognized during preview');
    lv_assert((int)$pdo->query('SELECT COUNT(*) FROM photos')->fetchColumn()===0,'Video preview creates no photos');
    foreach([1,2,3] as $n)lv_assert(is_file($uploadsRoot.'/'.$paths[$n])&&hash_file('sha256',$uploadsRoot.'/'.$paths[$n])===$sourceHashes[$n],'Video preview preserves source bytes '.$n);
    // Reproduce a persisted pre-MP4 inventory: a completed move job can have an
    // unsupported video entry while its image receipts already exist.
    $q=$pdo->prepare("UPDATE lychee_import_items SET status='unsupported',error='Previous release did not support MP4' WHERE job_id=? AND source_photo_id=?");$q->execute([$jobId,lv_id(2)]);
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move']),'Start MP4 move');
    $status=lv_step($owner,$status);$progress=$status['job']['media_progress']??null;
    lv_assert(is_array($progress)&&$progress['done_bytes']>0&&$progress['done_bytes']<=8*1024*1024&&$progress['total_bytes']===$sourceStats[1]['size'],'Large MP4 verifies in a bounded first request');
    lv_assert(is_file($uploadsRoot.'/'.$paths[1])&&(int)$pdo->query('SELECT COUNT(*) FROM photos')->fetchColumn()===0,'Hashing leaves source and target metadata untouched until complete');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/pause',['job_id'=>$jobId]),'Pause during MP4 verification');
    $refresh=lv_ok(lv_request($owner,'GET','/admin/lychee-import'),'Read paused video progress');
    lv_assert($refresh['job']['state']==='paused'&&($refresh['job']['media_progress']??null)===$progress&&is_file($uploadsRoot.'/'.$paths[1]),'Paused video progress survives a new request without relocating its source');
    lv_assert(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'copy'])[0]===409,'Paused video move cannot switch to copying');
    lv_assert(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'transfer_mode'=>'move'])[0]===409,'Resuming a video move still requires confirmation');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move']),'Resume video move');$status=lv_steps($owner,$status,'completed');
    lv_assert((int)$status['job']['totals']['imported']===2&&(int)$status['job']['totals']['unsupported']===1,'One video preserves its two album memberships');
    lv_assert((int)$status['job']['totals']['error']===2,'Fake MP4 and a video exceeding 2 GiB are rejected');
    lv_assert(!file_exists($uploadsRoot.'/'.$paths[1])&&is_file($uploadsRoot.'/'.$paths[2])&&is_file($uploadsRoot.'/'.$paths[3])&&is_file($uploadsRoot.'/'.$paths[4]),'Only verified supported videos leave Lychee');
    lv_assert(hash_file('sha256',$uploadsRoot.'/'.$paths[3])===$sourceHashes[3],'Mislabeled MP4 source stays byte-for-byte intact');
    $photos=$pdo->query("SELECT * FROM photos WHERE title='Video 1' ORDER BY id")->fetchAll();
    if(count($photos)!==2)throw new RuntimeException('Expected both moved MP4 memberships');
    $journals=$pdo->query('SELECT * FROM lychee_import_move_files')->fetchAll();
    lv_assert(count($journals)===1&&$journals[0]['state']==='ready','Two video memberships use one durable move receipt');
    $anchorId=$journals[0]['id'];$anchorPath=$privateRoot.'/originals/'.$anchorId.'.bin';$anchorStat=stat($anchorPath);
    lv_assert($anchorStat['ino']===$sourceStats[1]['ino']&&$anchorStat['dev']===$sourceStats[1]['dev']&&hash_file('sha256',$anchorPath)===$sourceHashes[1],'Moving preserves original MP4 inode and exact bytes above the image size limit');
    foreach($photos as $photo){
        $original=$privateRoot.'/originals/'.$photo['id'].'.bin';$stat=stat($original);
        lv_assert($photo['mime']==='video/mp4'&&$photo['uploader']===$ownerId&&$stat['ino']===$anchorStat['ino']&&$stat['dev']===$anchorStat['dev'],'Video membership shares the moved original with correct MIME and uploader');
        lv_assert(str_starts_with($photo['taken'],'2001-02-03T05:05:06')&&abs((float)$photo['lat']-55.7)<0.000001&&$photo['place']==='København','Video capture timezone, GPS and location are preserved');
        foreach(['thumb','view'] as $size){$poster=lv_request($owner,'GET','/photos/'.$photo['id'].'/image?size='.$size);$info=@getimagesizefromstring($poster[3]);lv_assert($poster[0]===200&&($info['mime']??'')==='image/jpeg','Video '.$size.' is a safe generated JPEG poster');}
    }
    $videoPhoto=$photos[0];$otherPhoto=$photos[1];$videoPath='/photos/'.$videoPhoto['id'].'/video';$length=$sourceStats[1]['size'];
    $q=$pdo->prepare('INSERT INTO grants VALUES(?,?,0,0,0)');$q->execute([$videoPhoto['gallery_id'],$guestId]);
    lv_assert(lv_request($anonymous,'GET',$videoPath)[0]===401,'Anonymous cannot stream private video');
    lv_assert(lv_request($guest,'GET','/photos/'.$videoPhoto['id'].'/image?size=thumb')[0]===200,'View-only guest may see the neutral poster');
    lv_assert(lv_request($guest,'GET',$videoPath,null,['Range: bytes=0-15'])[0]===403,'View-only guest cannot read video bytes');
    $q=$pdo->prepare('UPDATE grants SET download=?,gps=? WHERE gallery_id=? AND user_id=?');
    $q->execute([1,0,$videoPhoto['gallery_id'],$guestId]);lv_assert(lv_request($guest,'GET',$videoPath)[0]===403,'Download permission alone cannot disclose video metadata');
    $q->execute([0,1,$videoPhoto['gallery_id'],$guestId]);lv_assert(lv_request($guest,'GET',$videoPath)[0]===403,'GPS permission alone cannot stream video');
    lv_ok(lv_request($owner,'PUT','/admin/grants',['user_id'=>$guestId,'gallery_id'=>$videoPhoto['gallery_id'],'view'=>true,'upload'=>false,'download'=>true,'gps'=>true]),'Admin saves video permissions using the app API');
    $permissions=lv_ok(lv_request($guest,'GET','/galleries/'.$videoPhoto['gallery_id'].'/photos'),'Guest reloads gallery after admin save')['permissions'];
    lv_assert(($permissions['video']??null)===true&&($permissions['download']??null)===true&&($permissions['gps']??null)===true,'Guest receives explicit boolean playback permission after admin save');
    $head=lv_request($guest,'HEAD',$videoPath,null,['Range: bytes=0-15']);
    lv_assert($head[0]===200&&$head[3]===''&&(int)($head[2]['content-length']??0)===$length&&!isset($head[2]['content-range']),'Authorized HEAD ignores Range and returns full headers without a body');
    lv_assert(($head[2]['content-type']??'')==='video/mp4'&&($head[2]['accept-ranges']??'')==='bytes'&&str_starts_with($head[2]['content-disposition']??'','inline')&&str_contains($head[2]['cache-control']??'','no-store'),'Video response identifies MP4, byte ranges, inline playback and private caching');
    $etag=$head[2]['etag']??'';lv_assert($etag!==''&&!str_starts_with($etag,'W/'),'Video provides a strong validator for resumed playback');
    foreach([['bytes=0-15',0,15],['bytes='.($length-31).'-',$length-31,$length-1],['bytes=-23',$length-23,$length-1],['bytes=10-999999999',10,$length-1]] as [$range,$start,$end]){
        $r=lv_request($guest,'GET',$videoPath,null,['Range: '.$range]);
        lv_assert($r[0]===206&&($r[2]['content-range']??'')==='bytes '.$start.'-'.$end.'/'.$length&&(int)($r[2]['content-length']??0)===$end-$start+1&&$r[3]===lv_expected($anchorPath,$start,$end-$start+1),'Single range returns exact bytes: '.$range);
    }
    foreach(['bytes='.$length.'-','bytes=12-3','bytes=-0','bytes=abc','bytes=0-1,4-5','items=0-1'] as $range){$r=lv_request($guest,'GET',$videoPath,null,['Range: '.$range]);lv_assert($r[0]===416&&($r[2]['content-range']??'')==='bytes */'.$length&&$r[3]==='','Invalid or unsatisfiable range has an empty 416: '.$range);}
    $r=lv_request($guest,'GET',$videoPath,null,['Range: bytes=0-7','If-Range: '.$etag]);lv_assert($r[0]===206&&$r[3]===lv_expected($anchorPath,0,8),'Matching If-Range honors the requested bytes');
    $r=lv_request($guest,'GET',$videoPath,null,['Range: bytes=0-7','If-Range: "stale-validator"']);lv_assert($r[0]===200&&strlen($r[3])===$length&&hash('sha256',$r[3])===$sourceHashes[1]&&!isset($r[2]['content-range']),'Stale If-Range returns the complete exact original');unset($r);
    lv_assert(lv_request($guest,'GET','/photos/'.$otherPhoto['id'].'/video',null,['Range: bytes=0-7'])[0]===403,'Shared original hardlink never grants access to another gallery');
    lv_assert(lv_request($owner,'GET','/photos/'.$anchorId.'/video',null,['Range: bytes=0-7'])[0]===404,'Move receipt anchor is not a directly addressable video');
    $r=lv_request($guest,'GET','/photos/'.$videoPhoto['id'].'/image?size=original');lv_assert($r[0]===200&&str_starts_with($r[2]['content-disposition']??'','attachment')&&hash('sha256',$r[3])===$sourceHashes[1],'Authorized original video download remains an exact attachment');unset($r);
    $q=$pdo->prepare('DELETE FROM grants WHERE gallery_id=? AND user_id=?');$q->execute([$videoPhoto['gallery_id'],$guestId]);
    lv_assert(lv_request($guest,'GET',$videoPath,null,['Range: bytes=16-31'])[0]===403,'Each seek rechecks access after permission revocation');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/scan',[]),'Rescan old unsupported MP4 in a completed move job');$status=lv_steps($owner,$status,'preview');
    lv_assert((int)$status['job']['totals']['imported']===2&&(int)$status['job']['totals']['pending']>=1&&(int)$status['job']['totals']['missing']===0,'Rescan retains moved receipts and retries previously unsupported video');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Retain move choice when starting newly supported video');$status=lv_steps($owner,$status,'completed');
    $late=$pdo->query("SELECT * FROM photos WHERE title='Video 2'")->fetch();
    lv_assert($status['job']['transfer_mode']==='move'&&(int)$status['job']['totals']['imported']===3&&!file_exists($uploadsRoot.'/'.$paths[2])&&$late!==false,'Previously unsupported MP4 joins the existing move job');
    lv_assert($late!==false&&stat($privateRoot.'/originals/'.$late['id'].'.bin')['ino']===$sourceStats[2]['ino'],'Late supported video also moves without a second original copy');
    lv_assert(lv_snapshot($pdo,$sourceName)===$sourceSnapshot,'Video migration never changes the SELECT-only Lychee database');

    // A distinct uploads root gives a distinct, copy-mode job. Simulate a PHP
    // interruption after writing bytes but before persisting its chunk offset.
    $copyConfig=$importConfig;$copyConfig['uploads_root']=$copyRoot;file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($copyConfig,true).';');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/scan',[]),'Build separate video copy preview');$status=lv_steps($owner,$status,'preview');$copyJobId=$status['job']['id'];
    lv_assert($copyJobId!==$jobId,'Copy fixture has an independent import identity');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$copyJobId,'confirm'=>true,'transfer_mode'=>'copy']),'Start chunked video copy');
    $copyProgress=null;$stagePath=null;$previous=null;
    for($i=0;$i<20;$i++){
        $status=lv_step($owner,$status);$current=$status['job']['media_progress']??null;
        if(is_array($current)&&is_array($previous)&&$current['label']===$previous['label'])lv_assert($current['done_bytes']-$previous['done_bytes']<=8*1024*1024,'A video work request processes at most 8 MiB');
        $previous=$current;
        if(is_array($current)&&str_contains(strtolower($current['label']),'kopier')&&$current['done_bytes']>0&&$current['done_bytes']<$current['total_bytes']){
            $q=$pdo->prepare('SELECT planned_photo_id FROM lychee_import_items WHERE job_id=? AND source_photo_id=? ORDER BY id LIMIT 1');$q->execute([$copyJobId,lv_id(1)]);$planned=$q->fetchColumn();
            $stagePath=$privateRoot.'/originals/'.$planned.'.bin';$copyProgress=$current;break;
        }
    }
    lv_assert(is_array($copyProgress)&&$copyProgress['done_bytes']<=8*1024*1024&&is_string($stagePath)&&is_file($stagePath),'Copy yields after at most 8 MiB with a durable private staging file');
    if(!is_string($stagePath)||!is_file($stagePath))throw new RuntimeException('Expected staged chunked copy');
    lv_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE id='".basename($stagePath,'.bin')."'")->fetchColumn()===0,'Incomplete copy stage is not an addressable photo');
    lv_assert(lv_request($owner,'GET','/photos/'.basename($stagePath,'.bin').'/video')[0]===404,'Unregistered staged video bytes are inaccessible through playback');
    file_put_contents($stagePath,'Synthetic uncommitted write after the last saved offset',FILE_APPEND);
    lv_ok(lv_request($owner,'POST','/admin/lychee-import/pause',['job_id'=>$copyJobId]),'Pause an interrupted staged video copy');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$copyJobId,'confirm'=>true,'transfer_mode'=>'copy']),'Resume staged video copy');$status=lv_steps($owner,$status,'completed');
    lv_assert((int)$status['job']['totals']['imported']===3&&(int)$status['job']['totals']['error']===2,'Interrupted copy finishes both memberships and rejects unsafe videos');
    $q=$pdo->prepare("SELECT i.target_photo_id,p.digest FROM lychee_import_items i JOIN photos p ON p.id=i.target_photo_id WHERE i.job_id=? AND i.source_photo_id=? AND i.status='imported'");$q->execute([$copyJobId,lv_id(1)]);$copied=$q->fetchAll();
    lv_assert(count($copied)===2&&!array_filter($copied,fn($p)=>hash_file('sha256',$privateRoot.'/originals/'.$p['target_photo_id'].'.bin')!==$sourceHashes[1]||$p['digest']!==$sourceHashes[1]),'Copy recovery discards uncommitted excess and publishes exact original bytes');
    foreach([1,2,3] as $n)lv_assert(is_file($copyRoot.'/'.$paths[$n])&&hash_file('sha256',$copyRoot.'/'.$paths[$n])===$sourceHashes[$n],'Copy mode leaves source bytes intact '.$n);
    lv_assert(lv_snapshot($pdo,$sourceName)===$sourceSnapshot,'Copying videos also leaves every source database row unchanged');

    // A killed request may leave only the renamed original and a durable move
    // intent. Recovery itself needs several HTTP requests for a large video.
    $recoveryRoot=$temp.'/lychee-recovery/uploads';mkdir($recoveryRoot.'/original/01/09',0700,true);copy($anchorPath,$recoveryRoot.'/'.$paths[1]);
    $recoveryConfig=$importConfig;$recoveryConfig['uploads_root']=$recoveryRoot;file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($recoveryConfig,true).';');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/scan',[]),'Inventory isolated interrupted video move');$status=lv_steps($owner,$status,'preview');$recoveryJobId=$status['job']['id'];
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$recoveryJobId,'confirm'=>true,'transfer_mode'=>'move']),'Start isolated recovery move');
    $q=$pdo->prepare('SELECT * FROM lychee_import_items WHERE job_id=? AND source_photo_id=? ORDER BY id LIMIT 1');$q->execute([$recoveryJobId,lv_id(1)]);$recoveryItem=$q->fetch();
    $recoveryPlanned=bin2hex(random_bytes(16));$recoveryAnchor=bin2hex(random_bytes(16));$recoverySource=$recoveryRoot.'/'.$paths[1];$recoveryStat=stat($recoverySource);
    $q=$pdo->prepare('UPDATE lychee_import_items SET planned_photo_id=? WHERE id=?');$q->execute([$recoveryPlanned,$recoveryItem['id']]);
    $q=$pdo->prepare('INSERT INTO lychee_import_move_files(id,job_id,source_path_hash,source_short_path,digest,sha1,size,source_dev,source_inode,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?,\'planned\',?,?)');
    $q->execute([$recoveryAnchor,$recoveryJobId,hash('sha256',$paths[1]),$paths[1],$sourceHashes[1],sha1_file($recoverySource),$recoveryStat['size'],$recoveryStat['dev'],$recoveryStat['ino'],gmdate('c'),gmdate('c')]);
    $recoveryAnchorPath=$privateRoot.'/originals/'.$recoveryAnchor.'.bin';$recoveryPlannedPath=$privateRoot.'/originals/'.$recoveryPlanned.'.bin';rename($recoverySource,$recoveryAnchorPath);link($recoveryAnchorPath,$recoveryPlannedPath);
    $status=lv_step($owner,$status);$recoveryProgress=$status['job']['media_progress']??null;
    lv_assert($status['job']['state']==='running'&&is_array($recoveryProgress)&&$recoveryProgress['done_bytes']>0&&$recoveryProgress['done_bytes']<=8*1024*1024,'Sole video original recovery yields bounded work without pausing the job');
    clearstatcache();$recoveredStat=stat($recoveryAnchorPath);
    lv_assert(!file_exists($recoverySource)&&is_file($recoveryPlannedPath)&&$recoveredStat['ino']===$recoveryStat['ino']&&hash_file('sha256',$recoveryAnchorPath)===$sourceHashes[1],'Yielding recovery preserves the sole original and its already staged hardlink');
    lv_assert(lv_request($owner,'GET','/photos/'.$recoveryPlanned.'/video')[0]===404,'Interrupted moved video stays inaccessible before its photo receipt commits');
    $status=lv_steps($owner,$status,'completed');
    $q=$pdo->prepare('SELECT i.target_photo_id,p.digest FROM lychee_import_items i JOIN photos p ON p.id=i.target_photo_id WHERE i.job_id=? AND i.source_photo_id=?');$q->execute([$recoveryJobId,lv_id(1)]);$recovered=$q->fetchAll();
    lv_assert((int)$status['job']['totals']['imported']===2&&count($recovered)===2&&!array_filter($recovered,fn($p)=>$p['digest']!==$sourceHashes[1]||stat($privateRoot.'/originals/'.$p['target_photo_id'].'.bin')['ino']!==$recoveryStat['ino']),'Large sole-original recovery completes both memberships without copying its payload');
    lv_assert(in_array($recoveryPlanned,array_column($recovered,'target_photo_id'),true),'Recovery reuses its pre-interruption planned photo ID');

    // Change a source between hash portions. Even another album membership
    // must not relocate bytes that no longer match either recorded checksum.
    $changedRoot=$temp.'/lychee-changed/uploads';mkdir($changedRoot.'/original/01/09',0700,true);$changedSource=$changedRoot.'/'.$paths[1];copy($anchorPath,$changedSource);
    $changedConfig=$importConfig;$changedConfig['uploads_root']=$changedRoot;file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($changedConfig,true).';');
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/scan',[]),'Inventory source-change regression');$status=lv_steps($owner,$status,'preview');$changedJobId=$status['job']['id'];
    $status=lv_ok(lv_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$changedJobId,'confirm'=>true,'transfer_mode'=>'move']),'Start source-change regression');$status=lv_step($owner,$status);
    lv_assert(($status['job']['media_progress']['done_bytes']??0)>0&&is_file($changedSource),'Source-change regression pauses between real hash portions');
    $oldMtime=filemtime($changedSource);$f=fopen($changedSource,'r+b');fseek($f,-1,SEEK_END);fwrite($f,"\1");fclose($f);touch($changedSource,$oldMtime+2);clearstatcache();$changedHash=hash_file('sha256',$changedSource);
    $status=lv_step($owner,$status);$q=$pdo->prepare('SELECT status FROM lychee_import_items WHERE job_id=? AND source_photo_id=? ORDER BY id LIMIT 1');$q->execute([$changedJobId,lv_id(1)]);
    lv_assert($q->fetchColumn()==='error'&&is_file($changedSource),'Changing source identity between chunks rejects that item before rename');
    $status=lv_steps($owner,$status,'completed');$q=$pdo->prepare('SELECT COUNT(*) FROM lychee_import_move_files WHERE job_id=?');$q->execute([$changedJobId]);$changedReceipts=(int)$q->fetchColumn();
    lv_assert((int)$status['job']['totals']['imported']===0&&(int)$status['job']['totals']['error']===2&&$changedReceipts===0&&is_file($changedSource)&&hash_file('sha256',$changedSource)===$changedHash,'Changed video bytes stay at source across all memberships without any move receipt');
    lv_assert(lv_snapshot($pdo,$sourceName)===$sourceSnapshot,'Interrupted and changed-source regressions leave the Lychee database unchanged');
    echo 'Video integration: '.$checks.' checks, '.$failures." failures\n";
}catch(Throwable $e){$failures++;fwrite(STDERR,$e->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{
    if(is_resource($server)){proc_terminate($server);proc_close($server);}
    $pdo->exec('DROP DATABASE IF EXISTS `'.$targetName.'`');$pdo->exec('DROP DATABASE IF EXISTS `'.$sourceName.'`');$pdo->exec('DROP USER IF EXISTS '.$pdo->quote($sourceUser)."@'%'");lv_remove($temp);
}
exit($failures?1:0);
