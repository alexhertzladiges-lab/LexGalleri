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


## GitHub-test, 2. november 2026

- Testet programversion `722f4031475489dfe05cf0ab06adfa856106dcc0`, branch `feature/lexgalleri-compact-news-v1`.
- [Kørsel 41447366103](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41447366103), job `125283688494`: **SUCCESS**, alle trin bestået inklusive containeroprydning.
- Jobloggen dokumenterer **1.118 PHP-kontroller, 0 fejl**, og **194 Node-/browserprøver bestået, 0 fejl**. MySQL 8.4 i GitHub; MariaDB 11.8.6 lokalt. Hele den afsluttende browsersuite er grøn efter rettelse af den gamle forventning om grøn standardfarve til den godkendte varme palet.
- Alle 15 ændrede kildefilers Git-blob-hashes er sammenholdt med den testede GitHub-tree uden afvigelser. Ingen konfiguration, credentials eller medier er med i committen.
- [Download pakken](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41447366103/artifacts/13142644374): `lexgalleri-design-news-722f4031475489dfe05cf0ab06adfa856106dcc0`, 105.555 bytes, 16 filer plus SHA256SUMS. SHA-256 `92b5f5700a2fa087c30af76a19fe9d773aaa4162335819d86d7c03efaefd53e5`. Download kræver repository-adgang og udløber 2. december 2026.
- Den lokale testdatabaseserver er stoppet, nul engangsdatabaser efterladt, og den opgavespecifikke datamappe er slettet. Ingen produktionsdatabase, SMTP eller SMS er benyttet i testene.

Den særskilte kompatibilitetsprøve verificerer den offentlige designopdatering mod en backend uden nyheds-/aktivitetskapabiliteter: ingen kald til disse endpoints, skjulte nulmærker, varme standardknapper, søgning og mobiladgang til administration. Privatpakken leveres separat til cPanel-trinnene; offentlig installation må ikke fremstilles som aktivering af disse private funktioner.


## Offentlig installation, 2. november 2026

- Ejerens »test og install nu« er gennemført for designet på https://lexan.dk/lexgalleri/.
- [Installationskørsel 41448013087](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41448013087), job `125285864236`: **SUCCESS**, installationscommit `6878e9d27ce57e5f558e583cf5496d8f97e172e1`.
- Koden blev checkoutet fra den testede programversion `722f4031475489dfe05cf0ab06adfa856106dcc0`. Grøn testkørsel, artefakt-ID, ZIP-digest og alle 12 offentlige pakkefiler blev kontrolleret inden overførsel. 15 FTPS-planprøver bestod igen.
- Den godkendte, begrænsede LexGalleri-konto blev anvendt med krævet TLS, certifikat- og værtskontrol. Eksisterende offentlige index.php identificerede installationsroden inden ændringer. Kun de 12 tilladte offentlige filer blev overført og derefter genlæst; **12 SHA-256-kontroller bestået**.
- HTTP-efterkontrol kl. 12:51 UTC: offentlig indgang, installeret JavaScript/CSS og kontosikkerhed: **PASS**. storage_overview=true, MP4/video_thumbnails og invitationer er fortsat tilgængelige.
- [Installationsbevis](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41448013087/artifacts/13142774344), artefakt `13142774344`, SHA-256 `33d7babcd0eb5d6959b6ef09ddf80bc9c13e712bdd8e899aff1f3c51adf4f7dc`. Desuden installation/design-news/public-installed.json.
- Engangsworkflowet er lukket med if=false efter succes. Ingen merge, ingen private programfiler, SQL, konfiguration eller medier blev ændret af den automatiske installation. Ingen produktionslogin, medlemsdata, mail eller SMS indgik i efterkontrollen.

**Status:** det kompakte offentlige design er installeret og kontrolleret. Den nuværende server annoncerer endnu ikke gallery_news/member_activity/compact_gallery. Påmindelser og aktivitetsoversigt er testet og pakket, men **ikke aktiveret på webhotellet**. Der mangler ejerens upload af både app.php og security.php til den private mappe, rettighed 0600, og import af SQL 008 i den eksisterende LexGalleri-database. Den begrænsede offentlige FTPS-konto kan ikke udføre dette; der er ikke etableret nogen offentlig installationsgenvej. Se pakkens INSTALLER.md for de konkrete cPanel-trin og efterkontrol. Den fulde private aktivering kan ikke verificeres, før de trin er udført.
