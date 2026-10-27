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
    // Root of Lychee's local images disk, immediately above original/.
    // A saved short_path such as original/01/02/FILE.jpg is relative to this root.
    // Depending on installation this may be uploads or public/uploads; verify it.
    // Do not use original/, 01/ or another nested folder as the root.
    'uploads_root' => '/DIN/LYCHEE/uploads',
];
