<?php
declare(strict_types=1);
/**
 * Isolated Lychee 6.6.12 -> LexGalleri integration test.
 * Creates two randomly named databases and one SELECT-only source account.
 * Never loads production configuration or contacts a real gallery.
 */
if (getenv('LEXGALLERI_TEST') !== '1') exit("Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings.\n");
$root = dirname(__DIR__);
$temp = sys_get_temp_dir() . '/lexgalleri-lychee-test-' . bin2hex(random_bytes(6));
$privateRoot = $temp . '/private';
$uploadsRoot = $temp . '/lychee/public/uploads';
mkdir($privateRoot . '/config', 0700, true);
mkdir($uploadsRoot . '/big', 0700, true);
$targetName = 'lexgalleri_test_' . bin2hex(random_bytes(6));
$sourceName = 'lexgalleri_test_' . bin2hex(random_bytes(6));
$sourceUser = 'lychee_ro_' . bin2hex(random_bytes(5));
$sourcePassword = bin2hex(random_bytes(24));
$host = getenv('TEST_DB_HOST') ?: '127.0.0.1';
$port = (int)(getenv('TEST_DB_PORT') ?: 3306);
$dbuser = getenv('TEST_DB_USER') ?: 'root';
$password = getenv('TEST_DB_PASSWORD') ?: '';
$pdo = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $dbuser, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$server = null; $failures = 0; $checks = 0;

function li_assert(bool $ok, string $label): void {
    global $checks, $failures;
    $checks++;
    if (!$ok) { $failures++; fwrite(STDERR, "FAIL: $label\n"); }
    else echo "PASS: $label\n";
}
function li_client(): CurlHandle {
    $c = curl_init();
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEFILE => '', CURLOPT_TIMEOUT => 30]);
    return $c;
}
function li_request(CurlHandle $c, string $method, string $path, ?array $body = null): array {
    global $origin;
    curl_setopt($c, CURLOPT_URL, $origin . '/LexGalleri/api' . $path);
    curl_setopt($c, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($c, CURLOPT_POSTFIELDS, $body === null ? null : json_encode($body));
    curl_setopt($c, CURLOPT_HTTPHEADER, ['Origin: ' . $origin, 'Content-Type: application/json']);
    $raw = curl_exec($c);
    if ($raw === false) throw new RuntimeException(curl_error($c));
    return [(int)curl_getinfo($c, CURLINFO_RESPONSE_CODE), json_decode($raw, true) ?? $raw];
}
function li_ok(array $response, string $label): array {
    li_assert($response[0] === 200, $label);
    if ($response[0] !== 200 || !is_array($response[1])) throw new RuntimeException($label . ': ' . json_encode($response));
    return $response[1];
}
function li_steps(CurlHandle $client, array $status, string $until): array {
    for ($i = 0; $i < 100; $i++) {
        $state = $status['job']['state'] ?? '';
        if ($state === $until) return $status;
        if (!in_array($state, ['scanning', 'running'], true)) throw new RuntimeException('Unexpected importer state: ' . $state);
        $response = li_request($client, 'POST', '/admin/lychee-import/step', ['job_id' => $status['job']['id']]);
        if ($response[0] !== 200) throw new RuntimeException('Importer step failed: ' . json_encode($response));
        $status = $response[1];
    }
    throw new RuntimeException('Importer did not finish within bounded test steps');
}
function li_remove(string $path): void {
    foreach (scandir($path) as $name) {
        if ($name === '.' || $name === '..') continue;
        $p = $path . '/' . $name;
        if (is_link($p) || !is_dir($p)) unlink($p); else li_remove($p);
    }
    rmdir($path);
}
function li_source_snapshot(PDO $pdo, string $source): string {
    $snapshot = [];
    foreach (['configs','users','base_albums','albums','photos','photo_album','size_variants'] as $table) $snapshot[$table] = $pdo->query('SELECT * FROM `' . $source . '`.`' . $table . '` ORDER BY 1')->fetchAll();
    return json_encode($snapshot, JSON_UNESCAPED_UNICODE);
}
function li_count(PDO $pdo, string $target, string $table): int {
    return (int)$pdo->query('SELECT COUNT(*) FROM `' . $target . '`.`' . $table . '`')->fetchColumn();
}
function li_photo_id(int $n): string { return str_pad('photo-' . str_pad((string)$n,2,'0',STR_PAD_LEFT),24,'0'); }
function li_jpeg(string $path, int $red, int $green, int $blue): string {
    $im = imagecreatetruecolor(120,80);
    imagefill($im,0,0,imagecolorallocate($im,$red,$green,$blue));
    imagejpeg($im,$path,90);
    return hash_file('sha256',$path);
}

try {
    foreach ([$targetName,$sourceName] as $name) $pdo->exec('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE `' . $sourceName . '`');
    // Minimal faithful subset of the exact v6.6.12 schema. The stale old_album_id is deliberately misleading.
    $pdo->exec(<<<'SQL'
CREATE TABLE configs (`key` VARCHAR(50) PRIMARY KEY,value TEXT);
CREATE TABLE users (id INT UNSIGNED PRIMARY KEY,username VARCHAR(100),email VARCHAR(100),password VARCHAR(255));
CREATE TABLE base_albums (id CHAR(24) PRIMARY KEY,title VARCHAR(100),description TEXT,owner_id INT UNSIGNED,created_at DATETIME(6),updated_at DATETIME(6));
CREATE TABLE albums (id CHAR(24) PRIMARY KEY,parent_id CHAR(24) NULL);
CREATE TABLE photos (id CHAR(24) PRIMARY KEY,title VARCHAR(100),description TEXT,owner_id INT UNSIGNED,type VARCHAR(30),tags TEXT,taken_at DATETIME(6),taken_at_orig_tz VARCHAR(31),initial_taken_at DATETIME,initial_taken_at_orig_tz VARCHAR(31),latitude DECIMAL(10,8),longitude DECIMAL(11,8),location VARCHAR(255),checksum VARCHAR(40),original_checksum VARCHAR(40),is_starred TINYINT,created_at DATETIME(6),updated_at DATETIME(6),old_album_id CHAR(24));
CREATE TABLE photo_album (photo_id CHAR(24),album_id CHAR(24),PRIMARY KEY(photo_id,album_id));
CREATE TABLE size_variants (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,photo_id CHAR(24),type INT UNSIGNED,short_path VARCHAR(255),storage_disk VARCHAR(255) DEFAULT 'images',width INT,height INT,filesize BIGINT,ratio FLOAT);
SQL);
    $pdo->exec("INSERT INTO configs VALUES('version','060612')");
    $pdo->exec("INSERT INTO users VALUES(7,'Oprindelig fotograf','old-owner@example.test','NEVER_COPY_SOURCE_PASSWORD_HASH')");
    $legacyOwnerHash='$2y$10$'.str_repeat('x',53);
    $q=$pdo->prepare('INSERT INTO users VALUES(8,?,?,?)');$q->execute([$legacyOwnerHash,'old-admin@example.test','NEVER_COPY_OTHER_SOURCE_HASH']);
    $rootAlbum = str_pad('album-root',24,'0'); $childAlbum = str_pad('album-child',24,'0'); $emptyAlbum = str_pad('album-empty',24,'0');
    $q = $pdo->prepare('INSERT INTO base_albums VALUES(?,?,?,7,?,?)');
    $q->execute([$rootAlbum,'Familie','Lychee albumtekst','2010-01-01 00:00:00','2020-01-01 00:00:00']);
    $q->execute([$childAlbum,'Sommer','Lychee underalbumtekst','2010-01-01 00:00:00','2020-01-01 00:00:00']);
    $q->execute([$emptyAlbum,'Tomt Lychee-album','Tomt men bevaret','2010-01-01 00:00:00','2020-01-01 00:00:00']);
    $q=$pdo->prepare('UPDATE base_albums SET owner_id=8 WHERE id=?');$q->execute([$emptyAlbum]);
    $q = $pdo->prepare('INSERT INTO albums VALUES(?,?)'); $q->execute([$rootAlbum,null]);$q->execute([$childAlbum,$rootAlbum]);$q->execute([$emptyAlbum,null]);
    $originalHash = li_jpeg($uploadsRoot.'/big/photo1.jpg',20,100,70);
    copy($uploadsRoot.'/big/photo1.jpg',$uploadsRoot.'/big/photo2.jpg');
    li_jpeg($uploadsRoot.'/big/photo7.jpg',100,20,70);
    li_jpeg($uploadsRoot.'/big/photo8.jpg',100,70,20);
    li_jpeg($uploadsRoot.'/big/photo10.jpg',20,70,100);
    li_jpeg($uploadsRoot.'/big/photo11.jpg',190,170,10);
    li_jpeg($temp.'/outside.jpg',200,10,10);
    symlink($temp.'/outside.jpg',$uploadsRoot.'/big/link.jpg');
    file_put_contents($uploadsRoot.'/big/movie.mp4','test-only unsupported video');
    $paths = [1=>'big/photo1.jpg',2=>'big/photo2.jpg',3=>'big/missing.jpg',4=>'big/movie.mp4',5=>'../outside.jpg',6=>'big/link.jpg',7=>'big/photo7.jpg',8=>'big/photo8.jpg',9=>'big/cloud.jpg',10=>'big/photo10.jpg',11=>'big/photo11.jpg'];
    $sourceHashes = [];
    foreach ([1,2,7,8,10,11] as $n) $sourceHashes[$paths[$n]] = hash_file('sha256',$uploadsRoot.'/'.$paths[$n]);
    $outsideHash = hash_file('sha256',$temp.'/outside.jpg');
    $photoInsert = $pdo->prepare('INSERT INTO photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $variantInsert = $pdo->prepare('INSERT INTO size_variants(photo_id,type,short_path,storage_disk,width,height,filesize,ratio) VALUES(?,0,?,?,120,80,?,1.5)');
    $membershipInsert = $pdo->prepare('INSERT INTO photo_album VALUES(?,?)');
    foreach ($paths as $n=>$path) {
        $id=li_photo_id($n);$exists=is_file($uploadsRoot.'/'.$path);$checksum=$exists?sha1_file($uploadsRoot.'/'.$path):null;
        $originalChecksum=$n===7?str_repeat('1',40):$checksum;
        // keep_original_untouched may restore unrotated bytes after checksum was
        // recorded on an auto-rotated stream. Either documented SHA1 can match.
        if($n===8)$checksum=str_repeat('2',40);
        if($n===11){$checksum=str_repeat('0',40);$originalChecksum=str_repeat('3',40);}
        $photoInsert->execute([$id,$n===1?'Manuelt rettet titel':'Lychee foto '.$n,'Manuelt rettet billedtekst '.$n,$n===8?8:7,$n===4?'video/mp4':'image/jpeg','familie,sommer','2001-02-03 04:05:06.000000',$n===8?'Europe/Copenhagen':'UTC','1999-01-01 00:00:00','UTC','55.70000000','12.60000000','København',$checksum,$originalChecksum,0,'2010-05-06 07:08:09.000000','2020-06-07 08:09:10.000000',$rootAlbum]);
        $variantInsert->execute([$id,$path,$n===9?'s3':'images',$exists?filesize($uploadsRoot.'/'.$path):123]);
        if ($n!==10) $membershipInsert->execute([$id,$childAlbum]); // photo10 is genuinely unsorted.
        if ($n===1) $membershipInsert->execute([$id,$rootAlbum]); // same photo belongs to two albums.
    }
    $quotedUser=$pdo->quote($sourceUser);$quotedPassword=$pdo->quote($sourcePassword);
    $pdo->exec('CREATE USER '.$quotedUser."@'%' IDENTIFIED BY ".$quotedPassword);
    $pdo->exec('GRANT SELECT ON `'.$sourceName.'`.* TO '.$quotedUser."@'%'");
    $sourceSnapshot=li_source_snapshot($pdo,$sourceName);
    $config=['db_host'=>$host,'db_port'=>$port,'db_name'=>$targetName,'db_user'=>$dbuser,'db_password'=>$password,'base_path'=>'/LexGalleri','secure_cookies'=>false,'setup_token'=>str_repeat('test-setup-',5)];
    $importConfig=['enabled'=>true,'db_host'=>$host,'db_port'=>$port,'db_name'=>$sourceName,'db_user'=>$sourceUser,'db_password'=>$sourcePassword,'table_prefix'=>'','uploads_root'=>$uploadsRoot,'expected_version'=>'6.6.12'];
    file_put_contents($privateRoot.'/config/config.php','<?php return '.var_export($config,true).';');
    file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($importConfig,true).';');
    copy($root.'/private/app.php',$privateRoot.'/app.php');copy($root.'/private/schema.sql',$privateRoot.'/schema.sql');
    if (!is_file($root.'/private/lychee-import.php')) throw new RuntimeException('Importer backend is not present yet');
    copy($root.'/private/lychee-import.php',$privateRoot.'/lychee-import.php');
    // Change only the temporary module before PHP starts; the one-shot fault is
    // inactive until the final recovery scenario creates its private sentinel.
    $commitCode='$commitAttempted=true;$db->commit();';
    $faultCode=<<<'PHP'
$commitAttempted=true;$db->commit();
global $private;
if(is_file($private.'/test-lost-commit-ack')){
    unlink($private.'/test-lost-commit-ack');
    throw new PDOException('Synthetic lost COMMIT acknowledgement after successful commit');
}
PHP;
    $module=file_get_contents($privateRoot.'/lychee-import.php');
    $module=str_replace($commitCode,$faultCode,$module,$replacements);
    li_assert($replacements===1,'Fault injection replaces exactly one photo COMMIT in temporary module');
    if($replacements!==1)throw new RuntimeException('Cannot inject precise lost-commit acknowledgement fault');
    file_put_contents($privateRoot.'/lychee-import.php',$module);
    $httpPort=(int)(getenv('TEST_HTTP_PORT')?:8766);$origin='http://127.0.0.1:'.$httpPort;$env=getenv();$env['LEXGALLERI_PRIVATE']=$privateRoot;
    $server=proc_open([PHP_BINARY,'-d','memory_limit=256M','-d','opcache.enable_cli=0','-S','127.0.0.1:'.$httpPort,$root.'/tests/router.php'],[0=>['pipe','r'],1=>['file',$temp.'/server.log','a'],2=>['file',$temp.'/server.log','a']],$pipes,$root,$env);
    if(!is_resource($server))throw new RuntimeException('Could not start test server');
    $owner=li_client();$guest=li_client();$anonymous=li_client();$ready=false;
    for($i=0;$i<50;$i++){usleep(100000);try{if(li_request($owner,'GET','/status')[0]===200){$ready=true;break;}}catch(Throwable){}}
    if(!$ready)throw new RuntimeException('Test server did not become ready');
    li_ok(li_request($owner,'POST','/setup',['token'=>$config['setup_token'],'name'=>'Import admin','email'=>'import-admin@example.test','password'=>'long-import-password']),'Admin setup');
    $ownerId=li_request($owner,'GET','/me')[1]['id'];
    $pdo->exec('USE `'.$targetName.'`');
    $guestId=bin2hex(random_bytes(16));$q=$pdo->prepare('INSERT INTO users VALUES(?,?,?,?,0)');$q->execute([$guestId,'guest@example.test','Gæst',password_hash('long-guest-password',PASSWORD_DEFAULT)]);
    li_ok(li_request($guest,'POST','/login',['email'=>'guest@example.test','password'=>'long-guest-password']),'Guest login');
    li_assert(li_request($anonymous,'GET','/admin/lychee-import')[0]===401,'Anonymous cannot inspect importer');
    li_assert(li_request($guest,'GET','/admin/lychee-import')[0]===403,'Guest cannot inspect source metadata');
    li_assert(li_request($guest,'POST','/admin/lychee-import/scan',[])[0]===403,'Guest cannot start scan');
    $status=li_ok(li_request($owner,'GET','/admin/lychee-import'),'Importer detects missing target migration');
    li_assert(($status['migration_needed']??false)===true,'Missing migration is reported without creating tables');
    $pdo->exec(file_get_contents($root.'/private/migrations/002_lychee_import.sql'));
    $status=li_ok(li_request($owner,'GET','/admin/lychee-import'),'Configured importer after owner migration');
    li_assert(($status['configured']??false)===true && ($status['migration_needed']??true)===false,'Private source config recognized');
    foreach(['filesystem root'=>'/','target private'=>$privateRoot,'ancestor of target'=>$temp,'target originals'=>$privateRoot.'/originals'] as $label=>$invalidRoot){
        $badConfig=$importConfig;$badConfig['uploads_root']=$invalidRoot;
        file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($badConfig,true).';');
        li_assert(li_request($owner,'GET','/admin/lychee-import')[0]===400,'Reject source root overlapping system or target storage: '.$label);
    }
    file_put_contents($privateRoot.'/config/lychee-import.php','<?php return '.var_export($importConfig,true).';');
    $pdo->exec("UPDATE `".$sourceName."`.configs SET value='060613' WHERE `key`='version'");
    li_assert(li_request($owner,'POST','/admin/lychee-import/scan',[])[0]===400,'Refuse a different Lychee database version');
    $pdo->exec("UPDATE `".$sourceName."`.configs SET value='060612' WHERE `key`='version'");
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/scan',[]),'Begin inventory only');
    $status=li_steps($owner,$status,'preview');
    li_assert(($status['source_version']??'')==='6.6.12','Exact source version recognized');
    li_assert(li_count($pdo,$targetName,'galleries')===0 && li_count($pdo,$targetName,'photos')===0,'Preview creates no galleries or photo records');
    $copied=glob($privateRoot.'/originals/*')?:[];
    li_assert(count($copied)===0,'Preview copies no original files');
    li_assert(li_source_snapshot($pdo,$sourceName)===$sourceSnapshot,'Source database unchanged by scan');
    $jobId=$status['job']['id'];
    li_assert(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId])[0]===409,'Copy requires explicit confirmation');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Explicitly start copying');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/pause',['job_id'=>$jobId]),'Pause before next batch');
    li_assert(($status['job']['state']??'')==='paused','Paused state retained');
    li_assert(li_count($pdo,$targetName,'photos')===0,'Pause does not copy files itself');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Resume paused import');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/step',['job_id'=>$jobId]),'Copy bounded first batch');
    li_assert(li_count($pdo,$targetName,'photos')>0 && ($status['job']['state']??'')==='running','First batch leaves more work to resume');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/pause',['job_id'=>$jobId]),'Pause partially copied import');
    // Simulate PHP being killed after recording an intended ID and writing partial files.
    $plannedId=bin2hex(random_bytes(16));$q=$pdo->prepare('UPDATE lychee_import_items SET planned_photo_id=? WHERE job_id=? AND source_photo_id=? AND status=\'pending\'');$q->execute([$plannedId,$jobId,li_photo_id(7)]);
    li_assert($q->rowCount()===1,'Fixture simulates one interrupted pending copy');
    foreach(['originals/'.$plannedId.'.bin','previews/'.$plannedId.'.jpg','thumbnails/'.$plannedId.'.jpg'] as $f)file_put_contents($privateRoot.'/'.$f,'incomplete staged image');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$jobId,'confirm'=>true]),'Resume partially copied import');
    $status=li_steps($owner,$status,'completed');
    $totals=$status['job']['totals'];
    li_assert((int)($totals['imported']??0)===5,'Both memberships and unsorted photo imported');
    li_assert((int)($totals['duplicate']??0)===1,'Duplicate content within an album is linked without a second target');
    li_assert((int)($totals['unsupported']??0)>=2,'Unsupported video and cloud source reported');
    li_assert((int)($totals['missing']??0)>=1,'Missing original reported');
    li_assert((int)($totals['error']??0)>=3,'Traversal, outside-root symlink and two wrong source checksums refused');
    li_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE title='Lychee foto 11'")->fetchColumn()===0,'Two wrong source checksums create no target photo');
    li_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE title='Lychee foto 7'")->fetchColumn()===1,'Current checksum accepted even when original upload checksum differs');
    li_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE title='Lychee foto 8'")->fetchColumn()===1,'Original upload checksum accepted when restored bytes differ from current checksum');
    $q=$pdo->prepare('SELECT source_metadata FROM lychee_import_items WHERE source_photo_id=? AND status=\'imported\'');
    $q->execute([li_photo_id(7)]);$currentVerified=json_decode($q->fetchColumn(),true);
    $q->execute([li_photo_id(8)]);$originalVerified=json_decode($q->fetchColumn(),true);
    li_assert(($currentVerified['_verified_sha1_fields']??[])===['checksum'],'Receipt records successful current checksum verification');
    li_assert(($originalVerified['_verified_sha1_fields']??[])===['original_checksum']&&($originalVerified['_copied_sha1']??'')===sha1_file($uploadsRoot.'/big/photo8.jpg'),'Receipt records successful restored-original checksum verification');
    li_assert(str_starts_with((string)$pdo->query("SELECT taken FROM photos WHERE title='Lychee foto 8'")->fetchColumn(),'2001-02-03T05:05:06'),'Capture timezone restores source local wall time');
    li_assert((int)$pdo->query("SELECT COUNT(*) FROM photos WHERE id='".$plannedId."'")->fetchColumn()===1,'Interrupted copy reuses its planned ID exactly once');
    li_assert(hash_file('sha256',$privateRoot.'/originals/'.$plannedId.'.bin')===$sourceHashes['big/photo7.jpg'],'Partial original recovered byte for byte');
    li_assert(getimagesize($privateRoot.'/previews/'.$plannedId.'.jpg')!==false&&getimagesize($privateRoot.'/thumbnails/'.$plannedId.'.jpg')!==false,'Partial preview and thumbnail regenerated');
    li_assert(li_count($pdo,$targetName,'photos')===5,'Five target photo records after completed import');
    li_assert(li_count($pdo,$targetName,'galleries')===4,'Hierarchy, empty album and unsorted gallery preserved');
    li_assert(li_count($pdo,$targetName,'grants')===0,'Imported galleries remain admin-only');
    li_assert(li_count($pdo,$targetName,'users')===2,'Lychee owner does not become a target account');
    $imported=$pdo->query('SELECT * FROM photos ORDER BY id')->fetchAll();$targetHashes=[];
    foreach($imported as $p){$path=$privateRoot.'/originals/'.$p['id'].'.bin';li_assert(is_file($path)&&hash_file('sha256',$path)===$p['digest'],'Copied original matches target digest');$targetHashes[]=$p['digest'];li_assert($p['uploader']===$ownerId,'Importing admin is actual target uploader');}
    li_assert(count(array_filter($targetHashes,fn($h)=>$h===$originalHash))===2,'One original retained in each of its two albums');
    $manual=$pdo->query("SELECT * FROM photos WHERE title='Manuelt rettet titel'")->fetchAll();
    li_assert(count($manual)===2,'Manual source title preserved across memberships');
    foreach($manual as $p){li_assert(str_starts_with($p['taken'],'2001-02-03T04:05:06'),'Database capture date takes priority over file metadata');li_assert(abs((float)$p['lat']-55.7)<0.000001&&abs((float)$p['lon']-12.6)<0.000001,'Database GPS preserved');li_assert($p['place']==='København','Source location preserved');}
    $provenance=implode("\n",$pdo->query('SELECT source_metadata FROM lychee_import_items')->fetchAll(PDO::FETCH_COLUMN));
    li_assert(str_contains($provenance,'Manuelt rettet billedtekst'),'Unsupported descriptive metadata retained in provenance');
    li_assert(str_contains($provenance,'Oprindelig fotograf'),'Source owner retained as provenance');
    $albumProvenance=implode("\n",$pdo->query('SELECT source_metadata FROM lychee_import_albums')->fetchAll(PDO::FETCH_COLUMN));
    li_assert(str_contains($provenance,'Admin (Lychee)')&&str_contains($albumProvenance,'Admin (Lychee)'),'Legacy hashed photo and album owner normalized');
    li_assert(!str_contains($provenance.$albumProvenance,$legacyOwnerHash),'Legacy username hash never retained in provenance');
    li_assert(!str_contains($provenance,'old_album_id'),'Stale album membership field excluded from photo provenance');
    li_assert(!str_contains($provenance,'NEVER_COPY_SOURCE_PASSWORD_HASH')&&!str_contains($provenance,'old-owner@example.test'),'Source credentials and email never copied into provenance');
    $manualGallery=$manual[0]['gallery_id'];
    $adminPhotos=li_ok(li_request($owner,'GET','/galleries/'.$manualGallery.'/photos'),'Admin inspects imported photo provenance')['photos'];
    $adminManual=array_values(array_filter($adminPhotos,fn($p)=>$p['title']==='Manuelt rettet titel'))[0];
    $safeSource=$adminManual['import_source']??[];
    li_assert(($safeSource['version']??'')==='6.6.12'&&($safeSource['owner_name']??'')==='Oprindelig fotograf','Admin sees source version and owner name');
    li_assert(($safeSource['description']??'')==='Manuelt rettet billedtekst 1'&&($safeSource['tags']??'')==='familie,sommer','Admin sees preserved description and tags');
    li_assert(($safeSource['source_photo_id']??'')===li_photo_id(1),'Admin sees source photo reference');
    li_assert(!array_diff(array_keys($safeSource),['version','owner_name','description','tags','created_at','taken_at','taken_at_orig_tz','source_photo_id']),'Admin provenance API exposes only the agreed safe fields');
    li_assert(!str_contains(json_encode($adminPhotos),$uploadsRoot)&&!str_contains(json_encode($adminPhotos),$sourcePassword),'Admin photo API excludes private paths and credentials');
    $q=$pdo->prepare('INSERT INTO grants VALUES(?,?,0,0,0)');$q->execute([$manualGallery,$guestId]);
    $guestPhotos=li_ok(li_request($guest,'GET','/galleries/'.$manualGallery.'/photos'),'Granted guest sees imported gallery')['photos'];
    li_assert(count($guestPhotos)>0&&!array_filter($guestPhotos,fn($p)=>array_key_exists('import_source',$p)||array_key_exists('_import_metadata',$p)),'Source provenance remains absent for granted guests');
    li_assert(!array_filter($guestPhotos,fn($p)=>$p['lat']!==null||$p['lon']!==null),'Imported GPS follows guest gallery permissions');
    foreach($sourceHashes as $p=>$hash)li_assert(hash_file('sha256',$uploadsRoot.'/'.$p)===$hash,'Lychee original unchanged: '.$p);
    li_assert(hash_file('sha256',$temp.'/outside.jpg')===$outsideHash,'Outside-root file remains unchanged');
    li_assert(!in_array($outsideHash,$targetHashes,true),'Outside-root contents never imported');
    li_assert(li_source_snapshot($pdo,$sourceName)===$sourceSnapshot,'SELECT-only source database still unchanged');
    $beforePhotos=li_count($pdo,$targetName,'photos');$beforeGalleries=li_count($pdo,$targetName,'galleries');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/scan',[]),'Rescan existing source');
    $status=li_steps($owner,$status,'preview');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$status['job']['id'],'confirm'=>true]),'Start idempotent rerun');
    $status=li_steps($owner,$status,'completed');
    li_assert(li_count($pdo,$targetName,'photos')===$beforePhotos&&li_count($pdo,$targetName,'galleries')===$beforeGalleries,'Repeated scan/import is idempotent');
    li_assert(li_source_snapshot($pdo,$sourceName)===$sourceSnapshot,'Source DB unchanged after resumed and repeated imports');
    // Repair only the isolated fixture, then simulate a lost COMMIT acknowledgement
    // in the temporary module copy. Production code has no fault-injection hook.
    $q=$pdo->prepare('UPDATE `'.$sourceName.'`.photos SET checksum=?,original_checksum=? WHERE id=?');
    $repairedChecksum=sha1_file($uploadsRoot.'/big/photo11.jpg');
    $q->execute([$repairedChecksum,$repairedChecksum,li_photo_id(11)]);
    $repairedSourceSnapshot=li_source_snapshot($pdo,$sourceName);
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/scan',[]),'Rescan repaired isolated checksum fixture');
    $status=li_steps($owner,$status,'preview');
    $status=li_ok(li_request($owner,'POST','/admin/lychee-import/start',['job_id'=>$status['job']['id'],'confirm'=>true]),'Start isolated lost-commit-ack regression');
    file_put_contents($privateRoot.'/test-lost-commit-ack','once');
    $lostAck=li_request($owner,'POST','/admin/lychee-import/step',['job_id'=>$status['job']['id']]);
    li_assert($lostAck[0]===503,'Lost COMMIT acknowledgement returns a retriable 503');
    li_assert(!is_file($privateRoot.'/test-lost-commit-ack'),'Post-commit fault actually executed once');
    $q=$pdo->prepare('SELECT i.status,i.target_photo_id,p.digest FROM lychee_import_items i LEFT JOIN photos p ON p.id=i.target_photo_id WHERE i.job_id=? AND i.source_photo_id=?');
    $q->execute([$status['job']['id'],li_photo_id(11)]);$committed=$q->fetch();
    li_assert(($committed['status']??'')==='imported'&&!empty($committed['target_photo_id'])&&!empty($committed['digest']),'Successful COMMIT retains target photo and imported receipt despite lost acknowledgement');
    $committedId=$committed['target_photo_id']??str_repeat('0',32);
    $retainedOriginal=$privateRoot.'/originals/'.$committedId.'.bin';
    li_assert(is_file($retainedOriginal)&&hash_file('sha256',$retainedOriginal)===$sourceHashes['big/photo11.jpg'],'Committed original remains intact after acknowledgement error');
    foreach(['previews','thumbnails'] as $dir)li_assert(is_file($privateRoot.'/'.$dir.'/'.$committedId.'.jpg')&&getimagesize($privateRoot.'/'.$dir.'/'.$committedId.'.jpg')!==false,'Committed '.$dir.' image retained after acknowledgement error');
    $status=li_ok(li_request($owner,'GET','/admin/lychee-import'),'Reload status after uncertain COMMIT');
    li_assert(($status['job']['state']??'')==='running','Uncertain acknowledgement permits status refresh before continuing');
    $status=li_steps($owner,$status,'completed');
    li_assert(li_count($pdo,$targetName,'photos')===$beforePhotos+1,'Continue after lost acknowledgement creates no duplicate photo');
    li_assert(li_count($pdo,$targetName,'galleries')===$beforeGalleries,'Continue after lost acknowledgement creates no duplicate galleries');
    li_assert(li_source_snapshot($pdo,$sourceName)===$repairedSourceSnapshot,'Importer does not change repaired source fixture during commit recovery');
    echo "\n$checks checks, $failures failures\n";
}catch(Throwable $e){$failures++;fwrite(STDERR,$e->getMessage()."\n");if(is_file($temp.'/server.log'))fwrite(STDERR,file_get_contents($temp.'/server.log'));}
finally{
    if(is_resource($server)){proc_terminate($server);proc_close($server);}
    $pdo->exec('DROP DATABASE IF EXISTS `'.$targetName.'`');$pdo->exec('DROP DATABASE IF EXISTS `'.$sourceName.'`');
    $pdo->exec('DROP USER IF EXISTS '.$pdo->quote($sourceUser)."@'%'");
    li_remove($temp);
}
exit($failures?1:0);
