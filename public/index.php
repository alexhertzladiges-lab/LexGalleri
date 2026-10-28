<?php
declare(strict_types=1);
$private = getenv('LEXGALLERI_PRIVATE') ?: dirname(__DIR__, 2) . '/lexgalleri-private';
if (!is_file($private . '/config/config.php') || !is_file($private . '/app.php')) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    exit('LexGalleri er ikke installeret. Følg INSTALLATION.md og læg app.php samt config/config.php i den private mappe.');
}
// Deployment guard: the public entry point must not run an older password-only
// backend while the owner installs the private security update. This version
// stamp identifies trusted local program files; it is not a user-controlled flag.
$appHeader = @file_get_contents($private . '/app.php', false, null, 0, 512);
if (!is_file($private . '/security.php') || !is_string($appHeader) || !str_contains($appHeader, "\nconst LEXGALLERI_SECURITY_VERSION = 1;")) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if(str_contains((string)parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),'/api/')) {
        header('Content-Type: application/json; charset=utf-8');
        exit(json_encode(['detail'=>'Login opdateres. Administratoren skal færdiggøre installationen af kontosikkerhed'], JSON_UNESCAPED_UNICODE));
    }
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    header('Referrer-Policy: no-referrer');
    exit('<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LexGalleri · Login opdateres</title><style>body{background:#f7f6f2;color:#263b34;font:16px/1.7 Arial,sans-serif;margin:12vh auto;padding:24px;max-width:480px}h1{font:38px Georgia,serif}a{color:#416c57}</style><h1>Login opdateres.</h1><p>Administratoren er ved at færdiggøre en sikkerhedsopdatering. Prøv igen om lidt.</p><a href="">Opdatér siden</a></html>');
}
// Recheck file mtimes before loading programs that the owner may just have
// replaced, even when OPcache normally waits between timestamp checks.
if(function_exists('opcache_invalidate')) {
    @opcache_invalidate($private . '/app.php', false);
    @opcache_invalidate($private . '/security.php', false);
}
// The owner installs private programs separately. Version the public assets
// here so even an older private HTML template loads the deployed public bytes.
// API replies, images and streamed videos must never pass through this buffer.
$requestPath=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
if(is_string($requestPath)&&!preg_match('~/api(?:/|$)~',$requestPath)) {
    $assetVersions=[];
    foreach(['app.js','pwa.js','qrcode.js','style.css'] as $assetName) {
        $assetHash=@hash_file('sha256',__DIR__.'/static/'.$assetName);
        if(is_string($assetHash))$assetVersions[$assetName]=substr($assetHash,0,16);
    }
    ob_start(static function(string $html)use($assetVersions):string {
        $isHtml=false;
        foreach(headers_list() as $header)if(stripos($header,'Content-Type: text/html')===0)$isHtml=true;
        if(!$isHtml)return $html;
        foreach($assetVersions as $name=>$version) {
            $html=preg_replace('~(static/'.preg_quote($name,'~').')(?:\?v=[A-Za-z0-9._-]+)?(?=["\'])~','$1?v='.$version,$html)??$html;
        }
        return $html;
    });
}
require $private . '/app.php';
