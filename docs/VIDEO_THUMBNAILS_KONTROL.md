# LexGalleri – videominiaturer

Udgangspunkt: installeret gren `feature/lexgalleri-phone-mp4-v1`, commit `afd4cad70ee2c32feedd3fb92f6707199f4fd7df`. Ny kode bygges på `feature/lexgalleri-video-thumbnails-v1`. Ingen serverændringer under udviklingen.

## Ændring

Nye MP4-uploads får et ægte stillbillede fra browseren, når den understøtter videoens codec. Eksisterende videoer kan få et nyt billede via **Info → Lav miniaturebillede fra video**. Udtræk kræver ingen FFmpeg, og originalen ændres ikke. Ved manglende browserunderstøttelse bevares den eksisterende neutrale miniature.

Kun `private/app.php` og `public/static/app.js` ændrer runtime. Ingen ændring af datamodel eller SQL. Den nye pakke genbruger det eksisterende allowlist-baserede pakkescript med `--video-thumbnails`, uden SQL og konfiguration.

## Sikkerhed og begrænsninger

- Eksisterende session-, origin- og galleriadgang bruges på alle requests. Efterfølgende miniatureændring kræver redigering, download og GPS; admin har disse rettigheder som før. Upload af en ny MP4 kræver fortsat uploadrettighed.
- JPEG valideres som faktisk JPEG, højst 1 MiB, begrænsede dimensioner/pixels og genkodes, så EXIF/GPS fjernes. PHP behandler ikke videoens codec.
- Videooriginal, database, medlemsrettigheder og importkvitteringer ændres ikke af miniatureudskiftningen.
- Ændringer bruger samme MySQL-lås som mediesletning. En afbrudt sletning med en eksisterende slettekvitteringsmappe blokerer også miniatureændringer, så filer under oprydning ikke genskabes. Symlinks og ugyldige mål afvises. Midlertidige JPEG-filer ryddes i finally, og hver JPEG-udskiftning er atomisk. Et afbrudt par kan færdiggøres ved genkørsel; ingen garanti om fælles atomisk udskiftning af begge JPEG-versioner.
- Browseren stopper det midlertidige videoelement og frigiver blob-URL. Et sent udtræk efter logout/navigation kan ikke starte en miniature-upload eller genåbne dialogen.
- Gamle videoer udtrækkes kun efter brugerens valg. Ingen baggrundsscanning af private originaler og ingen ekstern billedtjeneste.
- `media-src 'self' blob:` tillader afkodning af den lokale upload. Oprindelige videostreams bruger fortsat samme adgangskontrol. Intet nyt offentligt medieendpoint.

## Faktiske lokale prøver, 1. november 2026

PHP 8.4.24, MariaDB 11.8.6 på localhost og rigtig Chromium. Tilfældige engangsdatabaser, syntetiske konti og den eksisterende sorte H.264 MP4-fixture. Ingen produktionscredentials, familiemedier, SMS eller e-mails.

- **76 PASS / 0 FAIL** i `tests/run.php`, herunder 17 nye kontroller: virkelig JPEG ved upload og efterfølgende ændring, bevaret original, metadatafjernelse, gæste-/origin-afvisning, særskilt redigerings-/GPS-adgang, lås mod sletning, ugyldig miniature, symlinkbeskyttelse og oprydning.
- **11 browsertests PASS / 0 FAIL**, inklusive virkeligt MP4 → canvas → JPEG → multipart → PHP → database, sort pixelkontrol mod den oprindelige neutrale miniature, regenerering fra info-knappen, codec-fallback og logout under udtræk.
- Eksisterende Node-prøver: 97 PASS / 0 FAIL i account-ui, lychee-ui, webapp og ftps-plan.
- PHP- og JavaScript-syntaks: PASS.
- Eksisterende kontosikkerheds-, invitations-, slette-, galleri- og Lychee-regressioner køres med den samme lokale isolerede opsætning. Den fulde MySQL 8.4-kørsel og pakningen udføres i GitHub Actions; resultater og link tilføjes efter afslutning.

Den nye browser-fixture deler kun syntetisk MP4-sti med testprocessen. Alle testkonti og private tempmapper slettes af eksisterende fixture-oprydning. Under udvikling blev en ugyldig await i et nyt testudtryk rettet. Den eksisterende offline-browserprøve ramte også en navigation, hvor document.body kortvarigt var null; ventebetingelsen er rettet til at vente på body frem for at kaste en TypeError. Ingen produktionskode er ændret for at skjule denne timingfejl.

## Genkørsel

Brug kun en isoleret databaseserver og dens testcredentials:

```bash
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password php tests/run.php
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password TEST_BROWSER=/usr/bin/chromium node --test tests/account-browser.test.mjs
node --test tests/account-ui.test.mjs tests/lychee-ui.test.mjs tests/webapp.test.mjs tests/ftps-plan.test.mjs
python3 scripts/package-telefon-mp4.py --video-thumbnails
```

Hele CI-sekvensen står i `.github/workflows/tests.yml`. På det rigtige webhotel mangler den nye private app.php, offentlig app.js og kontrol af PHP-uploadgrænser samt en prøve på de konkrete mobilbrowsere. Installationsvejledning: `installation/video-thumbnails/INSTALLER.md`. Udvikling/test aktiverer eller installerer ikke noget på webhotellet.

## Stabilisering af eksisterende browserkontroller

Et CI-forsøg på den afsluttende kode fejlede i tastaturtestens optælling af alle HTTP-kald (11 mod 10). Den samme type ustabile optælling var tidligere set i passwordikon-testen. Begge kontroller observerer nu JavaScript-fetch og form-submit direkte under kontroltrykket, så browserens sene favicon-/manifest-/service-worker-trafik ikke blandes ind i målingen. Assertions om ingen formularafsendelse og ingen JavaScript-netværkskald bevares. Produktets login- eller tastaturkode er ikke ændret. Den samlede test genkøres efter denne præcisering.
