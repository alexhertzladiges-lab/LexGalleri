# LexGalleri – telefoninvitationer og MP4: kontrol

Udgangspunkt: main `4ca46ccdeda02f1a8637b7595c41ef0cd44a82d5`. Ændringer forberedes på en særskilt featuregren. Ingen LexApp-filer eller Fiskerhytte-server berøres.

## Funktion og sikkerhed

- Admin vælger enten e-mail eller dansk telefonnummer. Telefon normaliseres til +45 og valideres på serveren. Der oprettes ingen fiktiv e-mail og sendes ingen automatisk besked.
- Første accept opretter eller autentificerer kontoen og anvender kun admins valgte rettigheder. Senere genbesøg kræver den samme kontos aktuelle adgangskode og genskaber **ingen** grants. Token låses under transaktion; databasen gemmer kun SHA-256-hash. Syv dages udløb, admin-tilbagekaldelse og loginbegrænsning bevares.
- Telefonkontoen understøttes i almindeligt login, profilrettelser og kontosletning. Admin skal fortsat have e-mail og Authenticator.
- MP4: 100 MiB pr. fil; billeder: 25 MiB. Serveren kontrollerer containerstruktur og videospor med den eksisterende begrænsede MP4-parser. Ingen FFmpeg, ekstern tjeneste eller Lychee-forbindelse bruges. Der genereres neutral JPEG-miniature. Afspilning/original kræver fortsat download **og** GPS, med sessionskontrol, byte ranges og privat cachepolitik som før.
- Manglende migreringsmarkør blokerer telefonfunktionerne, også accept af en telefoninvitation oprettet inden en afbrudt opgradering. Den gamle e-mailfunktion bevares før migrering. Manglende privat videomodul afviser video uden publicering.
- Original og to miniaturer fjernes, hvis databaseindsættelse fejler. Dubletter afvises.

## Udførte lokale prøver, 31. oktober 2026

PHP 8.4.24, isoleret MariaDB 11.8.6 på localhost:33307 og Chromium. Kun tilfældige engangsdatabaser, syntetiske konti og den eksisterende sorte MP4-fixture. Ingen produktionscredentials, webhoteladgang, SMS eller e-mails.

| Prøve | Faktisk resultat |
|---|---|
| Invitationer inkl. migrering fra forrige skema og gentagen migrering | 105 PASS, 0 FAIL |
| HTTP → rigtig database, fotos og direkte MP4 | 59 PASS, 0 FAIL |
| Kontosikkerhed/Authenticator | 152 PASS, 0 FAIL |
| Kontosletning | 62 PASS, 0 FAIL |
| Lychee-import | 128 PASS, 0 FAIL |
| Lychee-flytning | 110 PASS, 0 FAIL |
| Eksisterende MP4-import/streaming | 91 PASS, 0 FAIL |
| Rigtig Chromium → PHP → database, inkl. telefoninvitation og genbesøg | 7 beståede tests inkl. delprøver, 0 fejl |
| PHP-syntaks og JavaScript-syntaks | Bestået |

Desuden køres eksisterende prøver af mediesletning, sletteønsker, temaer, gallerioprettelse, asset-versioner, routing, webapp og FTPS-plan. Lokale Apache/FTPS-protokolprøver kræver installerede Apache/lftp og gennemføres i GitHub Actions med disse afhængigheder. Se den konkrete grønne Actions-kørsel og dens pakkeartefakt for CI-resultatet; lokal manglende klient tælles ikke som en bestået protokolprøve.

Fund under arbejdet: En tidlig uploadstørrelseskontrol lå foran autorisation og ændrede en forventet 403 til 413; kontrollen er flyttet ind efter adgangskontrollen og regressionen består. Test-fixtures med `INSERT ... VALUES` uden kolonnenavne er rettet til navngivne kolonner efter tilføjelse af telefonfeltet. Den virkelige browserprøve kontrollerer, at det skjulte e-mailfelt ikke blokerer telefonformularen.

100 MiB upload testes præcist på grænsen, én byte over, med forkert filindhold/MIME, uden rettigheder og med fremprovokeret databasefejl. Testenes finally-blokke stopper servere, sletter egne tempfiler og dropper egne tilfældige databaser.

## Genkørsel

Brug kun en isoleret database og aldrig produktionskonfiguration:

```bash
export LEXGALLERI_TEST=1
export TEST_DB_HOST=127.0.0.1
export TEST_DB_PORT=3306
export TEST_DB_USER=root
export TEST_DB_PASSWORD='kun-til-lokal-test'
php tests/run.php
php tests/invitations.php
php tests/account-security.php
php tests/member-delete.php
php tests/lychee-import.php
php tests/lychee-move.php
php tests/lychee-video.php
TEST_BROWSER=/usr/bin/chromium node --test tests/account-browser.test.mjs
python3 scripts/package-telefon-mp4.py
```

Hele den eksisterende testsekvens står i `.github/workflows/tests.yml` og køres før pakkeartefaktet offentliggøres i Actions. CI bruger MySQL 8.4. Migreringen bruger MySQL 8+/MariaDB 10.6+-kompatibel syntaks; faktisk databasetest er udført på de versioner, der er angivet her/af CI – ikke alle mellemliggende versioner.

## Installation og resterende kontrol

**Ikke installeret på webhotellet ved denne lokale kontrol.** Den eksisterende FTPS-konto er begrænset til offentlige filer; databasen og `/home/lexandkk/lexgalleri-private/` opdateres med ejerens cPanel-adgang efter [INSTALLER.md](../installation/telefon-mp4/INSTALLER.md). Pakken indeholder 12 offentlige filer, tre private programfiler, migrering 007 og vejledning, uden konfiguration eller medier.

Før åbning mangler kontrol af webhotellets uploadgrænser, private filrettigheder og en ufølsom MP4 i de faktiske mobilbrowsere. Appen omkoder ikke codecs: en strukturelt gyldig MP4 garanterer ikke, at alle browsere kan afkode filmen. H.264/AAC anbefales.

## Endelig GitHub-kontrol og pakke

- Testet kodecommit: `1dec9276ccfb3ddf543ee0b8e25fc42ac5e4253f` på `feature/lexgalleri-phone-mp4-v1`.
- [Grøn GitHub Actions-kørsel, forsøg 2](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41199635590/attempts/2), verify-job `124533496317`.
- Faktisk MySQL-version: **8.4.13**. Alle **1.000 PHP-kontroller** og **184 Node-/browserprøver** består. Apache-routing og lftp-protokolprøver er gennemført i CI; ingen skip i den grønne kørsel.
- [Download installationspakken](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41199635590/artifacts/13042018211) (GitHub-login med adgang til repositoryet kræves). 17 allowlistede filer + SHA256SUMS; 112.152 bytes som GitHub-artefakt. Udløber 30. november 2026.
- GitHub-artefaktets SHA-256: `996d19c795fc257287de64f51ecdced16f7df7aa08f29112eaddf9e48e3c848e`.
- [Samlet diff af de 21 ændrede/nye filer](https://github.com/alexhertzladiges-lab/LexGalleri/compare/4ca46ccdeda02f1a8637b7595c41ef0cd44a82d5...1dec9276ccfb3ddf543ee0b8e25fc42ac5e4253f). De lokale filers Git-blobhashes er kontrolleret mod denne GitHub-version.

Første forsøg på den endelige kode fejlede i den eksisterende passwordikon-browserprøves optælling af **alle** netværkskald (12 mod forventet 11). Samme prøve bestod i den foregående fulde kørsel, lokalt, i 12 isolerede genkørsler og i den fulde grønne genkørsel. Ingen runtime- eller testændring blev foretaget for at skjule fejlen. Den tidsafhængige netværksoptælling er et kendt udestående i testharnessen; den enkelte ekstra requests årsag er ikke fastslået.

Lokalt blev 0 tilbageværende tilfældige LexGalleri-testdatabaser bekræftet efter kørslerne. Opgavens egen MariaDB-proces blev stoppet, og dens datamappe fjernet. GitHub-jobbet stoppede og fjernede sin MySQL-service og sit engangsnetværk. Ingen webhotelfiler, produktionsdata eller konfiguration er ændret. Denne afsluttende rapportopdatering ændrer kun dokumentation; pakkens runtime er præcis det testede kodecommit ovenfor.


## Offentlig installation gennemført 31. oktober 2026

Efter særskilt besked »installer de offentlige filer« blev de 12 offentlige filer fra det testede kodecommit `1dec9276ccfb3ddf543ee0b8e25fc42ac5e4253f` installeret via den eksisterende, begrænsede FTPS-konto.

- [Grøn installationskørsel](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41203086179), job `124542623889`, installationscommit `4221cc861293f42a870d8f69ddce38e5964c7e69`.
- Det godkendte pakkeartefakt og alle 12 offentlige filer blev kontrolleret mod den grønne testkørsel før overførsel.
- Installationsrodens index.php blev kontrolleret før filændringer. Alle 12 filer blev genlæst via FTPS; samtlige SHA-256-kontrolsummer stemmer.
- HTTPS-forside, installeret app.js med hashkontrol og eksisterende kontosikkerhed består.
- Serverens status melder nu `reusable_phone_invitations=true` og `direct_mp4_upload=true`. Det viser den eksisterende private installations parathed; der er ikke oprettet en ny produktionskonto eller uploadet en prøvevideo som del af denne kørsel.
- Der blev ikke uploadet private programfiler eller konfiguration og ikke kørt SQL-migreringer.
- [Installationsbevis](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41203086179/artifacts/13043089144). Kontrolsummer og status gemmes også i `installation/telefon-mp4/public-installed.json`.
- Engangsworkflowet er efterfølgende låst med `if: false`. Kun offentlig installation er udført; ingen merge til main.
