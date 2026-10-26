<?php
// Only for CLI integration tests; Apache hosting uses public/.htaccess.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(in_array($path,['/LexGalleri/static/app.js','/LexGalleri/static/style.css'],true)) {
    header('Content-Type: '.(str_ends_with($path,'.js')?'text/javascript':'text/css'));
    readfile(dirname(__DIR__).'/public/static/'.basename($path));return;
}
require dirname(__DIR__).'/public/index.php';
