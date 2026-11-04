# LexGalleri: datodesign i selve gallerierne

Ejeren bad om tidslinjens samme design inde i gallerierne. De eksisterende datosektioner og CSS genbruges:6 miniaturer pr. række på pc,3 på mobil, alle filer under én datooverskrift før den næste dato. Favoritter beholder deres eksisterende visning.

Optagedatosortering bruger optagedato, ellers uploadtid; uploadsortering grupperer efter uploadtid uden at tilføje omtrentlige optagedatoer. Søgning giver kun grupper og antal for de synlige filer. En daterettelse flytter det eksisterende kort i den filtrerede oversigt uden at genhente billedet. Sletning opdaterer datoens antal og fjerner en tom sektion. Eksisterende adgangs-/sletningskontroller og billed-/videovisning genbruges.

Lokal Chromium: **26 PASS,0 FAIL,0 skipped** inklusive de nye galleri-forløb og eksisterende dato-, billedvalgs- og medlemssletteforløb. Nye kontroller omfatter datoorden/præcision,3/6 kolonner ved320,390,1280 og1920px, ingen vandret overflow, uploadsortering, tom/filtreret søgning, metadatarettelse med bevarede billednoder, tællere og tomme datosektioner ved sletning. De eksisterende48 import-/billedviser-unitprøver bestod; DOM-fixturen fik den virkelige dataset-egenskab, som layoutet bruger.

Kun public/static/app.js ændrer runtime. Privat backend og CSS er uændrede. Pakning genbruger den eksisterende allowlist med --gallery-date-layout:12 offentlige filer, INSTALLER.md og SHA256SUMS. Ingen privat upload, SQL eller ændring af brugerdata er nødvendig. Samlet CI og konkret installation journalføres efter grøn kontrol. Fiskerhyttens LexApp indgår ikke.

Genkørsel:

```sh
node --check public/static/app.js
node --test --test-name-pattern='gallery uses compact date sections|gallery deletion selects exact media|members request deletion approval|editing a capture date|timeline keeps each date' tests/webapp-browser.test.mjs
python3 scripts/package-telefon-mp4.py --gallery-date-layout
```
