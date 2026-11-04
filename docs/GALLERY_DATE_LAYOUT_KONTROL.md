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

## Afsluttende grøn kontrol og installation

[Kilde96094e9c0d68d2a7a922b2e27389fd25612e2a3a, CI41823053945](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41823053945), job126550748857: **SUCCESS**. **1.340 PHP-/MySQL8.4-kontroller og228 Node-/browserprøver**,0 fejl. Testet offentlig pakke13316889178, SHA256 `ac77f1ad3a2bce421d56d8742c2b26bac00be5eb14858a5e9f67f2393c940c19`. Pakken er genhentet og kontrolleret uafhængigt: ZIP-digest/CRC, præcis14-entry-allowlist og alle13 manifestposter matcher kildefilerne. Ingen private filer eller SQL.

[Installation41823659759](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41823659759), job126552801586, commit`ec40cfa5a8c4567eea237873f270b2f2548b1b99`: **SUCCESS**. Eksisterende backend bekræftet før offentlig upload,15 FTPS-plantests bestået, mål-/bootstrapkontrol og obligatorisk verificeret TLS bevaret. Alle12 offentlige filer er genlæst med korrekt størrelse og SHA256. HTTPS-indgang, JavaScript/CSS-hashes, nye galleridatofunktioner, bevaret masseredigering/knaptekst og eksisterende kontosikkerhed/gallerifunktioner er efterkontrolleret.

Installationsbevis artifact13317683434, ZIP-SHA256 `451ad084eb16866f3c0d3830cd779757b541be3a6e1a6f2796271fe3123f68d9`. Backendkontrol artifact13317592459, ZIP-SHA256 `75c5b68d36a38d4aa62310a2726db16b591d7cd2c64abf177a10d9dc722c401c`. Begge genhentet og kontrolleret; de12 installerede digests matcher den testede pakke og lokale filer.

Journal/pins: `installation/gallery-date-layout/public-installed.json`. Anmodningen er opfyldt, og engangsworkflowet er lukket. Ingen privat upload, SQL, routingændring, rettelse/sletning af rigtige gallerioplysninger, ændring af Fiskerhyttens LexApp eller merge. Alle funktionelle skriveriprøver brugte syntetiske browserdata. Genindlæs appen for samme datodesign i gallerierne.
