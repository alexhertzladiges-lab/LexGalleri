<?php
declare(strict_types=1);
const LEXGALLERI_SECURITY_VERSION = 1;

final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function fail(int $code, string $message): never { throw new ApiError($code, $message); }
function send(mixed $body, int $status = 200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit;
}
function query(string $sql, array $args = []): PDOStatement {
    global $db; $s = $db->prepare($sql); $s->execute($args); return $s;
}
function one(string $sql, array $args = []): ?array { return query($sql,$args)->fetch() ?: null; }
function rows(string $sql, array $args = []): array { return query($sql,$args)->fetchAll(); }
function body(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) fail(413,'Forespørgslen er for stor');
    try { $b = json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException) { fail(400,'Ugyldig JSON'); }
    if (!is_array($b) || array_is_list($b) && $b !== []) fail(400,'Ugyldig forespørgsel');
    return $b;
}
function text(array $b, string $key, int $max, bool $required = false): string {
    $v = $b[$key] ?? ''; if (!is_string($v)) fail(400,'Ugyldigt felt: '.$key);
    $v = trim($v); if (mb_strlen($v) > $max || $required && $v === '') fail(400,'Ugyldigt felt: '.$key); return $v;
}
function email(array $b): string {
    $v = strtolower(text($b,'email',254,true));
    if (!filter_var($v,FILTER_VALIDATE_EMAIL)) fail(400,'Ugyldig e-mail'); return $v;
}
function new_password(array $b): string {
    $p = $b['password'] ?? ''; if (!is_string($p) || strlen($p)<12 || strlen($p)>72) fail(400,'Adgangskoden skal være 12–72 bytes');
    return password_hash($p, PASSWORD_DEFAULT);
}
function stamp(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function uid(): string { return bin2hex(random_bytes(16)); }
function safe_user(array $u): array { return ['id'=>$u['id'],'email'=>$u['email'],'name'=>$u['name'],'admin'=>(int)$u['admin']]; }
function user(bool $admin = false): array {
    $id = $_SESSION['uid'] ?? ''; $u = $id ? one('SELECT * FROM users WHERE id=?',[$id]) : null;
    if (!$u || ($_SESSION['expires'] ?? 0) < time()) fail(401,'Log ind for at fortsætte');
    lg_security_validate_session($u);
    if ($admin && !$u['admin']) fail(403,'Kun administrator'); return $u;
}
function login_user(array $u): never {
    lg_security_login($u);
}
function access(string $g, ?string $permission = null): array {
    $u=user(); if (!one('SELECT id FROM galleries WHERE id=?',[$g])) fail(404,'Galleriet findes ikke');
    $a=one('SELECT * FROM grants WHERE gallery_id=? AND user_id=?',[$g,$u['id']]);
    if (!$u['admin'] && (!$a || $permission && !$a[$permission])) fail(403,'Du har ikke adgang');
    return [$u,$a];
}
function photo(string $id, ?string $permission=null): array {
    $p=one('SELECT * FROM photos WHERE id=?',[$id]); if (!$p) fail(404,'Foto findes ikke');
    access($p['gallery_id'],$permission); return $p;
}
function default_theme(): array {
    return ['version'=>1,'name'=>'Nordisk','colors'=>['background'=>'#f7f6f2','surface'=>'#ffffff','text'=>'#263b34','accent'=>'#416c57'],'font'=>'sans','radius'=>16,'density'=>'comfortable'];
}
function validate_theme(mixed $t): array {
    if (!is_array($t) || ($t['version']??null)!==1) fail(400,'Designpakken skal have version 1');
    text($t,'name',60,true); $colors=$t['colors']??null;
    if (!is_array($colors) || count($colors)!==4) fail(400,'Ugyldige farver');
    foreach (['background','surface','text','accent'] as $key) if (!isset($colors[$key]) || !is_string($colors[$key]) || !preg_match('/^#[0-9a-fA-F]{6}$/D',$colors[$key])) fail(400,'Farver skal være #RRGGBB');
    if (!in_array($t['font']??null,['sans','serif'],true) || !is_int($t['radius']??null) || $t['radius']<0 || $t['radius']>32 || !in_array($t['density']??null,['compact','comfortable'],true)) fail(400,'Ugyldige layoutvalg');
    return array_intersect_key($t,default_theme());
}
function validate_date(string $taken,string $precision): void {
    $formats=['exact'=>'Y-m-d\TH:i:s','day'=>'Y-m-d','month'=>'Y-m','year'=>'Y','circa'=>'Y'];
    if ($precision==='unknown') { if ($taken!=='') fail(400,'Ukendt dato skal være tom'); return; }
    if (!isset($formats[$precision])) fail(400,'Ugyldig datopræcision');
    $format=$formats[$precision]; if ($precision==='exact' && strlen($taken)===16) $format='Y-m-d\TH:i';
    $d=DateTimeImmutable::createFromFormat('!'.$format,$taken,new DateTimeZone('UTC'));
    if (!$d || $d->format($format)!==$taken || (int)$d->format('Y')<1) fail(400,'Ugyldig dato');
}
function upload_file(int $max): array {
    $f=$_FILES['file']??null;
    if (!$f || !is_array($f) || !is_int($f['error']??null) || !is_string($f['tmp_name']??null)) fail(400,'Vælg en fil');
    if ($f['error']===UPLOAD_ERR_INI_SIZE || $f['error']===UPLOAD_ERR_FORM_SIZE) fail(413,'Filen er for stor');
    if ($f['error']!==UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail(400,'Upload mislykkedes');
    if (filesize($f['tmp_name'])>$max) fail(413,'Filen er for stor'); return $f;
}
function image_path(string $id,string $suffix): string {
    global $private; if (!preg_match('/^[a-f0-9]{32}$/D',$id)) fail(404,'Foto findes ikke');
    $dir=['original'=>'originals','view'=>'previews','thumb'=>'thumbnails'][$suffix];
    return $private.'/'.$dir.'/'.$id.($suffix==='original'?'.bin':'.jpg');
}
// Parse decimal byte positions without overflowing PHP integers. Very large ends
// and suffixes may be clamped; very large starts remain outside any stored file.
function video_byte_number(string $digits): int {
    $digits=ltrim($digits,'0');$limit=(string)PHP_INT_MAX;
    if($digits==='')return 0;
    return strlen($digits)>strlen($limit) || strlen($digits)===strlen($limit) && strcmp($digits,$limit)>0?PHP_INT_MAX:(int)$digits;
}
function video_byte_range(string $range,int $size): ?array {
    if($size<1 || strlen($range)>1024 || !preg_match('/\Abytes=([0-9]*)-([0-9]*)\z/',$range,$m) || $m[1]==='' && $m[2]==='')return null;
    if($m[1]==='') {$suffix=video_byte_number($m[2]);return $suffix>0?[max(0,$size-$suffix),$size-1]:null;}
    $start=video_byte_number($m[1]);$end=$m[2]===''?$size-1:min($size-1,video_byte_number($m[2]));
    return $start<$size && $end>=$start?[$start,$end]:null;
}
function stream_video(array $p,bool $head): never {
    // The caller has checked both original-download and GPS permissions: an MP4
    // can contain embedded location metadata, even when database GPS is hidden.
    if($p['mime']!=='video/mp4')fail(404,'Video findes ikke');
    $file=image_path($p['id'],'original');$handle=@fopen($file,'rb');
    if(!$handle)fail(404,'Videofilen mangler');
    $stat=fstat($handle);if(!$stat || !is_int($stat['size']) || $stat['size']<0){fclose($handle);fail(500,'Videofilen kunne ikke læses');}
    $size=$stat['size'];$etag='"'.hash('sha256',(string)$p['digest']).'"';$start=0;$end=$size-1;$partial=false;
    $range=$_SERVER['HTTP_RANGE']??null;$ifRange=$_SERVER['HTTP_IF_RANGE']??null;
    if(!$head && $range!==null && ($ifRange===null || hash_equals($etag,$ifRange))) {
        $selected=video_byte_range($range,$size);
        if($selected===null){fclose($handle);http_response_code(416);header('Accept-Ranges: bytes');header('Content-Range: bytes */'.$size);header('Content-Length: 0');session_write_close();exit;}
        [$start,$end]=$selected;$partial=true;
    }
    if($start>0 && fseek($handle,$start,SEEK_SET)!==0){fclose($handle);fail(500,'Videofilen kunne ikke læses');}
    ini_set('zlib.output_compression','0');
    http_response_code($partial?206:200);header('Content-Type: video/mp4');header('Accept-Ranges: bytes');header('ETag: '.$etag);
    header("Content-Disposition: inline; filename=\"video.mp4\"; filename*=UTF-8''".rawurlencode($p['filename']));
    if($partial)header('Content-Range: bytes '.$start.'-'.$end.'/'.$size);
    $remaining=$size===0?0:$end-$start+1;header('Content-Length: '.$remaining);session_write_close();
    if(!$head)while($remaining>0 && !connection_aborted()) {
        $chunk=fread($handle,min(65536,$remaining));if($chunk===false || $chunk==='')break;
        echo $chunk;$remaining-=strlen($chunk);flush();
    }
    fclose($handle);exit;
}
function fraction(mixed $v): float {
    if (is_string($v) && str_contains($v,'/')) { [$n,$d]=explode('/',$v,2); if (!(float)$d) throw new RuntimeException('GPS');return (float)$n/(float)$d; }
    return (float)$v;
}
function gps_coordinate(array $v): float { return fraction($v[0])+fraction($v[1])/60+fraction($v[2])/3600; }
function resize_image(GdImage $image,int $max,string $path,int $quality): void {
    $w=imagesx($image);$h=imagesy($image);$ratio=min(1,$max/max($w,$h));$nw=max(1,(int)round($w*$ratio));$nh=max(1,(int)round($h*$ratio));
    $out=imagecreatetruecolor($nw,$nh);imagefill($out,0,0,imagecolorallocate($out,255,255,255));
    imagecopyresampled($out,$image,0,0,0,0,$nw,$nh,$w,$h);
    if (!imagejpeg($out,$path,$quality)) throw new RuntimeException('Kunne ikke gemme billede');
    chmod($path,0600);
}
function orient_image(GdImage $im,int $orientation): GdImage {
    if (in_array($orientation,[2,5,7],true)) imageflip($im,IMG_FLIP_HORIZONTAL);
    if ($orientation===4) imageflip($im,IMG_FLIP_VERTICAL);
    return match ($orientation) {3=>imagerotate($im,180,0),6,7=>imagerotate($im,-90,0),5,8=>imagerotate($im,90,0),default=>$im};
}
function throttle(string $bucket,int $max=10): void {
    global $db;
    $key=hash('sha256',$bucket);$until=time()+900;
    query('INSERT INTO login_limits(bucket,attempts,expires) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires<?,1,attempts+1),expires=IF(expires<?,VALUES(expires),expires)',[$key,$until,time(),time()]);
    if ((int)one('SELECT attempts FROM login_limits WHERE bucket=?',[$key])['attempts']>$max) fail(429,'For mange forsøg. Vent 15 minutter');
    query('DELETE FROM login_limits WHERE expires<?',[time()]);
}
function route(string $method,string $path): never {
    global $db,$config,$private,$base;
    if ($method==='GET' && $path==='/status') {
        $installed=one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'");
        send(['setup'=>!$installed || !one('SELECT id FROM users LIMIT 1'),'account_security_version'=>1,'account_security_ready'=>lg_security_ready()]);
    }
    if ($method==='POST' && $path==='/setup') {
        $b=body();$key=$config['setup_token']??'';
        if (strlen($key)<32 || str_starts_with($key,'UDSKIFT_') || !hash_equals($key,(string)($b['token']??''))) fail(403,'Ugyldig opsætningsnøgle');
        $mail=email($b);$name=text($b,'name',100,true);$pw=new_password($b);
        // MySQL advisory lock serializes first-admin creation across requests.
        $lock='lexgalleri-setup-'.substr(hash('sha256',$config['db_name']),0,24);
        if (!(int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()) fail(409,'Opsætning er i gang');
        try {
            $hasUsers=one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'");
            if ($hasUsers && one('SELECT id FROM users LIMIT 1')) fail(409,'Allerede opsat');
            {
                $sql=file_get_contents($private.'/schema.sql');
                if ($sql===false) throw new RuntimeException('schema.sql mangler');
                // Only explicit, secret-authorized first-time setup may install tables.
                foreach (explode(';',$sql) as $statement) if(trim($statement)!=='')$db->exec($statement);
            }
            if (one('SELECT id FROM users LIMIT 1')) fail(409,'Allerede opsat');
            $u=['id'=>uid(),'email'=>$mail,'name'=>$name,'admin'=>1];
            query('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,1)',[$u['id'],$mail,$name,$pw]);
        } finally { query('SELECT RELEASE_LOCK(?)',[$lock]); }
        login_user($u);
    }
    if ($method==='POST' && $path==='/login') {
        $b=body();$mail=email($b);throttle('login:'.($_SERVER['REMOTE_ADDR']??''),30);throttle('account:'.$mail);
        $u=one('SELECT * FROM users WHERE email=?',[$mail]);$pw=$b['password']??'';
        if (!is_string($pw) || !$u || !password_verify($pw,$u['password'])) fail(401,'Forkert e-mail eller adgangskode');
        if (password_needs_rehash($u['password'],PASSWORD_DEFAULT)) {$newHash=password_hash($pw,PASSWORD_DEFAULT);query('UPDATE users SET password=? WHERE id=? AND password=?',[$newHash,$u['id'],$u['password']]);$u['password']=$newHash;}
        login_user($u);
    }
    if ($method==='POST' && $path==='/logout') { $_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>1,'path'=>$base?:'/','secure'=>$config['secure_cookies'],'httponly'=>true,'samesite'=>'Strict']);send(['ok'=>true]); }
    if ($method==='POST' && $path==='/accept') {
        $b=body();throttle('invite:'.($_SERVER['REMOTE_ADDR']??''));$hash=hash('sha256',text($b,'token',200,true));
        $db->beginTransaction();$inv=one('SELECT * FROM invitations WHERE token=? AND expires>? FOR UPDATE',[$hash,time()]);
        if (!$inv) fail(400,'Invitationen er udløbet eller brugt');
        $u=one('SELECT * FROM users WHERE email=?',[$inv['email']]);
        if ($u) {if (!is_string($b['password']??null) || !password_verify($b['password'],$u['password'])) fail(401,'Brug din eksisterende adgangskode');}
        else { $u=['id'=>uid(),'email'=>$inv['email'],'name'=>$inv['name'],'admin'=>0];
            query('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,0)',[$u['id'],$u['email'],$u['name'],new_password($b)]); }
        query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE upload=VALUES(upload),download=VALUES(download),gps=VALUES(gps)',[$inv['gallery_id'],$u['id'],$inv['upload'],$inv['download'],$inv['gps']]);
        query('DELETE FROM invitations WHERE token=?',[$hash]);$db->commit();login_user($u);
    }
    lg_security_route_pre($method,$path);
    $u=user();
    lg_security_route($method,$path,$u);
    if ($path==='/admin/lychee-import' || str_starts_with($path,'/admin/lychee-import/')) {
        user(true);
        if(!is_file($private.'/lychee-import.php')) {
            if($method==='GET') send(['configured'=>false,'migration_needed'=>true,'source_version'=>'6.6.12','job'=>null]);
            fail(409,'Den private importør er ikke installeret');
        }
        require_once $private.'/lychee-import.php';
        lychee_route($method,substr($path,strlen('/admin/lychee-import')));
    }
    if ($method==='GET' && $path==='/me') send(safe_user($u));
    if ($method==='GET' && $path==='/galleries') send(rows('SELECT g.*,(SELECT count(*) FROM photos p WHERE p.gallery_id=g.id) count,(SELECT id FROM photos p WHERE p.gallery_id=g.id ORDER BY uploaded DESC LIMIT 1) cover FROM galleries g WHERE ?=1 OR EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=g.id AND a.user_id=?) ORDER BY created DESC',[(int)$u['admin'],$u['id']]));
    if ($method==='POST' && $path==='/galleries') {user(true);$b=body();$id=uid();query('INSERT INTO galleries VALUES(?,?,?,?)',[$id,text($b,'name',100,true),text($b,'description',1000),stamp()]);send(['id'=>$id]);}
    if (preg_match('~^/galleries/([a-f0-9]{32})/photos$~D',$path,$m)) {
        $g=$m[1];[$u,$a]=access($g,$method==='POST'?'upload':null);
        if ($method==='GET') {
            $provenance=$u['admin']&&one('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=\'lychee_import_items\'')?',(SELECT source_metadata FROM lychee_import_items i WHERE i.target_photo_id=p.id AND i.status=\'imported\' ORDER BY i.id LIMIT 1) _import_metadata':'';
            $ps=rows('SELECT p.*,u.name uploader_name,EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id=p.id AND f.user_id=?) favorite'.$provenance.' FROM photos p JOIN users u ON p.uploader=u.id WHERE gallery_id=? ORDER BY COALESCE(NULLIF(taken,\'\'),uploaded) DESC',[$u['id'],$g]);
            foreach($ps as &$p) {
                if(!empty($p['_import_metadata'])){
                    $source=json_decode($p['_import_metadata'],true);
                    if(is_array($source))$p['import_source']=['version'=>'6.6.12','owner_name'=>(string)($source['_owner_username']??''),'description'=>(string)($source['description']??''),'tags'=>(string)($source['tags']??''),'created_at'=>(string)($source['created_at']??''),'taken_at'=>(string)($source['taken_at']??''),'taken_at_orig_tz'=>(string)($source['taken_at_orig_tz']??''),'source_photo_id'=>(string)($source['id']??'')];
                }
                unset($p['digest'],$p['filename'],$p['_import_metadata']);foreach(['lat','lon'] as $key) $p[$key]=($u['admin'] || $a['gps']) && $p[$key]!==null?(float)$p[$key]:null;
            }
            unset($p);send(['photos'=>$ps,'permissions'=>['upload'=>(bool)($u['admin']||$a['upload']),'download'=>(bool)($u['admin']||$a['download']),'gps'=>(bool)($u['admin']||$a['gps']),'video'=>(bool)($u['admin']||$a['download']&&$a['gps'])]]);
        }
        if ($method==='POST') {
            $f=upload_file(25*1024*1024);$tmp=$f['tmp_name'];$info=@getimagesize($tmp);
            if (!$info || !in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP],true)) fail(400,'Brug JPEG, PNG eller WebP');
            // Bound decoding memory for ordinary shared hosting.
            $pixels=$info[0]*$info[1];$limit=ini_get('memory_limit');$bytes=(int)$limit;
            if (str_ends_with(strtolower($limit),'g')) $bytes*=1073741824;elseif(str_ends_with(strtolower($limit),'m'))$bytes*=1048576;elseif(str_ends_with(strtolower($limit),'k'))$bytes*=1024;
            if ($pixels>20000000 || ($bytes>0 && $pixels*9+memory_get_usage(true)+32*1024*1024>$bytes)) fail(413,'Billedet er for stort til webhotellets billedbehandling');
            $digest=hash_file('sha256',$tmp);if(one('SELECT id FROM photos WHERE gallery_id=? AND digest=?',[$g,$digest]))fail(409,'Billedet findes allerede');
            $id=uid();$taken='';$lat=$lon=null;$ex=[];
            if ($info[2]===IMAGETYPE_JPEG && function_exists('exif_read_data')) $ex=@exif_read_data($tmp,'ANY_TAG',true)?:[];
            $dt=$ex['EXIF']['DateTimeOriginal']??'';$date=DateTimeImmutable::createFromFormat('!Y:m:d H:i:s',$dt);
            if($date && $date->format('Y:m:d H:i:s')===$dt)$taken=$date->format('Y-m-d\TH:i:s');
            try {$gps=$ex['GPS']??[];if(isset($gps['GPSLatitude'],$gps['GPSLongitude'])){$lat=gps_coordinate($gps['GPSLatitude'])*(($gps['GPSLatitudeRef']??'N')==='S'?-1:1);$lon=gps_coordinate($gps['GPSLongitude'])*(($gps['GPSLongitudeRef']??'E')==='W'?-1:1);if(!is_finite($lat)||!is_finite($lon)||abs($lat)>90||abs($lon)>180)$lat=$lon=null;}}catch(Throwable){$lat=$lon=null;}
            $paths=[image_path($id,'original'),image_path($id,'view'),image_path($id,'thumb')];
            try {
                $im=match($info[2]) {IMAGETYPE_JPEG=>@imagecreatefromjpeg($tmp),IMAGETYPE_PNG=>@imagecreatefrompng($tmp),IMAGETYPE_WEBP=>@imagecreatefromwebp($tmp)};
                if(!$im)fail(400,'Billedet kunne ikke læses');$im=orient_image($im,(int)($ex['IFD0']['Orientation']??1));
                resize_image($im,1800,$paths[1],88);resize_image($im,600,$paths[2],80);
                if(!move_uploaded_file($tmp,$paths[0]))throw new RuntimeException('Kunne ikke gemme original');chmod($paths[0],0600);
                $filename=basename(str_replace('\\','/',(string)$f['name']));$filename=preg_replace('/[\x00-\x1f\x7f]/u','',$filename)?:'foto';$filename=mb_substr($filename,0,200);
                query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$g,pathinfo($filename,PATHINFO_FILENAME),$filename,$info['mime'],$u['id'],stamp(),$taken,$taken?'exact':'unknown','',$lat,$lon,$digest]);
            } catch(Throwable $e) {foreach($paths as $p)if(is_file($p))unlink($p);if($e instanceof PDOException && $e->getCode()==='23000')fail(409,'Billedet findes allerede');throw $e;}
            send(['id'=>$id]);
        }
    }
    if (in_array($method,['GET','HEAD'],true) && preg_match('~^/photos/([a-f0-9]{32})/video$~D',$path,$m)) {
        $p=photo($m[1],'download');access($p['gallery_id'],'gps');stream_video($p,$method==='HEAD');
    }
    if ($method==='GET' && preg_match('~^/photos/([a-f0-9]{32})/image$~D',$path,$m)) {
        $size=$_GET['size']??'thumb';if(!in_array($size,['thumb','view','original'],true))fail(400,'Ugyldig størrelse');
        $p=photo($m[1],$size==='original'?'download':null);if($size==='original')access($p['gallery_id'],'gps');$file=image_path($p['id'],$size);
        if(!is_file($file))fail(404,'Billedfilen mangler');
        header('Content-Type: '.($size==='original'?$p['mime']:'image/jpeg'));header('Content-Length: '.filesize($file));
        if($size==='original')header("Content-Disposition: attachment; filename=\"foto\"; filename*=UTF-8''".rawurlencode($p['filename']));
        session_write_close();readfile($file);exit;
    }
    if ($method==='PATCH' && preg_match('~^/photos/([a-f0-9]{32})$~D',$path,$m)) {
        user(true);photo($m[1]);$b=body();$taken=text($b,'taken',32);$precision=text($b,'precision',16,true);validate_date($taken,$precision);
        $lat=$b['lat']??null;$lon=$b['lon']??null;
        if(($lat===null)!==($lon===null) || $lat!==null && (!is_numeric($lat)||!is_numeric($lon)||!is_finite((float)$lat)||!is_finite((float)$lon)||abs((float)$lat)>90||abs((float)$lon)>180))fail(400,'Ugyldige koordinater');
        query('UPDATE photos SET title=?,taken=?,`precision`=?,place=?,lat=?,lon=? WHERE id=?',[text($b,'title',200,true),$taken,$precision,text($b,'place',200),$lat,$lon,$m[1]]);send(['ok'=>true]);
    }
    if($method==='POST' && preg_match('~^/photos/([a-f0-9]{32})/favorite$~D',$path,$m)) {
        photo($m[1]);if(one('SELECT 1 FROM favorites WHERE photo_id=? AND user_id=?',[$m[1],$u['id']]))query('DELETE FROM favorites WHERE photo_id=? AND user_id=?',[$m[1],$u['id']]);
        else query('INSERT INTO favorites VALUES(?,?)',[$m[1],$u['id']]);send(['ok'=>true]);
    }
    if($method==='GET' && $path==='/theme') {$t=one('SELECT value FROM settings WHERE `key`=\'theme\'');send($t?json_decode($t['value'],true):default_theme());}
    if(str_starts_with($path,'/admin/'))user(true);
    if($method==='GET' && $path==='/admin/users')send(['users'=>array_map('safe_user',rows('SELECT * FROM users')),'grants'=>rows('SELECT * FROM grants')]);
    if($method==='PUT' && $path==='/admin/grants') {
        $b=body();$g=text($b,'gallery_id',32,true);$id=text($b,'user_id',32,true);
        if(!one('SELECT id FROM galleries WHERE id=?',[$g]) || !one('SELECT id FROM users WHERE id=?',[$id]))fail(404,'Galleri eller bruger findes ikke');
        if($b['view']??false)query('INSERT INTO grants VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE upload=VALUES(upload),download=VALUES(download),gps=VALUES(gps)',[$g,$id,(int)!empty($b['upload']),(int)!empty($b['download']),(int)!empty($b['gps'])]);
        else query('DELETE FROM grants WHERE gallery_id=? AND user_id=?',[$g,$id]);send(['ok'=>true]);
    }
    if($method==='POST' && $path==='/admin/invitations') {
        $b=body();$g=text($b,'gallery_id',32,true);if(!one('SELECT id FROM galleries WHERE id=?',[$g]))fail(404,'Vælg et galleri');$token=bin2hex(random_bytes(32));
        query('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?)',[hash('sha256',$token),email($b),text($b,'name',100,true),$g,(int)!empty($b['upload']),(int)!empty($b['download']),(int)!empty($b['gps']),time()+604800]);send(['path'=>$base.'/?invite='.$token,'expires_days'=>7]);
    }
    if($method==='GET' && $path==='/admin/themes') {$ts=[['id'=>'default','theme'=>default_theme()]];foreach(rows('SELECT * FROM themes') as $t)$ts[]=['id'=>$t['id'],'theme'=>json_decode($t['document'],true)];send($ts);}
    if($method==='POST' && $path==='/admin/themes') {
        $f=upload_file(256000);$raw=file_get_contents($f['tmp_name']);
        if(str_ends_with(strtolower($f['name']),'.zip')) {
            if(!class_exists('ZipArchive'))fail(400,'ZIP er ikke aktiveret på webhotellet. Brug JSON');
            $z=new ZipArchive();if($z->open($f['tmp_name'])!==true)fail(400,'Ugyldig ZIP');
            try {if($z->numFiles!==1 || $z->getNameIndex(0)!=='theme.json' || ($z->statIndex(0)['size']??17000)>16000)fail(400,'ZIP skal kun indeholde theme.json, højst 16 KB');$raw=$z->getFromIndex(0,16001);if($raw===false)fail(400,'ZIP kunne ikke læses');}finally{$z->close();}
        }
        try{$t=validate_theme(json_decode($raw,true,16,JSON_THROW_ON_ERROR));}catch(JsonException){fail(400,'Ugyldig designpakke');}
        $id=uid();query('INSERT INTO themes VALUES(?,?)',[$id,json_encode($t,JSON_UNESCAPED_UNICODE)]);send(['id'=>$id,'theme'=>$t]);
    }
    if($method==='POST' && preg_match('~^/admin/themes/(default|[a-f0-9]{32})/activate$~D',$path,$m)) {
        $t=$m[1]==='default'?json_encode(default_theme()):(one('SELECT document FROM themes WHERE id=?',[$m[1]])['document']??null);if(!$t)fail(404,'Tema findes ikke');
        query('INSERT INTO settings(`key`,value) VALUES(\'theme\',?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[$t]);send(['ok'=>true]);
    }
    fail(404,'Ikke fundet');
}

// Bootstrap: private configuration, session files and photos never live in public_html.
try {
    $config=require $private.'/config/config.php';
    foreach (['pdo_mysql','gd','exif','mbstring','openssl'] as $extension) if(!extension_loaded($extension)) fail(503,'PHP-udvidelsen '.$extension.' skal aktiveres på webhotellet');
    if(!is_file($private.'/security.php'))fail(503,'Sikkerhedsmodulet mangler. Installér security.php fra samme kodeversion i den private mappe');
    require_once $private.'/security.php';
    $base=rtrim($config['base_path']??'/lexgalleri','/');
    if($base!=='' && !preg_match('~^(/[a-zA-Z0-9_-]+)+$~D',$base))throw new RuntimeException('Ugyldig base_path');
    umask(0077);
    foreach(['sessions','originals','previews','thumbnails'] as $folder) {
        if(!is_dir($private.'/'.$folder) && !mkdir($private.'/'.$folder,0700,true))throw new RuntimeException('Privat mappe kan ikke oprettes');
    }
    header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');header('X-Frame-Options: DENY');header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    $uri=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
    if(!is_string($uri) || ($uri!==$base && !str_starts_with($uri,$base.'/')))fail(404,'Ikke fundet');
    $path=substr($uri,strlen($base));
    if($path==='' || $path==='/') {
        header('Content-Type: text/html; charset=utf-8');$asset=htmlspecialchars($base,ENT_QUOTES,'UTF-8');
        echo '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#416c57"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="LexGalleri"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>LexGalleri · Vores fælles minder</title><link rel="manifest" href="'.$asset.'/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="'.$asset.'/static/icon.svg"><link rel="apple-touch-icon" sizes="180x180" href="'.$asset.'/static/apple-touch-icon.png"><link rel="stylesheet" href="'.$asset.'/static/style.css?v=20261028-accounts"><script src="'.$asset.'/static/qrcode.js?v=2.0.4" defer></script><script src="'.$asset.'/static/app.js?v=20261028-accounts" defer></script><script src="'.$asset.'/static/pwa.js?v=20261028-accounts" defer></script></head><body><div id="app"></div><dialog id="modal"></dialog><div id="toast" role="status"></div></body></html>';exit;
    }
    if(!str_starts_with($path,'/api/'))fail(404,'Ikke fundet');
    if((int)($_SERVER['CONTENT_LENGTH']??0)>26*1024*1024)fail(413,'Upload er for stor');
    if(!in_array($method,['GET','HEAD','OPTIONS'],true)) {
        if(($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')fail(403,'Ugyldig forespørgsel');
        // Require an exact same-origin Origin on browser writes (scheme, host and port).
        $origin=$_SERVER['HTTP_ORIGIN']??'';
        $expected=(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off'?'https':'http').'://'.($_SERVER['HTTP_HOST']??'');
        if($origin==='' || !hash_equals($expected,$origin))fail(403,'Ugyldig eller manglende origin');
    }
    session_name('lexgalleri');session_save_path($private.'/sessions');ini_set('session.use_strict_mode','1');ini_set('session.gc_maxlifetime','604800');
    session_set_cookie_params(['lifetime'=>604800,'path'=>$base?:'/','secure'=>(bool)$config['secure_cookies'],'httponly'=>true,'samesite'=>'Strict']);session_start();
    $db=new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    $db->exec("SET time_zone='+00:00'");
    route($method,substr($path,4));
} catch(ApiError $e) {if(isset($db) && $db->inTransaction())$db->rollBack();send(['detail'=>$e->getMessage()],$e->status);}
catch(Throwable $e) {if(isset($db) && $db->inTransaction())$db->rollBack();error_log('LexGalleri: '.$e->getMessage());send(['detail'=>'Serverfejl. Kontrollér installationen og webhotellets private fejllog.'],500);}
