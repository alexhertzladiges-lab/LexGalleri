# Installation — PHP 8.4/MySQL og FTPS med adgang kun til public/

Du installerer selv alle private filer med din egen adgang til webhotellet. ChatGPT/GitHub får kun en FTPS-konto, der er begrænset til `/home/lexandkk/public_html/LexGalleri`. Der gives ingen FTPS-adgang til den private mappe.

## 1. Opret database og vælg PHP

I webhotellets kontrolpanel:

- Vælg PHP **8.4** og aktivér `pdo_mysql`, `gd` (JPEG/PNG/WebP), `exif`, `mbstring` og sessioner. `zip` er valgfri til ZIP-temaer; JSON-temaer virker uden.
- Opret en tom MySQL/MariaDB-database og separat databasebruger med alle rettigheder **kun til denne database**. Gem værtsnavn, port, fuldt databasenavn, brugernavn og adgangskode hos dig selv.
- Anbefal: `memory_limit=256M`, `upload_max_filesize=25M`, `post_max_size=26M`, `max_execution_time=60`, `display_errors=Off`, `log_errors=On`. Fejllog skal være privat.

Tabeller oprettes automatisk ved første admin-opsætning. Du skal ikke oprette dem manuelt. Brug MySQL 8+ eller MariaDB 10.6+.

## 2. Læg de private filer på serveren selv

Hent kildekoden fra GitHub (**Code → Download ZIP**) og pak den ud på din pc. Brug webhotellets filmanager eller din egen fulde filadgang til at oprette:

```text
/home/lexandkk/lexgalleri-private/
├── app.php
├── schema.sql
├── config/
│   └── config.php
├── originals/
├── previews/
├── thumbnails/
└── sessions/
```

Kopiér repositoryets `private/app.php` og `private/schema.sql` til denne mappe. Opret de øvrige mapper. Kopiér `private/config/config.example.php` til `config/config.php` på serveren, og redigér den dér.

Private mapper: normalt **700**. Private filer: normalt **600**. PHP-processen skal kunne læse app, skema og konfiguration og skrive i billedmapperne og `sessions/`. Hvis PHP kører som en anden bruger, få webhotellet til at tilpasse ejer/grupperettigheder; brug ikke 777.

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
    'base_path' => '/LexGalleri',
    'secure_cookies' => true,
    'setup_token' => 'EN_TILFAELDIG_ENGANGSNOEGLE_PAA_MINDST_32_TEGN',
];
```

Brug de rigtige databaseoplysninger fra dit kontrolpanel. Generér opsætningsnøglen i en adgangskodeadministrator; brug ikke eksemplets tekst. Den er forskellig fra databaseadgangskoden. Hvis en værdi indeholder `'` eller `\`, skal den escapes i PHP-strengen (henholdsvis `\'` og `\\`).

Gem aldrig den udfyldte konfiguration, databaseadgangskoden eller opsætningsnøglen i GitHub eller chatten. GitHub-deploy hverken læser, tester, overfører eller ændrer denne servermappe direkte.

## 4. Begræns FTPS-kontoen til den offentlige mappe

Opret `/home/lexandkk/public_html/LexGalleri` med din egen adgang. I webhotellets kontrolpanel skal den FTPS-konto, der bruges til LexGalleri, have **præcis denne mappe som sin rod/hjemmemappe**. Den skal ikke kunne komme op i `public_html`, andre websites eller privatmappen.

Når denne konto logger ind med FTP over TLS, skal `/` i FTP-programmet svare til `/home/lexandkk/public_html/LexGalleri` på serveren. Det er samme mappe set fra to forskellige konti. Hvis kontoen aktuelt er begrænset til et andet projekt, skal dens rod ændres eller en passende konto oprettes. Genbrug ikke en anden projektmappe ved at gætte på stier.

FTPS = **FTP med TLS**. Vælg eksplicit FTP over TLS i fx FileZilla, korrekt værtsnavn/bruger fra kontrolpanelet og den oplyste port (ofte 21). SFTP er en anden protokol. Certifikatet skal være gyldigt for værtsnavnet.

Du kan enten overføre de offentlige filer selv med FTPS eller lade [GitHub-workflowet](DEPLOYMENT.md) gøre det. Det offentlige indhold skal ende sådan:

```text
/home/lexandkk/public_html/LexGalleri/
├── .htaccess
├── index.php
└── static/
    ├── app.js
    └── style.css
```

Det er **indholdet af `public/`**, der lægges i målmappen — ikke en ekstra `public/`-mappe og ikke hele repositoryet. Husk den skjulte `.htaccess`. Offentlige mapper: normalt 755. Offentlige filer: normalt 644.

PHP's `public/index.php` er allerede kodet til at finde privatmappen på `/home/lexandkk/lexgalleri-private` ved netop denne installation. Behold derfor den private placering ovenfor, eller tilpas bootstrap-filen selv ved en anden placering.

## 5. Åbn galleriet og opret admin

Åbn dit eget domænes HTTPS-adresse efterfulgt af `/LexGalleri/`. Udbydernavnet er ikke nødvendigvis dit domæne.

Indtast opsætningsnøgle, navn, e-mail og en unik adminadgangskode på 12–72 bytes. PHP opretter tabellerne og admin-kontoen under en MySQL-lås. Efter vellykket oprettelse ændrer du selv `'setup_token' => ''` i den private konfiguration. Behold `secure_cookies=true` og brug HTTPS.

Opret et testgalleri, upload et ufølsomt testfoto, og prøv en gæsteinvitation i en anden browserprofil. Kontroller adgang og tilbagekaldelse på pc og mobil, før du uploader familiens arkiv.

## 6. Opdatering og backup

GitHub/vores FTPS-konto opdaterer **kun de fire offentlige filer**. Hvis en ny kodeversion også ændrer `private/app.php` eller `private/schema.sql`, får du en vejledning og lægger selv de relevante private filer ind fra samme version. Nye databaseskemaer skal have særskilt migreringsvejledning; upload af schema.sql alene opgraderer ikke en allerede installeret database.

Du vedligeholder selv backup af **MySQL-databasen og hele den private mappe**. SQL alene indeholder ingen billeder. Hold appen ude af brug under manuel samlet backup/gendannelse, opbevar kopier privat/krypteret, og afprøv gendannelse separat. Sessionsmappen kan udelades; brugerne skal så logge ind igen efter gendannelse.

## Fejlfinding

- **FTPS-kontoen viser et andet website:** Ret kontoens rod i kontrolpanelet. Workflowet gætter ikke alternative mapper.
- **503 med manglende installation:** Kontrollér dine private filer og PHP-læserettigheder via din egen adgang.
- **503 med manglende PHP-udvidelse:** Aktivér den i kontrolpanelet.
- **404 på `/LexGalleri/api/status`:** Kontrollér `.htaccess`, `base_path` og Apache/LiteSpeed-rewrite. Ved andre servertyper skal webhotellet konfigurere tilsvarende routing til index.php.
- **500:** Se din private PHP-fejllog. Kontrollér DB-forbindelse, privilegier og `open_basedir`. Hvis webhotellet ikke tillader `Options -Indexes`, bed support om mappeindeks-beskyttelse og fjern kun denne linje fra .htaccess.
- **Login forsvinder:** Brug HTTPS og kontrollér PHP-skriveadgang til `sessions/`.
- **Upload afvises:** Kontrollér PHP-grænser; prøv et mindre billede.

Ingen webhotelinstallation eller rigtig FTPS-login er foretaget fra denne chat. GitHub-kode og beståede tests er ikke i sig selv en installation på serveren.
