<?php
declare(strict_types=1);

// Owner-installed module for the exact Lychee6.6.12 schema. Never connects to any
// server on behalf of ChatGPT: the signed-in owner runs it in their own PHP app.
final class LycheeCommitUncertain extends RuntimeException {}
function lychee_config(): ?array {
    global $private;
    $path=$private.'/config/lychee-import.php';
    if(!is_file($path))return null;
    $c=require $path;
    if(!is_array($c) || ($c['enabled']??false)!==true)return null;
    if(($c['expected_version']??'')!=='6.6.12')fail(400,'Denne importør kræver Lychee6.6.12');
    if(!is_string($c['table_prefix']??null) || !preg_match('/^[A-Za-z0-9_]*$/D',$c['table_prefix']))fail(400,'Ugyldigt tabelpræfiks i importkonfigurationen');
    foreach(['db_host','db_name','db_user','db_password','uploads_root'] as $k)if(!isset($c[$k])||!is_string($c[$k]))fail(400,'Importkonfigurationen mangler et felt');
    $root=realpath($c['uploads_root']);
    if(!$root || !is_dir($root)||!is_readable($root))fail(400,'Lychees billedrod kan ikke læses af PHP');
    $root=rtrim($root,DIRECTORY_SEPARATOR);$target=realpath($private);
    if($root===''||preg_match('/^[A-Za-z]:$/D',$root)||!$target||$root===$target||str_starts_with($root,$target.DIRECTORY_SEPARATOR)||str_starts_with($target,$root.DIRECTORY_SEPARATOR))fail(400,'Lychees billedrod skal være en særskilt mappe uden for LexGalleris private mappe');
    $c['uploads_root']=$root;
    // Identity never includes the source password and is never sent to guests.
    $c['source_key']=hash('sha256',json_encode([$c['db_host'],(int)($c['db_port']??3306),$c['db_name'],$c['table_prefix'],$c['uploads_root']]));
    return $c;
}
function lychee_migration_ready(): bool {
    foreach(['lychee_import_jobs','lychee_import_albums','lychee_import_items'] as $table)
        if(!one('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[$table]))return false;
    return true;
}
function lychee_json(array $data): string {return json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);}
function lychee_table(array $c,string $name): string {return '`'.$c['table_prefix'].$name.'`';}
function lychee_source(array $c): PDO {
    try {
        $source=new PDO('mysql:host='.$c['db_host'].';port='.(int)($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
        // SET configures this connection only; every data operation on Lychee is SELECT.
        $source->exec("SET time_zone='+00:00'");
        $s=$source->prepare('SELECT value FROM '.lychee_table($c,'configs').' WHERE `key`=?');$s->execute(['version']);
        if((string)$s->fetchColumn()!=='060612')fail(400,'Kildens databaseversion er ikke Lychee6.6.12. Ingen opgradering udføres');
        return $source;
    } catch(ApiError $e){throw $e;}catch(PDOException){fail(400,'Lychee-databasen kan ikke læses. Kontrollér den private importkonfiguration og SELECT-rettigheden');}
}
function lychee_query(PDO $source,string $sql,array $args=[]): PDOStatement {$s=$source->prepare($sql);$s->execute($args);return $s;}
function lychee_owner_name(mixed $name): string {
    $name=is_string($name)?$name:'';
    // Older Lychee installations can retain a password hash as the admin username.
    return preg_match('/^\$(?:2[abxy]\$|argon2(?:id|i)\$)/D',$name)?'Admin (Lychee)':$name;
}
function lychee_photo_columns(PDO $source,array $c): string {
    $allowed=['id','title','description','tags','owner_id','type','iso','aperture','make','model','lens','shutter','focal','latitude','longitude','altitude','img_direction','location','taken_at','taken_at_orig_tz','initial_taken_at','initial_taken_at_orig_tz','is_starred','live_photo_short_path','live_photo_content_id','live_photo_checksum','checksum','original_checksum','created_at','updated_at','filesize'];
    $available=lychee_query($source,'SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[$c['table_prefix'].'photos'])->fetchAll(PDO::FETCH_COLUMN);
    $fields=array_values(array_intersect($allowed,$available));
    foreach(['id','title','owner_id','type','checksum','original_checksum'] as $required)if(!in_array($required,$fields,true))fail(400,'Lychees billedtabel svarer ikke til det understøttede skema');
    return implode(',',array_map(fn($field)=>'p.`'.$field.'`',$fields));
}
function lychee_status(?array $c,bool $ready): array {
    $out=['configured'=>$c!==null,'migration_needed'=>!$ready,'source_version'=>'6.6.12','job'=>null];
    if(!$c||!$ready)return $out;
    $job=one('SELECT * FROM lychee_import_jobs WHERE source_key=?',[$c['source_key']]);if(!$job)return $out;
    $totals=['albums'=>(int)query('SELECT COUNT(*) FROM lychee_import_albums WHERE job_id=?',[$job['id']])->fetchColumn(),'photos'=>0,'pending'=>0,'imported'=>0,'duplicate'=>0,'unsupported'=>0,'missing'=>0,'error'=>0];
    foreach(rows('SELECT status,COUNT(*) n FROM lychee_import_items WHERE job_id=? GROUP BY status',[$job['id']]) as $r){$totals['photos']+=(int)$r['n'];if(isset($totals[$r['status']]))$totals[$r['status']]=(int)$r['n'];}
    $preview=rows('SELECT a.source_id,a.path title,COUNT(i.id) count FROM lychee_import_albums a LEFT JOIN lychee_import_items i ON i.job_id=a.job_id AND i.source_album_id=a.source_id WHERE a.job_id=? GROUP BY a.source_id,a.path ORDER BY a.path LIMIT 100',[$job['id']]);
    foreach($preview as &$row)$row['count']=(int)$row['count'];unset($row);
    $issues=rows('SELECT source_photo_id,source_album_id,status,error,source_metadata FROM lychee_import_items WHERE job_id=? AND status IN (\'error\',\'missing\',\'unsupported\') ORDER BY id LIMIT 50',[$job['id']]);
    foreach($issues as &$issue){$metadata=json_decode($issue['source_metadata'],true);$issue['title']=(string)($metadata['title']??'');unset($issue['source_metadata']);}unset($issue);
    $out['job']=['id'=>$job['id'],'state'=>$job['state'],'source_photos'=>(int)$job['source_photo_count'],'totals'=>$totals,'preview'=>$preview,'preview_limit'=>100,'issues'=>$issues];
    return $out;
}
function lychee_safe_path(array $c,array $metadata): array {
    if(($metadata['_storage_disk']??'')!=='images')return ['unsupported','Originalen ligger ikke på Lychees lokale images-disk',null];
    if((int)($metadata['_variant_count']??0)!==1)return ['error','Originalvarianten mangler eller er tvetydig',null];
    $short=$metadata['_short_path']??'';
    if(!is_string($short)||$short===''||strlen($short)>2000||str_contains($short,"\0")||str_contains($short,'\\')||str_starts_with($short,'/')||preg_match('~(^|/)\.{1,2}(/|$)|:~',$short))return ['error','Ugyldig originalsti',null];
    $path=realpath($c['uploads_root'].'/'.$short);
    if(!$path||!is_file($path)||!is_readable($path))return ['missing','Originalfilen mangler eller kan ikke læses',null];
    if(!str_starts_with($path,$c['uploads_root'].DIRECTORY_SEPARATOR))return ['error','Originalstien eller et symlink forlader den tilladte billedrod',null];
    if(!in_array($metadata['type']??'',['image/jpeg','image/png','image/webp'],true))return ['unsupported','Formatet understøttes endnu ikke (kun JPEG/PNG/WebP)',null];
    return ['pending','',$path];
}
function lychee_album_paths(array $albums): array {
    $paths=[];
    foreach($albums as $id=>$a){
        $parts=[];$seen=[];$cursor=$id;
        while($cursor!==null && $cursor!==''){
            if(isset($seen[$cursor])||count($seen)>100)fail(400,'Lychees albumtræ indeholder en cyklus eller er for dybt');
            $seen[$cursor]=true;if(!isset($albums[$cursor]))fail(400,'Lychees albumtræ henviser til et manglende album');
            array_unshift($parts,trim((string)$albums[$cursor]['title'])?:'Uden titel');$cursor=$albums[$cursor]['parent_id'];
        }
        $paths[$id]='Lychee / '.implode(' / ',$parts);
    }
    return $paths;
}
function lychee_scan(array $c,array $u): void {
    $source=lychee_source($c);
    $old=one('SELECT * FROM lychee_import_jobs WHERE source_key=?',[$c['source_key']]);
    if($old && in_array($old['state'],['scanning','running','paused'],true))fail(409,'Fortsæt eller afslut den igangværende import før en ny scanning');
    $count=(int)lychee_query($source,'SELECT COUNT(*) FROM '.lychee_table($c,'albums'))->fetchColumn();
    if($count>10000)fail(400,'Denne importør understøtter højst10.000 albummer pr. kilde');
    $sql='SELECT b.id,b.title,b.description,b.owner_id,b.created_at,b.updated_at,a.parent_id,u.username owner_username FROM '.lychee_table($c,'albums').' a JOIN '.lychee_table($c,'base_albums').' b ON a.id=b.id LEFT JOIN '.lychee_table($c,'users').' u ON b.owner_id=u.id ORDER BY b.id';
    $albums=[];foreach(lychee_query($source,$sql) as $a){$a['owner_username']=lychee_owner_name($a['owner_username']);$albums[(string)$a['id']]=$a;}
    $paths=lychee_album_paths($albums);$id=$old['id']??uid();
    global $db;$db->beginTransaction();
    if(!$old)query('INSERT INTO lychee_import_jobs VALUES(?,?,?,?,?,?,?,?,?)',[$id,$c['source_key'],'6.6.12','scanning','',(int)lychee_query($source,'SELECT COUNT(*) FROM '.lychee_table($c,'photos'))->fetchColumn(),$u['id'],stamp(),stamp()]);
    else query('UPDATE lychee_import_jobs SET state=\'scanning\',cursor_photo=\'\',source_photo_count=?,updated=? WHERE id=?',[(int)lychee_query($source,'SELECT COUNT(*) FROM '.lychee_table($c,'photos'))->fetchColumn(),stamp(),$id]);
    // Retain completed receipts on later scans; never delete target galleries or photos.
    query('DELETE FROM lychee_import_items WHERE job_id=? AND status NOT IN (\'imported\',\'duplicate\')',[$id]);
    foreach($albums as $sid=>$a)query('INSERT INTO lychee_import_albums(job_id,source_id,parent_id,title,description,path,source_metadata) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),title=VALUES(title),description=VALUES(description),path=VALUES(path),source_metadata=VALUES(source_metadata)',[$id,$sid,$a['parent_id'],$a['title']??'',$a['description']??'',$paths[$sid],lychee_json($a)]);
    $db->commit();
}
function lychee_scan_step(array $c,array $job): void {
    $source=lychee_source($c);$pt=lychee_table($c,'photos');$vt=lychee_table($c,'size_variants');$ut=lychee_table($c,'users');
    $columns=lychee_photo_columns($source,$c);
    $sql="SELECT $columns,u.username _owner_username,(SELECT COUNT(*) FROM $vt v WHERE v.photo_id=p.id AND v.type=0) _variant_count,(SELECT short_path FROM $vt v WHERE v.photo_id=p.id AND v.type=0 ORDER BY id LIMIT 1) _short_path,(SELECT storage_disk FROM $vt v WHERE v.photo_id=p.id AND v.type=0 ORDER BY id LIMIT 1) _storage_disk FROM $pt p LEFT JOIN $ut u ON p.owner_id=u.id WHERE p.id>? ORDER BY p.id LIMIT 50";
    $batch=lychee_query($source,$sql,[$job['cursor_photo']])->fetchAll();
    foreach($batch as $p){
        $p['_owner_username']=lychee_owner_name($p['_owner_username']);
        $sid=(string)$p['id'];$members=lychee_query($source,'SELECT album_id FROM '.lychee_table($c,'photo_album').' WHERE photo_id=? ORDER BY album_id',[$sid])->fetchAll(PDO::FETCH_COLUMN);
        if(!$members){$members=[''];query('INSERT IGNORE INTO lychee_import_albums(job_id,source_id,parent_id,title,description,path,source_metadata) VALUES(?,\'\',NULL,\'Ikke sorteret\',\'\',\'Lychee / Ikke sorteret\',\'{}\')',[$job['id']]);}
        [$status,$error]=lychee_safe_path($c,$p);
        foreach($members as $album){
            $rowStatus=$status;$rowError=$error;
            if(!one('SELECT source_id FROM lychee_import_albums WHERE job_id=? AND source_id=?',[$job['id'],$album])){$rowStatus='error';$rowError='Billedet henviser til et manglende almindeligt album';}
            query('INSERT INTO lychee_import_items(job_id,source_photo_id,source_album_id,status,source_metadata,error,updated) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE source_metadata=IF(status IN (\'imported\',\'duplicate\'),source_metadata,VALUES(source_metadata)),status=IF(status IN (\'imported\',\'duplicate\'),status,VALUES(status)),error=IF(status IN (\'imported\',\'duplicate\'),error,VALUES(error)),updated=VALUES(updated)',[$job['id'],$sid,$album,$rowStatus,lychee_json($p),$rowError,stamp()]);
        }
        query('UPDATE lychee_import_jobs SET cursor_photo=?,updated=? WHERE id=?',[$sid,stamp(),$job['id']]);
    }
    if(count($batch)<50)query('UPDATE lychee_import_jobs SET state=\'preview\',updated=? WHERE id=?',[stamp(),$job['id']]);
}
function lychee_target_gallery(array $job,array $album): string {
    if($album['target_gallery_id'])return $album['target_gallery_id'];
    $id=uid();$name=$album['path'];if(mb_strlen($name)>100)$name=mb_substr($name,0,88).' …'.substr(hash('sha256',$album['source_id']),0,8);
    global $db;$db->beginTransaction();
    query('INSERT INTO galleries VALUES(?,?,?,?)',[$id,$name,mb_strcut($album['description'],0,60000,'UTF-8'),stamp()]);
    query('UPDATE lychee_import_albums SET target_gallery_id=? WHERE job_id=? AND source_id=?',[$id,$job['id'],$album['source_id']]);$db->commit();
    return $id;
}
function lychee_taken(array $p): string {
    $raw=$p['taken_at']??null;if(!is_string($raw)||$raw==='')return '';
    try{$d=new DateTimeImmutable($raw,new DateTimeZone('UTC'));if((int)$d->format('Y')<1)return '';if(!empty($p['taken_at_orig_tz']))$d=$d->setTimezone(new DateTimeZone($p['taken_at_orig_tz']));return $d->format('Y-m-d\TH:i:s');}
    catch(Throwable){return '';}
}
function lychee_copy_one(array $c,array $job,array $item,array $u): void {
    $p=json_decode($item['source_metadata'],true,512,JSON_THROW_ON_ERROR);
    [$status,$error,$source]=lychee_safe_path($c,$p);
    if($status!=='pending'){query('UPDATE lychee_import_items SET status=?,error=?,updated=? WHERE id=?',[$status,$error,stamp(),$item['id']]);return;}
    $album=one('SELECT * FROM lychee_import_albums WHERE job_id=? AND source_id=?',[$job['id'],$item['source_album_id']]);
    if(!$album)throw new RuntimeException('Album findes ikke i prøvevisningen');$gallery=lychee_target_gallery($job,$album);
    $id=$item['planned_photo_id']?:uid();
    if(!$item['planned_photo_id'])query('UPDATE lychee_import_items SET planned_photo_id=? WHERE id=?',[$id,$item['id']]);
    $paths=[image_path($id,'original'),image_path($id,'view'),image_path($id,'thumb')];
    if(one('SELECT id FROM photos WHERE id=?',[$id]))throw new RuntimeException('Den planlagte målfil er allerede registreret; kræver manuel kontrol');
    // Recover only this item's unregistered staged files after a killed PHP request.
    foreach($paths as $path)if(is_file($path))unlink($path);
    $commitAttempted=false;
    try {
        $before=stat($source);$in=@fopen($source,'rb');if(!$in)throw new RuntimeException('Originalen kunne ikke læses');
        try {
            $out=@fopen($paths[0],'xb');if(!$out)throw new RuntimeException('Originalen kunne ikke kopieres');
            try {$bytes=stream_copy_to_stream($in,$out,25*1024*1024+1);}finally{fclose($out);}
        }finally{fclose($in);}
        if($bytes===false||$bytes>25*1024*1024)throw new RuntimeException('Originalen overstiger25MB');
        chmod($paths[0],0600);clearstatcache(true,$source);$after=stat($source);
        if($before['size']!==$bytes||$before['size']!==$after['size']||$before['mtime']!==$after['mtime'])throw new RuntimeException('Originalfilen blev ændret under kopieringen; prøv igen efter en ny scanning');
        // keep_original_untouched may restore an unrotated backup AFTER Lychee
        // calculates checksum. Either recorded SHA1 can therefore identify ORIGINAL.
        $p['_copied_sha1']=sha1_file($paths[0]);$p['_verified_sha1_fields']=[];
        foreach(['checksum','original_checksum'] as $field)if(is_string($p[$field]??null)&&preg_match('/^[a-f0-9]{40}$/iD',$p[$field])&&hash_equals(strtolower($p[$field]),$p['_copied_sha1']))$p['_verified_sha1_fields'][]=$field;
        if(!$p['_verified_sha1_fields'])throw new RuntimeException('Ingen af Lychees kontrolsummer matcher originalen');
        $digest=hash_file('sha256',$paths[0]);
        $existing=one('SELECT id FROM photos WHERE gallery_id=? AND digest=?',[$gallery,$digest]);
        if($existing){unlink($paths[0]);query('UPDATE lychee_import_items SET status=\'duplicate\',target_photo_id=?,source_metadata=?,error=\'\',updated=? WHERE id=?',[$existing['id'],lychee_json($p),stamp(),$item['id']]);return;}
        $info=@getimagesize($paths[0]);if(!$info||!in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP],true))throw new RuntimeException('Originalen kunne ikke læses som JPEG/PNG/WebP');
        $pixels=$info[0]*$info[1];$setting=strtolower(ini_get('memory_limit'));$limit=(int)$setting;
        if(str_ends_with($setting,'g'))$limit*=1073741824;elseif(str_ends_with($setting,'m'))$limit*=1048576;elseif(str_ends_with($setting,'k'))$limit*=1024;
        if($pixels>20000000||$limit>0&&$pixels*9+memory_get_usage(true)+32*1024*1024>$limit)throw new RuntimeException('Originalen er for stor til webhotellets billedbehandling');
        $im=match($info[2]){IMAGETYPE_JPEG=>@imagecreatefromjpeg($paths[0]),IMAGETYPE_PNG=>@imagecreatefrompng($paths[0]),IMAGETYPE_WEBP=>@imagecreatefromwebp($paths[0])};
        if(!$im)throw new RuntimeException('Originalen kunne ikke afkodes');
        $ex=$info[2]===IMAGETYPE_JPEG?(@exif_read_data($paths[0],'IFD0',true)?:[]):[];$im=orient_image($im,(int)($ex['IFD0']['Orientation']??1));
        resize_image($im,1800,$paths[1],88);resize_image($im,600,$paths[2],80);unset($im);
        $taken=lychee_taken($p);$lat=$p['latitude']??null;$lon=$p['longitude']??null;
        if(!is_numeric($lat)||!is_numeric($lon)||!is_finite((float)$lat)||!is_finite((float)$lon)||abs((float)$lat)>90||abs((float)$lon)>180)$lat=$lon=null;
        $filename=basename((string)$p['_short_path']);$title=mb_substr(trim((string)($p['title']??''))?:pathinfo($filename,PATHINFO_FILENAME),0,200);
        // Target uploader is the real importing admin; source owner and original
        // created_at are kept in provenance. Do not claim owner==original uploader.
        global $db;$db->beginTransaction();
        query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$gallery,$title,mb_substr($filename,0,255),$info['mime'],$u['id'],stamp(),$taken,$taken?'exact':'unknown',mb_substr((string)($p['location']??''),0,200),$lat,$lon,$digest]);
        query('UPDATE lychee_import_items SET status=\'imported\',target_photo_id=?,source_metadata=?,error=\'\',updated=? WHERE id=?',[$id,lychee_json($p),stamp(),$item['id']]);$commitAttempted=true;$db->commit();
    } catch(Throwable $e){
        // A lost COMMIT acknowledgement does not prove rollback. Keep the files
        // and receipt unchanged until a fresh request observes the database.
        // Committed items are skipped; rolled-back items clean their planned files.
        if($commitAttempted)throw new LycheeCommitUncertain('Databasens bekræftelse mangler',0,$e);
        global $db;try{if($db->inTransaction())$db->rollBack();}finally{foreach($paths as $path)if(is_file($path))unlink($path);}throw $e;
    }
}
function lychee_step(array $c,array $job,array $u): void {
    if($job['state']==='scanning'){lychee_scan_step($c,$job);return;}
    if($job['state']!=='running')fail(409,'Importen kører ikke');
    // Preserve empty albums too; bounded batches avoid long webhotel requests.
    $albums=rows('SELECT * FROM lychee_import_albums WHERE job_id=? AND target_gallery_id IS NULL ORDER BY source_id LIMIT 20',[$job['id']]);
    foreach($albums as $album)lychee_target_gallery($job,$album);
    if(count($albums)===20)return;
    foreach(rows('SELECT * FROM lychee_import_items WHERE job_id=? AND status=\'pending\' ORDER BY id LIMIT 2',[$job['id']]) as $item){
        try{lychee_copy_one($c,$job,$item,$u);}catch(LycheeCommitUncertain){fail(503,'Databasens bekræftelse mangler. Opdatér importstatus før du fortsætter');}catch(Throwable $e){
            // Error text is intentionally generic to avoid exposing server paths,
            // SQL details or private config. Full source metadata stays in MySQL.
            $message=$e instanceof RuntimeException && !$e instanceof PDOException?$e->getMessage():'Billedet kunne ikke importeres';
            query('UPDATE lychee_import_items SET status=\'error\',error=?,updated=? WHERE id=?',[mb_substr($message,0,500),stamp(),$item['id']]);
        }
    }
    if(!query('SELECT 1 FROM lychee_import_items WHERE job_id=? AND status=\'pending\' LIMIT 1',[$job['id']])->fetchColumn())query('UPDATE lychee_import_jobs SET state=\'completed\',updated=? WHERE id=?',[stamp(),$job['id']]);
}
function lychee_route(string $method,string $action): never {
    $u=user(true);$c=lychee_config();$ready=lychee_migration_ready();
    if($method==='GET'&&$action==='')send(lychee_status($c,$ready));
    if(!$c)fail(409,'Installér og aktivér den private Lychee-importkonfiguration først');
    if(!$ready)fail(409,'Importér002_lychee_import.sql i LexGalleri-databasen via phpMyAdmin først');
    global $db;$lock='lex-lychee-'.substr($c['source_key'],0,40);
    if(!(int)query('SELECT GET_LOCK(?,0)',[$lock])->fetchColumn())fail(409,'En anden importanmodning arbejder; prøv igen om lidt');
    try {
        if($method==='POST'&&$action==='/scan'){body();lychee_scan($c,$u);}
        elseif($method==='POST'&&in_array($action,['/step','/start','/pause'],true)){
            $b=body();$job=one('SELECT * FROM lychee_import_jobs WHERE source_key=? AND id=?',[$c['source_key'],$b['job_id']??'']);if(!$job)fail(404,'Importjobbet findes ikke');
            if($action==='/start'){
                if(($b['confirm']??false)!==true||!in_array($job['state'],['preview','paused'],true))fail(409,'Prøvevisningen skal bekræftes før kopiering');
                query('UPDATE lychee_import_jobs SET state=\'running\',updated=? WHERE id=?',[stamp(),$job['id']]);
            }elseif($action==='/pause'){
                if($job['state']!=='running')fail(409,'Importen kører ikke');query('UPDATE lychee_import_jobs SET state=\'paused\',updated=? WHERE id=?',[stamp(),$job['id']]);
            }else lychee_step($c,$job,$u);
        }else fail(404,'Ukendt importhandling');
    } finally {query('SELECT RELEASE_LOCK(?)',[$lock]);}
    send(lychee_status($c,$ready));
}
