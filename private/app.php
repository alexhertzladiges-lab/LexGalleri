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
function safe_user(array $u): array { return ['id'=>$u['id'],'email'=>$u['email'],'phone'=>$u['phone']??null,'name'=>$u['name'],'admin'=>(int)$u['admin']]; }
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
    if(!$u['admin']) {
        if(!$a)fail(403,'Du har ikke adgang');
        if($permission==='edit'){if(!gallery_edit_allowed($g,$u,$a))fail(403,'Du har ikke adgang til at redigere dette galleri');}
        elseif($permission&&!$a[$permission])fail(403,'Du har ikke adgang');
    }
    return [$u,$a];
}
function gallery_permissions_ready(): bool {
    static $ready=null;if($ready!==null)return $ready;
    return $ready=(int)query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='gallery_editors' AND column_name IN ('gallery_id','user_id')) OR (table_name='invitation_galleries' AND column_name IN ('token','gallery_id','upload','edit_metadata','download','gps')))")->fetchColumn()===8;
}
// A partial upgrade must not issue a phone identity or a reusable invitation.
function reusable_invitations_ready(): bool {
    static $ready=null;if($ready!==null)return $ready;
    $columns=(int)query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='users' AND column_name='phone') OR (table_name='invitations' AND column_name IN ('phone','accepted_user_id')))")->fetchColumn();
    return $ready=$columns===3&&one("SELECT 1 FROM settings WHERE `key`='invitation_version' AND value='2'")!==null;
}
function phone(array $b): string {
    $value=text($b,'phone',30,true);
    if(!preg_match('/^(?:\+45|0045)?[0-9 ()-]+$/D',$value))fail(400,'Brug et dansk telefonnummer med 8 cifre, eventuelt med +45');
    $digits=preg_replace('/[ ()-]/','',$value);
    if(str_starts_with($digits,'+45'))$digits=substr($digits,3);
    elseif(str_starts_with($digits,'0045'))$digits=substr($digits,4);
    if(!preg_match('/^[2-9][0-9]{7}$/D',$digits))fail(400,'Brug et dansk telefonnummer med 8 cifre, eventuelt med +45');
    return '+45'.$digits;
}
function gallery_edit_allowed(string $gallery,array $u,?array $grant): bool {
    return (bool)$u['admin'] || $grant && gallery_permissions_ready() && one('SELECT 1 FROM gallery_editors WHERE gallery_id=? AND user_id=?',[$gallery,$u['id']])!==null;
}
function gallery_editor_set(string $gallery,string $user,bool $enabled): void {
    if(!gallery_permissions_ready())fail(503,'Installér 006_gallery_permissions.sql for at aktivere redigeringsrettigheder');
    if($enabled)query('INSERT IGNORE INTO gallery_editors(gallery_id,user_id) VALUES(?,?)',[$gallery,$user]);
    else query('DELETE FROM gallery_editors WHERE gallery_id=? AND user_id=?',[$gallery,$user]);
}
function gallery_owner_id(string $gallery): ?string {
    $saved=one('SELECT value FROM settings WHERE `key`=?',['gallery_owner_'.$gallery]);
    if(!$saved)return null;
    if(!preg_match('/^[a-f0-9]{32}$/D',$saved['value']))fail(503,'Galleriets ejer kunne ikke bekræftes');
    return $saved['value'];
}
function gallery_member_share_allowed(string $gallery,array $u,?array $grant=null): bool {
    if(!gallery_permissions_ready())return false;
    if($u['admin'])return true;
    $grant??=one('SELECT * FROM grants WHERE gallery_id=? AND user_id=?',[$gallery,$u['id']]);
    return gallery_owner_id($gallery)===$u['id']&&gallery_edit_allowed($gallery,$u,$grant);
}
function gallery_members(string $gallery): array {
    [$u,$grant]=access($gallery);
    if(!gallery_member_share_allowed($gallery,$u,$grant))fail(403,'Kun galleriets ejer eller admin kan dele med medlemmer');
    $search=text(['q'=>$_GET['q']??''],'q',100);
    $members=rows("SELECT u.id,u.name,EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=? AND a.user_id=u.id) has_access FROM users u WHERE u.admin=0 AND u.id<>? AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id)) AND (?='' OR LOCATE(?,u.name)>0) ORDER BY u.name,u.id LIMIT 101",[$gallery,$u['id'],$search,$search]);
    $more=count($members)>100;if($more)array_pop($members);
    foreach($members as &$member)$member['has_access']=(bool)$member['has_access'];unset($member);
    $ownerId=gallery_owner_id($gallery);
    $owner=$ownerId?one("SELECT u.id,u.name,u.admin FROM users u WHERE u.id=? AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id))",[$ownerId]):null;
    return ['members'=>$members,'has_more'=>$more,'owner_id'=>$ownerId,'owner'=>$owner,'can_assign_owner'=>(bool)$u['admin']];
}
function gallery_share_members(string $gallery,array $b): array {
    global $db;
    [$actor,$grant]=access($gallery);
    if(!gallery_member_share_allowed($gallery,$actor,$grant))fail(403,'Kun galleriets ejer eller admin kan dele med medlemmer');
    $ids=$b['user_ids']??null;
    if(array_keys($b)!==['user_ids']||!is_array($ids)||!array_is_list($ids)||count($ids)<1||count($ids)>50)fail(400,'Vælg mellem 1 og 50 eksisterende medlemmer');
    foreach($ids as $id)if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))fail(400,'Vælg kun eksisterende medlemmer');
    $ids=array_values(array_unique($ids));$locks=array_values(array_unique(array_merge($ids,[$actor['id']])));sort($locks,SORT_STRING);
    $db->beginTransaction();
    try{
        if(!one('SELECT id FROM galleries WHERE id=? FOR UPDATE',[$gallery]))fail(404,'Galleriet findes ikke');
        $people=rows("SELECT u.* FROM users u WHERE u.id IN (".implode(',',array_fill(0,count($locks),'?')).") AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id)) ORDER BY u.id FOR UPDATE",$locks);
        $people=array_column($people,null,'id');$fresh=$people[$actor['id']]??null;
        if(!$fresh)fail(401,'Log ind igen');lg_security_validate_session($fresh);
        if(!gallery_member_share_allowed($gallery,$fresh))fail(403,'Din adgang til at dele galleriet er ændret');
        foreach($ids as $id)if($id===$fresh['id']||!isset($people[$id])||$people[$id]['admin'])fail(409,'Valget indeholder et medlem, som ikke længere kan tilføjes. Opdatér listen');
        $added=0;
        foreach($ids as $id){
            if(one('SELECT 1 FROM grants WHERE gallery_id=? AND user_id=?',[$gallery,$id]))continue;
            query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,0,0,0)',[$gallery,$id]);$added++;
        }
        $db->commit();return ['ok'=>true,'added'=>$added,'already_had_access'=>count($ids)-$added];
    }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
}
function gallery_assign_owner(string $gallery,array $b): array {
    global $db;
    $actor=user(true);
    if(count($b)!==2||array_diff(array_keys($b),['user_id','expected_owner_id'])||!array_key_exists('user_id',$b)||!array_key_exists('expected_owner_id',$b))fail(400,'Angiv ejer og den nuværende ejer');
    foreach(['user_id','expected_owner_id'] as $key)if($b[$key]!==null&&(!is_string($b[$key])||!preg_match('/^[a-f0-9]{32}$/D',$b[$key])))fail(400,'Ugyldigt medlem');
    if(!gallery_permissions_ready())fail(503,'Galleriets redigeringsrettigheder er ikke klar');
    $ids=array_values(array_unique(array_filter([$actor['id'],$b['user_id']])));sort($ids,SORT_STRING);
    $db->beginTransaction();
    try{
        if(!one('SELECT id FROM galleries WHERE id=? FOR UPDATE',[$gallery]))fail(404,'Galleriet findes ikke');
        $people=rows("SELECT u.* FROM users u WHERE u.id IN (".implode(',',array_fill(0,count($ids),'?')).") AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id)) ORDER BY u.id FOR UPDATE",$ids);$people=array_column($people,null,'id');
        $fresh=$people[$actor['id']]??null;if(!$fresh)fail(401,'Log ind igen');lg_security_validate_session($fresh);if(!$fresh['admin'])fail(403,'Kun administrator');
        if(gallery_owner_id($gallery)!==$b['expected_owner_id'])fail(409,'Ejeren er ændret. Opdatér listen før du prøver igen');
        $id=$b['user_id'];
        if($id!==null){
            if(!isset($people[$id]))fail(409,'Medlemmet findes ikke længere');
            query('INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',['gallery_owner_'.$gallery,$id]);
            if(!$people[$id]['admin']){
                query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,1,1,1) ON DUPLICATE KEY UPDATE upload=1,download=1,gps=1',[$gallery,$id]);
                gallery_editor_set($gallery,$id,true);
            }
        }else query('DELETE FROM settings WHERE `key`=?',['gallery_owner_'.$gallery]);
        $db->commit();return ['ok'=>true,'owner_id'=>$id];
    }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
}
function gallery_permission_flag(array $b,string $key): bool {
    if(!array_key_exists($key,$b))return false;
    if(!in_array($b[$key],[true,false,0,1],true))fail(400,'Ugyldig rettighed: '.$key);
    return(bool)$b[$key];
}
function create_gallery_invitation(array $b): array {
    global $db,$base;
    $hasPhone=text($b,'phone',30)!=='';
    if($hasPhone&&text($b,'email',254)!=='')fail(400,'Vælg enten e-mail eller telefonnummer');
    if($hasPhone&&!reusable_invitations_ready())fail(503,'Installér 007_reusable_phone_invitations.sql for telefoninvitationer');
    $mail=$hasPhone?null:email($b);$number=$hasPhone?phone($b):null;$name=text($b,'name',100,true);$multi=array_key_exists('galleries',$b);
    if($multi&&!gallery_permissions_ready())fail(503,'Installér 006_gallery_permissions.sql for at invitere til flere gallerier');
    $input=$multi?$b['galleries']:[array_intersect_key($b,array_flip(['gallery_id','upload','edit','download','gps']))];
    if(!is_array($input)||!array_is_list($input)||count($input)<1||count($input)>100)fail(400,'Vælg mellem 1 og 100 gallerier');
    $selected=[];$seen=[];
    foreach($input as $item){
        if(!is_array($item)||array_diff(array_keys($item),['gallery_id','upload','edit','download','gps']))fail(400,'Ugyldige gallerirettigheder');
        $id=$item['gallery_id']??null;if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))fail(400,'Vælg et gyldigt galleri');
        if(isset($seen[$id]))fail(400,'Et galleri må kun vælges én gang');$seen[$id]=true;
        $gallery=one('SELECT id,name FROM galleries WHERE id=?',[$id]);if(!$gallery)fail(404,'Et af de valgte gallerier findes ikke');
        $choice=['gallery_id'=>$id,'name'=>$gallery['name']];foreach(['upload','edit','download','gps'] as $key)$choice[$key]=gallery_permission_flag($item,$key);
        if($choice['edit']&&!gallery_permissions_ready())fail(503,'Installér 006_gallery_permissions.sql for at aktivere redigeringsrettigheder');
        $selected[]=$choice;
    }
    $token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);$first=$selected[0];
    $db->beginTransaction();
    try{
        if(reusable_invitations_ready())query('INSERT INTO invitations(token,email,phone,name,gallery_id,upload,download,gps,expires) VALUES(?,?,?,?,?,?,?,?,?)',[$hash,$mail,$number,$name,$first['gallery_id'],(int)$first['upload'],(int)$first['download'],(int)$first['gps'],time()+604800]);
        else query('INSERT INTO invitations(token,email,name,gallery_id,upload,download,gps,expires) VALUES(?,?,?,?,?,?,?,?)',[$hash,$mail,$name,$first['gallery_id'],(int)$first['upload'],(int)$first['download'],(int)$first['gps'],time()+604800]);
        if(gallery_permissions_ready())foreach($selected as $choice)query('INSERT INTO invitation_galleries(token,gallery_id,upload,edit_metadata,download,gps) VALUES(?,?,?,?,?,?)',[$hash,$choice['gallery_id'],(int)$choice['upload'],(int)$choice['edit'],(int)$choice['download'],(int)$choice['gps']]);
        $db->commit();
    }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
    return ['path'=>$base.'/?invite='.$token,'expires_days'=>7,'reusable'=>reusable_invitations_ready(),'galleries'=>$selected];
}
function photo(string $id, ?string $permission=null): array {
    $p=one('SELECT * FROM photos WHERE id=?',[$id]); if (!$p) fail(404,'Foto findes ikke');
    access($p['gallery_id'],$permission); return $p;
}
function storage_limit(): int {
    $saved=one("SELECT value FROM settings WHERE `key`='storage_limit_bytes'");
    if(!$saved)return 25000000000;
    $raw=$saved['value'];if(!is_string($raw)||!preg_match('/^[1-9][0-9]{0,14}$/D',$raw)||(int)$raw>100000000000000)fail(503,'Pladsgrænsen er ugyldig. Kontrollér indstillingen');
    return (int)$raw;
}
function storage_set_limit(array $b): array {
    user(true);
    if(array_keys($b)!==['limit_gb'])fail(400,'Angiv kun pladsgrænsen i GB');
    $raw=$b['limit_gb'];if(!is_int($raw)&&!is_string($raw))fail(400,'Angiv GB som et tal, fx 25 eller 30,5');
    $raw=str_replace(',','.',trim((string)$raw));
    if(!preg_match('/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,3})?$/D',$raw))fail(400,'Angiv GB som et tal, fx 25 eller 30,5');
    $parts=explode('.',$raw);$bytes=(int)$parts[0]*1000000000+(int)str_pad($parts[1]??'',3,'0')*1000000;
    if($bytes<1000000||$bytes>100000000000000)fail(400,'Grænsen skal være mellem 0,001 og 100.000 GB');
    query("INSERT INTO settings(`key`,value) VALUES('storage_limit_bytes',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[(string)$bytes]);
    return ['ok'=>true,'limit_bytes'=>$bytes];
}
function storage_scan(): array {
    global $private;
    $galleries=[];foreach(rows('SELECT id,name FROM galleries ORDER BY name') as $g)$galleries[$g['id']]=['id'=>$g['id'],'name'=>$g['name'],'bytes'=>0,'media_count'=>0];
    $photos=[];$statement=query('SELECT id,gallery_id FROM photos');
    while($p=$statement->fetch()){if(isset($galleries[$p['gallery_id']])){$photos[$p['id']]=$p['gallery_id'];$galleries[$p['gallery_id']]['media_count']++;}}
    $inodes=[];$paths=0;$skipped=0;$changed=0;$visited=0;
    // Fixed media roots only. Never open config, sessions or another website.
    $walk=function(string $directory,int $depth=0)use(&$walk,&$inodes,&$paths,&$skipped,&$changed,&$visited,$photos):void{
        if($depth>8)fail(503,'Mediepladsen indeholder for mange mappeniveauer til én opgørelse');
        if(is_link($directory)){$skipped++;return;}
        if(!is_dir($directory))return;
        if(!is_readable($directory))fail(503,'En mediemappe kan ikke opgøres. Kontrollér læserettighederne');
        try{$entries=new DirectoryIterator($directory);}catch(UnexpectedValueException){fail(503,'En mediemappe kan ikke opgøres');}
        foreach($entries as $entry){
            if($entry->isDot())continue;
            if(++$visited>200000||memory_get_usage(true)>160*1024*1024)fail(503,'Mediearkivet er for stort til én samlet opgørelse på denne server');
            $path=$entry->getPathname();clearstatcache(true,$path);$stat=@lstat($path);
            if(!$stat){$changed++;continue;}
            $type=$stat['mode']&0170000;
            if($type===0040000){$walk($path,$depth+1);continue;}
            if($type!==0100000){$skipped++;continue;}
            $size=$stat['size'];if(!is_int($size)||$size<0)fail(503,'En filstørrelse kunne ikke opgøres');
            $paths++;$key=(string)$stat['dev'].':'.(string)$stat['ino'];
            if(!isset($inodes[$key]))$inodes[$key]=['size'=>$size,'galleries'=>[]];
            elseif($inodes[$key]['size']!==$size){$changed++;$inodes[$key]['size']=max($inodes[$key]['size'],$size);}
            $name=$entry->getFilename();$photo=null;
            if(preg_match('/^([a-f0-9]{32})\.(?:bin|jpg)$/D',$name,$m))$photo=$m[1];
            elseif(in_array($name,['original.bin','view.jpg','thumb.jpg','receipt.json'],true)&&preg_match('/^[a-f0-9]{32}$/D',basename($directory)))$photo=basename($directory);
            if($photo!==null&&isset($photos[$photo]))$inodes[$key]['galleries'][$photos[$photo]]=true;
        }
    };
    foreach(['originals','previews','thumbnails','.deletions'] as $name)$walk($private.'/'.$name);
    $total=0;$shared=0;$other=0;
    foreach($inodes as $file){
        if($total>PHP_INT_MAX-$file['size'])fail(503,'Mediepladsen overstiger serverens talgrænse');
        $total+=$file['size'];if(count($file['galleries'])>1)$shared+=$file['size'];
        if(!$file['galleries'])$other+=$file['size'];
        foreach($file['galleries'] as $id=>$present)$galleries[$id]['bytes']+=$file['size'];
    }
    return ['version'=>1,'scanned_at'=>time(),'total_bytes'=>$total,'shared_bytes'=>$shared,'other_bytes'=>$other,'stored_files'=>count($inodes),'file_paths'=>$paths,'complete'=>$skipped===0&&$changed===0,'skipped_entries'=>$skipped,'changes_during_scan'=>$changed,'galleries'=>array_values($galleries)];
}
function storage_overview(bool $refresh=false): array {
    global $config;
    user(true);$limit=storage_limit();
    if(!$refresh){
        $saved=one("SELECT value FROM settings WHERE `key`='storage_snapshot_v1'");$snapshot=$saved?json_decode($saved['value'],true):null;
        if(is_array($snapshot)&&($snapshot['version']??null)===1&&is_int($snapshot['scanned_at']??null)&&$snapshot['scanned_at']<=time()&&$snapshot['scanned_at']>time()-60&&is_int($snapshot['total_bytes']??null)&&is_array($snapshot['galleries']??null))return array_merge($snapshot,['limit_bytes'=>$limit,'cached'=>true]);
    }
    $lock='lexgalleri-storage-'.substr(hash('sha256',$config['db_name']),0,32);
    if((int)query('SELECT GET_LOCK(?,0)',[$lock])->fetchColumn()!==1)fail(409,'En pladsopgørelse er allerede i gang. Prøv igen om lidt');
    try{
        $snapshot=storage_scan();
        query("INSERT INTO settings(`key`,value) VALUES('storage_snapshot_v1',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        return array_merge($snapshot,['limit_bytes'=>$limit,'cached'=>false]);
    }finally{query('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function activity_ready(): bool {
    static $ready=null;if($ready!==null)return $ready;
    return $ready=(int)query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='activity_users' AND column_name IN ('user_id','initialized_at')) OR (table_name='media_seen' AND column_name IN ('user_id','photo_id','seen_at')) OR (table_name='activity_events' AND column_name IN ('id','user_id','kind','gallery_id','occurred_at','event_key')))")->fetchColumn()===11;
}
function activity_require(): void {if(!activity_ready())fail(503,'Nye billeder og aktivitet kræver migrering 008_gallery_news_activity.sql');}
function activity_initialize(array $u): void {
    global $db;
    if(one('SELECT 1 FROM activity_users WHERE user_id=?',[$u['id']]))return;
    $db->beginTransaction();
    try{
        // Serialize the first baseline across tabs without time/ID watermarks.
        query('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
        if(!one('SELECT 1 FROM activity_users WHERE user_id=?',[$u['id']])){
            query('INSERT INTO activity_users(user_id,initialized_at) VALUES(?,UTC_TIMESTAMP(6))',[$u['id']]);
            query('INSERT IGNORE INTO media_seen(user_id,photo_id,seen_at) SELECT ?,p.id,UTC_TIMESTAMP(6) FROM photos p WHERE ?=1 OR EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=p.gallery_id AND a.user_id=?)',[$u['id'],(int)$u['admin'],$u['id']]);
        }
        $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function activity_prune(): void {
    // Bounded, indexed cleanup; no hosting cron or external service required.
    query('DELETE FROM activity_events WHERE occurred_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 30 DAY) LIMIT 1000');
}
function activity_login(array $u): void {
    if(!activity_ready())return;
    activity_initialize($u);
    query("INSERT INTO activity_events(user_id,kind,gallery_id,occurred_at,event_key) VALUES(?,'login',NULL,UTC_TIMESTAMP(6),?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)",[$u['id'],hash('sha256','login:'.session_id())]);
    activity_prune();
}
function activity_galleries(array $u): array {
    $ready=activity_ready();if($ready)activity_initialize($u);
    $news=$ready?',(SELECT COUNT(*) FROM photos np WHERE np.gallery_id=g.id AND np.uploader<>? AND NOT EXISTS(SELECT 1 FROM media_seen ms WHERE ms.user_id=? AND ms.photo_id=np.id)) new_count':'';
    $args=$ready?[$u['id'],$u['id'],(int)$u['admin'],$u['id']]:[(int)$u['admin'],$u['id']];
    return rows('SELECT g.*,(SELECT COUNT(*) FROM photos p WHERE p.gallery_id=g.id) count,(SELECT id FROM photos p WHERE p.gallery_id=g.id ORDER BY uploaded DESC LIMIT 1) cover'.$news.' FROM galleries g WHERE ?=1 OR EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=g.id AND a.user_id=?) ORDER BY created DESC',$args);
}
function activity_visit(string $g,array $u,array $b): array {
    global $db;
    activity_require();access($g);activity_initialize($u);
    if(array_diff(array_keys($b),['photo_ids']))fail(400,'Ugyldigt besøgsfelt');
    $ids=$b['photo_ids']??[];
    if(!is_array($ids)||!array_is_list($ids)||count($ids)>500)fail(400,'Højst 500 viste billeder ad gangen');
    foreach($ids as $id)if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))fail(400,'Ugyldigt billede');
    $ids=array_values(array_unique($ids));
    $db->beginTransaction();
    try{
        if($ids){
            $marks=implode(',',array_fill(0,count($ids),'?'));
            $found=rows('SELECT id FROM photos WHERE gallery_id=? AND id IN ('.$marks.') FOR UPDATE',array_merge([$g],$ids));
            if(count($found)!==count($ids))fail(409,'Galleriindholdet er ændret. Hent galleriet igen');
            foreach($ids as $id)query('INSERT IGNORE INTO media_seen(user_id,photo_id,seen_at) VALUES(?,?,UTC_TIMESTAMP(6))',[$u['id'],$id]);
        }
        $key=hash('sha256','gallery:'.$u['id'].':'.$g.':'.intdiv(time(),300));
        query("INSERT INTO activity_events(user_id,kind,gallery_id,occurred_at,event_key) VALUES(?,'gallery',?,UTC_TIMESTAMP(6),?) ON DUPLICATE KEY UPDATE occurred_at=VALUES(occurred_at)",[$u['id'],$g,$key]);
        $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    activity_prune();return ['ok'=>true];
}
function activity_admin(): array {
    user(true);activity_require();activity_prune();
    $requested=$_GET['user_id']??'';if(!is_string($requested)||$requested!==''&&!preg_match('/^[a-f0-9]{32}$/D',$requested))fail(400,'Ugyldigt medlem');
    $people=rows("SELECT u.id,u.name,MAX(CASE WHEN e.kind='login' THEN e.occurred_at END) last_login,MAX(CASE WHEN e.kind='gallery' THEN e.occurred_at END) last_gallery FROM users u LEFT JOIN activity_events e ON e.user_id=u.id AND e.occurred_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 30 DAY) WHERE NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id)) GROUP BY u.id,u.name ORDER BY u.name LIMIT 500");
    $events=rows("SELECT e.id,e.kind,e.occurred_at,u.name,g.name gallery_name FROM activity_events e JOIN users u ON u.id=e.user_id LEFT JOIN galleries g ON g.id=e.gallery_id WHERE e.occurred_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 30 DAY) AND (?='' OR e.user_id=?) AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id)) ORDER BY e.id DESC LIMIT 100",[$requested,$requested]);
    $uploads=rows('SELECT p.id,p.title,p.mime,p.uploaded,g.name gallery_name,u.name uploader_name FROM photos p JOIN galleries g ON g.id=p.gallery_id JOIN users u ON u.id=p.uploader ORDER BY p.uploaded DESC,p.id DESC LIMIT 30');
    return ['people'=>$people,'events'=>$events,'uploads'=>$uploads,'retention_days'=>30];
}
function activity_member_delete(string $id): void {
    if(!activity_ready())return;
    foreach(['activity_events','media_seen','activity_users'] as $table)query('DELETE FROM '.$table.' WHERE user_id=?',[$id]);
}
function default_theme(): array {
    return ['version'=>1,'name'=>'Nordisk','colors'=>['background'=>'#f8f4ed','surface'=>'#fffcf8','text'=>'#253d33','accent'=>'#a54f3d'],'font'=>'sans','radius'=>16,'density'=>'comfortable'];
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
function upload_file(int $max,string $field='file'): array {
    $f=$_FILES[$field]??null;
    if (!$f || !is_array($f) || !is_int($f['error']??null) || !is_string($f['tmp_name']??null)) fail(400,'Vælg en fil');
    if ($f['error']===UPLOAD_ERR_INI_SIZE || $f['error']===UPLOAD_ERR_FORM_SIZE) fail(413,'Filen er for stor');
    if ($f['error']!==UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail(400,'Upload mislykkedes');
    if (filesize($f['tmp_name'])>$max) fail(413,'Filen er for stor'); return $f;
}
function video_thumbnail_image(array $file): GdImage {
    $info=@getimagesize($file['tmp_name']);
    if(!$info||$info[2]!==IMAGETYPE_JPEG)fail(400,'Miniaturen skal være et JPEG-billede');
    if($info[0]>1920||$info[1]>1920||$info[0]*$info[1]>2073600)fail(413,'Miniaturebilledet er for stort');
    $image=@imagecreatefromjpeg($file['tmp_name']);if(!$image)fail(400,'Miniaturebilledet kunne ikke læses');return $image;
}
function save_video_thumbnail(string $id,GdImage $image): void {
    $staged=[];
    try{
        foreach(['view'=>1800,'thumb'=>600] as $size=>$max){
            $target=image_path($id,$size);
            if(is_link(dirname($target))||is_link($target)||file_exists($target)&&!is_file($target))fail(409,'Miniaturens placering kræver kontrol');
            $tmp=tempnam(dirname($target),'.video-thumb-');if($tmp===false)throw new RuntimeException('Miniaturen kunne ikke klargøres');
            if(dirname($tmp)!==dirname($target)){@unlink($tmp);throw new RuntimeException('Miniaturen kræver skriverettighed i den private billedmappe');}
            $staged[$target]=$tmp;resize_image($image,$max,$tmp,85);
        }
        // Each replacement is atomic. Both are valid metadata-free JPEGs even
        // if an interrupted request replaces only one; retry finishes the pair.
        foreach($staged as $target=>$tmp)if(!@rename($tmp,$target))fail(503,'Miniaturen kunne ikke færdiggøres. Prøv igen');
    }finally{foreach($staged as $tmp)if(is_file($tmp))@unlink($tmp);}
}
function replace_video_thumbnail(string $id): never {
    global $private;
    $lock='lexgalleri-delete-'.$id;
    if((int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()!==1)fail(409,'Videoen behandles allerede. Prøv igen');
    try{
        if(is_link($private.'/.deletions')||file_exists($private.'/.deletions/'.$id)||is_link($private.'/.deletions/'.$id))fail(409,'Videoens sletning skal afsluttes før miniaturen kan ændres');
        $p=photo($id,'edit');access($p['gallery_id'],'download');access($p['gallery_id'],'gps');
        if($p['mime']!=='video/mp4')fail(400,'Kun MP4-videoer kan få en videominiature');
        $image=video_thumbnail_image(upload_file(1024*1024));
        save_video_thumbnail($id,$image);
    }finally{query('SELECT RELEASE_LOCK(?)',[$lock]);}
    send(['ok'=>true]);
}
function upload_video(array $f,string $gallery,array $u): never {
    global $private;
    // Pure container inspection/poster helpers. This does not call the importer,
    // read its config, or open a source database.
    if(!is_file($private.'/lychee-import.php'))fail(503,'Videomodulet mangler i den private installation');
    require_once $private.'/lychee-import.php';
    try{lychee_video_info($f['tmp_name']);}catch(RuntimeException){fail(400,'Filen er ikke en understøttet MP4-video eller er beskadiget');}
    $digest=hash_file('sha256',$f['tmp_name']);
    if(one('SELECT id FROM photos WHERE gallery_id=? AND digest=?',[$gallery,$digest]))fail(409,'Videoen findes allerede');
    $thumbnail=isset($_FILES['thumbnail'])?video_thumbnail_image(upload_file(1024*1024,'thumbnail')):null;
    $id=uid();$paths=[image_path($id,'original'),image_path($id,'view'),image_path($id,'thumb')];
    try {
        if($thumbnail)save_video_thumbnail($id,$thumbnail);else lychee_video_poster($paths);
        if(!move_uploaded_file($f['tmp_name'],$paths[0]))throw new RuntimeException('Kunne ikke gemme videoen');
        chmod($paths[0],0600);
        $filename=basename(str_replace('\\','/',(string)$f['name']));
        $filename=mb_substr(preg_replace('/[\x00-\x1f\x7f]/u','',$filename)?:'video.mp4',0,200);
        query('INSERT INTO photos(id,gallery_id,title,filename,mime,uploader,uploaded,taken,`precision`,place,lat,lon,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$gallery,pathinfo($filename,PATHINFO_FILENAME),$filename,'video/mp4',$u['id'],stamp(),'','unknown','',null,null,$digest]);
    }catch(Throwable $e){foreach($paths as $path)if(is_file($path))unlink($path);if($e instanceof PDOException&&$e->getCode()==='23000')fail(409,'Videoen findes allerede');throw $e;}
    send(['id'=>$id]);
}
function image_path(string $id,string $suffix): string {
    global $private; if (!preg_match('/^[a-f0-9]{32}$/D',$id)) fail(404,'Foto findes ikke');
    $dir=['original'=>'originals','view'=>'previews','thumb'=>'thumbnails'][$suffix];
    return $private.'/'.$dir.'/'.$id.($suffix==='original'?'.bin':'.jpg');
}
function media_delete_validate(string $directory): array {
    if(is_link($directory)||is_link(dirname($directory))||!is_dir($directory))throw new RuntimeException('Slettekvitteringens placering kræver kontrol');
    $names=['original.bin','view.jpg','thumb.jpg','receipt.json'];$entries=@scandir($directory);
    if($entries===false)throw new RuntimeException('Slettekvitteringen kunne ikke læses');
    foreach($entries as $name)if($name!=='.'&&$name!=='..'&&!in_array($name,$names,true))throw new RuntimeException('Slettekvitteringen kræver kontrol');
    foreach($names as $name) {
        $path=$directory.'/'.$name;clearstatcache(true,$path);
        if(is_link($path)||file_exists($path)&&!is_file($path))throw new RuntimeException('Slettekvitteringen kræver kontrol');
    }
    return $entries;
}
function media_delete_cleanup(string $directory): void {
    $entries=media_delete_validate($directory);$names=['original.bin','view.jpg','thumb.jpg','receipt.json'];
    foreach($names as $name) {
        $path=$directory.'/'.$name;
        if(in_array($name,$entries,true)&&!@unlink($path))throw new RuntimeException('Slettede filer kunne ikke ryddes');
    }
    // All recorded media and the receipt are gone. A leftover empty directory
    // contains no media and must not turn a completed deletion into a failure.
    @rmdir($directory);
}
function delete_photo(string $id): void {
    global $db,$private;
    $lock='lexgalleri-delete-'.$id;
    if(!(int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn())fail(409,'Filen er ved at blive slettet. Prøv igen.');
    $directory=$private.'/.deletions/'.$id;$receipt=$directory.'/receipt.json';
    $paths=['original.bin'=>image_path($id,'original'),'view.jpg'=>image_path($id,'view'),'thumb.jpg'=>image_path($id,'thumb')];
    $commitAttempted=false;$committed=false;$journalReady=false;
    try {
        $db->beginTransaction();$photo=one('SELECT * FROM photos WHERE id=? FOR UPDATE',[$id]);
        $root=$private.'/.deletions';
        if(is_link($root)||file_exists($root)&&!is_dir($root)||is_link($directory)||file_exists($directory)&&!is_dir($directory))fail(409,'Filernes placering kræver kontrol før sletning.');
        $journal=is_file($receipt)&&!is_link($receipt)?json_decode((string)file_get_contents($receipt),true):null;
        if(is_dir($directory)&&($journal['version']??null)!==1&&count(scandir($directory)?:[])>2)fail(409,'En tidligere sletning kræver kontrol.');
        if($journal!==null&&($journal['photo_id']??null)!==$id)fail(409,'En tidligere sletning kræver kontrol.');
        $journalReady=($journal['version']??null)===1&&($journal['photo_id']??null)===$id;
        if(!$photo) {
            $db->rollBack();
            // A committed delete can be retried after interrupted file cleanup.
            if(($journal['photo_id']??null)!==$id)fail(404,'Foto eller video findes ikke.');
            $committed=true;
        } else {
            if(!is_dir($root)&&!@mkdir($root,0700))fail(503,'Sletningen kunne ikke forberedes. Kontrollér private filrettigheder.');
            if(!is_dir($directory)&&!@mkdir($directory,0700))fail(503,'Sletningen kunne ikke forberedes. Kontrollér private filrettigheder.');
            if($journal===null) {
                // Fixed paths and a durable receipt make an interrupted rename
                // resumable without copying originals or guessing their state.
                $encoded=json_encode(['version'=>1,'photo_id'=>$id,'photo'=>$photo,'created'=>stamp()],JSON_THROW_ON_ERROR);
                $handle=@fopen($receipt,'xb');
                if(!$handle)fail(503,'Slettekvitteringen kunne ikke gemmes. Prøv igen.');
                try{if(fwrite($handle,$encoded)!==strlen($encoded)||!fflush($handle)||function_exists('fsync')&&!fsync($handle))throw new RuntimeException('Slettekvitteringen kunne ikke gemmes');$journalReady=true;}
                catch(Throwable $error){@unlink($receipt);@rmdir($directory);throw $error;}
                finally{fclose($handle);}
            }
            media_delete_validate($directory);
            foreach($paths as $name=>$path) {
                $staged=$directory.'/'.$name;clearstatcache(true,$path);clearstatcache(true,$staged);
                if(is_link(dirname($path))||is_link($path)||file_exists($path)&&!is_file($path)||is_link($staged)||file_exists($staged)&&!is_file($staged)||is_file($path)&&is_file($staged))fail(409,'Filernes placering kræver kontrol før sletning.');
                if(is_file($path)) {
                    $sourceStat=@stat($path);$targetStat=@stat($directory);
                    if(!$sourceStat||!$targetStat||$sourceStat['dev']!==$targetStat['dev'])fail(409,'Sletning kræver, at de private billedmapper ligger på samme filsystem.');
                }
            }
            foreach($paths as $name=>$path)if(is_file($path)&&!@rename($path,$directory.'/'.$name))fail(503,'Filerne kunne ikke klargøres til sletning. Prøv igen.');
            query('DELETE FROM favorites WHERE photo_id=?',[$id]);
            if(one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='lychee_import_items'")) {
                // Keep completed import receipts so a new preview does not
                // resurrect a deliberately deleted gallery placement.
                query('UPDATE lychee_import_items SET target_photo_id=NULL WHERE target_photo_id=?',[$id]);
            }
            query('DELETE FROM photos WHERE id=?',[$id]);
            $commitAttempted=true;if(!$db->commit())throw new RuntimeException('Databasens slettebekræftelse mangler');$committed=true;
        }
        try{media_delete_cleanup($directory);}
        catch(Throwable $error){error_log('LexGalleri media cleanup: '.$error->getMessage());fail(503,'Filen er fjernet fra galleriet, men filoprydningen er ikke afsluttet. Prøv Slet igen.');}
    } catch(Throwable $error) {
        if(!$committed) {
            try{if($db->inTransaction())$db->rollBack();}catch(Throwable $rollback){error_log('LexGalleri delete rollback: '.$rollback->getMessage());}
            if(!$commitAttempted&&$journalReady) {
                $restored=true;
                foreach($paths as $name=>$path) {
                    $staged=$directory.'/'.$name;clearstatcache(true,$staged);clearstatcache(true,$path);
                    if(is_link($staged)||file_exists($staged)&&!is_file($staged)){$restored=false;continue;}
                    if(is_file($staged)&&(file_exists($path)||is_link($path)||!@rename($staged,$path)))$restored=false;
                }
                if($restored&&is_dir($directory)&&!is_link($directory)) {
                    try{media_delete_cleanup($directory);}catch(Throwable $cleanup){error_log('LexGalleri delete staging: '.$cleanup->getMessage());}
                }
            }
        }
        // Never unlink staged originals after an uncertain database commit.
        // The receipt and fixed filenames let a later DELETE resolve DB truth.
        if($commitAttempted&&!$committed)fail(503,'Sletningen kunne ikke bekræftes. Prøv Slet igen.');
        throw $error;
    } finally {
        try{query('SELECT RELEASE_LOCK(?)',[$lock]);}catch(Throwable $ignored){}
    }
}
function media_delete_requests_ready(): bool {
    // Existing galleries keep working while the owner installs this migration.
    return (int)query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='media_delete_requests' AND column_name IN ('id','photo_id','gallery_id','gallery_name','requester_id','requester_name','title','mime','status','created','updated','resolved_by','resolved_at')")->fetchColumn()===13;
}
function media_delete_requests_require(): void {
    if(!media_delete_requests_ready())fail(503,'Slettemarkeringer er ikke klar. Admin skal installere migrering 005_media_delete_requests.sql.');
}
function media_delete_request_lock(string $photoId,callable $operation): mixed {
    $lock='lexgalleri-request-'.$photoId;
    if((int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()!==1)fail(409,'Slettemarkeringen behandles allerede. Prøv igen.');
    try{return $operation();}
    finally{try{query('SELECT RELEASE_LOCK(?)',[$lock]);}catch(Throwable $ignored){}}
}
function media_delete_request_resolve(string $photoId,array $admin): void {
    // No foreign key points at photos: approval keeps its own audit receipt.
    if(media_delete_requests_ready())query("UPDATE media_delete_requests SET status='approved',updated=?,resolved_at=?,resolved_by=? WHERE photo_id=? AND status='pending'",[stamp(),stamp(),$admin['id'],$photoId]);
}
function media_delete_direct(string $photoId,array $admin): void {
    if(!media_delete_requests_ready()){delete_photo($photoId);return;}
    media_delete_request_lock($photoId,function()use($photoId,$admin){
        try{delete_photo($photoId);}
        catch(ApiError $error){
            // Cleanup may have completed before writing the request outcome
            // failed. Only an existing pending receipt permits this recovery.
            if($error->status!==404||one('SELECT id FROM photos WHERE id=?',[$photoId])||!one("SELECT id FROM media_delete_requests WHERE photo_id=? AND status='pending' LIMIT 1",[$photoId]))throw $error;
        }
        media_delete_request_resolve($photoId,$admin);
    });
}
function media_delete_request_create(string $photoId,array $u): array {
    media_delete_requests_require();
    return media_delete_request_lock($photoId,function()use($photoId,$u){
        global $db;
        $db->beginTransaction();
        try {
            $p=one('SELECT * FROM photos WHERE id=? FOR UPDATE',[$photoId]);if(!$p)fail(404,'Foto findes ikke');
            access($p['gallery_id']);
            if($p['uploader']!==$u['id'])fail(403,'Du kan kun markere dine egne billeder og videoer til sletning.');
            $pending=one("SELECT * FROM media_delete_requests WHERE photo_id=? AND status='pending' ORDER BY created,id LIMIT 1",[$photoId]);
            if($pending){if($pending['requester_id']!==$u['id'])fail(409,'Filen har allerede en slettemarkering.');$db->commit();return $pending;}
            $id=uid();$now=stamp();$gallery=one('SELECT name FROM galleries WHERE id=?',[$p['gallery_id']]);
            query('INSERT INTO media_delete_requests(id,photo_id,gallery_id,gallery_name,requester_id,requester_name,title,mime,status,created,updated,resolved_by,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$photoId,$p['gallery_id'],$gallery['name'],$u['id'],$u['name'],$p['title'],$p['mime'],'pending',$now,$now,null,null]);
            $request=one('SELECT * FROM media_delete_requests WHERE id=?',[$id]);$db->commit();return $request;
        }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
    });
}
function media_delete_request_started(string $photoId): bool {
    global $private;
    $directory=$private.'/.deletions/'.$photoId;
    // An uncertain commit can leave both a live row and staged files. Keep its
    // approval pending until delete_photo has reconciled the durable receipt.
    return !one('SELECT id FROM photos WHERE id=?',[$photoId])||file_exists($directory)||is_link($directory);
}
function media_delete_request_cancel(string $photoId,array $u): array {
    media_delete_requests_require();
    return media_delete_request_lock($photoId,function()use($photoId,$u){
        $request=one("SELECT * FROM media_delete_requests WHERE photo_id=? AND status='pending' ORDER BY created,id LIMIT 1",[$photoId]);
        if(!$request)fail(404,'Slettemarkeringen findes ikke.');
        if($request['requester_id']!==$u['id'])fail(403,'Du kan kun fjerne din egen slettemarkering.');
        access($request['gallery_id']);
        if(media_delete_request_started($photoId))fail(409,'Sletningen er allerede påbegyndt. Admin skal afslutte godkendelsen.');
        query("UPDATE media_delete_requests SET status='cancelled',updated=?,resolved_at=?,resolved_by=? WHERE id=? AND status='pending'",[stamp(),stamp(),$u['id'],$request['id']]);
        return one('SELECT * FROM media_delete_requests WHERE id=?',[$request['id']]);
    });
}
function media_delete_request_decide(string $requestId,string $action,array $admin): array {
    media_delete_requests_require();
    $request=one('SELECT * FROM media_delete_requests WHERE id=?',[$requestId]);if(!$request)fail(404,'Slettemarkeringen findes ikke.');
    return media_delete_request_lock($request['photo_id'],function()use($requestId,$action,$admin){
        $request=one('SELECT * FROM media_delete_requests WHERE id=?',[$requestId]);if(!$request)fail(404,'Slettemarkeringen findes ikke.');
        $target=$action==='approve'?'approved':'rejected';
        if($request['status']===$target)return $request;
        if($request['status']!=='pending')fail(409,'Slettemarkeringen er allerede afsluttet.');
        if($action==='reject'&&media_delete_request_started($request['photo_id']))fail(409,'Sletningen er allerede påbegyndt. Afslut godkendelsen for at rydde de resterende filer.');
        if($action==='approve') {
            // delete_photo owns its transaction and durable cleanup receipt.
            // A cleanup503 keeps this request pending so approval can retry.
            try{delete_photo($request['photo_id']);}
            catch(ApiError $error){if($error->status!==404||one('SELECT id FROM photos WHERE id=?',[$request['photo_id']]))throw $error;}
        }
        query('UPDATE media_delete_requests SET status=?,updated=?,resolved_at=?,resolved_by=? WHERE id=? AND status=\'pending\'',[$target,stamp(),stamp(),$admin['id'],$requestId]);
        return one('SELECT * FROM media_delete_requests WHERE id=?',[$requestId]);
    });
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
        send(['setup'=>!$installed || !one('SELECT id FROM users LIMIT 1'),'account_security_version'=>1,'account_security_ready'=>lg_security_ready(),'capabilities'=>['multi_gallery_invitations'=>gallery_permissions_ready(),'gallery_edit'=>true,'member_delete'=>function_exists('lg_security_delete_member'),'media_delete'=>true,'media_delete_requests'=>media_delete_requests_ready(),'theme_delete'=>true,'gallery_create'=>true,'reusable_phone_invitations'=>reusable_invitations_ready(),'direct_mp4_upload'=>is_file($private.'/lychee-import.php'),'video_thumbnails'=>true,'storage_overview'=>true,'member_gallery_sharing'=>gallery_permissions_ready(),'gallery_news'=>activity_ready(),'member_activity'=>activity_ready(),'compact_gallery'=>true]]);
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
        $b=body();$number=array_key_exists('phone',$b)?phone($b):null;$mail=$number===null?email($b):null;throttle('login:'.($_SERVER['REMOTE_ADDR']??''),30);throttle('account:'.($number??$mail));
        $u=$number!==null?(reusable_invitations_ready()?one('SELECT * FROM users WHERE phone=?',[$number]):null):one('SELECT * FROM users WHERE email=?',[$mail]);$pw=$b['password']??'';
        if (!is_string($pw) || !$u || !password_verify($pw,$u['password'])) fail(401,'Forkert e-mail, telefonnummer eller adgangskode');
        if (password_needs_rehash($u['password'],PASSWORD_DEFAULT)) {$newHash=password_hash($pw,PASSWORD_DEFAULT);query('UPDATE users SET password=? WHERE id=? AND password=?',[$newHash,$u['id'],$u['password']]);$u['password']=$newHash;}
        login_user($u);
    }
    if ($method==='POST' && $path==='/logout') { $_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>1,'path'=>$base?:'/','secure'=>$config['secure_cookies'],'httponly'=>true,'samesite'=>'Strict']);send(['ok'=>true]); }
    if ($method==='POST' && $path==='/accept') {
        $b=body();throttle('invite:'.($_SERVER['REMOTE_ADDR']??''));$hash=hash('sha256',text($b,'token',200,true));
        $db->beginTransaction();$inv=one('SELECT * FROM invitations WHERE token=? AND expires>? FOR UPDATE',[$hash,time()]);
        if (!$inv) fail(400,'Invitationen er udløbet eller tilbagekaldt');
        $reusable=reusable_invitations_ready();
        if(!empty($inv['phone'])&&!$reusable)fail(503,'Telefoninvitationens opgradering er ikke afsluttet');
        if(!empty($inv['accepted_user_id'])) {
            if(!$reusable)fail(503,'Invitationens opgradering er ikke afsluttet');
            $u=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$inv['accepted_user_id']]);
            if(!$u||lg_security_member_deleted($u['id'],true))fail(400,'Invitationen er ikke længere aktiv');
            if(!is_string($b['password']??null)||!password_verify($b['password'],$u['password']))fail(401,'Brug din eksisterende adgangskode');
            // Reopening is authentication only: never restore revoked grants.
            $db->commit();login_user($u);
        }
        $assignments=[];
        if(one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='invitation_galleries'"))$assignments=rows('SELECT gallery_id,upload,edit_metadata AS `edit`,download,gps FROM invitation_galleries WHERE token=? ORDER BY gallery_id FOR UPDATE',[$hash]);
        if($assignments&&!gallery_permissions_ready())fail(503,'Invitationens rettigheder kræver 006_gallery_permissions.sql');
        if(!$assignments)$assignments=[array_merge($inv,['edit'=>0])];
        $number=$inv['phone']??null;
        $u=$number!==null?one('SELECT * FROM users WHERE phone=? FOR UPDATE',[$number]):one('SELECT * FROM users WHERE email=? FOR UPDATE',[$inv['email']]);
        if($u&&lg_security_member_deleted($u['id'],true))fail(400,'Invitationen er ikke længere aktiv');
        if ($u) {if (!is_string($b['password']??null) || !password_verify($b['password'],$u['password'])) fail(401,'Brug din eksisterende adgangskode');}
        else { $u=['id'=>uid(),'email'=>$inv['email'],'phone'=>$number,'name'=>$inv['name'],'admin'=>0,'password'=>new_password($b)];
            if($reusable)query('INSERT INTO users(id,email,phone,name,password,admin) VALUES(?,?,?,?,?,0)',[$u['id'],$u['email'],$number,$u['name'],$u['password']]);
            else query('INSERT INTO users(id,email,name,password,admin) VALUES(?,?,?,?,0)',[$u['id'],$u['email'],$u['name'],$u['password']]); }
        foreach($assignments as $choice){
            query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE upload=VALUES(upload),download=VALUES(download),gps=VALUES(gps)',[$choice['gallery_id'],$u['id'],$choice['upload'],$choice['download'],$choice['gps']]);
            if(gallery_permissions_ready())gallery_editor_set($choice['gallery_id'],$u['id'],(bool)$choice['edit']);
        }
        if($reusable)query('UPDATE invitations SET accepted_user_id=? WHERE token=?',[$u['id'],$hash]);
        else query('DELETE FROM invitations WHERE token=?',[$hash]);$db->commit();login_user($u);
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
    if ($method==='GET' && $path==='/deletion-requests') {
        media_delete_requests_require();
        send(rows('SELECT r.* FROM media_delete_requests r WHERE r.requester_id=? AND (?=1 OR EXISTS(SELECT 1 FROM grants a WHERE a.gallery_id=r.gallery_id AND a.user_id=?)) ORDER BY r.created DESC,r.id DESC',[$u['id'],(int)$u['admin'],$u['id']]));
    }
    if ($method==='GET' && $path==='/admin/deletion-requests') {
        user(true);media_delete_requests_require();send(rows("SELECT * FROM media_delete_requests WHERE status='pending' ORDER BY created,id"));
    }
    if ($method==='POST' && preg_match('~^/admin/deletion-requests/([a-f0-9]{32})/(approve|reject)$~D',$path,$m)) {
        $admin=user(true);send(['ok'=>true,'request'=>media_delete_request_decide($m[1],$m[2],$admin)]);
    }
    if (in_array($method,['POST','DELETE'],true) && preg_match('~^/photos/([a-f0-9]{32})/deletion-request$~D',$path,$m)) {
        send(['ok'=>true,'request'=>$method==='POST'?media_delete_request_create($m[1],$u):media_delete_request_cancel($m[1],$u)]);
    }
    if(preg_match('~^/galleries/([a-f0-9]{32})/members$~D',$path,$m)){
        if($method==='GET')send(gallery_members($m[1]));
        if($method==='POST')send(gallery_share_members($m[1],body()));
    }
    if($method==='PUT'&&preg_match('~^/admin/galleries/([a-f0-9]{32})/owner$~D',$path,$m))send(gallery_assign_owner($m[1],body()));
    if ($method==='GET' && $path==='/galleries') send(activity_galleries($u));
    if($method==='GET'&&$path==='/news'){
        activity_require();$list=activity_galleries($u);$g=$_GET['gallery_id']??'';
        if(!is_string($g)||$g!==''&&!preg_match('/^[a-f0-9]{32}$/D',$g))fail(400,'Ugyldigt galleri');
        $ids=[];if($g!==''){access($g);$ids=array_column(rows('SELECT p.id FROM photos p WHERE p.gallery_id=? AND p.uploader<>? AND NOT EXISTS(SELECT 1 FROM media_seen ms WHERE ms.user_id=? AND ms.photo_id=p.id) ORDER BY p.uploaded DESC,p.id DESC LIMIT 500',[$g,$u['id'],$u['id']]),'id');}
        send(['galleries'=>$list,'photo_ids'=>$ids]);
    }
    if($method==='GET'&&$path==='/admin/activity')send(activity_admin());
    if($method==='POST'&&preg_match('~^/galleries/([a-f0-9]{32})/visit$~D',$path,$m))send(activity_visit($m[1],$u,body()));
    if($method==='PATCH'&&preg_match('~^/galleries/([a-f0-9]{32})$~D',$path,$m)){
        access($m[1],'edit');$b=body();$name=text($b,'name',100,true);$description=text($b,'description',1000);
        query('UPDATE galleries SET name=?,description=? WHERE id=?',[$name,$description,$m[1]]);send(['ok'=>true]);
    }
    if ($method==='POST' && $path==='/galleries') {
        $b=body();$name=text($b,'name',100,true);$description=text($b,'description',1000);$id=uid();
        $db->beginTransaction();
        query('INSERT INTO galleries(id,name,description,created) VALUES(?,?,?,?)',[$id,$name,$description,stamp()]);
        query('INSERT INTO settings(`key`,value) VALUES(?,?)',['gallery_owner_'.$id,$u['id']]);
        // The authenticated creator gets access only to this new gallery.
        // Administrators already have full access through their existing role.
        if(!$u['admin']){query('INSERT INTO grants(gallery_id,user_id,upload,download,gps) VALUES(?,?,1,1,1)',[$id,$u['id']]);if(gallery_permissions_ready())gallery_editor_set($id,$u['id'],true);}
        $db->commit();send(['id'=>$id]);
    }
    if (preg_match('~^/galleries/([a-f0-9]{32})/photos$~D',$path,$m)) {
        $g=$m[1];[$u,$a]=access($g,$method==='POST'?'upload':null);
        if ($method==='GET') {
            if(activity_ready())activity_initialize($u);
            $news=activity_ready()?rows('SELECT p.id FROM photos p WHERE p.gallery_id=? AND p.uploader<>? AND NOT EXISTS(SELECT 1 FROM media_seen ms WHERE ms.user_id=? AND ms.photo_id=p.id)',[$g,$u['id'],$u['id']]):[];
            $newIds=array_fill_keys(array_column($news,'id'),true);
            $provenance=$u['admin']&&one('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=\'lychee_import_items\'')?',(SELECT source_metadata FROM lychee_import_items i WHERE i.target_photo_id=p.id AND i.status=\'imported\' ORDER BY i.id LIMIT 1) _import_metadata':'';
            $ps=rows('SELECT p.*,u.name uploader_name,EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id=p.id AND f.user_id=?) favorite'.$provenance.' FROM photos p JOIN users u ON p.uploader=u.id WHERE gallery_id=? ORDER BY COALESCE(NULLIF(taken,\'\'),uploaded) DESC',[$u['id'],$g]);
            $requests=[];
            if(media_delete_requests_ready())foreach(rows("SELECT id,photo_id,requester_id,status,created FROM media_delete_requests WHERE gallery_id=? AND status='pending'",[$g]) as $request) {
                if($u['admin']||$request['requester_id']===$u['id'])$requests[$request['photo_id']]=['id'=>$request['id'],'status'=>$request['status'],'created'=>$request['created']];
            }
            foreach($ps as &$p) {
                $p['deletion_request']=$requests[$p['id']]??null;$p['is_new']=isset($newIds[$p['id']]);
                if(!empty($p['_import_metadata'])){
                    $source=json_decode($p['_import_metadata'],true);
                    if(is_array($source))$p['import_source']=['version'=>'6.6.12','owner_name'=>(string)($source['_owner_username']??''),'description'=>(string)($source['description']??''),'tags'=>(string)($source['tags']??''),'created_at'=>(string)($source['created_at']??''),'taken_at'=>(string)($source['taken_at']??''),'taken_at_orig_tz'=>(string)($source['taken_at_orig_tz']??''),'source_photo_id'=>(string)($source['id']??'')];
                }
                unset($p['digest'],$p['filename'],$p['_import_metadata']);foreach(['lat','lon'] as $key) $p[$key]=($u['admin'] || $a['gps']) && $p[$key]!==null?(float)$p[$key]:null;
            }
            unset($p);send(['photos'=>$ps,'permissions'=>['share_members'=>gallery_member_share_allowed($g,$u,$a),'edit'=>gallery_edit_allowed($g,$u,$a),'upload'=>(bool)($u['admin']||$a['upload']),'download'=>(bool)($u['admin']||$a['download']),'gps'=>(bool)($u['admin']||$a['gps']),'video'=>(bool)($u['admin']||$a['download']&&$a['gps'])]]);
        }
        if ($method==='POST') {
            if(empty($_FILES)&&!empty($_SERVER['CONTENT_LENGTH']))fail(413,'Webhotellets uploadgrænse er for lav, eller uploaden er ufuldstændig');
            $f=upload_file(100*1024*1024);$tmp=$f['tmp_name'];
            if(strtolower(pathinfo((string)$f['name'],PATHINFO_EXTENSION))==='mp4')upload_video($f,$g,$u);
            if(filesize($tmp)>25*1024*1024)fail(413,'Billeder må højst være 25 MB; MP4 må være 100 MB');
            $info=@getimagesize($tmp);
            if (!$info || !in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP],true)) fail(400,'Brug JPEG, PNG, WebP eller MP4');
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
    if($method==='POST'&&preg_match('~^/photos/([a-f0-9]{32})/thumbnail$~D',$path,$m))replace_video_thumbnail($m[1]);
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
    if ($method==='DELETE' && preg_match('~^/photos/([a-f0-9]{32})$~D',$path,$m)) {$admin=user(true);media_delete_direct($m[1],$admin);send(['ok'=>true]);}
    if ($method==='PATCH' && preg_match('~^/photos/([a-f0-9]{32})$~D',$path,$m)) {
        $p=photo($m[1],'edit');$b=body();$taken=text($b,'taken',32);$precision=text($b,'precision',16,true);validate_date($taken,$precision);
        $hasGps=array_key_exists('lat',$b)||array_key_exists('lon',$b);
        if($hasGps){access($p['gallery_id'],'gps');if(!array_key_exists('lat',$b)||!array_key_exists('lon',$b))fail(400,'Angiv begge koordinater');}
        $lat=$hasGps?$b['lat']:$p['lat'];$lon=$hasGps?$b['lon']:$p['lon'];
        if(($lat===null)!==($lon===null) || $lat!==null && (!is_numeric($lat)||!is_numeric($lon)||!is_finite((float)$lat)||!is_finite((float)$lon)||abs((float)$lat)>90||abs((float)$lon)>180))fail(400,'Ugyldige koordinater');
        query('UPDATE photos SET title=?,taken=?,`precision`=?,place=?,lat=?,lon=? WHERE id=?',[text($b,'title',200,true),$taken,$precision,text($b,'place',200),$lat,$lon,$m[1]]);send(['ok'=>true]);
    }
    if($method==='POST' && preg_match('~^/photos/([a-f0-9]{32})/favorite$~D',$path,$m)) {
        photo($m[1]);if(one('SELECT 1 FROM favorites WHERE photo_id=? AND user_id=?',[$m[1],$u['id']]))query('DELETE FROM favorites WHERE photo_id=? AND user_id=?',[$m[1],$u['id']]);
        else query('INSERT INTO favorites VALUES(?,?)',[$m[1],$u['id']]);send(['ok'=>true]);
    }
    if($method==='GET' && $path==='/theme') {$t=one('SELECT value FROM settings WHERE `key`=\'theme\'');send($t?json_decode($t['value'],true):default_theme());}
    if(str_starts_with($path,'/admin/'))user(true);
    if($method==='GET'&&$path==='/admin/storage')send(storage_overview());
    if($method==='POST'&&$path==='/admin/storage/refresh'){if(body()!==[])fail(400,'Pladsopgørelsen har ingen parametre');send(storage_overview(true));}
    if($method==='PUT'&&$path==='/admin/storage/limit')send(storage_set_limit(body()));
    if($method==='GET' && $path==='/admin/users')send(['users'=>array_map('safe_user',rows("SELECT u.* FROM users u WHERE NOT EXISTS(SELECT 1 FROM settings s WHERE s.`key`=CONCAT('deleted_user_',u.id))")),'grants'=>rows(gallery_permissions_ready()?'SELECT a.*,EXISTS(SELECT 1 FROM gallery_editors e WHERE e.gallery_id=a.gallery_id AND e.user_id=a.user_id) AS `edit` FROM grants a':'SELECT a.*,0 AS `edit` FROM grants a')]);
    if($method==='PUT' && $path==='/admin/grants') {
        $b=body();$g=text($b,'gallery_id',32,true);$id=text($b,'user_id',32,true);
        if(array_key_exists('edit',$b)&&!gallery_permissions_ready())fail(503,'Installér 006_gallery_permissions.sql for at ændre redigeringsrettigheder');
        $edit=array_key_exists('edit',$b)?gallery_permission_flag($b,'edit'):null;
        $db->beginTransaction();
        if(!one('SELECT id FROM galleries WHERE id=? FOR UPDATE',[$g]) || !one('SELECT id FROM users WHERE id=? FOR UPDATE',[$id]) || one('SELECT 1 FROM settings WHERE `key`=? FOR UPDATE',['deleted_user_'.$id]))fail(404,'Galleri eller bruger findes ikke');
        if($b['view']??false)query('INSERT INTO grants VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE upload=VALUES(upload),download=VALUES(download),gps=VALUES(gps)',[$g,$id,(int)!empty($b['upload']),(int)!empty($b['download']),(int)!empty($b['gps'])]);
        else query('DELETE FROM grants WHERE gallery_id=? AND user_id=?',[$g,$id]);
        if(!empty($b['view'])&&$edit!==null)gallery_editor_set($g,$id,$edit);
        $db->commit();send(['ok'=>true]);
    }
    if($method==='GET' && $path==='/admin/invitations') {
        if(!reusable_invitations_ready())fail(503,'Invitationsoversigten kræver migrering 007');
        send(rows('SELECT token AS id,name,email,phone,expires,accepted_user_id IS NOT NULL AS accepted FROM invitations ORDER BY expires DESC LIMIT 500'));
    }
    if($method==='DELETE' && preg_match('~^/admin/invitations/([a-f0-9]{64})$~D',$path,$m)) {
        query('DELETE FROM invitations WHERE token=?',[$m[1]]);send(['ok'=>true]);
    }
    if($method==='POST' && $path==='/admin/invitations') {
        send(create_gallery_invitation(body()));
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
        theme_transaction(function()use($m){
            $t=$m[1]==='default'?json_encode(default_theme()):(one('SELECT document FROM themes WHERE id=? FOR UPDATE',[$m[1]])['document']??null);if(!$t)fail(404,'Tema findes ikke');
            query('INSERT INTO settings(`key`,value) VALUES(\'theme\',?),(\'theme_package_id\',?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[$t,$m[1]]);return ['ok'=>true];
        });send(['ok'=>true]);
    }
    if($method==='DELETE' && preg_match('~^/admin/themes/(default|[a-f0-9]{32})$~D',$path,$m)) {
        if($m[1]==='default')fail(409,'Standarddesignet kan ikke slettes');
        send(theme_transaction(function()use($m){
            $package=one('SELECT document FROM themes WHERE id=? FOR UPDATE',[$m[1]]);if(!$package)fail(404,'Designpakken findes ikke');
            $setting=one('SELECT value FROM settings WHERE `key`=\'theme\' FOR UPDATE');
            $source=one('SELECT value FROM settings WHERE `key`=\'theme_package_id\' FOR UPDATE');
            $active=$setting?validate_theme(json_decode($setting['value'],true,16,JSON_THROW_ON_ERROR)):default_theme();
            $deleted=validate_theme(json_decode($package['document'],true,16,JSON_THROW_ON_ERROR));
            // New activations retain identity even for equal package documents.
            // Legacy settings without an ID can only be matched by snapshot.
            $knownSource=$source && preg_match('/\A(?:default|[a-f0-9]{32})\z/D',$source['value']);
            $reset=$setting!==null && ($knownSource?$source['value']===$m[1]:$active==$deleted);
            if($reset){$active=default_theme();query('INSERT INTO settings(`key`,value) VALUES(\'theme\',?),(\'theme_package_id\',\'default\') ON DUPLICATE KEY UPDATE value=VALUES(value)',[json_encode($active,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);}
            query('DELETE FROM themes WHERE id=?',[$m[1]]);
            return ['ok'=>true,'theme'=>$active,'reset_to_default'=>$reset];
        }));
    }
    fail(404,'Ikke fundet');
}

// Serialize activation and deletion so an activation cannot retain a package
// that another administrator deleted between reading it and saving its design.
function theme_transaction(callable $operation): array {
    global $db,$config;
    $lock='lexgalleri-theme-'.substr(hash('sha256',$config['db_name']),0,32);
    if((int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()!==1)fail(409,'Designet ændres allerede. Prøv igen om lidt.');
    try {
        $db->beginTransaction();$result=$operation();$db->commit();return $result;
    } catch(Throwable $error) {
        if($db->inTransaction())$db->rollBack();throw $error;
    } finally {
        try{query('SELECT RELEASE_LOCK(?)',[$lock]);}catch(Throwable $error){error_log('LexGalleri theme lock: '.$error->getMessage());}
    }
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
    header("Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    $uri=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
    if(!is_string($uri) || ($uri!==$base && !str_starts_with($uri,$base.'/')))fail(404,'Ikke fundet');
    $path=substr($uri,strlen($base));
    if($path==='' || $path==='/') {
        header('Content-Type: text/html; charset=utf-8');$asset=htmlspecialchars($base,ENT_QUOTES,'UTF-8');
        echo '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#416c57"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="LexGalleri"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>LexGalleri · Vores fælles minder</title><link rel="manifest" href="'.$asset.'/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="'.$asset.'/static/icon.svg"><link rel="apple-touch-icon" sizes="180x180" href="'.$asset.'/static/apple-touch-icon.png"><link rel="stylesheet" href="'.$asset.'/static/style.css?v=20261028-accounts"><script src="'.$asset.'/static/qrcode.js?v=2.0.4" defer></script><script src="'.$asset.'/static/app.js?v=20261028-accounts" defer></script><script src="'.$asset.'/static/pwa.js?v=20261028-accounts" defer></script></head><body><div id="app"></div><dialog id="modal"></dialog><div id="toast" role="status"></div></body></html>';exit;
    }
    if(!str_starts_with($path,'/api/'))fail(404,'Ikke fundet');
    $galleryUpload=$method==='POST'&&preg_match('~^/api/galleries/[a-f0-9]{32}/photos$~D',$path);
    if((int)($_SERVER['CONTENT_LENGTH']??0)>($galleryUpload?102:26)*1024*1024)fail(413,'Upload er for stor');
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
