<?php
declare(strict_types=1);

// Optional document-root entry point when no existing index.php must be kept.
// The root .htaccess block is preferred, because it also handles gallery paths.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$host=(string)($_SERVER['HTTP_HOST']??'');
if(!preg_match('/\A(?:www\.)?lexan\.dk(?::[0-9]+)?\z/iD',$host)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Ikke fundet');
}

$path=parse_url((string)($_SERVER['REQUEST_URI']??'/'),PHP_URL_PATH);
if(!in_array($path,['/','/index.php'],true)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Ikke fundet');
}

$query=(string)($_SERVER['QUERY_STRING']??'');
if(preg_match('/[\r\n]|%(?:0d|0a)/i',$query)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Ugyldig forespørgsel');
}

header('Location: https://lexan.dk/lexgalleri/'.($query===''?'':'?'.$query),true,308);
exit;
