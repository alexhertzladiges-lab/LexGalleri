# lexgalleri – slet hele gallerier

Kun lexgalleri. Fiskerhyttens LexApp er en anden app og er urørt. Branch `feature/lexgalleri-gallery-deletion-v1`, afledt fra `aa9ebb3db07768e6ab756328b88bde47276376ba`.

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
