# LexGalleri — PHP 8.4 / MySQL

Privat familiefotogalleri til et almindeligt PHP-webhotel. Denne version erstatter den tidligere Python/FastAPI-prototype. Der kræves ingen Python, Node, Composer, Docker eller vedvarende serverproces i drift.

**Start med [INSTALLATION.md](INSTALLATION.md).** Du installerer selv private filer og konfiguration; vores FTPS-konto har kun adgang til den offentlige galleri-mappe. [Deploy offentlige filer fra GitHub via FTPS](DEPLOYMENT.md) kan overføre de offentlige appfiler med et klik. Koden er målrettet PHP 8.4 og MySQL 8 / MariaDB 10.6+. Frontend er almindelig JavaScript og CSS uden eksterne tjenester.

Har du **Lychee 6.6.12**, kan admin importere fra database og lokale billed- og MP4-originaler uden eksport eller opgradering. Start med [Lychee-importvejledningen](LYCHEE-IMPORT.md); den kræver særskilt privat konfiguration og importtabeller i LexGalleris database, før du laver prøvevisningen.

## Funktioner

- Administrator, gæstekonti og personlige engangsinvitationer, som udløber efter 7 dage.
- **Min profil** med navn og e-mail. Admin kan se og redigere egne og medlemmers profiler samt sætte en ny adgangskode. Eksisterende adgangskoder vises aldrig.
- Obligatorisk Authenticator-login for administratorer med TOTP og engangskoder til gendannelse. Se [ACCOUNTS.md](ACCOUNTS.md) for opsætning, profiler og opdatering.
- Separat se-, upload-, originaldownload- og GPS-adgang pr. bruger og galleri.
- JPEG/PNG/WebP-upload med dubletkontrol, miniaturebilleder og større visningsbilleder.
- EXIF-dato, GPS og kameraretning aflæses. Visningsbilleder genkodes uden originalens EXIF.
- Originaler bevares uændret. Download kræver både download- og GPS-adgang, fordi originalen kan indeholde GPS.
- Redigér titel, sted, koordinater og datopræcision: tidspunkt, dag, måned, år, cirka år eller ukendt.
- Tidslinje, søgning, favoritter og mobiltilpasset billedvisning.
- Billedvisning med pile oven på billedet og én Info-knap til oplysninger og handlinger. Se [visningen på pc og mobil](docs/design/compact-viewer.md).
- Billeder åbnes oven på oversigten. Lukning bevarer miniaturer, søgning, sortering og position uden at genindlæse hele galleriet.
- Installerbar webapp på mobil og pc med eget ikon og appvindue. Se [WEBAPP.md](WEBAPP.md); billeder og videoer kræver internetforbindelse.
- Admin kan installere designpakker som JSON eller ZIP, forhåndsvise og aktivere dem for alle.
- Første admin oprettes med en privat opsætningsnøgle. Installationen opretter selv databasens tabeller.
- Sessionsfiler, billeder og konfiguration ligger uden for `public_html`.
- Import fra Lychee 6.6.12 med prøvevisning og valg mellem kopiering og flytning af originaler. Flytning på samme filsystem genbruger originalens indhold mellem albummer.
- MP4 fra Lychee afspilles med videokontroller på mobil og pc. Afspilning kræver både download- og GPS-adgang, fordi den bruger den uændrede original; admin har adgang.
- Adgangskoder hashes med PHP `password_hash`; databaseforespørgsler bruger PDO-parametre. Loginforsøg begrænses i databasen på tværs af PHP-processer.

## Repositoryets mapper

| Mappe | Formål |
|---|---|
| `public/` | Det eneste indhold, der skal ligge i `public_html/LexGalleri/` |
| `private/` | PHP-app, databaseskema og konfiguration uden for webroden |
| `themes/` | Eksempel på en designpakke |
| `tests/` | Integrationstest med en isoleret database |
| `docs/design/` | Visuelle forslag og visualiseringer, når de tilføjes |

Undlad at uploade hele repositoryet til webroden. Der følger ingen rigtige adgangskoder, private billeder eller databasekopier med.

## Designpakker

Se [eksempeltemaet Hav](themes/hav/theme.json). Upload JSON-filen direkte i adminpanelet, eller pak den i en ZIP med præcis én fil: `theme.json`. ZIP-understøttelse kræver PHP ZipArchive. Pakken tillader farver i #RRGGBB, skrifttypen sans/serif, hjørner 0–32 og afstand compact/comfortable. Pakker kan ikke installere PHP, JavaScript, HTML eller vilkårlig CSS.

Alle nye visuelle forslag, billeder og visualiseringer lægges i dette private GitHub-repository med direkte links til ejeren. Familiens rigtige billeder hører ikke hjemme i Git.

## FTPS og private filer

FTPS-kontoens rod skal være `/home/lexandkk/public_html/LexGalleri`. GitHub-workflowet overfører kun de offentlige appfiler, som er oplistet i [DEPLOYMENT.md](DEPLOYMENT.md). Private filer installeres og opdateres manuelt af ejeren. Ingen forbindelsesoplysninger fra andre projekter antages.

Profil- og Authenticator-opdateringen kræver [004_account_security.sql](private/migrations/004_account_security.sql) i en eksisterende LexGalleri-database samt begge private programfiler [app.php](private/app.php) og [security.php](private/security.php) fra samme version som den offentlige kode. Behold din eksisterende konfiguration og private medier. PHP opretter en privat krypteringsnøgle i `config/mfa.key`; den skal indgå i din private backup og må aldrig lægges på GitHub. Se [ACCOUNTS.md](ACCOUNTS.md).

Webapp-opdateringen kræver, at ejeren erstatter [private/app.php](private/app.php) med samme version som de offentlige filer. Behold eksisterende konfiguration, database og private medier; der er ingen SQL-migrering til webappen. Se [WEBAPP.md](WEBAPP.md) for opdatering og installation på telefonen.

MP4-opdateringen kræver begge private programfiler: [app.php](private/app.php) og [lychee-import.php](private/lychee-import.php). Behold den udfyldte kildekonfiguration. Der er ingen ny SQL-migrering til MP4; flytning bruger fortsat `002` og `003`. Lad importen være pauset eller endnu ikke startet, indtil offentlige og private programfiler er opdateret til samme version. Et pauset job genoptages derefter som samme job. Se de præcise trin i [Lychee-importvejledningen](LYCHEE-IMPORT.md).

## Test

PHP 8.4 med pdo_mysql, gd, exif, mbstring, openssl, zip og curl kræves for hele testen. Testen starter selv en lokal PHP-testserver, opretter en tilfældigt navngivet testdatabase og sletter kun den database bagefter. Brug en isoleret testdatabaseserver med en bruger, der må oprette testdatabaser. Testen læser aldrig den rigtige app-konfiguration.

```bash
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password php tests/run.php
```

GitHub Actions er sat op til PHP 8.4 og MySQL 8.4. Testen kontrollerer installation, konti, invitationer, gallerirettigheder, direkte billedadgang, tilbagekaldelse, EXIF/GPS, orientering, originalbevarelse, metadata, favoritter og temaer. Browserudseendet og det konkrete webhotel skal stadig kontrolleres efter installation.

`php tests/account-security.php` bruger samme isolerede databaseindstillinger og kontrollerer Authenticator, udløb og genbrug af koder, reservekoder, profilrettigheder, sessions-tilbagekaldelse og installation af kontomigreringen. Brug kun syntetiske konti og Authenticator-nøgler i testen; den må ikke køres mod den rigtige database.

`node --test tests/account-ui.test.mjs` kontrollerer profil- og loginforløbene. `LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password node --test tests/account-browser.test.mjs` bruger rigtig PHP/MySQL og Chrome/Chromium til hele login-, Authenticator- og medlemsredigeringsforløbet med syntetiske konti.

CI kører også `php tests/lychee-import.php` med samme isolerede testindstillinger. Importtesten opretter to testdatabaser og en midlertidig kildebruger med kun SELECT; testkontoen skal derfor også kunne oprette brugere og tildele rettigheder. Alle testdata er syntetiske og ryddes op bagefter. `node --test tests/lychee-ui.test.mjs` kontrollerer blandt andet, at prøvevisning ikke starter kopiering, og at navigation og pause stopper nye portioner.

`php tests/lychee-move.php` kontrollerer flytning uden ekstra originalkopier, delte originaler mellem albummer, filsystemgrænser og genoptagelse efter afbrudt flytning eller databasecommit. Testen flytter kun syntetiske filer i sit eget midlertidige område.

`php tests/lychee-video.php` tester MP4-kopiering og flytning med syntetiske filer over 25 MiB, bytefremdrift og genoptagelse, filvalidering og størrelsesgrænsen på 2 GiB. Den kontrollerer også videoens GET/HEAD-svar, byteintervaller, If-Range og download-/GPS-rettigheder, herunder tilbagekaldelse.

`node --test tests/ftps-client.test.mjs` kræver en lokal `lftp` og tester mappehåndtering mod en midlertidig FTP-testserver på localhost med syntetiske loginoplysninger. Den kontakter ikke webhotellet. CI installerer testklienten automatisk.

`node --test tests/webapp.test.mjs` kontrollerer installation, appikoner og adskillelse mellem offlinebesked og private data. `node --test tests/webapp-browser.test.mjs` bruger Node 22+ og en lokal Chrome/Chromium til at kontrollere billedlukning, netværkskald, mobilvisning og webappen i en rigtig browser uden npm-pakker. Sæt eventuelt `TEST_BROWSER` til browserens sti. CI kræver browserkontrollen; lokalt springes den over, hvis ingen browser findes.

## Begrænsninger

HEIC, direkte videoupload, import af andre videoformater end MP4, kortvisning, kommentarer, personmærkning, offlineadgang til familiearkivet, genoptagelig upload, papirkurv, gæstekonti med automatisk udløb og automatisk adgangskodegendannelse via e-mail er endnu ikke implementeret. Invitationer udløber; den adgang, der oprettes efter accept, fjernes manuelt af admin. Invitationslinket sendes manuelt. Admin kan sætte en ny adgangskode til et medlem gennem profilvisningen.

Webappen kræver HTTPS og understøttelse i browseren. Den installeres fra browseren og distribueres ikke gennem App Store eller Google Play. Uden forbindelse vises kun en generisk forbindelsesbesked; privat HTML, API-svar, billeder og videoer gemmes ikke i service workerens offlinecache.

Billedbehandling sker under upload og er begrænset af webhotellets PHP-hukommelse. Billedoriginaler må højst være 25 MB og 20 megapixel; den faktiske grænse kan være lavere ved et lavt memory_limit. Et almindeligt 12 MP mobilfoto bør kunne behandles med 256 MB PHP-hukommelse. Store mobilfotos kan kræve en nedskaleret eksport. Kameraets optagetid bevares uden en antaget tidszone; uploadtid er UTC.

Lychee-importen accepterer MP4 på højst 2 GiB på 64-bit PHP. Den behandler store filer i begrænsede datastykker og bevarer originalen uden genkodning; der kræves ingen ffmpeg. Videoer får et neutralt videomotiv. Afspilning afhænger af browserens understøttelse af filens kodek; originaldownload kan bruges, hvis den ikke kan afspilles. Gæster med kun se-adgang ser videomotiv og titel.

Den gamle Python-version findes i Git-historikken, men bruges ikke til denne installation. Der er ingen automatisk migrering af data fra Python-prototypen. Repositoryet har fortsat ingen open source-licens.
