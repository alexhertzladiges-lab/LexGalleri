# FTPS-deploy — kun den offentlige LexGalleri-mappe

Adgangsgrænsen er fast: vores FTPS-konto må kun se `/home/lexandkk/public_html/LexGalleri`. Du installerer og opdaterer selv private filer via din egen adgang, som beskrevet i [INSTALLATION.md](INSTALLATION.md).

## Kontoens rod

Begræns kontoen i webhotellets kontrolpanel, så dens FTP-rod `/` svarer til `/home/lexandkk/public_html/LexGalleri`. Workflowet arbejder kun i denne rod og dens `static/`-mappe. Det får ingen sti til eller adgang til serverens private mappe, og det forsøger ikke at åbne den.

Kontrollér rodbegrænsningen i kontrolpanelet, før kontoen kobles på GitHub. FTP-protokollens `PWD /` alene beviser ikke, hvilken fysisk servermappe roden er koblet til. Serveren skal håndhæve begrænsningen.

Den offentlige URL er `https://lexan.dk/lexgalleri/`, selv om den eksisterende fysiske mappe hedder `LexGalleri`. [ROUTING.md](ROUTING.md) beskriver rodblokken, som ejeren lægger ved siden af galleri-mappen med egen adgang. Workflowet overfører ikke `hosting/root/` til domænets rod.

## GitHub-indstillinger — én gang

Åbn **Settings → Secrets and variables → Actions** i LexGalleri.

Opret under **Variables**:

| Navn | Værdi |
|---|---|
| `FTPS_HOST` | Den rigtige FTPS-server fra dit webhotel |
| `FTPS_USERNAME` | Kontoen, der er begrænset til LexGalleri-mappen |
| `FTPS_PORT` | Den oplyste port, ofte 21 |

Opret under **Secrets**:

| Navn | Værdi |
|---|---|
| `FTPS_PASSWORD` | Denne FTPS-kontos adgangskode |

Der antages ingen server, bruger eller secret fra LexApp eller andre projekter. Del aldrig adgangskoden i chatten. Der skal ikke oprettes SSH-værtsnøgler til FTPS; workflowet bruger almindelig TLS-certifikat- og værtsnavnekontrol.

Secrets i et andet repository bliver ikke automatisk tilgængelige her og kan ikke læses tilbage fra GitHub. En allerede passende organisationssecret kan deles med repositoryet, hvis organisationens indstillinger tillader det. Databaseadgangskoden og opsætningsnøglen skal blive i din private serverkonfiguration.

## Først: kontrollér forbindelsen uden upload

1. Åbn **Actions → Deploy PHP via FTPS → Run workflow**.
2. Vælg **main**.
3. Behold **diagnostic_only** slået til.
4. Start kørslen.

Dette kontrollerer FTPS-login, TLS-certifikat og krypteret listning af den offentlige kontorod. Det overfører ingen filer, opretter ingen mapper og ændrer ingen rettigheder. Det tilgår ikke privatmappen. Hvis certifikat/login fejler, skal den konkrete fejl løses; certifikatkontrollen må ikke slås fra.

## Dernæst: overfør de offentlige filer

Når du har kontrolleret kontoens rod, kører du samme workflow på `main` med **diagnostic_only slået fra**. PHP/MySQL-testene og deployplantestene på samme commit skal bestå, før overførslen begynder. Brug de offentlige og private programfiler fra samme kodeversion; hold en eventuel import på pause, indtil begge er opdateret.

Kun følgende tolv offentlige appfiler overføres:

| Fra GitHub | Til FTPS-kontoens rod |
|---|---|
| `public/static/icon.svg` | `static/icon.svg` |
| `public/static/icon-192.png` | `static/icon-192.png` |
| `public/static/icon-512.png` | `static/icon-512.png` |
| `public/static/apple-touch-icon.png` | `static/apple-touch-icon.png` |
| `public/manifest.webmanifest` | `manifest.webmanifest` |
| `public/service-worker.js` | `service-worker.js` |
| `public/static/pwa.js` | `static/pwa.js` |
| `public/static/style.css` | `static/style.css` |
| `public/static/app.js` | `static/app.js` |
| `public/static/qrcode.js` | `static/qrcode.js` |
| `public/.htaccess` | `.htaccess` |
| `public/index.php` | `index.php` |

Ingen privat PHP-kode, schema.sql, konfiguration, familiebilleder, videoer, sessionsfiler eller database kopieres. Appikonerne i tabellen er offentlige programfiler. Der er ingen rekursiv synkronisering, sletning eller oprydning uden for de tolv appfiler. Den offentlige `static/`-mappe kan oprettes med rettigheder 755, og overførte filer får 644. Kontorodens egne rettigheder ændres ikke.

Webapp-opdateringen kræver også, at ejeren selv erstatter `private/app.php` i privatmappen fra samme kodeversion. Den tilføjer sidens manifest, ikoner og appscript. Behold den udfyldte konfiguration og databasen; denne ændring kræver ingen SQL-migrering. Se [webapp-vejledningen](WEBAPP.md).

Workflowet er manuelt; det starter ikke ved push eller pull requests. Det kører kun fra `main`, og overførsler køres én ad gangen. Der kræves ingen SSH-shelladgang. Node og lftp bruges kun på GitHub-runneren; webhotellet behøver kun PHP/MySQL.

## FTPS og filaktivering

Der bruges **eksplicit FTPS** (`ftp://` plus `AUTH TLS`) med obligatorisk TLS på kontrol- og datakanaler, verificeret certifikat og kontrolleret værtsnavn. FTP-adgangskoden gives via lftp's miljøvariabel og skrives ikke i kommandolinjeargumenter eller de genererede planer.

Alle tolv filer uploades først med midlertidige navne. Derefter aktiveres hver fil med FTP-rename. Ikoner, manifest og worker aktiveres før scripts og den offentlige indgangsfil, som aktiveres sidst. Serveren skal understøtte rename, der erstatter en eksisterende fil. Hvis den afviser det, stopper overførslen; der bruges ingen fallback, som sletter målfilen først.

De tolv rename-operationer er ikke én samlet transaktion. En afbrudt forbindelse kan efterlade en blanding af kodeversioner eller skjulte `.lexgalleri-...`-filer. Genkør samme kodeversion eller gendan de offentlige filer fra backup. Oprydning af eventuelle midlertidige filer sker manuelt efter kontrol. Private data påvirkes ikke af dette workflow.

## Efter overførsel

Åbn `https://lexan.dk/lexgalleri/`, genindlæs siden, log ind og kontroller et ufølsomt foto. Åbn og luk billedet; oversigten skal blive liggende uden ny hentning af alle miniaturer. Følg [WEBAPP.md](WEBAPP.md) for installation på mobilen, og kontrollér også opstart fra hjemmeskærmen. Første opsætning kræver de private filer og databasen fra installationsvejledningen. Et grønt GitHub-testjob eller en vellykket offentlig filoverførsel beviser ikke, at den private installation eller en konkret mobilbrowser virker.

Planens fil-liste, adgangsgrænse, TLS-krav og rækkefølge testes automatisk. En gennemført offentlig overførsel kontrollerer FTPS-login og de nødvendige filoperationer; ejeren kontrollerer derefter selve galleriet og appinstallationen på sit domæne.
