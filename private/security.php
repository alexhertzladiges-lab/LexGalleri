<?php
declare(strict_types=1);

// Account security is kept outside the public web root with the main app. No
// secret, password hash, pending challenge or recovery hash is a profile field.
function lg_security_ready(): bool {
    static $ready=null;
    if($ready!==null)return $ready;
    try {
        query('SELECT user_id,session_version,totp_secret,totp_last_step,totp_enabled,created,updated FROM user_security LIMIT 0');
        query('SELECT id,user_id,code_hash,used_at,created FROM user_recovery_codes LIMIT 0');
        return $ready=true;
    }catch(PDOException){return $ready=false;}
}
function lg_security_require(): void {
    if(!lg_security_ready())fail(503,'Kontosikkerhed er ikke installeret. Importér 004_account_security.sql i LexGalleris database');
}
function lg_security_member_deleted(string $id,bool $lock=false): bool {
    return one('SELECT 1 FROM settings WHERE `key`=?'.($lock?' FOR UPDATE':''),['deleted_user_'.$id])!==null;
}
function lg_security_state(string $id,bool $lock=false): array {
    lg_security_require();
    query('INSERT IGNORE INTO user_security(user_id,session_version,totp_secret,totp_last_step,totp_enabled,created,updated) VALUES(?,1,NULL,-1,0,?,?)',[$id,stamp(),stamp()]);
    $state=one('SELECT * FROM user_security WHERE user_id=?'.($lock?' FOR UPDATE':''),[$id]);
    if(!$state)fail(401,'Kontoen findes ikke');return $state;
}
function lg_security_forget_session(): void {
    $_SESSION=[];session_regenerate_id(true);
}
function lg_security_validate_session(array $u): void {
    if(lg_security_member_deleted($u['id'])){lg_security_forget_session();fail(401,'Kontoen er slettet');}
    $state=lg_security_state($u['id']);
    if((string)($_SESSION['security_version']??'')!==(string)$state['session_version'] || $u['admin'] && (empty($_SESSION['mfa_authenticated']) || !$state['totp_enabled'])) {
        lg_security_forget_session();fail(401,'Log ind igen for at fortsætte');
    }
}
function lg_security_complete(array $u,int $version,bool $mfa,array $extra=[]): never {
    session_regenerate_id(true);
    $_SESSION=['uid'=>$u['id'],'expires'=>time()+604800,'security_version'=>$version,'mfa_authenticated'=>$mfa];
    send(array_merge(safe_user($u),$extra));
}
function lg_security_begin_pending(array $u,array $state,string $mode='login'): never {
    session_regenerate_id(true);
    $_SESSION=['lg_pending_uid'=>$u['id'],'lg_pending_expires'=>time()+600,'lg_pending_version'=>(string)$state['session_version'],'lg_pending_password'=>hash('sha256',$u['password']),'lg_pending_mode'=>$mode];
    send(['mfa_required'=>true,'mfa_enrollment_required'=>$mode==='replace'||!$state['totp_enabled']]);
}
function lg_security_login(array $verified): never {
    global $db;
    lg_security_require();
    // Keep the password snapshot and its session epoch in the same locked read:
    // a password reset racing a successful password check cannot create a new
    // challenge or session bound to the reset account's newer epoch.
    $db->beginTransaction();
    $u=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$verified['id']]);
    if(!$u || lg_security_member_deleted($u['id'],true) || isset($verified['password'])&&!hash_equals($verified['password'],$u['password']))fail(401,'Kontoen er ændret. Log ind igen');
    $state=lg_security_state($u['id'],true);$db->commit();
    if($u['admin'])lg_security_begin_pending($u,$state);
    lg_security_complete($u,(int)$state['session_version'],false);
}
function lg_security_pending(bool $lock=false): array {
    lg_security_require();$id=$_SESSION['lg_pending_uid']??'';
    if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id)||($_SESSION['lg_pending_expires']??0)<time()) {
        if(isset($_SESSION['uid']))fail(409,'Du er allerede logget ind');
        lg_security_forget_session();fail(401,'Loginforsøget er udløbet. Log ind igen');
    }
    $u=one('SELECT * FROM users WHERE id=?'.($lock?' FOR UPDATE':''),[$id]);
    if(!$u || !$u['admin'] || lg_security_member_deleted($u['id'],$lock)){lg_security_forget_session();fail(401,'Log ind igen');}
    $state=lg_security_state($id,$lock);
    if((string)$state['session_version']!==(string)($_SESSION['lg_pending_version']??'') || !hash_equals(hash('sha256',$u['password']),(string)($_SESSION['lg_pending_password']??''))) {
        lg_security_forget_session();fail(401,'Kontoen er ændret. Log ind igen');
    }
    return [$u,$state];
}
function lg_security_key(): string {
    global $private;static $key=null;if($key!==null)return $key;
    if(!function_exists('openssl_encrypt')||!function_exists('openssl_decrypt'))fail(503,'PHP OpenSSL skal aktiveres til Authenticator');
    $path=$private.'/config/mfa.key';$lockPath=$path.'.lock';
    if(is_link($path)||is_link($lockPath))fail(503,'Den private sikkerhedsnøgle kræver kontrol');
    // Lock a separate private file before publishing or opening the key. Locking
    // only after fopen(x) leaves a small window where another reader sees an
    // empty, not-yet-locked new key file.
    $lock=@fopen($lockPath,'c+b');
    if(!$lock||!@chmod($lockPath,0600)||!flock($lock,LOCK_EX))fail(503,'Den private sikkerhedsnøgle kan ikke låses. Kontrollér skriverettigheder til config-mappen');
    $handle=null;
    try {
        clearstatcache(true,$path);$created=!file_exists($path);
        if($created && one('SELECT user_id FROM user_security WHERE totp_enabled=1 AND totp_secret IS NOT NULL LIMIT 1'))fail(503,'Den private sikkerhedsnøgle mangler. Gendan mfa.key fra din private backup');
        $handle=@fopen($path,$created?'x+b':'rb');
        if(!$handle)fail(503,'Den private sikkerhedsnøgle kan ikke åbnes. Kontrollér skriverettigheder til config-mappen');
        if($created) {
            if(!@chmod($path,0600))fail(503,'Den private sikkerhedsnøgle kan ikke sikres');
            $generated=random_bytes(32);$written=0;
            while($written<32){$n=fwrite($handle,substr($generated,$written));if($n===false||$n===0)fail(503,'Den private sikkerhedsnøgle kunne ikke gemmes');$written+=$n;}
            if(!fflush($handle)||(function_exists('fsync')&&!fsync($handle)))fail(503,'Den private sikkerhedsnøgle kunne ikke gemmes');
            rewind($handle);
        }
        $stored=stream_get_contents($handle,33);
        if(!is_string($stored)||strlen($stored)!==32)fail(503,'Den private sikkerhedsnøgle er ugyldig. Gendan den fra din private backup');
        $stat=fstat($handle);clearstatcache(true,$path);$named=@stat($path);
        if(!$stat||!$named||($stat['mode']&0170000)!==0100000||$stat['dev']!==$named['dev']||$stat['ino']!==$named['ino']||is_link($path))fail(503,'Den private sikkerhedsnøgle kræver kontrol');
        if(($stat['mode']&0077)!==0&&!@chmod($path,0600))fail(503,'Den private sikkerhedsnøgle kan ikke sikres');
        return $key=$stored;
    }finally{if(is_resource($handle))fclose($handle);flock($lock,LOCK_UN);fclose($lock);}
}
function lg_security_encrypt(string $secret,string $userId): string {
    $key=lg_security_key();$nonce=random_bytes(12);$tag='';$cipher=openssl_encrypt($secret,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$nonce,$tag,'LexGalleri TOTP v1:'.$userId,16);
    if($cipher===false)fail(503,'Authenticator-nøglen kunne ikke gemmes');return 'v1:'.base64_encode($nonce.$tag.$cipher);
}
function lg_security_decrypt(string $encrypted,string $userId): string {
    if(!str_starts_with($encrypted,'v1:'))fail(503,'Authenticator-nøglen kræver kontrol');
    $data=base64_decode(substr($encrypted,3),true);
    if($data===false||strlen($data)<29)fail(503,'Authenticator-nøglen kræver kontrol');
    $key=lg_security_key();$secret=openssl_decrypt(substr($data,28),'aes-256-gcm',$key,OPENSSL_RAW_DATA,substr($data,0,12),substr($data,12,16),'LexGalleri TOTP v1:'.$userId);
    if($secret===false)fail(503,'Authenticator-nøglen kan ikke åbnes. Kontrollér den private sikkerhedsnøgle');return $secret;
}
function lg_security_base32_encode(string $bytes): string {
    $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$buffer=0;$bits=0;$out='';
    foreach(unpack('C*',$bytes) as $byte){$buffer=($buffer<<8)|$byte;$bits+=8;while($bits>=5){$bits-=5;$out.=$alphabet[($buffer>>$bits)&31];}$buffer&=(1<<$bits)-1;}
    if($bits)$out.=$alphabet[($buffer<<(5-$bits))&31];return $out;
}
function lg_security_base32_decode(string $secret): string {
    $secret=strtoupper(rtrim($secret,'='));
    if($secret===''||!preg_match('/^[A-Z2-7]+$/D',$secret))throw new RuntimeException('Ugyldig Authenticator-nøgle');
    $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$buffer=0;$bits=0;$out='';
    foreach(str_split($secret) as $character){$buffer=($buffer<<5)|strpos($alphabet,$character);$bits+=5;if($bits>=8){$bits-=8;$out.=chr(($buffer>>$bits)&255);}$buffer&=(1<<$bits)-1;}
    return $out;
}
function lg_security_totp(string $secret,int $step): string {
    if($step<0)throw new RuntimeException('Ugyldigt Authenticator-tidstrin');
    $counter=pack('N2',intdiv($step,4294967296),$step%4294967296);
    $hash=hash_hmac('sha1',$counter,lg_security_base32_decode($secret),true);$offset=ord($hash[19])&15;
    $value=unpack('N',substr($hash,$offset,4))[1]&0x7fffffff;
    return str_pad((string)($value%1000000),6,'0',STR_PAD_LEFT);
}
function lg_security_match_step(string $secret,string $code): ?int {
    if(!preg_match('/^[0-9]{6}$/D',$code))return null;$now=intdiv(time(),30);
    // Prefer the current step if a rare collision exists between adjacent codes.
    foreach([$now,$now-1,$now+1] as $step)if($step>=0&&hash_equals(lg_security_totp($secret,$step),$code))return $step;
    return null;
}
function lg_security_code(mixed $raw): string {
    if(!is_string($raw)||strlen($raw)>100)fail(400,'Indtast en Authenticator-kode eller gendannelseskode');return trim($raw);
}
function lg_security_check_code(array $state,string $raw): bool {
    if(!$state['totp_enabled']||!is_string($state['totp_secret']))return false;
    $normalized=strtoupper(preg_replace('/[\s-]/','',$raw));
    if(preg_match('/^[A-F0-9]{32}$/D',$normalized)) {
        $s=query('UPDATE user_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL',[stamp(),$state['user_id'],hash('sha256',$normalized)]);
        return $s->rowCount()===1;
    }
    $step=lg_security_match_step(lg_security_decrypt($state['totp_secret'],$state['user_id']),$raw);
    if($step===null || $step<=(int)$state['totp_last_step'])return false;
    return query('UPDATE user_security SET totp_last_step=?,updated=? WHERE user_id=? AND session_version=? AND totp_last_step<? AND totp_enabled=1',[$step,stamp(),$state['user_id'],$state['session_version'],$step])->rowCount()===1;
}
function lg_security_new_recovery_codes(string $id): array {
    query('DELETE FROM user_recovery_codes WHERE user_id=?',[$id]);$codes=[];
    for($i=0;$i<10;$i++){$plain=strtoupper(bin2hex(random_bytes(16)));$codes[]=implode('-',str_split($plain,8));query('INSERT INTO user_recovery_codes(id,user_id,code_hash,used_at,created) VALUES(?,?,?,NULL,?)',[uid(),$id,hash('sha256',$plain),stamp()]);}
    return $codes;
}
function lg_security_mfa_throttle(string $id): void {
    throttle('mfa-account:'.$id,10);throttle('mfa-ip:'.($_SERVER['REMOTE_ADDR']??''),40);
}
function lg_security_reauth_throttle(string $id): void {
    throttle('reauth-account:'.$id,20);throttle('reauth-ip:'.($_SERVER['REMOTE_ADDR']??''),60);
}
function lg_security_reauthenticate(array $actor,array $b): array {
    $fresh=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$actor['id']]);
    if(!$fresh)fail(401,'Log ind igen');$state=lg_security_state($fresh['id'],true);
    if((string)($_SESSION['security_version']??'')!==(string)$state['session_version'] || $fresh['admin']&&empty($_SESSION['mfa_authenticated'])){lg_security_forget_session();fail(401,'Log ind igen');}
    $password=$b['current_password']??null;
    if(!is_string($password)||!password_verify($password,$fresh['password']))fail(403,'Den nuværende adgangskode er forkert');
    if($fresh['admin']&&!lg_security_check_code($state,lg_security_code($b['mfa_code']??'')))fail(403,'Brug en ny Authenticator-kode eller en ubrugt gendannelseskode');
    return [$fresh,$state];
}
function lg_security_route_pre(string $method,string $path): void {
    global $db;
    if($method==='GET'&&$path==='/mfa/status') {
        [$u,$state]=lg_security_pending();send(['mfa_required'=>true,'mfa_enrollment_required'=>($_SESSION['lg_pending_mode']??'login')==='replace'||!$state['totp_enabled']]);
    }
    if($method==='POST'&&$path==='/mfa/setup') {
        [$u,$state]=lg_security_pending();
        if($state['totp_enabled']&&($_SESSION['lg_pending_mode']??'login')!=='replace')fail(409,'Authenticator er allerede tilknyttet. Indtast din kode');
        $_SESSION['lg_pending_secret']??=lg_security_base32_encode(random_bytes(20));
        $uri='otpauth://totp/'.rawurlencode('LexGalleri:'.$u['email']).'?secret='.$_SESSION['lg_pending_secret'].'&issuer=LexGalleri&algorithm=SHA1&digits=6&period=30';
        send(['secret'=>$_SESSION['lg_pending_secret'],'otpauth_uri'=>$uri]);
    }
    if($method==='POST'&&$path==='/mfa/confirm') {
        $b=body();[$u,$state]=lg_security_pending();lg_security_mfa_throttle($u['id']);$code=lg_security_code($b['code']??'');
        $secret=$_SESSION['lg_pending_secret']??null;
        if(!is_string($secret))fail(409,'Begynd med at tilknytte Authenticator');
        $step=lg_security_match_step($secret,$code);if($step===null)fail(401,'Forkert Authenticator-kode');
        $encrypted=lg_security_encrypt($secret,$u['id']);
        $db->beginTransaction();[$u,$state]=lg_security_pending(true);
        if($state['totp_enabled']&&($_SESSION['lg_pending_mode']??'login')!=='replace')fail(409,'Authenticator er allerede tilknyttet. Log ind igen');
        $version=(int)$state['session_version']+1;
        query('UPDATE user_security SET totp_secret=?,totp_enabled=1,totp_last_step=?,session_version=?,updated=? WHERE user_id=?',[$encrypted,$step,$version,stamp(),$u['id']]);
        $codes=lg_security_new_recovery_codes($u['id']);$db->commit();
        lg_security_complete($u,$version,true,['recovery_codes'=>$codes]);
    }
    if($method==='POST'&&$path==='/mfa/verify') {
        $b=body();[$u,$state]=lg_security_pending();lg_security_mfa_throttle($u['id']);$code=lg_security_code($b['code']??'');
        if(!$state['totp_enabled']||($_SESSION['lg_pending_mode']??'login')==='replace')fail(409,'Tilknyt først din Authenticator');
        $db->beginTransaction();[$u,$state]=lg_security_pending(true);
        if(!lg_security_check_code($state,$code))fail(401,'Forkert eller allerede brugt kode');
        $db->commit();lg_security_complete($u,(int)$state['session_version'],true);
    }
}
function lg_security_profile(array $u): array {
    if(lg_security_member_deleted($u['id']))fail(404,'Medlemmet findes ikke');
    $state=lg_security_state($u['id']);$edit=function_exists('gallery_permissions_ready')&&gallery_permissions_ready();
    $galleries=$u['admin']?rows('SELECT id,name,1 upload,1 download,1 gps,1 AS `edit` FROM galleries ORDER BY name'):rows('SELECT g.id,g.name,a.upload,a.download,a.gps,'.($edit?'EXISTS(SELECT 1 FROM gallery_editors e WHERE e.gallery_id=g.id AND e.user_id=a.user_id)':'0').' AS `edit` FROM galleries g JOIN grants a ON a.gallery_id=g.id WHERE a.user_id=? ORDER BY g.name',[$u['id']]);
    foreach($galleries as &$gallery)foreach(['upload','edit','download','gps'] as $key)$gallery[$key]=(bool)$gallery[$key];unset($gallery);
    return array_merge(safe_user($u),['mfa_enabled'=>(bool)$state['totp_enabled'],'upload_count'=>(int)query('SELECT COUNT(*) FROM photos WHERE uploader=?',[$u['id']])->fetchColumn(),'galleries'=>$galleries]);
}
function lg_security_update_profile(array $actor,string $id,array $b): never {
    global $db;
    foreach(array_keys($b) as $key)if(!in_array($key,['name','email','phone','password','current_password','mfa_code'],true))fail(400,'Ugyldigt profilfelt');
    if(!array_key_exists('name',$b)&&!array_key_exists('email',$b)&&!array_key_exists('phone',$b)&&!array_key_exists('password',$b))fail(400,'Angiv de oplysninger, der skal ændres');
    $name=array_key_exists('name',$b)?text($b,'name',100,true):null;$mail=array_key_exists('email',$b)&&text($b,'email',254)!==''?email($b):null;$password=array_key_exists('password',$b)?new_password($b):null;
    lg_security_reauth_throttle($actor['id']);
    $db->beginTransaction();[$freshActor,$actorState]=lg_security_reauthenticate($actor,$b);
    $target=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]);if(!$target || lg_security_member_deleted($id,true))fail(404,'Medlemmet findes ikke');
    $targetState=lg_security_state($id,true);$newMail=array_key_exists('email',$b)?$mail:$target['email'];
    $number=$target['phone']??null;
    if(array_key_exists('phone',$b)){
        if(!reusable_invitations_ready())fail(503,'Telefonprofiler kræver migrering 007');
        $number=text($b,'phone',30)!==''?phone($b):null;
    }
    if(($target['admin']&&!$newMail)||(!$newMail&&!$number))fail(400,'Angiv en e-mail eller et telefonnummer. Admin skal have e-mail');
    if($number&&one('SELECT id FROM users WHERE phone=? AND id<>?',[$number,$id]))fail(409,'Telefonnummeret bruges allerede');
    if(one('SELECT id FROM users WHERE email=? AND id<>?',[$newMail,$id]))fail(409,'E-mailadressen bruges allerede');
    try{if(reusable_invitations_ready())query('UPDATE users SET name=?,email=?,phone=?,password=? WHERE id=?',[$name??$target['name'],$newMail,$number,$password??$target['password'],$id]);
        else query('UPDATE users SET name=?,email=?,password=? WHERE id=?',[$name??$target['name'],$newMail,$password??$target['password'],$id]);}
    catch(PDOException $e){if($e->getCode()==='23000')fail(409,'Kontaktoplysningerne bruges allerede');throw $e;}
    if($number!==($target['phone']??null))query('DELETE FROM invitations WHERE phone=?',[$target['phone']??null]);
    if($newMail!==$target['email'])query('DELETE FROM invitations WHERE email=?',[$target['email']]);
    query('UPDATE user_security SET session_version=session_version+1,updated=? WHERE user_id=?',[stamp(),$id]);$db->commit();
    $target['name']=$name??$target['name'];$target['email']=$newMail;$target['phone']=$number;
    $self=$id===$actor['id'];if($self)lg_security_forget_session();
    send(['user'=>safe_user($target),'reauthentication_required'=>$self]);
}
function lg_security_delete_member(array $actor,string $id,array $b): never {
    global $db;
    if(!$actor['admin'])fail(403,'Kun administrator');
    if(($b['confirm']??null)!==true)fail(400,'Bekræft sletningen af medlemmet');
    $db->beginTransaction();
    try {
        // Serialize with profile/security changes, and recheck the acting
        // administrator's session epoch before changing another account.
        $fresh=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$actor['id']]);
        if(!$fresh || !$fresh['admin'])fail(403,'Kun administrator');
        $state=lg_security_state($fresh['id'],true);
        if((string)($_SESSION['security_version']??'')!==(string)$state['session_version'] || empty($_SESSION['mfa_authenticated']) || !$state['totp_enabled'])fail(401,'Log ind igen');
        $target=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]);
        if(!$target)fail(404,'Medlemmet findes ikke');
        if($id===$fresh['id'] || $target['admin'])fail(409,'Administratorkonti kan ikke slettes her');
        if(lg_security_member_deleted($id,true)){$db->commit();send(['ok'=>true,'id'=>$id]);}
        $now=stamp();lg_security_state($id,true);
        if(reusable_invitations_ready()){query('DELETE FROM invitations WHERE accepted_user_id=? OR email=? OR phone=?',[$id,$target['email'],$target['phone']??null]);query('UPDATE users SET phone=NULL WHERE id=?',[$id]);}
        else query('DELETE FROM invitations WHERE email=?',[$target['email']]);
        query('DELETE FROM grants WHERE user_id=?',[$id]);
        query('DELETE FROM favorites WHERE user_id=?',[$id]);
        query('DELETE FROM user_recovery_codes WHERE user_id=?',[$id]);
        query('UPDATE user_security SET session_version=session_version+1,totp_secret=NULL,totp_enabled=0,totp_last_step=-1,updated=? WHERE user_id=?',[$now,$id]);
        // Keep only the uploader identity required by existing media foreign
        // keys and history. Credentials and personal contact details are gone;
        // the retained row cannot log in or appear as an active member again.
        query('UPDATE users SET email=?,password=? WHERE id=?',['deleted-'.uid().'@lexgalleri.invalid','!deleted-account!',$id]);
        query('INSERT INTO settings(`key`,value) VALUES(?,?)',['deleted_user_'.$id,json_encode(['deleted_at'=>$now,'by'=>$fresh['id']],JSON_THROW_ON_ERROR)]);
        $db->commit();send(['ok'=>true,'id'=>$id]);
    }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
}
function lg_security_route(string $method,string $path,array $u): void {
    global $db;
    if($path==='/profile') {
        if($method==='GET')send(lg_security_profile($u));
        if($method==='PATCH')lg_security_update_profile($u,$u['id'],body());
    }
    if(preg_match('~^/admin/users/([a-f0-9]{32})$~D',$path,$m)) {
        if(!$u['admin'])fail(403,'Kun administrator');
        if($method==='GET'){$target=one('SELECT * FROM users WHERE id=?',[$m[1]]);if(!$target)fail(404,'Medlemmet findes ikke');send(lg_security_profile($target));}
        if($method==='PATCH')lg_security_update_profile($u,$m[1],body());
        if($method==='DELETE')lg_security_delete_member($u,$m[1],body());
    }
    if($method==='GET'&&$path==='/security/mfa') {
        $state=lg_security_state($u['id']);send(['required'=>(bool)$u['admin'],'enabled'=>(bool)$state['totp_enabled'],'recovery_codes_remaining'=>(int)query('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id=? AND used_at IS NULL',[$u['id']])->fetchColumn()]);
    }
    if($method==='POST'&&$path==='/security/mfa/recovery-codes') {
        if(!$u['admin'])fail(403,'Kun administrator');$b=body();lg_security_reauth_throttle($u['id']);
        $db->beginTransaction();[$fresh,$state]=lg_security_reauthenticate($u,$b);$codes=lg_security_new_recovery_codes($u['id']);$version=(int)$state['session_version']+1;
        query('UPDATE user_security SET session_version=?,updated=? WHERE user_id=?',[$version,stamp(),$u['id']]);$db->commit();
        session_regenerate_id(true);$_SESSION['security_version']=$version;send(['recovery_codes'=>$codes]);
    }
    if($method==='POST'&&$path==='/security/mfa/replace') {
        if(!$u['admin'])fail(403,'Kun administrator');$b=body();lg_security_reauth_throttle($u['id']);
        $db->beginTransaction();[$fresh,$state]=lg_security_reauthenticate($u,$b);$version=(int)$state['session_version']+1;
        // Existing factors stay valid until confirmation. A lost connection at
        // this point cannot silently turn an enrolled account into password-only
        // first enrollment for anyone else who happens to know its password.
        query('UPDATE user_security SET session_version=?,updated=? WHERE user_id=?',[$version,stamp(),$u['id']]);$db->commit();$state['session_version']=$version;
        lg_security_begin_pending($fresh,$state,'replace');
    }
}
