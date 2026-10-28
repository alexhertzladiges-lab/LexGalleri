# LexGalleri — PHP 8.4 / MySQL

Privat familiefotogalleri til et almindeligt PHP-webhotel. Denne version erstatter den tidligere Python/FastAPI-prototype. Der kræves ingen Python, Node, Composer, Docker eller vedvarende serverproces i drift.

**Start med [INSTALLATION.md](INSTALLATION.md).** Du installerer selv private filer og konfiguration; vores FTPS-konto har kun adgang til den offentlige galleri-mappe. [Deploy offentlige filer fra GitHub via FTPS](DEPLOYMENT.md) kan derefter overføre de fire offentlige kodefiler med et klik. Koden er målrettet PHP 8.4 og MySQL 8 / MariaDB 10.6+. Frontend er almindelig JavaScript og CSS uden eksterne tjenester.

Har du **Lychee 6.6.12**, kan admin importere fra database og lokale originaler uden eksport eller opgradering. Start med [Lychee-importvejledningen](LYCHEE-IMPORT.md); den kræver særskilt privat konfiguration og en migrering i LexGalleris database, før du laver prøvevisningen.

## Funktioner

- Administrator, gæstekonti og personlige engangsinvitationer, som udløber efter 7 dage.
- Separat se-, upload-, originaldownload- og GPS-adgang pr. bruger og galleri.
- JPEG/PNG/WebP-upload med dubletkontrol, miniaturebilleder og større visningsbilleder.
- EXIF-dato, GPS og kameraretning aflæses. Visningsbilleder genkodes uden originalens EXIF.
- Originaler bevares uændret. Download kræver både download- og GPS-adgang, fordi originalen kan indeholde GPS.
- Redigér titel, sted, koordinater og datopræcision: tidspunkt, dag, måned, år, cirka år eller ukendt.
- Tidslinje, søgning, favoritter og mobiltilpasset billedvisning.
- Admin kan installere designpakker som JSON eller ZIP, forhåndsvise og aktivere dem for alle.
- Første admin oprettes med en privat opsætningsnøgle. Installationen opretter selv databasens tabeller.
- Sessionsfiler, billeder og konfiguration ligger uden for `public_html`.
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

FTPS-kontoens rod skal være `/home/lexandkk/public_html/LexGalleri`. GitHub-workflowet overfører kun `index.php`, `.htaccess`, `static/app.js` og `static/style.css`. Private filer installeres og opdateres manuelt af ejeren. Ingen forbindelsesoplysninger fra andre projekter antages. Se [DEPLOYMENT.md](DEPLOYMENT.md).

## Test

PHP 8.4 med pdo_mysql, gd, exif, mbstring, zip og curl kræves for hele testen. Testen starter selv en lokal PHP-testserver, opretter en tilfældigt navngivet testdatabase og sletter kun den database bagefter. Brug en isoleret testdatabaseserver med en bruger, der må oprette testdatabaser. Testen læser aldrig den rigtige app-konfiguration.

```bash
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password php tests/run.php
```

GitHub Actions er sat op til PHP 8.4 og MySQL 8.4. Testen kontrollerer installation, konti, invitationer, gallerirettigheder, direkte billedadgang, tilbagekaldelse, EXIF/GPS, orientering, originalbevarelse, metadata, favoritter og temaer. Browserudseendet og det konkrete webhotel skal stadig kontrolleres efter installation.

CI kører også `php tests/lychee-import.php` med samme isolerede testindstillinger. Importtesten opretter to testdatabaser og en midlertidig kildebruger med kun SELECT; testkontoen skal derfor også kunne oprette brugere og tildele rettigheder. Alle testdata er syntetiske og ryddes op bagefter. `node --test tests/lychee-ui.test.mjs` kontrollerer blandt andet, at prøvevisning ikke starter kopiering, og at navigation og pause stopper nye portioner.

`node --test tests/ftps-client.test.mjs` kræver en lokal `lftp` og tester mappehåndtering mod en midlertidig FTP-testserver på localhost med syntetiske loginoplysninger. Den kontakter ikke webhotellet. CI installerer testklienten automatisk.

## Begrænsninger

HEIC/video, kortvisning, kommentarer, personmærkning, offline/PWA, genoptagelig upload, papirkurv, gæstekonti med automatisk udløb, MFA og adgangskodegendannelse er endnu ikke implementeret. Invitationer udløber; den adgang, der oprettes efter accept, fjernes manuelt af admin. Invitationslinket sendes manuelt.

Billedbehandling sker under upload og er begrænset af webhotellets PHP-hukommelse. Originaler må højst være 25 MB og 20 megapixel; den faktiske grænse kan være lavere ved et lavt memory_limit. Et almindeligt 12 MP mobilfoto bør kunne behandles med 256 MB PHP-hukommelse. Store mobilfotos kan kræve en nedskaleret eksport. Kameraets optagetid bevares uden en antaget tidszone; uploadtid er UTC.

Den gamle Python-version findes i Git-historikken, men bruges ikke til denne installation. Der er ingen automatisk migrering af data fra Python-prototypen. Repositoryet har fortsat ingen open source-licens.
