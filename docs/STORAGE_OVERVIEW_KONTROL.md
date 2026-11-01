# LexGalleri – pladsoversigt

Aktiv opgave efter brugerens stop og præcisering: lille samlet pladsoversigt og tal pr. galleri i forhold til en grænse valgt af admin. Startværdi 25 GB, som tidligere oplyst af ejeren. Udgangspunkt er den installerede version `12e0e24971d1ed7da612eaf79813b7a0d16220df`. Udvikling sker isoleret fra de pauserede design-/nyheds-/aktivitetsændringer; de indgår ikke i denne pakke.

## Funktion

Admin får en kompakt oversigt under Administration → Overblik og Drift og sikkerhed: samlet filstørrelse, procent, forbrug mod grænsen, tidspunkt, Opdatér og Ret grænse. En udfoldelig liste viser bytes og andel af den samlede ramme pr. galleri. Mindst 80 % markeres gult, mindst 100 % rødt; overskridelse vises også med tekst.

Grænsen er et visningsbudget, ikke en ny hostingkvote eller uploadspærring. Værdien gemmes som et helt antal decimal-bytes i den eksisterende settings-tabel. Ingen migration eller ændring af datamodellen. 1 GB = 1.000.000.000 bytes. Brugerens øvrige handlinger og rettigheder bevares.

## Optælling og sikkerhed

- Kun faste mediemapper: originals, previews, thumbnails og .deletions. Ingen brugerbestemt sti, scanning af andre websites eller læsning af konfiguration/sessioner.
- Kun filmetadata læses; medieindhold afkodes ikke. Totalen er summen af filstørrelser, ikke filsystemets blokforbrug eller cPanels kvote. Database- og programfiler måles ikke.
- Fysiske hardlinks identificeres med device/inode og tælles kun én gang i totalen. Samme indhold kan indgå i flere galleriers tilknyttede forbrug. Skjulte importankre tæller ikke dobbelt.
- Igangværende sletninger og øvrige mediefiler tæller stadig i totalen. Der slettes eller flyttes ingen filer ved opgørelsen.
- Symlinks og andre særlige filtyper følges ikke. De eller ændringer under opgørelsen giver en tydeligt delvis opgørelse, uden en præcis påstand om resterende plads.
- Scanning er begrænset til 8 mappeniveauer, 200.000 poster og et begrænset hukommelsesforbrug. Afbrydelse giver fejl, ikke et falsk nul. Normale læsninger genbruger snapshot i højst 60 sekunder. En MySQL-lås forhindrer samtidige scanninger.
- GET /admin/storage, POST /admin/storage/refresh og PUT /admin/storage/limit kræver fuldt adminlogin med eksisterende MFA. Origin-/cookie-/sessionskontrol bevares. Kun limit_gb accepteres som ny indstilling. Ingen stier, credentials eller filnavne udleveres.
- Sene svar kan ikke overskrive en anden side eller en anden konto. Gallerinavne HTML-escapes. Ukendt/ugyldigt svar vises som fejl, ikke som ledig plads.

## Faktiske lokale prøver

PHP 8.4.24, MariaDB 11.8.6 og Chromium. Kun tilfældige engangsdatabaser, syntetiske konti og testmedier. En 31 GB sparse testfil afprøver store tal uden at oprette eller sende 31 GB indhold. Ingen produktionscredentials eller data bruges.

- Plads-HTTP/database: **46 PASS, 0 FAIL**. Omfatter default, total/pr. galleri, hardlinks på tværs af gallerier, importankre, restfiler, ventende sletning, eksternt symlink, cache, genopdatering, samtidighedslås, overskridelse, eksakte decimaler og afvisning af medlem/pending MFA/fejlinput/forfalsket origin og sti.
- Eksisterende HTTP-kæde inkl. upload/video: **76 PASS, 0 FAIL**.
- Rigtig browser/PHP/database: **12 tests bestået**, inklusive grænseændring og genlæsning, liste pr. galleri samt layout og trykflader ved 320, 390 og 1280 px.
- Konto-/UI-prøver: **23 PASS, 0 FAIL**, inklusive XSS-escaping, overforbrug, delvis opgørelse og et sent svar efter navigation.
- Eksisterende webapp-browserprøver: **72 PASS, 0 FAIL**.
- Eksisterende PHP-regressioner: kontosikkerhed 152, invitationer 105, kontosletning 62, mediesletning 55, sletteønsker 97, gallerioprettelse 43, Lychee-video 91, import 128, flytning 110; alle uden fejl.

Den nye browserprøves første fejl under udvikling forventede GB i en række med kun få kB syntetiske data. Målefunktionen var korrekt; prøven er rettet til at kontrollere andelen og den faktiske enhedsformatering. Den samlede browserprøve er derefter grøn.

## Genkørsel og levering

Brug kun en isoleret testdatabaseserver:

```bash
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password php tests/storage-overview.php
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=test-only-password TEST_BROWSER=/usr/bin/chromium node --test tests/account-browser.test.mjs
node --test tests/account-ui.test.mjs
python3 scripts/package-telefon-mp4.py --storage-overview
```

CI genbruger den eksisterende MySQL 8.4-opsætning og fulde regression. Pakkescriptet genbruges med en ny option; der bygges ikke et nyt testsystem. Pakken har kun 12 offentlige filer, én privat app.php, vejledning og checksums. Ingen SQL, konfiguration, medlemmer, sessionsfiler eller medier.

Installationsvejledning: `installation/storage-overview/INSTALLER.md`. Endelige GitHub-resultater og pakkelink tilføjes efter CI. Ingen ændringer er udført på webhotellet. Ny privat app.php og offentlig kode skal installeres fra samme testede version; konkret webhotelopgørelse valideres ved admins første besøg.
