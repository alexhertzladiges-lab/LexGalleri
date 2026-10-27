<?php
// OWNER installs as lexgalleri-private/config/lychee-import.php; never upload via public FTPS.
// Use a separate MySQL user with SELECT only on the Lychee database.
return [
    'enabled' => false, // Enable after configuration + target migration + backup.
    'expected_version' => '6.6.12',
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'DIN_LYCHEE_DATABASE',
    'db_user' => 'DIN_LYCHEE_LAESEBRUGER',
    'db_password' => 'DIN_HEMMELIGE_LYCHEE_DATABASEADGANGSKODE',
    'table_prefix' => '',
    // The Lychee images disk root, NOT its big/ subfolder. For a standard6.6.12
    // installation this is public/uploads, but LYCHEE_UPLOADS may override it.
    'uploads_root' => '/DIN/LYCHEE/public/uploads',
];
