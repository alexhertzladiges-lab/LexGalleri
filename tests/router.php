<?php
// Only for CLI integration tests; Apache hosting uses public/.htaccess.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
$assets=['static/app.js'=>'text/javascript','static/style.css'=>'text/css','static/pwa.js'=>'text/javascript','static/qrcode.js'=>'text/javascript','service-worker.js'=>'text/javascript','manifest.webmanifest'=>'application/manifest+json','static/icon.svg'=>'image/svg+xml','static/icon-192.png'=>'image/png','static/icon-512.png'=>'image/png','static/apple-touch-icon.png'=>'image/png'];
$relative='';foreach(['/lexgalleri/','/LexGalleri/'] as $prefix)if(str_starts_with($path,$prefix)){$relative=substr($path,strlen($prefix));break;}
if(isset($assets[$relative])) {
    header('Content-Type: '.$assets[$relative]);
    readfile(dirname(__DIR__).'/public/'.$relative);return;
}
require dirname(__DIR__).'/public/index.php';
