# LexGalleri – slet hele gallerier

**Status: kodet, fuldt testet og pakket. Ikke installeret.**

Appen hedder **LexGalleri**; dens offentlige adresse er **https://lexan.dk/lexgalleri/** med små bogstaver. Fiskerhyttens LexApp ligger på **https://fiskerhyttenkoege.dk/dk/** i et andet repository og er urørt. Branch `feature/lexgalleri-gallery-deletion-v1`, afledt fra `aa9ebb3db07768e6ab756328b88bde47276376ba`.

## Adfærd

Admin kan vælge **Slet galleri** i et galleri eller under Administration → Indhold. Admin ser antal billeder/videoer og skriver det præcise gallerinavn før sletning. Alle medier, favoritter, galleriadgange og galleriets invitationsbindinger fjernes. Andre gallerier og importkildens originalfiler bevares.

Et almindeligt medlem kan vælge **Send galleri til sletning** på sit eget galleri, se afventende status og annullere anmodningen. Admin behandler hele gallerier under Administration → Sletteønsker med **Gennemgå og slet galleri** eller **Afvis anmodning**. Uploader-/redigeringsadgang til en andens galleri giver ingen ejerrettighed. Ældre gallerier kan have behov for ejerudpegning via den eksisterende funktion Del med medlemmer → Galleriets ejer.

En anmodning sletter intet. Ved godkendelse kontrollerer serveren den aktuelle ejer og rettigheder igen. Admins direkte sletning er selvstændigt autoriseret. Login og Authenticator bevares; afventende MFA er utilstrækkeligt.

## Gennemførelse og sikkerhed

- Fastlåst galleri-id og version af navn/media-id-liste beskytter mod et forældet bekræftelsesvindue. Andre gallerier kan ikke vælges ved at ændre ejerfelter.
- Serveren kontrollerer roller, ejer, rettigheder og origin. Klientens knapper er ikke adgangskontrol.
- Højst ti medier behandles pr. forespørgsel. Klienten fortsætter først efter et gyldigt svar. Gentagne requests er serialiseret og kan genoptage den samme operation.
- Den eksisterende journallerede mediesletning håndterer originale billeder, MP4, forhåndsvisninger, miniaturer, favoritter og importkvitteringer. Den kontrollerer også, at en fil stadig tilhører det godkendte galleri.
- Når sletning er startet, spærres normal adgang til galleriet. Afbrudte sletninger vises for admin og kan genoptages. Filer, som allerede er slettet, kan ikke gendannes via Annullér.
- Galleriets sidste metadata-/referenceændringer sker i én transaktion. Indhold slettes i genoptagelige portioner, ikke én stor transaktion. Der meldes ikke fuldført, før filoprydning og den sidste transaktion er bekræftet.
- Invitationslinks til flere gallerier bevarer kun de øvrige galleriers rettigheder; primærbindingens gamle rettighedsflag overføres ikke ved flytning af invitationens anker.
- Importerede album-mappinger fjernes for det slettede galleri, så de hverken blokerer fremmednøgler eller genopretter det slettede galleri ved automatisk fortsættelse. Gennemførte billedimportkvitteringer bevares. Andre mappinger og kildefiler bevares.
- Status for sletning og seneste medlemsanmodning gemmes med faste, korte nøgler i den eksisterende settings-tabel. Ingen ny SQL-migrering eller ekstern pakke er nødvendig.

## Lokale resultater

Syntetiske konti/filer; PHP 8.4.24 og lokal engangs-MariaDB 11.8.6 på loopback. Ingen webhoteladgang eller produktionscredentials. Ingen e-mail, SMS eller Signal-beskeder.

| Kontrol | Resultat |
| --- | --- |
| Ny HTTP/PHP/database-test `tests/gallery-delete.php` | 91 kontroller, 0 fejl |
| Eksisterende `tests/media-delete.php` | 55 kontroller, 0 fejl |
| Eksisterende `tests/media-delete-requests.php` | 97 kontroller, 0 fejl |
| Eksisterende oprettelse, ejerskab og deling | 104 kontroller, 0 fejl |
| Hele eksisterende browserfil inkl. første tre nye forløb | 77 prøver, 0 fejl |
| Seks afsluttende nye browserforløb | 6 prøver, 0 fejl |
| Eksisterende Node account/UI-tests | Bestået |
| PHP/JavaScript/Python-syntaks | Bestået |
| Allowlist-pakning | 14 filer plus SHA256SUMS, ingen SQL/config/sessioner/medier |

Regressionerne dækker ejerens anmodning, dublet, annullering, afvisning, admins godkendelse og direkte sletning af tomt galleri, navne-/versionsbekræftelse, ændret ejerskab, tilbagekaldte ejer-/adminrettigheder, afventende MFA, origin/cross-site, MP4/billeder, import- og invitationsreferencer, andre galleriers filer samt database-/journalfejl og genoptagelse. Browseren kontrollerer bl.a. dobbeltklik, låst dialog under afsendelse, afbrudt svar, genoptagelse og valgt anmodnings-id.

En automatisk testgodkendelse anvendte først den tidligere LexApp-afgrænsning og afviste lokal testnetadgang. Den aktuelle lexgalleri-opgave og behovet for loopback-sockets blev dokumenteret; den isolerede testkørsel blev derefter godkendt. Der blev ikke omgået en netværksafvisning eller anvendt en produktionsforbindelse.

## GitHub og pakke

Den eksisterende `.github/workflows/tests.yml` er udvidet med den nye database-test og pakkemuligheden `--gallery-delete`. Samlet MySQL 8.4-/Node-/browserkontrol og præcis CI-pakke afventes her, indtil resultatet er journalført. Første kørsel 41799986928 bestod alle PHP/databaseprøver, men to ældre VM-dialogprøver savnede modalens querySelector-metode. Lukkehåndteringen anvender nu den eksisterende globale formvælger; de gamle dialogprøver og de seks nye browserforløb består lokalt. Både begyndelse og afslutning af slettejobbet kræver desuden eksplicit databasebekræftelse. En afsluttende fuld CI køres på den præcise kildecommit.

Genkør med de eksisterende syntetiske TEST_DB-indstillinger og `LEXGALLERI_TEST=1`:

```sh
php tests/gallery-delete.php
php tests/media-delete.php
php tests/media-delete-requests.php
php tests/gallery-create.php
node --test tests/webapp.test.mjs tests/account-ui.test.mjs
TEST_BROWSER=/usr/bin/chromium node --test tests/webapp-browser.test.mjs
python3 scripts/package-telefon-mp4.py --gallery-delete
```

Pakken `dist/lexgalleri-gallery-delete/` indeholder de 12 offentlige filer, privat app.php, INSTALLER.md og SHA256SUMS. Den eksisterende lexgalleri-FTPS-konto har kun offentlig adgang; den private fil skal fortsat installeres i den rigtige private mappe med 0600. Vejledning: `installation/gallery-delete/INSTALLER.md`.

## Afgrænsning

Ikke installeret på webhotellet. Ingen rigtige gallerier, konti, medier, adgangsrettigheder eller credentials er ændret. Ingen merge. En konkret grøn pakke skal godkendes før installation; der må ikke køres en sletteprøve med rigtige gallerier uden særskilt aftale. Fysiske telefoner er ikke testet i denne opgave.

## Afsluttende grøn kontrol

Kildecommit `8c70814d44cfd95adfc32e28ef1e5ca878485d20`. [GitHub Actions 41801200808](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41801200808), job126477101617: **SUCCESS**.

- **1.274 PHP-/MySQL 8.4-kontroller**, inklusive de 91 nye galleri-slettekontroller, bestået.
- **209 Node-/browserprøver**, inklusive de seks nye browserforløb og de eksisterende login-, profil-, import- og galleri-prøver, bestået. Ingen fejl eller oversprungne prøver.
- Alle pakker blev bygget efter testene. Den konkrete pakke for denne opgave er `lexgalleri-gallery-delete-8c70814d44cfd95adfc32e28ef1e5ca878485d20`, artifact 13307512756, 106.134 bytes.
- [Download den testede pakke](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41801200808/artifacts/13307512756). GitHub-adgang kræves.
- ZIP-SHA256: `6a0b5b408fb720b3221ac13d60dace1ab033b8b90e7f3b5d01384bf1517b14b9`.
- Pakken blev genhentet og kontrolleret uafhængigt: ZIP-digest og CRC, alle 14 SHA256SUMS-poster, præcis 12 offentlige filer + privat app.php + vejledning. De to programfiler matcher de lokalt testede bytes. Ingen SQL, config, sessioner, originals eller andre private medier. Pins: `installation/gallery-delete/release.json`.
- Den lokale engangs-MariaDB er stoppet; hver test rydder egne databaser, filer, PHP-servere og browserprofiler op.

Den senere journalcommit ændrer kun dokumentation og pakke-pins. Kildecommit og artifact ovenfor er de testede. Ingen produktionstest med rigtige gallerier og ingen installation er udført.

### Ændrede filer

- `private/app.php`: beskyttede endpoints, ejeranmodninger, moderationskø, navne-/versionsbekræftelse, genoptagelig batchsletning og referenceoprydning.
- `public/static/app.js`: ejerens anmodning/annullering, admins direkte sletning og godkendelse/afvisning/genoptagelse.
- `tests/gallery-delete.php`, `tests/webapp-browser.test.mjs`: database-/HTTP- og browserregressioner.
- `.github/workflows/tests.yml`, `scripts/package-telefon-mp4.py`: genbrug af eksisterende CI og allowlist-pakning med `--gallery-delete`.
- `installation/gallery-delete/INSTALLER.md`, `installation/gallery-delete/release.json` og denne rapport.

Før installation: godkend den konkrete pakke og upload den private app.php til den eksisterende private lexgalleri-mappe med 0600. Den offentlige FTP-konto kan derefter installere de offentlige filer. Ingen ny SQL er nødvendig. Gallerier slettes kun gennem en efterfølgende, udtrykkeligt bekræftet adminhandling i appen.

## Navn og adresse præciseret

Produktnavnet er **LexGalleri**. Produktionsadressen er præcist **https://lexan.dk/lexgalleri/**; `/LexGalleri/` er en gammel URL, som eksisterende routing kan viderestille til den lille adresse. Det er ikke en anden app. Fiskerhyttens **LexApp** er den separate app på **https://fiskerhyttenkoege.dk/dk/**.

Repositoryets AGENTS.md fastholder denne opdeling. Installationsværktøjet er låst til LexGalleris egen server/konto og kontrollerer den godkendte offentlige bootstrap før upload. De konkrete LexApp-værdier afvises, også ved ren forbindelsesdiagnose. Dette er kontrolleret uden netværk eller filoverførsel. Fysisk mappenavn følger eksisterende routing og den verificerede FTPS-rod; det udledes ikke af store/små bogstaver i produktnavnet.

Den grønne pakke, programfilerne og kontrolsummerne er uændrede. Dens tidligere brug af lille produktnavn i pakketekstens overskrift ændrer ikke appnavnet eller adressen; denne præcisering og AGENTS.md er den supplerende vejledning. Ingen installation eller omdøbning er udført.

## Installationsforsøg 4. november 2026

Ejeren godkendte installationen med »ok installér«. Den godkendte pakke er fortsat artifact13307512756 fra den grønne kildecommit8c70814d44cfd95adfc32e28ef1e5ca878485d20; runtime og kontrolsummer er uændrede.

[Installationskørsel41804486568](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41804486568), job126488017307, commitb7635c1e25c8bd55d18b62439b3cf4fcc93d28d5:

- PASS: grøn testkilde, CI-artifactets SHA-256, præcis fil-allowlist, alle14 manifestposter og byte-sammenligning med testkilden.
- PASS: alle15 eksisterende FTPS-plantests og shellsyntaks.
- PASS: HTTPS200 på den præcise lille URL `https://lexan.dk/lexgalleri/api/status`, eksisterende sikkerhedsheaders, lukket installation, kontosikkerhed, pladsoversigt og medlemsdeling.
- STOP: privat backend annoncerer endnu hverken `gallery_delete` eller `gallery_delete_requests`. Den påkrævede backendkontrol afbrød før installation af FTPS-klient og før forbindelse/overførsel af offentlige filer.
- Ingen produktionsfiler, SQL eller rigtige gallerier blev ændret. Jobstatus er FAILURE på grund af denne manglende forudsætning, ikke en fejlet programtest.

Den ikke-følsomme status er genhentet og kontrolleret: artifact13309332216, ZIP-SHA256 `6f0af023979f0a17dbd12bd88bc884ef1843301c123e9343ab3acacf57e6e2a7`. Resultatet findes i `installation/gallery-delete/backend-preflight.json`; forløb og genoptagelse i `installation/gallery-delete/pending-installation.json`.

### Næste konkrete trin

Ejeren henter [den allerede testede pakke](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41801200808/artifacts/13307512756), pakker den ud og erstatter **kun** pakkens `private/app.php` på `/home/lexandkk/lexgalleri-private/app.php` via cPanel med0600. Filens SHA-256 skal være `9783bf8f6ef1eae352eea179a4739c1b97172054120c11a5a1278bae293ad53a`. Ingen SQL eller ændring af konfiguration, security.php, medier, sessions eller routing kræves.

FTPS-kontoen er begrænset til de offentlige filer; den kan ikke udføre dette private trin. Når filen er uploadet, genkøres alene det fejlede installationsjob126488017307 på den uforanderlige installationscommit. Det genkontrollerer pakken og backend før de12 offentlige filer overføres og genlæses. Godkendelsen til samme konkrete pakke gælder fortsat. Workflowets nye push-kørsler er sat på pause med `if: false`, så journalændringer ikke udløser en installation. En vellykket overførsel skal efterfølgende journalføres særskilt; dette dokument hævder ikke, at installationen er fuldført.

## Fuldført installation 4. november 2026

Efter ejeren skrev »uploadet« blev det allerede godkendte installationsjob genkørt på den uforanderlige installationscommit. [Kørsel41804486568, forsøg2](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41804486568/attempts/2), job126509164268: **SUCCESS**. Installationen blev verificeret kl.10.56 dansk tid. De foregående afsnit beskriver historiske test- og første-forsøgsresultater; den aktuelle status er installeret.

- PASS: samme grønne kilde, uændret artifact13307512756, ZIP-digest, præcis allowlist, alle14 manifestposter og byte-sammenligning med den testede kilde.
- PASS: alle15 eksisterende FTPS-plantests og shellsyntaks.
- PASS: privat backend annoncerer nu gallery_delete og gallery_delete_requests samt eksisterende kontosikkerhed, pladsoversigt og medlemsdeling. Ejeren uploadede den private fil; FTP-kontoen læste eller ændrede den ikke. Der hævdes ikke en separat hashkontrol af private serverbytes.
- PASS: korrekt LexGalleri-host/konto, TLS med certifikat-/værtsnavnekontrol og godkendt offentlig bootstrap før ændringer. Alle12 offentlige filer blev installeret gennem den eksisterende allowlist og genlæst med korrekt størrelse og SHA-256.
- PASS: den præcise lille HTTPS-adresse, offentlig indgang, JavaScript-/CSS-SHA-256 og eksisterende kontosikkerhed samt begge nye slettefunktioner efter overførsel.
- Ingen SQL, routing, medlems-/mediedata eller rigtige gallerier blev ændret eller slettet af installationsjobbet. Fiskerhyttens separate LexApp indgik ikke i installationen.

Installationsbevis: artifact13312311932, ZIP-SHA256 `0780508299d55fb9ba6f6b0b382fc5392e6d129e0c94c0405fdb654dc7a23534`. Den nye backendkontrol: artifact13311943065, ZIP-SHA256 `ade321857a263d91c471b83c14a528f20a3e70cdc57d58434e08df42a69c9e09`. Begge er genhentet og kontrolleret; alle12 offentlige digests matcher release.json.

Journal og kontroller: `installation/gallery-delete/public-installed.json`, `backend-preflight.json`, `release.json` og den afsluttede `pending-installation.json`. Godkendelsen er forbrugt. Engangsworkflowet forbliver `if: false` og er markeret som afsluttet; historiske installationsjobs må ikke genkøres på denne godkendelse.

Appen kan genindlæses. Admin kan slette hele gallerier med navnebekræftelse. Ejere kan anmode om sletning af deres egne gallerier; admin kan godkende eller afvise. Funktionelle sletteforløb er dækket af de grønne syntetiske HTTP-/database- og browsertests (1.274 PHP-kontroller og209 Node-/browserprøver). Installationen tilføjede ikke en destruktiv prøve med rigtige produktionsgallerier. Ingen merge er udført.
