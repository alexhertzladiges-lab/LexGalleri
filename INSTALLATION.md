# Installation — PHP 8.4/MySQL og FTPS med adgang kun til public/

Du installerer selv alle private filer med din egen adgang til webhotellet. ChatGPT/GitHub får kun en FTPS-konto, der er begrænset til `/home/lexandkk/public_html/LexGalleri`. Der gives ingen FTPS-adgang til den private mappe.

## 1. Opret database og vælg PHP

I webhotellets kontrolpanel:

- Vælg PHP **8.4** og aktivér `pdo_mysql`, `gd` (JPEG/PNG/WebP), `exif`, `mbstring`, `openssl` og sessioner. `zip` er valgfri til ZIP-temaer; JSON-temaer virker uden.
- Opret en tom MySQL/MariaDB-database og separat databasebruger med alle rettigheder **kun til denne database**. Gem værtsnavn, port, fuldt databasenavn, brugernavn og adgangskode hos dig selv.
- Anbefal: `memory_limit=256M`, `upload_max_filesize=100M`, `post_max_size=101M`, `max_execution_time=60`, `display_errors=Off`, `log_errors=On`. Fejllog skal være privat.

Tabeller oprettes automatisk ved første admin-opsætning. Du skal ikke oprette dem manuelt. Brug MySQL 8+ eller MariaDB 10.6+.

## 2. Læg de private filer på serveren selv

Hent kildekoden fra GitHub (**Code → Download ZIP**) og pak den ud på din pc. Brug webhotellets filmanager eller din egen fulde filadgang til at oprette:

```text
/home/lexandkk/lexgalleri-private/
├── app.php
├── security.php
├── schema.sql
├── config/
│   ├── config.php
│   └── mfa.key        # oprettes privat af PHP ved Authenticator-opsætning
├── originals/
├── previews/
├── thumbnails/
└── sessions/
```

Kopiér repositoryets [private/app.php](private/app.php), [private/security.php](private/security.php) og [private/schema.sql](private/schema.sql) til denne mappe fra samme kodeversion. Opret de øvrige mapper. Kopiér `private/config/config.example.php` til `config/config.php` på serveren, og redigér den dér. Du opretter ikke selv `mfa.key`; PHP genererer den ved Authenticator-opsætningen.

Private mapper: normalt **700**. Private filer: normalt **600**. PHP-processen skal kunne læse programfiler, skema og konfiguration og skrive i billedmapperne, `sessions/` og den private `config/`-mappe, hvor krypteringsnøglen oprettes. Hvis PHP kører som en anden bruger, få webhotellet til at tilpasse ejer/grupperettigheder; brug ikke 777.

**FTP-kontoens mappebegrænsning og PHP's filadgang er forskellige.** PHP skal have adgang til sine private filer, selv om vores FTPS-konto ikke har det. Hvis `open_basedir` er slået til, skal webhotellet tillade PHP adgang til begge appmapper. Det giver ikke FTPS-kontoen adgang til privatmappen.

## 3. Udfyld den private config.php selv

Serverfilen `/home/lexandkk/lexgalleri-private/config/config.php` skal indeholde:

```php
<?php
return [
    'db_host' => 'VÆRT_FRA_KONTROLPANELET',
    'db_port' => 3306,
    'db_name' => 'FULDT_DATABASENAVN',
    'db_user' => 'FULDT_BRUGERNAVN',
    'db_password' => 'DIN_HEMMELIGE_DATABASEADGANGSKODE',
    'base_path' => '/lexgalleri',
    'secure_cookies' => true,
    'setup_token' => 'EN_TILFAELDIG_ENGANGSNOEGLE_PAA_MINDST_32_TEGN',
];
```

Brug de rigtige databaseoplysninger fra dit kontrolpanel. Generér opsætningsnøglen i en adgangskodeadministrator; brug ikke eksemplets tekst. Den er forskellig fra databaseadgangskoden. Hvis en værdi indeholder `'` eller `\`, skal den escapes i PHP-strengen (henholdsvis `\'` og `\\`).

Gem aldrig den udfyldte konfiguration, databaseadgangskoden eller opsætningsnøglen i GitHub eller chatten. GitHub-deploy hverken læser, tester, overfører eller ændrer denne servermappe direkte.

Den offentlige URL bruger `/lexgalleri` med små bogstaver. [ROUTING.md](ROUTING.md) beskriver den ene konfigurationsværdi og blokken i domænets rod, som får `https://lexan.dk/` til at åbne galleriet. Den fysiske galleri-mappe i næste trin kan fortsat hedde `LexGalleri`.

## 4. Begræns FTPS-kontoen til den offentlige mappe

Opret `/home/lexandkk/public_html/LexGalleri` med din egen adgang. I webhotellets kontrolpanel skal den FTPS-konto, der bruges til LexGalleri, have **præcis denne mappe som sin rod/hjemmemappe**. Den skal ikke kunne komme op i `public_html`, andre websites eller privatmappen.

Når denne konto logger ind med FTP over TLS, skal `/` i FTP-programmet svare til `/home/lexandkk/public_html/LexGalleri` på serveren. Det er samme mappe set fra to forskellige konti. Hvis kontoen aktuelt er begrænset til et andet projekt, skal dens rod ændres eller en passende konto oprettes. Genbrug ikke en anden projektmappe ved at gætte på stier.

FTPS = **FTP med TLS**. Vælg eksplicit FTP over TLS i fx FileZilla, korrekt værtsnavn/bruger fra kontrolpanelet og den oplyste port (ofte 21). SFTP er en anden protokol. Certifikatet skal være gyldigt for værtsnavnet.

Du kan enten overføre de offentlige filer selv med FTPS eller lade [GitHub-workflowet](DEPLOYMENT.md) gøre det. Det offentlige indhold skal ende sådan:

```text
/home/lexandkk/public_html/LexGalleri/
├── .htaccess
├── index.php
├── manifest.webmanifest
├── service-worker.js
└── static/
    ├── app.js
    ├── style.css
    ├── pwa.js
    ├── qrcode.js
    ├── icon.svg
    ├── icon-192.png
    ├── icon-512.png
    └── apple-touch-icon.png
```

Det er **indholdet af `public/`**, der lægges i målmappen — ikke en ekstra `public/`-mappe og ikke hele repositoryet. Husk den skjulte `.htaccess`. Offentlige mapper: normalt 755. Offentlige filer: normalt 644.

PHP's `public/index.php` er allerede kodet til at finde privatmappen på `/home/lexandkk/lexgalleri-private` ved netop denne installation. Behold derfor den private placering ovenfor, eller tilpas bootstrap-filen selv ved en anden placering.

## 5. Åbn galleriet og opret admin

Installér først domænets routing efter [ROUTING.md](ROUTING.md), hvis den lille adresse endnu ikke åbner galleri-mappen. Rodblokken installerer du med egen adgang ved siden af galleri-mappen.

Åbn `https://lexan.dk/lexgalleri/` med små bogstaver. Udbydernavnet er ikke nødvendigvis dit domæne.

Indtast opsætningsnøgle, navn, e-mail og en unik adminadgangskode på 12–72 bytes. PHP opretter tabellerne og admin-kontoen under en MySQL-lås. Tilknyt derefter en Authenticator-app ved at scanne QR-koden eller indtaste opsætningsnøglen fra skærmen, og bekræft med appens sekscifrede kode. Gem de viste engangskoder til gendannelse privat. Først efter bekræftelsen åbnes galleriet.

Efter vellykket oprettelse og Authenticator-tilknytning ændrer du selv `'setup_token' => ''` i den private konfiguration. Behold `secure_cookies=true` og brug HTTPS. Se [ACCOUNTS.md](ACCOUNTS.md) for login og profiler.

Opret et testgalleri, upload et ufølsomt testfoto, og prøv en gæsteinvitation i en anden browserprofil. Kontroller adgang og tilbagekaldelse på pc og mobil, før du uploader familiens arkiv.

## 6. Opdatering og backup

GitHub/vores FTPS-konto opdaterer **kun de offentlige appfiler** i oversigten ovenfor og [deployvejledningen](DEPLOYMENT.md). Hvis en ny kodeversion også ændrer private programfiler eller databaseskema, lægger du selv de relevante private filer ind fra samme version. Nye databaseskemaer skal have særskilt migreringsvejledning; upload af schema.sql alene opgraderer ikke en allerede installeret database.

**Opdatér en eksisterende installation til profiler og Authenticator:** Importér [004_account_security.sql](private/migrations/004_account_security.sql) i **LexGalleris database** med phpMyAdmin. Hent derefter [app.php](private/app.php) og [security.php](private/security.php) fra samme kodeversion, og læg begge i `/home/lexandkk/lexgalleri-private/` med din egen adgang. Behold eksisterende konfiguration, medier og importtabeller. Lad en eventuel import være pauset, indtil offentlig og privat kode matcher. Log ind igen og gennemfør den første Authenticator-tilknytning; tidligere administratorsessioner giver ikke adgang uden den. Hele forløbet findes i [ACCOUNTS.md](ACCOUNTS.md).

**Medlemmers markering til sletning:** Importér [005_media_delete_requests.sql](private/migrations/005_media_delete_requests.sql) i LexGalleris database, og installér den nye [app.php](private/app.php) privat samt de offentlige appfiler. Medlemmer kan kun markere egne uploads; filerne slettes først efter admins godkendelse. Se [vejledningen](ACCOUNTS.md#markering-til-sletning-og-admins-godkendelse).

**Invitationer til flere gallerier og redigeringsrettigheder:** Importér [006_gallery_permissions.sql](private/migrations/006_gallery_permissions.sql) i LexGalleris database, og erstat de private [app.php](private/app.php) og [security.php](private/security.php). Brug offentlige appfiler fra samme kodeversion. Admin kan vælge adgang og rettigheder pr. galleri i én invitation; se [vejledningen](ACCOUNTS.md#invitation-til-flere-gallerier).

Til webapp-opdateringen erstatter du selv [private/app.php](private/app.php) på `/home/lexandkk/lexgalleri-private/app.php`. Den tilføjer henvisningerne til manifest, ikoner og webappens script. Behold din udfyldte `config/config.php`, importkonfiguration, database og private medier. Der kræves ingen ny SQL-migrering. Hold en eventuel import pauset, indtil offentlige og private programfiler er fra samme version, og genoptag derefter samme job.

Du vedligeholder selv backup af **MySQL-databasen og hele den private mappe**, herunder `config/mfa.key`. Nøglen bruges til at læse de krypterede Authenticator-hemmeligheder i databasen; gem den sammen med din private backup. SQL alene indeholder hverken billeder eller denne nøgle. Hold appen ude af brug under manuel samlet backup/gendannelse, opbevar kopier privat/krypteret, og afprøv gendannelse separat. Sessionsmappen kan udelades; brugerne skal så logge ind igen efter gendannelse.

## Installér webappen på mobil eller pc

Når begge dele er opdateret, åbner du galleriets HTTPS-adresse i browseren og opdaterer siden. Følg [WEBAPP.md](WEBAPP.md) for **Installér app** på Android/pc eller **Føj til hjemmeskærm** i Safari på iPhone/iPad. Den installerede webapp bruger de samme konti og gallerirettigheder; du opretter ingen ny database eller konto. Visning af billeder og videoer kræver internetforbindelse.

## Import fra Lychee 6.6.12

Følg [den særskilte Lychee-importvejledning](LYCHEE-IMPORT.md), hvis du vil kopiere albummer og billeder fra Lychee 6.6.12 på samme server. Lychee skal ikke opgraderes eller eksportere noget. Du installerer selv importørens private filer, kildekonfiguration og SQL-migrering; FTPS-workflowet overfører fortsat kun de offentlige filer.

## Fejlfinding

- **FTPS-kontoen viser et andet website:** Ret kontoens rod i kontrolpanelet. Workflowet gætter ikke alternative mapper.
- **503 med manglende installation:** Kontrollér dine private filer og PHP-læserettigheder via din egen adgang.
- **503 med manglende PHP-udvidelse:** Aktivér den i kontrolpanelet.
- **404 på `/lexgalleri/api/status`:** Kontrollér `.htaccess`, `base_path` og Apache/LiteSpeed-rewrite. Ved andre servertyper skal webhotellet konfigurere tilsvarende routing til index.php.
- **500:** Se din private PHP-fejllog. Kontrollér DB-forbindelse, privilegier og `open_basedir`. Hvis webhotellet ikke tillader `Options -Indexes`, bed support om mappeindeks-beskyttelse og fjern kun denne linje fra .htaccess.
- **Login forsvinder:** Brug HTTPS og kontrollér PHP-skriveadgang til `sessions/`.
- **Login kræver kontomigrering:** Kør `004_account_security.sql` i LexGalleris database, og kontrollér, at begge private programfiler er fra den samme version.
- **Authenticator-opsætning kan ikke gemmes:** Kontrollér OpenSSL og PHP's skriveadgang til den private `config/`-mappe. Bevar en allerede oprettet `mfa.key`.
- **Authenticator-kode afvises:** Brug automatisk dato og tid på telefonen og den seneste kode. En kode, der netop er brugt, kan ikke genbruges; vent på næste kode. Se [kontovejledningen](ACCOUNTS.md).
- **Upload afvises:** Kontrollér PHP-grænser; prøv et mindre billede.

En grøn FTPS-kørsel bekræfter overførslen af de offentlige filer. Kontrollér derefter dit eget website; de private filer og databaseoplysninger installerer du særskilt med din egen adgang.

## Telefoninvitationer og direkte MP4-upload

Brug [den samlede opgraderingsvejledning](installation/telefon-mp4/INSTALLER.md) til en eksisterende installation. Migrering 007, tre private programfiler og offentlige filer skal alle installeres. Genimportér ikke det nye schema.sql i en eksisterende installation.
