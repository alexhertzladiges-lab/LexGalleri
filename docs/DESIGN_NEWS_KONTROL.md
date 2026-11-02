# LexGalleri – kompakt design og nye billeder

Genoptaget efter ejerens besked »test og install nu«. Samlet oven på den installerede pladsoversigt, programversion e301b275e854a6b15e8e86cbd2f7887d2784e112, og installationsrapport-commit 12c3f08c6ab6ce3c74852daeaf2b359af5d0c418. Intet arbejde fra Fiskerhytten/LexApp indgår.

## Leverance

Kompakt top, to galleri-kort ved siden af hinanden på mobil, vedvarende bundmenu, kontomenu og samlede gallerihandlinger. Aftalte varme tegl-/elfenbens-/skovfarver erstatter den urørte oprindelige palet; tilpassede paletter bevares ved offentlig installation. Administrationsområder vælges fortsat i den samlede områdevælger. Pladsoversigten og den gemte grænse bevares.

Privat opdatering: påmindelser ved login/under brug, mærker på nye gallerier og medier samt adminoversigt over login/åbnede gallerier og seneste uploads. Ingen historik over individuel billed-/videoåbning. Der gemmes ingen IP eller læsetid i aktivitetsdata. Hændelser filtreres til 30 dage, med begrænset oprydning. Session/MFA/Origin og eksisterende galleriadgang gælder fortsat.

SQL 008 tilføjer tre tabeller og én engangsaktivering af paletten. Det eksisterende register, adgangskoder, MFA og medier ændres ikke. Den private app fungerer også inden SQL 008; funktionerne for nyt/aktivitet bliver først tilgængelige efter komplette tabeller. Ny offentlig kode virker desuden med den allerede installerede private backend og sender ingen understøttelsesløse nyheds-/aktivitetskald.

## Lokale resultater

PHP 8.4.24, MariaDB 11.8.6, Chromium. Kun syntetiske konti og medier, tilfældige engangsdatabaser på 127.0.0.1. Ingen produktionsdatabase, private credentials, mail eller SMS.

- Nyheds-/aktivitets-HTTP/database: **55 kontroller, 0 fejl**. Adgangsfiltrering, first-use-baseline, idempotens, egne uploads, snapshot-kvittering, ankomst efter snapshot, falsk origin, forfalsket bruger, MFA, kontosletning, retention og ufuldstændig migration.
- Plads-HTTP/database: **46 kontroller, 0 fejl** efter samling.
- Rigtig PHP/database/browser: **13 tests bestået**, inkl. eksisterende login/MFA, profiler, telefoninvitationer, MP4-miniaturer, pladsgrænse samt to konti med nyhedspåmindelse, galleriåbning og adminaktivitet.
- Eksisterende webapp-browser: **72 tests bestået** før de sidste visuelle rettelser; ny særskilt kompatibilitetsprøve bestået bagefter.
- Konto-/UI: **24 tests bestået**, inklusive paletkompatibilitet og bevarelse af tilpassede farver.

Under visuel kontrol blev to konkrete fejl rettet: author-CSS kunne vise skjulte »0 nye«-mærker, og det gamle mobil-layout kunne placere knappen under overskriften. Skjult mærke og kompakt vandret overskrift kontrolleres nu i rigtig browser. Kontomenuens trykflade er 44 px. Mobil 320/390 px, tablet 768 px og pc 1280 px kontrolleres for overflow og navigation. Der er særskilt prøve af den offentlige opdatering inden privat nyhedsopdatering.

## Genkørsel og installation

Eksisterende tests og pakker genbruges. `php tests/news-activity.php`, `php tests/storage-overview.php` og `node --test tests/account-browser.test.mjs` køres med `LEXGALLERI_TEST=1` og en isoleret TEST_DB_HOST/PORT/USER/PASSWORD. `node --test tests/webapp-browser.test.mjs tests/account-ui.test.mjs` og `python3 scripts/package-telefon-mp4.py --design-news`.

Vejledning: installation/design-news/INSTALLER.md. Test- og installationsresultater fra GitHub tilføjes efter kørsel. Offentligt design installeres med eksisterende FTPS-allowlist og kontrolsummer. Private programfiler og SQL skal ejeren installere via cPanel, da FTPS-kontoen ikke har den adgang. Der åbnes ingen alternativ adgang til de private filer.
