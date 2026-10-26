# Installation hos e-studio.dk — PHP 8.4 / MySQL

Mål: `/home/lexandkk/public_html/LexGalleri`. Privat mappe: `/home/lexandkk/lexgalleri-private`.

## 1. Kontrollér PHP

Vælg PHP **8.4** i kontrolpanelet, og aktivér:

- `pdo_mysql`, `gd` (med JPEG, PNG og WebP), `exif`, `mbstring` og sessioner.
- `zip` til ZIP-designpakker. JSON-designpakker virker uden zip.

Anbefalede indstillinger: `memory_limit=256M`, `upload_max_filesize=25M`, `post_max_size=26M`, `max_execution_time=60`, `display_errors=Off`, `log_errors=On`. Serverens fejllog skal være privat. `open_basedir`, hvis aktiveret, skal tillade både den offentlige og private mappe. Ændr dette gennem webhotellets kontrolpanel eller support.

Appen forventer Apache/LiteSpeed med `.htaccess`, `mod_rewrite` og tilladelse til rewrite-regler. Ved andre servertyper skal webhotellet konfigurere en tilsvarende regel til `index.php`. Hvis `Options -Indexes` ikke er tilladt og giver fejl 500, bed support om directory-index-beskyttelse og fjern kun denne linje. Behold rewrite-reglerne.

## 2. Opret en tom database

Opret en MySQL/MariaDB-database og separat bruger i kontrolpanelet. Giv brugeren alle rettigheder **kun til denne database**. Notér værtsnavn, eventuel port, fuldt databasenavn og fuldt brugernavn. Gem adgangskoden i din adgangskodeadministrator. Den skal ikke sendes i chat eller lægges på GitHub.

Tabellerne oprettes automatisk ved første admin-opsætning. Brug en tom database, der kun er til LexGalleri. MySQL 8+ eller MariaDB 10.6+ anbefales; lokale integrationstests køres med MySQL 8.4 og MariaDB 11.4.

## 3. Opret private mapper via SFTP

```text
/home/lexandkk/
├── lexgalleri-private/
│   ├── app.php
│   ├── schema.sql
│   ├── config/
│   │   └── config.php
│   ├── originals/
│   ├── previews/
│   ├── thumbnails/
│   └── sessions/
└── public_html/
    └── LexGalleri/
        ├── .htaccess
        ├── index.php
        └── static/
            ├── app.js
            └── style.css
```

Upload indholdet af repositoryets **`public/`** til `/home/lexandkk/public_html/LexGalleri/`. Husk den skjulte fil `.htaccess` — aktivér visning af skjulte filer i SFTP-programmet.

Upload `private/app.php` og `private/schema.sql` til `/home/lexandkk/lexgalleri-private/`. Opret `config/`, `originals/`, `previews/`, `thumbnails/` og `sessions/` i den private mappe.

Private mapper: normalt **700**. Private filer: normalt **600**. Offentlige mapper: normalt **755**, offentlige filer: **644**. PHP skal kunne læse app, skema og konfiguration og skrive i billedmapperne og `sessions/`. Tilpas ejer/grupperettigheder sammen med webhotellet, hvis PHP kører som en anden bruger. Brug ikke 777. Flyt aldrig private filer ind i webroden for at løse adgangsproblemer.

## 4. Udfyld privat konfiguration

Kopiér `private/config/config.example.php` til serverens **`/home/lexandkk/lexgalleri-private/config/config.php`**. Redigér denne serverfil:

```php
<?php
return [
    'db_host' => 'VÆRT_FRA_KONTROLPANELET',
    'db_port' => 3306,
    'db_name' => 'FULDT_DATABASENAVN',
    'db_user' => 'FULDT_BRUGERNAVN',
    'db_password' => 'DIN_HEMMELIGE_DATABASEADGANGSKODE',
    'base_path' => '/LexGalleri',
    'secure_cookies' => true,
    'setup_token' => 'EN_LANG_TILFAELDIG_NOEGLE_PAA_MINDST_32_TEGN',
];
```

Brug en adgangskodeadministrator til at generere en tilfældig opsætningsnøgle på mindst 32 tegn. Den skal være forskellig fra databaseadgangskoden og bruges kun til at oprette første administrator. Brug ikke eksemplets tekst. Hvis en værdi indeholder `'` eller `\`, skal den escapes i PHP-strengen (henholdsvis `\'` og `\\`). Gem aldrig den udfyldte konfiguration i repositoryet.

## 5. Opret administrator

Åbn **HTTPS-adressen på dit eget domæne efterfulgt af `/LexGalleri/`**. `e-studio.dk` er oplyst som udbyder, så der antages ikke et konkret domæne her.

Indtast opsætningsnøgle, navn, e-mail og en unik adminadgangskode på 12–72 bytes. Installationen opretter tabellerne og admin-kontoen under en MySQL-lås, så to anmodninger ikke opretter hver sin første admin. Brug HTTPS og behold `secure_cookies=true`.

Når du er logget ind, fjern opsætningsnøglen i den private konfiguration ved at sætte `'setup_token' => ''`. Der kan ikke oprettes endnu en første admin, når en bruger allerede findes.

Opret et testgalleri, upload et ufølsomt testfoto, og kontrollér det på både pc og mobil. Opret en gæsteinvitation, og åbn den i et separat browserprofil/privat vindue. Kontrollér at gæsten kun ser det tildelte galleri. Afprøv til sidst tilbagekaldelse af adgang og GPS-rettigheder, inden du uploader familiens arkiv.

## 6. Backup og opdatering

Brug webhotellets backupfunktion til **både hele den private mappe og MySQL-databasen**. En SQL-eksport alene indeholder ingen billeder. Hold appen ude af brug under en manuel samlet backup og gendannelse. Opbevar backup krypteret og privat. Afprøv en gendannelse på en separat installation. Sessionsmappen kan udelades fra backup; det logger brugerne ud ved gendannelse.

Ved en kodeopdatering: tag backup, udskift de relevante offentlige filer samt `private/app.php`, og bevar `config.php` og de fire datamapper. Denne første version har ingen automatiske schemaopgraderinger for senere datamodeller; fremtidige ændringer skal have en særskilt migreringsvejledning.

## Fejlfinding

- **503 med manglende installation:** Kontrollér de private stier og læserettigheder.
- **503 med PHP-udvidelse:** Aktivér den navngivne udvidelse i kontrolpanelet.
- **404 på `/api/status`:** Kontrollér `.htaccess`, rewrite-understøttelse og `base_path`.
- **500:** Se webhotellets private PHP-fejllog. Kontrollér databaseforbindelse, databaseprivilegier, skemafilen og `open_basedir`. Del ikke logs, hvis de indeholder hemmeligheder.
- **Login forsvinder:** Brug HTTPS. Kontrollér skriverettigheder til `sessions/` og korrekt `/LexGalleri` i konfigurationen.
- **Upload er for stor:** Kontrollér PHP-grænser og billedets pixelantal. Prøv et mindre foto.

Der er ikke oprettet en SFTP-forbindelse eller installeret noget på din server fra denne chat. Denne vejledning og kildekoden gør installationen klar til filoverførsel.
