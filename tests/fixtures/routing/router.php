<?php
// CLI test router only. Apache rewriting is independently tested by routing.test.mjs.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if($path==='/'||$path==='/index.php')require dirname(__DIR__,3).'/hosting/root/index.php';
else require dirname(__DIR__,2).'/router.php';
