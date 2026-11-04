# LexGalleri: admin-masseredigering af metadata

Admin kan i et galleri vælge **Redigér alle billeder** og sætte flueben ved dato/datopræcision, sted, fælles titel og/eller GPS. Gennemgangen viser antal billeder og videoer samt præcise nye værdier. Bekræftelse kræver galleriets navn. Felter uden flueben, originalfiler, filnavne, uploader, uploadtid og andre gallerier bevares.

## Implementering og sikkerhedsgrænser

- To eksisterende HTTP-routingtilføjelser: POST `/galleries/{id}/metadata-preview` og `/metadata-apply`. Kun admin efter fuld autentificering/MFA; almindelige ejere og redaktører har ingen adgang.
- Kun en fast liste metadatafelter accepteres. Dato og præcision samt begge GPS-koordinater valideres samlet. SQL-værdier bindes; ingen stier, ejerskab, roller eller filnavne kan vælges.
- En tilfældig engangsgennemgang bindes til admins session, bruger, galleri, valgte værdier og en SHA-256 over de gennemgåede metadata. Udløber efter10 minutter; ny gennemgang erstatter den gamle. Apply accepterer kun token og navnebekræftelse.
- Det eksisterende eksklusive galleri-låseforløb genbruges. I transaktionen låses den aktuelle adminrække, galleriet og alle berørte billedrækker; rettigheder og metadata genkontrolleres før en samlet UPDATE. En SQL-fejl ruller alt tilbage. Ændret galleriindhold eller metadata kræver ny gennemgang.
- Brugerfladen sender kun valgte felter, invaliderer gennemgangen ved redigering, låser dobbelttryk/lukning under afsendelse og genafsender aldrig automatisk ved fejl. Funktionen vises kun ved den nye servercapability `gallery_bulk_metadata`.

## Faktisk lokal kontrol

Udvidelse af den eksisterende `tests/gallery-create.php`, samme fixtures og oprydning: **170 PASS,0 FAIL** på lokal MariaDB11.8.6/PHP8.4.24. Inkluderer almindelige gallerioprettelses-/delingsregressioner samt55 første bulk-kontroller og11 ekstra kontroller. Dækket: HTTP/autentificering/MFA, medlemmer/ejere, origin/cross-site, feltvalidering, rigtige JPEG/MP4-uploads, preview uden skriverier, navne- og tokenbinding, uændrede felter/filer/andre gallerier, engangsbrug, atomar rollback, eksplicit rydning, gammelt snapshot, nye uploads, galleriomdøbning, en anden MFA-bekræftet adminsession og fjernelse af adminrollen.

Eksisterende browserfixture udvidet: **7 PASS,0 FAIL,0 skipped** for feltvalg, gennemgang uden skriverier, ændrede værdier, navnebekræftelse, dobbelttryk/Escape, fejl uden automatisk genafsendelse, en bekræftet gemning efterfulgt af en fejlet galleriopdatering og lukket adgang for medlemmer/ældre backend. Eksisterende Node-regressioner for import, konto og webapp: **91 PASS,0 FAIL**. PHP/JavaScript-syntaks er kontrolleret. Pakning genbruger `scripts/package-telefon-mp4.py --gallery-bulk-metadata`:14 tilladte filer plus SHA256SUMS, ingen konfiguration/SQL/sessioner/medier.

Alle prøver bruger syntetiske data, localhost og engangsdatabaser. Ingen webhotel, produktionsdatabase, e-mail eller SMS bruges i prøverne. Den samlede GitHub Actions-kørsel og konkrete artifact registreres efter grøn CI. Der er endnu ikke installeret en bulk-opdatering på webhotellet; den allerede installerede kompakte tidslinje er uændret.

## Genkørsel

```sh
LEXGALLERI_TEST=1 TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=33087 TEST_DB_USER=root TEST_DB_PASSWORD= php tests/gallery-create.php
node --test --test-name-pattern='admin reviews only selected gallery metadata|members and an older private backend' tests/webapp-browser.test.mjs
python3 scripts/package-telefon-mp4.py --gallery-bulk-metadata
```

Vejledning til den nødvendige private app.php-upload med0600 og efterfølgende offentlig installation: `installation/gallery-bulk-metadata/INSTALLER.md`. Ingen ny SQL. Ingen merge og ingen masseredigering af rigtige gallerier som installationstest.

Fund og rettelse: En bekræftet metadata-gemning efterfulgt af en fejlet læsning af galleriet kunne skjule resultatet. Brugerfladen bekræfter nu, at oplysningerne er gemt, og beder om genindlæsning uden at gentage skriveriet. En browserregression dækker forløbet.

## Afsluttende grøn CI og konkret pakke

Testet kilde: `d64d46ab61a36601f49c0547e6a1541cdeec6770`. [GitHub Actions41818566701](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41818566701), job126535571210: **SUCCESS**. **1.340 PHP-/MySQL8.4-kontroller og223 Node-/browserprøver**, ingen fejl eller oversprungne prøver. Den endelige lokale brugerfladeprøve bestod7 kontroller; de170 lokale databasekontroller og91 gallerisletningsregressioner er ligeledes bestået.

[Download den testede bulk-pakke](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41818566701/artifacts/13315519372), artifact13315519372,110.510 bytes. ZIP-SHA256: `4a319da2e96b9dde1d2173ef0df8a690f2da492a50e9832bbf7d252357e6dd12`. Pakken er uafhængigt genhentet: ZIP-digest/CRC, præcis allowlist, alle14 manifestposter og byte-sammenligning med de lokalt testede programfiler bestod. Pins: `installation/gallery-bulk-metadata/release.json`.

### Hvad der mangler før denne funktion installeres

Ejeren skal først uploade pakkens **private/app.php** til **/home/lexandkk/lexgalleri-private/app.php** med rettighed **0600**. Privat fil-SHA256: `24d74be63d625b6799f88d58fc46c67ed7391c5f884fac79666919cb472fd2f8`. FTPS-kontoen har kun offentlig adgang og må ikke tilgå privatmappen. Bevar config, security.php, sessions, originaler, miniaturefiler og importmodulet; ingen ny SQL.

Det efterfølgende offentlige installationsworkflow er færdiggjort, syntakskontrolleret og **deaktiveret** i `.github/workflows/install-gallery-bulk-metadata-public.yml`. Det låser præcis grøn kilde/pakke og kræver `gallery_bulk_metadata=true` over den lille HTTPS-adresse før offentlig upload. Det genbruger eksisterende mål-/bootstrapkontrol, obligatorisk verificeret TLS,12-fil-allowlist og hashgenlæsning. Aktivér kun efter ejerens bekræftelse af den konkrete private upload; markér forløbet afsluttet efter verificeret installation. Den nye bulk-funktion er endnu ikke installeret.

Den tidligere godkendte kompakte tidslinje er allerede installeret og verificeret i kørsel41815491054. Ingen bulk-skrivning af rigtige medlems-/gallerioplysninger, ingen ændring af Fiskerhyttens LexApp og ingen merge er udført. Den lokale MariaDB er stoppet, og SHOW DATABASES bekræftede, at alle engangsdatabaser var fjernet. Hver test ryddede sine PHP-servere, private fixtures og browserprofiler op.

## Fuldført installation 4. november 2026

Efter ejerens »uploadet« blev den præcist låste pakke installeret. [Installation41819919706](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41819919706), job126540108365, commit`aa2cd3ff9dc7758c2f2d087d5731cad8347c81dd`: **SUCCESS**. Tidligere afsnit om manglende privat upload er historik; den aktuelle status er installeret og verificeret.

- PASS: den uændrede grønne testkilde, artifactets ZIP-digest, præcis15-entry-allowlist, alle14 manifestposter og sammenligning med kildefiler.
- PASS:15 eksisterende FTPS-plantests og shellsyntaks; den private backend annoncerer gallery_bulk_metadata=true før offentlig overførsel.
- PASS: LexGalleris låste host/konto, bootstrapkontrol før ændringer og verificeret TLS. Alle12 offentlige filer overført og genlæst med korrekte SHA-256.
- PASS: lille HTTPS-indgang, JavaScript/CSS-hashes, ny adminfunktion, bevaret datotidslinje og knaptekst samt eksisterende kontosikkerhed, galleri-/medlemsdeling og slettefunktioner.

Installationsbevis artifact13315704273, ZIP-SHA256 `1413b02c48e00873d32e3ac1eba6430c8ae478164b3a3ef34da3f49d79ca84d3`. Backendkontrol artifact13316671162, ZIP-SHA256 `4594c26257e12d87f9177573f29c90f902cf5341e805633c83381c953e3c5d3f`. Begge er uafhængigt genhentet; installationsbevisets12 offentlige digests matcher den grønne release og lokale filer.

Den private fil blev lagt ind af ejeren, ikke gennem vores begrænsede offentlige FTP-konto. Serverens private filbytes blev ikke læst; tilgængelighed og funktion blev kontrolleret via HTTPS-capabilities. Ingen SQL, ændring af rigtige gallerioplysninger, routing, konfiguration, medier eller Fiskerhyttens LexApp. Funktionelle masseændringer blev kun prøvet med syntetiske lokale/CI-data. Ingen merge.

Journal: `installation/gallery-bulk-metadata/public-installed.json`, `backend-preflight.json` og opdaterede release-pins. Godkendelsen er forbrugt, og engangsworkflowet er lukket. Admin kan genindlæse appen, åbne et galleri og vælge **Redigér alle billeder**; kun valgte felter ændres efter gennemgang og navnebekræftelse.
