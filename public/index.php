<?php
declare(strict_types=1);
$private = getenv('LEXGALLERI_PRIVATE') ?: dirname(__DIR__, 2) . '/lexgalleri-private';
if (!is_file($private . '/config/config.php') || !is_file($private . '/app.php')) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit('LexGalleri er ikke installeret. Følg INSTALLATION.md og læg app.php samt config/config.php i den private mappe.');
}
require $private . '/app.php';
