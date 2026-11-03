# LexGalleri – eksisterende medlemmer som gallerimodtagere

Brugerens beslutning: et medlem skal kunne dele sit eget galleri med brugere, som allerede er medlemmer; admin styrer invitation af nye medlemmer til LexGalleri. Fortolkningen med egen gallerioprettelse, læseadgang og en medlemsvælger blev bekræftet af brugeren med »ja tak perfekt«.

## Adfærd og rettigheder

Admin alene kan fortsat oprette, liste og tilbagekalde personlige invitationslinks samt tildele bredere rettigheder. Ny medlemsdeling skriver kun view-only grants til aktive eksisterende ikke-adminkonti. Den opretter ingen konto, invitation, besked, mail eller SMS. Eksisterende højere rettigheder bevares. Kun galleriets ejer eller admin må læse modtagerlisten og tildele adgang. En redaktør eller modtager bliver ikke automatisk ejer og kan ikke tildele videre adgang.

Nye gallerier får troværdigt ejerskab fra den aktuelle session, i samme transaktion som oprettelsen og opretterens adgang. Forged owner_id/user_id i oprettelsespayload ignoreres fortsat. Ejerskab lagres som gallery_owner_<32hex>, 46 tegn, i den eksisterende settings-tabel med VARCHAR(50)-nøgle. Ingen ny SQL eller ændring af datamodel. Ældre gallerier uden markør får ingen automatisk ejer; admin kan vælge ejer i samme delingsdialog med forklaring og eksplicit bekræftelse af fuld galleriadgang. Overdragelse bevarer andre brugeres eksisterende adgang.

Modtagersøgning udleverer kun navn, id og eksisterende galleriadgang; ikke e-mail, telefon, loginoplysninger, password eller MFA-data. Listen udelader slettede konti og admin, som allerede har adgang via rollen. Søgning er parametriseret og begrænset til 100 tegn/100 resultater. UI viser begrænsningen og bevarer søgefeltets fokus ved opdatering.

POST /galleries/<id>/members accepterer kun user_ids, en liste med 1–50 gyldige eksisterende id'er. E-mail/telefon, rolleflag, ukendte/slettede konti og blandede gyldige/ugyldige batches afvises uden delvis adgang. Duplikater normaliseres, gentagne requests er idempotente, og nye grants har upload=download=gps=0 uden editor-række.

Den eksisterende session/MFA/Origin-beskyttelse bevares. Ændringer låser galleriet og berørte brugere, genkontrollerer session, ejer og redigeringsadgang under låsen og foretages atomisk. Eksisterende admin-grantændringer bruger samme gallerilås. Admins ejerskabsændring kræver expected_owner_id, så en forældet dialog ikke overskriver en anden ejerskabsændring. Sletning eller rettighedsfratagelse blokerer også nye tildelinger. Fejl i grantoprettelse ruller både ejerskab og galleri tilbage.

Signal-deling og almindelige links er stadig separate fra adgangstildeling. Links indeholder kun id-fragment, og modtageren skal logge ind og have serverbekræftet adgang. Der foretages ingen Signal-serverkald.

## Lokale prøver

PHP 8.4.24, MariaDB 11.8.6 og Chromium; kun syntetiske konti, lokale engangsdatabaser og testmedier. Ingen produktionsforbindelse eller rigtig besked.

- Udvidet eksisterende gallerioprettelses-/HTTP/databaseprøve: **104 kontroller, 0 fejl**. Ejerregistrering trods forfalsket payload, nøglelængde, navneminimering, rolle-/MFA-/Origin-afvisning, uregistrerede/slettede modtagere, batch-atomicitet, læseadgang, ingen kontooprettelse/invitation, originalbeskyttelse, ingen videre tildeling, idempotens, bevarede adminrettigheder, ejerskifte, revokering, legacy-ejer og rollback ved databasefejl.
- PHP/database/browser: **15 tests bestået**, inklusive ny deling gennem UI, medlemssøgning med bevaret fokus, retry efter fejl, faktiske recipient-login uden upload/videretildeling og admins bekræftede ejerskifte. Mobil 320/390 px og pc 1280 px.
- Eksisterende webapp-browser: **74 tests bestået**.
- Lokale app-Node-prøver: **106 bestået, 0 fejl, én miljøbetinget skip**. De eksterne klientværktøjer til de øvrige protokolprøver kontrolleres i den eksisterende GitHub-opsætning.

Genkør eksisterende tests/gallery-create.php og tests/account-browser.test.mjs med LEXGALLERI_TEST=1 og isolerede TEST_DB_* indstillinger. Eksisterende workflows og fixtures er udvidet; intet nyt testsystem. Pak med python3 scripts/package-telefon-mp4.py --member-sharing.

Status før GitHub-kontrol: kodet og lokalt testet, **ikke installeret**. Pakken kræver opdatering af én privat app.php og offentlige filer. Ingen ny SQL. Endelig test- og pakkehenvisning tilføjes efter GitHub-kørsel.

Yderligere samtidighedskontrol: modtagerens brugerrække låses fra en anden databaseforbindelse, en ægte HTTP-deling startes, og SHOW FULL PROCESSLIST bekræfter, at requesten venter på rækkelåsen. Sletningsmarkør/passwordspærring committes før låsen frigives. Delingen afvises med 409 uden ny grant. Prøven er bestået lokalt og medtages i GitHub. Den første samlede browserkørsel fandt en ventebetingelse, der læste et DOM-element, mens gallerioversigten genindlæstes; betingelsen venter nu på elementet uden at ændre appens produktkode.

Ekstraprøven bestod på MariaDB 11.8.6, men påviste en reel fejl på MySQL 8.4: subqueryen med NOT EXISTS i det ventende brugerrækkeopslag kunne returnere et forældet aktivt medlemskab efter en samtidigt committet sletning. Den nye delingsfunktion var ikke installeret. Rettelsen genkontrollerer både aktørens og modtagernes sletningsmarkører med en aktuel SELECT ... FOR UPDATE efter brugerrækkelåsene. Samme kontrol gælder ejerudpegning. Der blev ikke ændret i de øvrige medlems-/slettefunktioner. Regressionen fastholder den reelle rækkelås og kræver 409 og ingen grant efter sletningen.

Efter MySQL-rettelsen afviste MariaDB den samme samtidige operation med SQL-fejl 1020 (Record has changed since last read), hvilket gav en generel HTTP 500. De nye delings-/ejerskabsoperationer ruller nu tilbage og svarer 409 ved 1020, deadlock/serialization failure eller lock timeout. Den nye tekst beder brugeren rydde valget og opdatere listen. Egentlige databasefejl og testtriggerens 45000 er fortsat fejl; de bliver ikke meldt som succes. Den endelige lokale MariaDB-prøve er **104 kontroller, 0 fejl**, inklusive observeret ventende lås, sletning før frigivelse, HTTP 409 og ingen efterladt grant.


## Afsluttende GitHub-kontrol og pakke

- Testet programversion `3b538029ddedabb180df2d1d7a7e45a87dd23ac0`, branch `feature/lexgalleri-existing-member-sharing-v1`.
- [GitHub Actions 41698512285](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41698512285), job `126135301100`: **SUCCESS**, **1.183 PHP-kontroller og 203 Node-/browserprøver bestået**, 0 fejl, 0 oversprungne tests. Containeroprydning bestået. Den reelle samtidighedsprøve er dermed grøn på MySQL 8.4 efter rettelsen; den endelige lokale MariaDB 11.8.6-prøve er også grøn med 104 kontroller.
- [Download samlet pakke](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41698512285/artifacts/13261429680): `lexgalleri-member-sharing-3b538029ddedabb180df2d1d7a7e45a87dd23ac0`, 101.706 bytes. 14 filer plus SHA256SUMS: 12 offentlige filer, privat app.php og vejledning. Artefakt `13261429680`, SHA-256 `a14114b2decf2ccf287208677abddde3bc7fdafb4cb312bfbd7fa6b42b373f2e`. GitHub-adgang kræves; download udløber 3. december 2026.
- Ingen SQL, private konfigurationer, credentials, sessioner, rigtige medlemmer eller medier følger med pakken. Signal-deling er inkluderet, så den tidligere separate offentlige Signal-pakke ikke skal installeres først.
- Ingen merge eller ændring på webhotellet er udført. Der er ikke sendt en rigtig Signal-besked, e-mail eller SMS. Lokale testdatabaser og testservere er stoppet og ryddet op; nul testdatabaser efterladt.

**Status: færdigkodet, testet og pakket, endnu ikke installeret.** Upload af den private app.php (0600) skal ske via ejerens cPanel, da den eksisterende FTPS-konto kun har adgang til de offentlige filer. Derefter kan de offentlige filer installeres og efterkontrolleres. Ingen ny SQL er nødvendig. Vejledning: installation/member-sharing/INSTALLER.md. Ældre gallerier får først en medlemsejer, når admin udpeger den; eksisterende adgang ændres ikke ved selve installationen.
