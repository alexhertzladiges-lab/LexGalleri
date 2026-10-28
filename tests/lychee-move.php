<?php
declare(strict_types=1);
require_once __DIR__.'/security-test-helper.php';
/**
 * Destructive operations are confined to synthetic fixtures in a random temp
 * directory and two random test databases. Never loads production config.
 */
if(getenv('LEXGALLERI_TEST')!=='1')exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root=dirname(__DIR__);
$temp=sys_get_temp_dir().'/lexgalleri-move-test-'.bin2hex(random_bytes(6));
$privateRoot=$temp.'/private';$uploadsRoot=$temp.'/lychee/uploads';
mkdir($privateRoot.'/config',0700,true);
foreach(['01/02','02/03','03/04','04/05','06/07','08/09','09/0a'] as $dir)mkdir($uploadsRoot.'/original/'.$dir,0700,true);
$targetName='lexgalleri_test_'.bin2hex(random_bytes(6));$sourceName='lexgalleri_test_'.bin2hex(random_bytes(6));
$sourceUser='lychee_ro_'.bin2hex(random_bytes(5));$sourcePassword=bin2hex(random_bytes(24));
$host=getenv('TEST_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('TEST_DB_PORT')?:3306);
$dbuser=getenv('TEST_DB_USER')?:'root';$password=getenv('TEST_DB_PASSWORD')?:'';
$pdo=new PDO("mysql:host=$host;port=$port;charset=utf8mb4",$dbuser,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$server=null;$legacyTargetName=null;$failures=0;$checks=0;

function lm_assert(bool $ok,string $label):void{
    global $checks,$failures;$checks++;
    if($ok)echo 'PASS: '.$label."\n";else{$failures++;fwrite(STDERR,'FAIL: '.$label."\n");}
}
function lm_client():CurlHandle{$c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>30]);return $c;}
function lm_request(CurlHandle $c,string $method,string $path,?array $body=null):array{
    global $origin;
    curl_setopt_array($c,[CURLOPT_URL=>$origin.'/LexGalleri/api'.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body),CURLOPT_HTTPHEADER=>['Origin: '.$origin,'Content-Type: application/json']]);
    $raw=curl_exec($c);if($raw===false)throw new RuntimeException(curl_error($c));
    return[(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)??$raw];
}
function lm_ok(array $response,string $label):array{
    lm_assert($response[0]===200,$label);
    if($response[0]!==200||!is_array($response[1]))throw new RuntimeException($label.': '.json_encode($response));
    return $response[1];
}
function lm_steps(CurlHandle $c,array $status,string $until):array{
    for($i=0;$i<100;$i++){
        $state=$status['job']['state']??'';if($state===$until)return $status;
        if(!in_array($state,['scanning','running'],true))throw new RuntimeException('Unexpected move state: '.$state);
        $r=lm_request($c,'POST','/admin/lychee-import/step',['job_id'=>$status['job']['id']]);
        if($r[0]!==200)throw new RuntimeException('Move step failed: '.json_encode($r));$status=$r[1];
    }
    throw new RuntimeException('Move test exceeded bounded steps');
}
function lm_remove(string $path):void{
    foreach(scandir($path) as $name){if($name==='.'||$name==='..')continue;$p=$path.'/'.$name;if(is_link($p)||!is_dir($p))unlink($p);else lm_remove($p);}rmdir($path);
}
function lm_snapshot(PDO $pdo,string $database):string{
    $data=[];foreach(['configs','users','base_albums','albums','photos','photo_album','size_variants'] as $table)$data[$table]=$pdo->query('SELECT * FROM `'.$database.'`.`'.$table.'` ORDER BY 1')->fetchAll();
    return json_encode($data,JSON_UNESCAPED_UNICODE);
}
function lm_count(PDO $pdo,string $table):int{return(int)$pdo->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn();}
function lm_id(int $n):string{return str_pad('move-photo-'.str_pad((string)$n,2,'0',STR_PAD_LEFT),24,'0');}
function lm_jpeg(string $path,int $r,int $g,int $b):void{$im=imagecreatetruecolor(120,80);imagefill($im,0,0,imagecolorallocate($im,$r,$g,$b));imagejpeg($im,$path,90);}
function lm_files(string $directory):array{return array_values(array_diff(scandir($directory),['.','..']));}
function lm_inject_commit_fault(string $module):string{
    $start=strpos($module,'function lychee_move_one(');if($start===false)throw new RuntimeException('Move engine must be bundled before running its integration test');
    $end=strpos($module,"\nfunction ",$start+1);if($end===false)$end=strlen($module);
    $body=substr($module,$start,$end-$start);$commit=strrpos($body,'$db->commit();');
    if($commit===false)throw new RuntimeException('Cannot locate the real photo COMMIT for test-only acknowledgement fault');
    $replacement=<<<'PHP'
$db->commit();
global $private;
if(is_file($private.'/test-move-lost-ack')){
    unlink($private.'/test-move-lost-ack');
    throw new PDOException('Synthetic lost COMMIT acknowledgement after successful move commit');
}
PHP;
    $body=substr_replace($body,$replacement,$commit,strlen('$db->commit();'));
    return substr_replace($module,$body,$start,$end-$start);
}

try{
    foreach([$targetName,$sourceName] as $name)$pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
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
    $pdo->exec("INSERT INTO configs VALUES('version','060612')");
    $pdo->exec("INSERT INTO users VALUES(7,'Lychee owner','owner@example.test','NEVER_COPY_MOVE_PASSWORD')");
    $rootAlbum=str_pad('move-root',24,'0');$childAlbum=str_pad('move-child',24,'0');$emptyAlbum=str_pad('move-empty',24,'0');
    $q=$pdo->prepare('INSERT INTO base_albums VALUES(?,?,?,7,?,?)');
    foreach([[$rootAlbum,'Familie','Root description'],[$childAlbum,'Sommer','Child description'],[$emptyAlbum,'Tomt','Empty description']] as [$id,$title,$description])$q->execute([$id,$title,$description,'2010-01-01 00:00:00','2020-01-01 00:00:00']);
    $q=$pdo->prepare('INSERT INTO albums VALUES(?,?)');$q->execute([$rootAlbum,null]);$q->execute([$childAlbum,$rootAlbum]);$q->execute([$emptyAlbum,null]);
    $paths=[1=>'original/01/02/first.jpg',2=>'original/02/03/duplicate.jpg',3=>'original/03/04/unsorted.jpg',4=>'original/04/05/movie.webm',5=>'original/missing.jpg',6=>'original/06/07/bad-checksum.jpg',7=>'../outside.jpg',8=>'original/08/09/link.jpg'];
    lm_jpeg($uploadsRoot.'/'.$paths[1],20,100,70);copy($uploadsRoot.'/'.$paths[1],$uploadsRoot.'/'.$paths[2]);
    lm_jpeg($uploadsRoot.'/'.$paths[3],100,70,20);lm_jpeg($uploadsRoot.'/'.$paths[6],190,170,10);
    lm_jpeg($temp.'/outside.jpg',200,10,10);symlink($temp.'/outside.jpg',$uploadsRoot.'/'.$paths[8]);
    file_put_contents($uploadsRoot.'/'.$paths[4],'Synthetic unsupported video stays in Lychee');
    $sourceHashes=[];$sourceStats=[];
    foreach([1,2,3,4,6] as $n){$sourceHashes[$n]=hash_file('sha256',$uploadsRoot.'/'.$paths[$n]);$sourceStats[$n]=stat($uploadsRoot.'/'.$paths[$n]);}
    $outsideHash=hash_file('sha256',$temp.'/outside.jpg');
    $photoInsert=$pdo->prepare('INSERT INTO `'.$sourceName.'`.photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $variantInsert=$pdo->prepare('INSERT INTO `'.$sourceName.'`.size_variants(photo_id,type,short_path,storage_disk,width,height,filesize,ratio) VALUES(?,0,?,\'images\',120,80,?,1.5)');
    $membershipInsert=$pdo->prepare('INSERT INTO `'.$sourceName.'`.photo_album VALUES(?,?)');
    $addPhoto=function(int $n,string $path)use($uploadsRoot,$photoInsert,$variantInsert,$membershipInsert,$rootAlbum,$childAlbum):void{
        $exists=is_file($uploadsRoot.'/'.$path);$sha=$exists?sha1_file($uploadsRoot.'/'.$path):null;$current=$n===3?str_repeat('2',40):$sha;$original=$sha;
        if($n===6){$current=str_repeat('0',40);$original=str_repeat('3',40);}
        $photoInsert->execute([lm_id($n),$n===1?'Manuel flyttet titel':'Move photo '.$n,'Source description '.$n,7,$n===4?'video/webm':'image/jpeg','family,summer','2001-02-03 04:05:06.000000',$n===3?'Europe/Copenhagen':'UTC','1999-01-01 00:00:00','UTC','55.70000000','12.60000000','København',$current,$original,0,'2010-05-06 07:08:09.000000','2020-06-07 08:09:10.000000',$rootAlbum]);
        $variantInsert->execute([lm_id($n),$path,$exists?filesize($uploadsRoot.'/'.$path):123]);
        if($n!==3)$membershipInsert->execute([lm_id($n),$childAlbum]);if($n===1)$membershipInsert->execute([lm_id($n),$rootAlbum]);
    };
    foreach($paths as $n=>$path)$addPhoto($n,$path);
    $quotedUser=$pdo->quote($sourceUser);$pdo->exec('CREATE USER '.$quotedUser."@'%' IDENTIFIED BY ".$pdo->quote($sourcePassword));
    $pdo->exec('GRANT SELECT ON `'.$sourceName.'`.* TO '.$quotedUser."@'%'");
    $sourceSnapshot=lm_snapshot($pdo,$sourceName);
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$targetName,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('move-test-setup-',4)];
    $importConfig=['enabled'=>true,'expected_version'=>'6.6.12','db_host'=>$host,'db_port'=>$port,'db_name'=>$sourceName,'db_user'=>$sourceUser,'db_password'=>$sourcePassword,'table_prefix'=>'','uploads_root'=>$uploadsRoot];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');
    file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($importConfig,true).';');
    copy($root.'/private/app.php',$privateRoot.'/app.php');copy($root.'/private/security.php',$privateRoot.'/security.php');copy($root.'/private/schema.sql',$privateRoot.'/schema.sql');
    file_put_contents($privateRoot.'/lychee-import.php',lm_inject_commit_fault(file_get_contents($root.'/private/lychee-import.php')));
    $httpPort=(int)(getenv('TEST_HTTP_PORT')?:8767);$origin='http://127.0.0.1:'.$httpPort;$env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    // cli-server's opcode cache must not retain a previous fixture config.
    $server=proc_open([PHP_BINARY,'-d','memory_limit=256M','-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S','127.0.0.1:'.$httpPort,$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Could not start isolated move test server');
    $owner=lm_client();$guest=lm_client();$anonymous=lm_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(lm_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Move test server did not become ready');
    lm_ok(security_test_complete_admin($owner,lm_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Move admin','email'=>'move-admin@example.test','password'=>'long-move-password']),'lm_request'),'Create move test admin');
    $ownerId=lm_request($owner,'GET','/me')[1]['id'];$pdo->exec('USE `'.$targetName.'`');
    $guestId=bin2hex(random_bytes(16));$q=$pdo->prepare('INSERT INTO users VALUES(?,?,?,?,0)');$q->execute([$guestId,'move-guest@example.test','Guest',password_hash('long-guest-password',PASSWORD_DEFAULT)]);
    lm_ok(lm_request($guest,'POST','/login',['email'=>'move-guest@example.test','password'=>'long-guest-password']),'Move test guest login');
    $pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/scan',[]),'Inventory before optional move migration');$status=lm_steps($owner,$status,'preview');$jobId=$status['job']['id'];
    lm_assert(($status['move_available']??true)===false&&($status['move_migration_needed']??false)===true,'Move requires its own migration while copy preview remains available');
    lm_assert(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move'])[0]===409,'Move cannot start before owner installs migration003');
    $pdo->exec(file_get_contents($root.'/private/migrations/003_lychee_move.sql'));
    $status=lm_ok(lm_request($owner,'GET','/admin/lychee-import'),'Refresh after move migration');
    lm_assert(($status['move_available']??true)===false&&($status['move_migration_needed']??true)===false,'Installing move tables requires a fresh preview before moving');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/scan',[]),'Build fresh move-capable inventory');$status=lm_steps($owner,$status,'preview');
    lm_assert(($status['move_available']??false)===true&&($status['job']['mode_locked']??true)===false,'Fresh supported preview offers an unlocked move choice');
    lm_assert(($status['job']['transfer_mode']??'')==='copy','Existing copy behavior remains the default before choosing a mode');
    lm_assert(lm_count($pdo,'photos')===0&&lm_count($pdo,'galleries')===0,'Move preview creates no target photos or galleries');
    lm_assert(!lm_files($privateRoot.'/originals'),'Move preview creates no originals or hidden preflight files');
    foreach([1,2,3,4,6] as $n)lm_assert(is_file($uploadsRoot.'/'.$paths[$n])&&hash_file('sha256',$uploadsRoot.'/'.$paths[$n])===$sourceHashes[$n],'Preview leaves source original intact: '.$n);
    lm_assert(lm_snapshot($pdo,$sourceName)===$sourceSnapshot,'Move preview leaves SELECT-only source database unchanged');
    // Read only an existing directory on another filesystem. No fixture files
    // are created there; the real start guard must refuse PHP's copy fallback.
    $sharedMemoryStat=is_dir('/dev/shm')&&is_readable('/dev/shm')?@stat('/dev/shm'):false;
    $privateOriginalStat=stat($privateRoot.'/originals');
    if($sharedMemoryStat&&(string)$sharedMemoryStat['dev']!==(string)$privateOriginalStat['dev']){
        $crossConfig=$importConfig;$crossConfig['uploads_root']='/dev/shm';
        try{
            file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($crossConfig,true).';');
            $cross=lm_ok(lm_request($owner,'POST','/admin/lychee-import/scan',[]),'Inventory metadata with an existing read-only cross-filesystem root');$cross=lm_steps($owner,$cross,'preview');
            lm_assert(($cross['move_available']??true)===false,'Cross-filesystem preview disables moving before any rename');
            lm_assert(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$cross['job']['id'],'confirm'=>true,'transfer_mode'=>'move'])[0]===409,'Move start refuses a cross-filesystem source instead of copying originals');
            lm_assert(!lm_files($privateRoot.'/originals')&&!array_filter([1,2,3,4,6],fn($n)=>!is_file($uploadsRoot.'/'.$paths[$n])||hash_file('sha256',$uploadsRoot.'/'.$paths[$n])!==$sourceHashes[$n]),'Rejected cross-filesystem start leaves fixture sources and target originals unchanged');
        }finally{
            file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($importConfig,true).';');
        }
        $status=lm_ok(lm_request($owner,'GET','/admin/lychee-import'),'Restore the original preview after the cross-filesystem guard');
        lm_assert(($status['job']['id']??'')===$jobId&&($status['move_available']??false)===true,'The same-filesystem move preview remains ready after restoring its config');
        if(($status['job']['id']??'')!==$jobId)throw new RuntimeException('Original move fixture configuration was not restored');
    }else echo "SKIP: Cross-filesystem guard fixture requires a readable /dev/shm on a different device\n";
    lm_assert(lm_request($anonymous,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move'])[0]===401,'Anonymous cannot choose destructive move mode');
    lm_assert(lm_request($guest,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move'])[0]===403,'Guest cannot start moving originals');
    lm_assert(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'transfer_mode'=>'move'])[0]===409,'Move requires explicit preview confirmation');
    lm_assert(lm_request($owner,'POST','/admin/lychee-import/step',['job_id'=>$jobId])[0]===409,'Preview does not move files through an unstarted step');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'move']),'Explicitly select and start moving');
    lm_assert(($status['job']['transfer_mode']??'')==='move'&&($status['job']['mode_locked']??false)===true,'Move mode is persisted and locked before processing files');
    lm_assert(!lm_files($privateRoot.'/originals')&&is_file($uploadsRoot.'/'.$paths[1]),'Move preflight cleans its probes and moves no original itself');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/pause',['job_id'=>$jobId]),'Pause before first move batch');
    lm_assert(lm_count($pdo,'photos')===0&&is_file($uploadsRoot.'/'.$paths[1]),'Pause before a batch leaves all originals at the source');
    lm_assert(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true,'transfer_mode'=>'copy'])[0]===409,'A paused move job cannot be switched to copying');

    // Reproduce a killed request after a durable intent and an actual rename,
    // but before any photo transaction committed. The anchor is the sole file.
    $q=$pdo->prepare('SELECT * FROM lychee_import_items WHERE job_id=? AND source_photo_id=? ORDER BY id LIMIT 1');$q->execute([$jobId,lm_id(1)]);$recoverItem=$q->fetch();
    $plannedId=bin2hex(random_bytes(16));$anchorId=bin2hex(random_bytes(16));$sourcePath=$uploadsRoot.'/'.$paths[1];$stat=$sourceStats[1];
    $q=$pdo->prepare('UPDATE lychee_import_items SET planned_photo_id=? WHERE id=?');$q->execute([$plannedId,$recoverItem['id']]);
    $q=$pdo->prepare('INSERT INTO lychee_import_move_files(id,job_id,source_path_hash,source_short_path,digest,sha1,size,source_dev,source_inode,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?,\'planned\',?,?)');
    $q->execute([$anchorId,$jobId,hash('sha256',$paths[1]),$paths[1],$sourceHashes[1],sha1_file($sourcePath),$stat['size'],$stat['dev'],$stat['ino'],gmdate('c'),gmdate('c')]);
    $anchorPath=$privateRoot.'/originals/'.$anchorId.'.bin';rename($sourcePath,$anchorPath);link($anchorPath,$privateRoot.'/originals/'.$plannedId.'.bin');
    mkdir($privateRoot.'/previews/'.$plannedId.'.jpg');file_put_contents($privateRoot.'/thumbnails/'.$plannedId.'.jpg','Interrupted staged thumbnail');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Resume move mode without changing it');
    $blocked=lm_request($owner,'POST','/admin/lychee-import/step',['job_id'=>$jobId]);
    lm_assert(in_array($blocked[0],[409,503],true),'Failure after source relocation pauses rather than discarding the pending move');
    clearstatcache();
    lm_assert(!is_file($sourcePath)&&is_file($anchorPath)&&hash_file('sha256',$anchorPath)===$sourceHashes[1],'Sole relocated original survives a derivative-write failure');
    $status=lm_ok(lm_request($owner,'GET','/admin/lychee-import'),'Inspect protected move after derivative failure');
    lm_assert(($status['job']['state']??'')==='paused','Protected incomplete move is visibly paused');
    $q=$pdo->prepare('SELECT status FROM lychee_import_items WHERE id=?');$q->execute([$recoverItem['id']]);lm_assert($q->fetchColumn()==='pending','Incomplete relocated receipt remains pending for recovery');
    lm_assert(lm_request($owner,'POST','/admin/lychee-import/scan',[])[0]===409,'A rescan cannot erase pending move recovery history');
    rmdir($privateRoot.'/previews/'.$plannedId.'.jpg');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Resume after repairing synthetic derivative conflict');
    $status=lm_steps($owner,$status,'completed');clearstatcache();
    $totals=$status['job']['totals'];
    lm_assert((int)$totals['imported']===3&&(int)$totals['duplicate']===1,'Move preserves two memberships, one unsorted photo and within-album deduplication');
    lm_assert((int)$totals['unsupported']===1&&(int)$totals['missing']===1&&(int)$totals['error']===3,'Unsupported, missing, checksum, traversal and escaping symlink issues remain distinct');
    lm_assert(lm_count($pdo,'photos')===3&&lm_count($pdo,'galleries')===4,'Move preserves hierarchy, empty albums and unsorted gallery');
    lm_assert(lm_count($pdo,'grants')===0,'Moved galleries start admin-only');
    lm_assert((int)($status['job']['moved_files']??-1)===3,'Physical moved-file count differs from album placements');
    foreach([1,2,3] as $n)lm_assert(!file_exists($uploadsRoot.'/'.$paths[$n]),'Successfully moved original no longer occupies source path: '.$n);
    foreach([4,6] as $n)lm_assert(is_file($uploadsRoot.'/'.$paths[$n])&&hash_file('sha256',$uploadsRoot.'/'.$paths[$n])===$sourceHashes[$n],'Skipped or rejected source original stays intact: '.$n);
    lm_assert(hash_file('sha256',$temp.'/outside.jpg')===$outsideHash&&is_link($uploadsRoot.'/'.$paths[8]),'Move never changes outside-root contents or the rejected source symlink');
    $journals=$pdo->query('SELECT * FROM lychee_import_move_files ORDER BY source_short_path')->fetchAll();
    lm_assert(count($journals)===3&&!array_filter($journals,fn($row)=>$row['state']!=='ready'),'Every relocated original has a durable ready journal');
    foreach([1,2,3] as $n){
        $j=array_values(array_filter($journals,fn($row)=>$row['source_short_path']===$paths[$n]))[0]??null;
        $path=$privateRoot.'/originals/'.($j['id']??str_repeat('0',32)).'.bin';$s=is_file($path)?stat($path):[];
        lm_assert($j!==null&&hash_file('sha256',$path)===$sourceHashes[$n]&&($s['dev']??null)===$sourceStats[$n]['dev']&&($s['ino']??null)===$sourceStats[$n]['ino'],'Move retains bytes and filesystem identity without an original copy: '.$n);
    }
    $originalInodes=[];foreach(glob($privateRoot.'/originals/*.bin')?:[] as $path){$s=stat($path);$originalInodes[$s['dev'].':'.$s['ino']]=$s['size'];}
    lm_assert(count($originalInodes)===3&&array_sum($originalInodes)===array_sum(array_map(fn($n)=>$sourceStats[$n]['size'],[1,2,3])),'Multiple target paths consume only the original payload blocks');
    $photos=$pdo->query('SELECT * FROM photos ORDER BY id')->fetchAll();
    foreach($photos as $photo){
        $path=$privateRoot.'/originals/'.$photo['id'].'.bin';lm_assert(is_file($path)&&hash_file('sha256',$path)===$photo['digest'],'Target photo resolves its unchanged moved original');
        lm_assert($photo['uploader']===$ownerId,'Moving admin remains actual target uploader');
        foreach(['previews','thumbnails'] as $dir)lm_assert(is_file($privateRoot.'/'.$dir.'/'.$photo['id'].'.jpg')&&getimagesize($privateRoot.'/'.$dir.'/'.$photo['id'].'.jpg')!==false,'New '.$dir.' is valid after move');
    }
    $manual=array_values(array_filter($photos,fn($photo)=>$photo['title']==='Manuel flyttet titel'));
    lm_assert(count($manual)===2,'One moved source photo is represented in both target albums');
    $a=stat($privateRoot.'/originals/'.$manual[0]['id'].'.bin');$b=stat($privateRoot.'/originals/'.$manual[1]['id'].'.bin');
    lm_assert($a['dev']===$b['dev']&&$a['ino']===$b['ino']&&$a['ino']===stat($anchorPath)['ino'],'Album memberships share the same original inode');
    lm_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE id='".$plannedId."'")->fetchColumn()===1,'Killed move recovers its existing planned photo ID once');
    foreach($manual as $photo){lm_assert(str_starts_with($photo['taken'],'2001-02-03T04:05:06'),'Moved database capture timestamp is preserved');lm_assert(abs((float)$photo['lat']-55.7)<0.000001&&abs((float)$photo['lon']-12.6)<0.000001&&$photo['place']==='København','Moved GPS and source location are preserved');}
    $restored=$pdo->query("SELECT * FROM photos WHERE title='Move photo 3'")->fetch();
    lm_assert(str_starts_with($restored['taken']??'','2001-02-03T05:05:06'),'Move restores original capture timezone');
    $q=$pdo->prepare('SELECT source_metadata FROM lychee_import_items WHERE source_photo_id=? AND status=\'imported\'');$q->execute([lm_id(3)]);$restoredMetadata=json_decode($q->fetchColumn(),true);
    lm_assert(($restoredMetadata['_verified_sha1_fields']??[])===['original_checksum'],'Move accepts a valid restored-original SHA1');
    $rootGallery=$pdo->query("SELECT id FROM galleries WHERE name='Lychee / Familie'")->fetchColumn();$childGallery=$pdo->query("SELECT id FROM galleries WHERE name='Lychee / Familie / Sommer'")->fetchColumn();
    $rootPhoto=array_values(array_filter($manual,fn($photo)=>$photo['gallery_id']===$rootGallery))[0];$childPhoto=array_values(array_filter($manual,fn($photo)=>$photo['gallery_id']===$childGallery))[0];
    $q=$pdo->prepare('INSERT INTO grants VALUES(?,?,0,0,0)');$q->execute([$childGallery,$guestId]);
    lm_assert(lm_request($guest,'GET','/photos/'.$childPhoto['id'].'/image?size=thumb')[0]===200,'Guest can view the granted moved thumbnail');
    lm_assert(lm_request($guest,'GET','/photos/'.$rootPhoto['id'].'/image?size=thumb')[0]===403,'Shared original inode does not bypass another gallery permission');
    lm_assert(lm_request($guest,'GET','/photos/'.$childPhoto['id'].'/image?size=original')[0]===403,'Original download and GPS permissions still apply after move');
    $guestPhotos=lm_ok(lm_request($guest,'GET','/galleries/'.$childGallery.'/photos'),'Guest inspects granted moved gallery')['photos'];
    lm_assert(!array_filter($guestPhotos,fn($p)=>isset($p['import_source'])||isset($p['_move_relative'])||$p['lat']!==null||$p['lon']!==null),'Guest receives neither move provenance nor denied GPS');
    lm_assert(lm_request($owner,'GET','/photos/'.$anchorId.'/image?size=original')[0]===404,'Journal anchor is not a directly addressable photo');
    $download=lm_request($owner,'GET','/photos/'.$rootPhoto['id'].'/image?size=original');
    lm_assert($download[0]===200&&hash('sha256',(string)$download[1])===$sourceHashes[1],'Authorized original download remains byte-for-byte correct');
    lm_assert(lm_snapshot($pdo,$sourceName)===$sourceSnapshot,'Moving files never writes to the SELECT-only source database');
    $beforePhotos=lm_count($pdo,'photos');$beforeGalleries=lm_count($pdo,'galleries');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/scan',[]),'Rescan completed move without restoring source originals');$status=lm_steps($owner,$status,'preview');
    lm_assert((int)$status['job']['totals']['missing']===1,'Already moved originals are not reclassified as missing during rescan');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Repeat persisted move mode');$status=lm_steps($owner,$status,'completed');
    lm_assert(lm_count($pdo,'photos')===$beforePhotos&&lm_count($pdo,'galleries')===$beforeGalleries&&lm_count($pdo,'lychee_import_move_files')===3,'Repeated move does not duplicate photos, galleries or original anchors');

    // Add only a new synthetic source record, then lose a real COMMIT reply.
    $paths[9]='original/09/0a/after-commit.jpg';lm_jpeg($uploadsRoot.'/'.$paths[9],210,40,180);$sourceHashes[9]=hash_file('sha256',$uploadsRoot.'/'.$paths[9]);$sourceStats[9]=stat($uploadsRoot.'/'.$paths[9]);
    $addPhoto(9,$paths[9]);$extendedSourceSnapshot=lm_snapshot($pdo,$sourceName);
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/scan',[]),'Inventory a new isolated move original');$status=lm_steps($owner,$status,'preview');
    $status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Start lost-ack move regression');
    file_put_contents($privateRoot.'/test-move-lost-ack','once');$faultResponse=null;
    for($i=0;$i<10&&is_file($privateRoot.'/test-move-lost-ack');$i++){
        $faultResponse=lm_request($owner,'POST','/admin/lychee-import/step',['job_id'=>$jobId]);
        clearstatcache(true,$privateRoot.'/test-move-lost-ack');
        if($faultResponse[0]!==200)break;
    }
    lm_assert($faultResponse!==null&&in_array($faultResponse[0],[409,503],true)&&!is_file($privateRoot.'/test-move-lost-ack'),'Actual move COMMIT succeeds before its synthetic acknowledgement error');
    $q=$pdo->prepare('SELECT i.status,i.target_photo_id,p.digest FROM lychee_import_items i LEFT JOIN photos p ON p.id=i.target_photo_id WHERE i.job_id=? AND i.source_photo_id=?');$q->execute([$jobId,lm_id(9)]);$committed=$q->fetch();
    lm_assert(($committed['status']??'')==='imported'&&($committed['digest']??'')===$sourceHashes[9],'Lost acknowledgement retains the committed move photo and receipt');
    $committedId=$committed['target_photo_id']??str_repeat('0',32);clearstatcache();
    lm_assert(!file_exists($uploadsRoot.'/'.$paths[9])&&is_file($privateRoot.'/originals/'.$committedId.'.bin')&&hash_file('sha256',$privateRoot.'/originals/'.$committedId.'.bin')===$sourceHashes[9],'Committed moved original survives a lost acknowledgement');
    foreach(['previews','thumbnails'] as $dir)lm_assert(is_file($privateRoot.'/'.$dir.'/'.$committedId.'.jpg')&&getimagesize($privateRoot.'/'.$dir.'/'.$committedId.'.jpg')!==false,'Committed moved '.$dir.' survives a lost acknowledgement');
    $status=lm_ok(lm_request($owner,'GET','/admin/lychee-import'),'Refresh after uncertain move COMMIT');
    if(($status['job']['state']??'')==='paused')$status=lm_ok(lm_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Resume protected uncertain move');
    $status=lm_steps($owner,$status,'completed');
    lm_assert(lm_count($pdo,'photos')===$beforePhotos+1&&lm_count($pdo,'galleries')===$beforeGalleries,'Continuing an uncertain move creates no duplicate photo or gallery');
    lm_assert(lm_snapshot($pdo,$sourceName)===$extendedSourceSnapshot,'Commit recovery leaves source database contents unchanged');

    // A genuine legacy copy job has no persisted mode row. Its already copied
    // receipt must still prevent conversion to moving after migration003.
    $legacyTargetName='lexgalleri_test_'.bin2hex(random_bytes(6));
    $pdo->exec('CREATE DATABASE `'.$legacyTargetName.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $q=$pdo->prepare('UPDATE `'.$sourceName.'`.photos SET checksum=?,original_checksum=? WHERE id=?');$fixedSha=sha1_file($uploadsRoot.'/'.$paths[6]);$q->execute([$fixedSha,$fixedSha,lm_id(6)]);
    $legacySourceSnapshot=lm_snapshot($pdo,$sourceName);$legacyConfig=$config;$legacyConfig['db_name']=$legacyTargetName;
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($legacyConfig,true).';');
    // Start a separate process for the second installation, so SAPI/opcache
    // revalidation intervals cannot keep the first installation's main config.
    proc_terminate($server);proc_close($server);$server=null;
    $server=proc_open([PHP_BINARY,'-d','memory_limit=256M','-d','opcache.enable=0','-d','opcache.enable_cli=0','-d','display_errors=0','-S','127.0.0.1:'.$httpPort,$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Could not start isolated legacy-copy test server');
    $legacyOwner=lm_client();
    $legacyReady=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(lm_request($legacyOwner,'GET','/status')[0]===200){$legacyReady=true;break;}}catch(Throwable){}}
    if(!$legacyReady)throw new RuntimeException('Legacy-copy test server did not become ready');
    lm_ok(security_test_complete_admin($legacyOwner,lm_request($legacyOwner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Legacy copy admin','email'=>'legacy-copy@example.test','password'=>'long-legacy-password']),'lm_request'),'Create an isolated legacy-copy target');
    $pdo->exec('USE `'.$legacyTargetName.'`');$pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));
    $legacy=lm_ok(lm_request($legacyOwner,'POST','/admin/lychee-import/scan',[]),'Inventory a legacy copy job without move tables');$legacy=lm_steps($legacyOwner,$legacy,'preview');
    $legacyJob=$legacy['job']['id'];
    $legacy=lm_ok(lm_request($legacyOwner,'POST','/admin/lychee-import/start',['job_id'=>$legacyJob,'confirm'=>true]),'Start a real copy job before move migration');$legacy=lm_steps($legacyOwner,$legacy,'completed');
    lm_assert(lm_count($pdo,'photos')===1&&is_file($uploadsRoot.'/'.$paths[6]),'Legacy copy creates its own original while retaining the source');
    $pdo->exec(file_get_contents($root.'/private/migrations/003_lychee_move.sql'));
    $legacy=lm_ok(lm_request($legacyOwner,'POST','/admin/lychee-import/scan',[]),'Refresh legacy preview after installing move tables');$legacy=lm_steps($legacyOwner,$legacy,'preview');
    lm_assert(($legacy['job']['mode_locked']??true)===false&&($legacy['move_available']??true)===false,'A legacy copied receipt blocks moving even without a persisted mode lock');
    lm_assert(lm_request($legacyOwner,'POST','/admin/lychee-import/start',['job_id'=>$legacyJob,'confirm'=>true,'transfer_mode'=>'move'])[0]===409,'An already imported legacy copy job cannot switch to moving');
    lm_assert(is_file($uploadsRoot.'/'.$paths[6])&&hash_file('sha256',$uploadsRoot.'/'.$paths[6])===$sourceHashes[6],'Rejected legacy mode switch leaves the original at the source');
    lm_assert(lm_snapshot($pdo,$sourceName)===$legacySourceSnapshot,'Legacy compatibility checks do not alter source database data');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $e){$failures++;fwrite(STDERR,$e->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{
    if(is_resource($server)){proc_terminate($server);proc_close($server);}
    $pdo->exec('DROP DATABASE IF EXISTS `'.$targetName.'`');$pdo->exec('DROP DATABASE IF EXISTS `'.$sourceName.'`');
    if($legacyTargetName!==null)$pdo->exec('DROP DATABASE IF EXISTS `'.$legacyTargetName.'`');
    $pdo->exec('DROP USER IF EXISTS '.$pdo->quote($sourceUser)."@'%'");lm_remove($temp);
}
exit($failures?1:0);
