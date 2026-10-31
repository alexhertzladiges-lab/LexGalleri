# Profiler og Authenticator-login

Alle brugere har en profil med navn, e-mail og rolle. Administratoren kan se og redigere både sin egen og medlemmers profiler, ændre deres e-mail og sætte en ny adgangskode. Adgangskoder gemmes som hashes og kan ikke vises eller læses tilbage.

Administratorer skal bruge adgangskode og en kode fra en Authenticator-app for at logge ind. Medlemmer bruger deres almindelige login. Galleriernes separate adgangsrettigheder gælder fortsat.

Log ind på **https://lexan.dk/lexgalleri/** med små bogstaver. Se [ROUTING.md](ROUTING.md) ved adresseændringen; brug den eksisterende konto og Authenticator, hvis den nye cookiesti kræver nyt login.

## Opdatér en eksisterende installation

Brug din egen adgang til webhotellets filmanager og phpMyAdmin. FTPS-workflowet har fortsat kun adgang til den offentlige galleri-mappe.

1. Sæt en eventuel igangværende import på pause, og tag en privat backup af LexGalleris database og private filer.
2. Åbn phpMyAdmin, vælg **LexGalleris database**, og importér [004_account_security.sql](private/migrations/004_account_security.sql). Du skal ikke genimportere `schema.sql` eller ændre Lychees database.
3. Hent [app.php](private/app.php) og [security.php](private/security.php) fra samme kodeversion med **Download raw file** i GitHub. Læg begge programfiler i `/home/lexandkk/lexgalleri-private/` med din egen filadgang.
4. Behold den eksisterende `config/config.php`, kildekonfiguration, importmodul, billedmapper og importtabeller. Kontrollér, at PHP har OpenSSL og kan skrive i den private `config/`-mappe.
5. Kontrollér, at de offentlige appfiler fra samme version er overført via [FTPS-workflowet](DEPLOYMENT.md). Opdatér browsersiden med **Ctrl+F5** på pc.
6. Log ind med din eksisterende admin-e-mail og adgangskode, og tilknyt Authenticator som beskrevet nedenfor. Et tidligere adminlogin åbner ikke galleriet uden Authenticator-bekræftelse.

Migreringen tilføjer kontosikkerhed til den eksisterende database. Konti, gallerier, billeder og de bevarede importoplysninger bliver i installationen. En ny installation bruger i stedet de opdaterede programfiler og [schema.sql](private/schema.sql) som beskrevet i [INSTALLATION.md](INSTALLATION.md).

Den offentlige indgang afviser den gamle loginversion, indtil de nye private programmer er installeret. Siden viser derfor **Login opdateres**, hvis den offentlige opdatering kommer først. Gennemfør filopdateringen og migreringen med din egen adgang; opdatér derefter siden.

Når offentlig kode, private programmer og migration er opdateret, kan et pauset importjob fortsættes som samme job. Importens menuknap er fjernet fra den almindelige navigation.

## Første tilknytning af Authenticator

Du kan bruge fx Microsoft Authenticator, Google Authenticator eller en anden app, som understøtter TOTP.

1. Log ind med admin-e-mail og adgangskode. Ved en helt ny installation opretter du først admin med den private opsætningsnøgle.
2. Åbn Authenticator-appen, og tilføj en konto ved at scanne QR-koden på LexGalleris opsætningsside. Du kan også vælge manuel tilføjelse og indtaste nøglen fra siden; vælg en tidsbaseret kode.
3. Indtast appens aktuelle sekscifrede kode i LexGalleri for at bekræfte tilknytningen.
4. Gem de ti viste **reservekoder** i en adgangskodeadministrator eller på et andet privat sted, som du kan tilgå uden telefonen. De fungerer som gendannelseskoder og kan bruges én gang hver. Du kan kopiere eller hente listen fra denne visning; bekræft, at du har gemt den, før du fortsætter.

Opsætningen skal bekræftes, før admin får adgang til gallerier og administration. Et påbegyndt login udløber efter ti minutter; log ind igen, hvis opsætningen eller kodebekræftelsen er udløbet.

QR-koden fremstilles lokalt i browseren. Nøglen sendes ikke til en ekstern QR-tjeneste. Opsætningsnøglen, den personlige QR-kode og reservekoderne er private loginoplysninger: gem dem aldrig i GitHub, chatten eller almindelige screenshots, som deles med andre.

PHP opretter automatisk en tilfældig krypteringsnøgle i `/home/lexandkk/lexgalleri-private/config/mfa.key` med private filrettigheder. Nøglen bruges til at beskytte Authenticator-hemmelighederne i databasen. Lad filen blive på serveren, og medtag den i din private backup sammen med databasen.

## Dagligt adminlogin

Åbn galleriets HTTPS-adresse eller den installerede webapp. Indtast først e-mail og adgangskode og derefter den aktuelle kode fra Authenticator. Appen viser nye koder omtrent hvert halve minut.

Hvis du bruger en reservekode, indtaster du den i feltet til Authenticator-kode eller reservekode. Den bliver brugt op efter et vellykket login. Administratorlogin kræver fortsat adgangskoden.

Brug automatisk dato og tid på telefonen. En kode, der allerede er brugt til login eller en ændring, kan ikke bruges igen. Vent på næste kode, hvis du netop har brugt den viste kode.

## Din egen profil

Åbn **Min profil**. Her kan du se dit navn, e-mail, rolle og de gallerier, du har adgang til. En administrator har adgang til alle gallerier.

Ret navn eller e-mail i profilformularen. Vil du ændre adgangskoden, udfylder du feltet til en ny adgangskode; lad det være tomt, når adgangskoden skal bevares. Nye adgangskoder skal være 12–72 bytes.

Bekræft ændringer med din nuværende adgangskode. Administratorer skal også angive en frisk Authenticator-kode eller en ubrugt reservekode. Når du gemmer din egen profil, bliver du bedt om at logge ind igen med de opdaterede oplysninger og Authenticator, hvis du er admin. Gamle sessioner tilbagekaldes ved ændring af loginoplysninger.

En e-mailadresse skal være unik i samme LexGalleri-installation. Brug den nye adresse ved næste login; eventuelle nye loginoplysninger deles manuelt.

## Redigér et medlem som admin

1. Åbn **Familie & gæster**.
2. Vælg **Se/redigér profil** ved medlemmet for at se og redigere navn og e-mail.
3. Udfyld en ny adgangskode, hvis medlemmet skal have en anden. Du behøver ikke kende medlemmets gamle adgangskode.
4. Bekræft med din egen adminadgangskode og en frisk Authenticator-kode eller ubrugt reservekode, og gem.

Medlemmet bruger derefter sin nye e-mail eller adgangskode ved næste login. Send selv eventuelle nye loginoplysninger til medlemmet gennem en privat kanal. En ændring af loginoplysninger tilbagekalder de gamle sessioner.

Under **Redigér gallerirettigheder** vælger du fortsat separat, hvilke gallerier medlemmet kan se, og om medlemmet må uploade, hente originaler og se GPS. Videoafspilning bruger originalen og kræver både download- og GPS-adgang.

Gem adgang ved det enkelte galleri. Formularen viser, når den gemmer, når rettighederne er gemt, og hvis ændringen afvises. Nye ændringer markeres som ugemte, indtil du gemmer igen.

Medlemmernes gallerioversigt indeholder kun de gallerier, de har adgang til. Listen hentes igen ved navigation, så tilbagekaldt adgang ikke bliver stående som et gammelt gallerikort. Administratorer ser alle gallerier.

Gæster og medlemmer kan også vælge **Nyt galleri**. Et galleri oprettet af et medlem er fra start kun synligt for medlemmet selv og administratorer. Opretteren får adgang til at uploade, hente originaler og se GPS i sit nye galleri. Administratoren styrer fortsat deling med andre konti.

Du inviterer nye medlemmer med **Invitér en gæst** og sender selv invitationslinket. Efter migrering 007 kan det åbnes igen med samme kontos adgangskode indtil udløb efter syv dage eller tilbagekaldelse. Et medlem kan kun se og rette sin egen profil; administratoren administrerer medlemmerne.

## Invitation til flere gallerier

Åbn **Familie & gæster → Invitér en gæst**, og udfyld navn og e-mail. Markér **Se galleri** ved hvert galleri, personen skal have adgang til, og vælg de øvrige rettigheder separat for hvert galleri:

| Rettighed | Adgang |
| --- | --- |
| Se galleri | Galleriet og dets visningsbilleder bliver synlige. |
| Uploade billeder | Tilføje billeder til netop dette galleri. |
| Redigere galleri og billedoplysninger | Ændre galleriets navn og beskrivelse samt billeders og videoers titel, dato og sted. Ændring af koordinater kræver også GPS-adgang. |
| Hente originaler | Hente originalfiler og afspille videoer, når GPS-adgang også er valgt. |
| Se præcis GPS | Se koordinater; redigering af dem kræver også redigeringsrettigheden. |

Vælg **Opret invitationslink**. Den færdige invitation viser en oversigt over de gemte gallerier og rettigheder, før du kopierer og sender linket. Der oprettes ét personligt engangslink til alle valgte gallerier; de får deres respektive rettigheder samlet ved accept. Andre gallerier bliver ikke synlige. Til en eksisterende konto ændrer invitationen kun rettighederne i de valgte gallerier; øvrig adgang bevares og kan ændres under **Redigér gallerirettigheder**.

Redigering giver ikke adgang til at dele gallerier, administrere konti eller slette andres uploads. Medlemmers sletning af egne uploads kræver fortsat admins godkendelse.

**Installation:** Importér [006_gallery_permissions.sql](private/migrations/006_gallery_permissions.sql) i **LexGalleris database** via phpMyAdmin. Erstat derefter [app.php](private/app.php) og [security.php](private/security.php) i `/home/lexandkk/lexgalleri-private/` med din egen adgang, og brug de offentlige filer fra samme kodeversion. Behold konfigurationen, Authenticator-nøglen og medierne. Migreringen kan køres igen og ændrer ikke eksisterende rettigheder. Allerede udsendte invitationer til ét galleri virker fortsat. `multi_gallery_invitations: true` i `/lexgalleri/api/status` viser, at migrering og privat kode er klar.

## Redigér galleriets navn

Åbn galleriet, og vælg **Redigér galleri**. Ret navn og beskrivelse, og vælg **Gem galleri**. Admin har altid denne adgang; et medlem skal have den særskilte redigeringsrettighed. Billedoversigten genindlæses ikke ved gemning. Admins redigering af navn kræver den nye private `app.php`, men er tilgængelig før migrering 006, som aktiverer medlemmers rettigheder.

## Vis og skjul adgangskoder

Øjeikonet ved hvert adgangskodefelt viser eller skjuler netop dette felt. Adgangskoder er skjult fra starten. Det gælder login, registrering via invitation, første opsætning, profilens adgangskodeskift og adminbekræftelser. Funktionen ændrer ikke adgangskoden eller indsender formularen og kræver kun de opdaterede offentlige appfiler.

## Slet et medlem

Som admin åbner du **Familie & gæster** og vælger **Slet medlem** ved personen. Knappen findes også på medlemmets profil. Bekræft med **Slet medlemmet**; **Annullér** bevarer kontoen. Administratorkonti kan ikke slettes her.

Kontoen fjernes fra medlemslisten, og alle eksisterende login mister adgang ved næste forespørgsel. E-mailadresse, adgangskode, reservekoder, gallerirettigheder, personlige favoritter og ubrugte invitationer til den gamle e-mail fjernes. Gallerier, billeder, MP4-filer og uploadernavnet bevares i historikken. Eksisterende markeringer af medlemmets billeder til sletning kan stadig gennemgås af admin.

Personen kan inviteres igen med samme e-mail, men får en ny konto med de rettigheder, du vælger i den nye invitation. Gamle invitationslinks kan ikke gendanne den slettede konto eller dens adgang.

**Aktivér i en eksisterende installation:** Hent den nye [app.php](private/app.php) og [security.php](private/security.php), og erstat begge i `/home/lexandkk/lexgalleri-private/` med din egen filmanager. Behold konfigurationen, Authenticator-nøglen og mediemapperne. De offentlige appfiler skal være fra samme kodeversion. Der kræves ingen ny SQL-migrering. `/lexgalleri/api/status` viser `member_delete: true`, når den private kode er klar; indtil da vises knappen deaktiveret med en installationsvejledning.

## Slet billeder og videoer som admin

Kun administratorer kan gennemføre sletninger. Medlemmer og gæster kan markere egne uploads til godkendelse som beskrevet nedenfor. De kan ikke markere administratorens eller andre medlemmers uploads. Serveren kontrollerer ejerskab og godkendelse ved hvert forsøg.

Vælg **Slet billeder** på forsiden med gallerilisten, og vælg galleriet. Du kan også åbne et galleri og vælge **Slet billeder** over billedoversigten. Klik på de billeder og MP4-filer, der skal slettes; markeringerne vises direkte på miniaturebillederne. Vælg **Slet valgte**, gennemgå listen, og vælg **Bekræft sletning**. **Annullér** bevarer filerne. Du kan fortsat slette ét medie fra dets **Info**-panel.

Hvis du ændrer søgning eller sortering, nulstilles markeringerne. Under sletningen behandles filerne én ad gangen. En fejl stopper resten af listen; de gennemførte sletninger bevares, og **Prøv igen** forsøger kun de resterende filer. **Stop efter denne fil**, Escape eller lukning af bekræftelsen stopper nye sletninger; en fil, som serveren allerede behandler, kan stadig blive slettet. Navigerer du væk eller logger ud, starter listen heller ikke flere sletninger.

Sletningen gælder den valgte placering i galleriet. Mediets egne original-, visnings- og miniaturefiler fjernes sammen med placeringens favoritter. Andre placeringer af samme medie og Lychees kildefiler ændres ikke; bevarede importoplysninger kan fortsat henvise til den tidligere import.

### Aktivér sletning i en eksisterende installation

Har du allerede profiler og Authenticator installeret, kræver admins direkte sletning kun den nye [private/app.php](private/app.php) samt de offentlige appfiler. Medlemmers markeringer og godkendelse kræver desuden migrering 005 nedenfor.

1. Gem en privat kopi af din nuværende `app.php` uden for webadgangen.
2. Hent [private/app.php](private/app.php) fra GitHub med **Download raw file**, og erstat `/home/lexandkk/lexgalleri-private/app.php` med din egen filmanager.
3. Behold den eksisterende konfiguration, `security.php`, Authenticator-nøgle, database og mediemapper.
4. Opdatér galleriet med **Ctrl+F5** på pc. Sletteknappen vises først, når den private kode understøtter sletning, og du er logget ind som admin.

Hvis serveren afviser en sletning, vises fejlen i den åbne bekræftelse. Følg fejlteksten ved en uafsluttet filoprydning, og forsøg igen; en sådan oprydning kan genoptages. Valg af flere filer kræver kun nye offentlige appfiler, når serverens status allerede viser `media_delete: true`.

## Markering til sletning og admins godkendelse

Et medlem åbner et galleri og vælger **Markér til sletning**. Kun medlemmets egne uploads kan vælges. Efter gennemgang af listen vælges **Send til godkendelse**. Billeder og MP4-filer bliver liggende og kan fortsat ses; deres miniaturebilleder får teksten **Markeret til sletning · afventer admin**. Importerede medier har administratoren som uploader og kan derfor ikke markeres af medlemmer.

Admin åbner **Sletteønsker** i menuen. Hvert ønske viser filens titel, galleri og medlemmet, der markerede den. **Vis billede/video** åbner mediet. **Godkend sletning** kræver en bekræftelse, før filen fjernes fra dette galleri. **Afvis** kræver også bekræftelse og bevarer filen. Historikken gemmes, og medlemmet kan markere filen igen efter en afvisning. Hvis oprydningen af en godkendt sletning bliver afbrudt, bliver ønsket stående, så admin kan forsøge godkendelsen igen.

Aktivér arbejdsgangen i en eksisterende installation:

1. Hent [005_media_delete_requests.sql](private/migrations/005_media_delete_requests.sql), og importér den i **LexGalleris database** via phpMyAdmin. Migreringen kan køres igen. Den ændrer ikke Lychees database eller eksisterende mediefiler. Brug kun denne migrering til opdateringen; importér ikke hele `schema.sql`.
2. Hent den nye [private/app.php](private/app.php), og erstat `/home/lexandkk/lexgalleri-private/app.php` med din egen filmanager. Behold konfigurationen, `security.php`, Authenticator-nøglen og billedmapperne.
3. Installér de offentlige appfiler fra samme kodeversion via det eksisterende FTPS-workflow. Opdatér browseren med **Ctrl+F5**.
4. `/lexgalleri/api/status` viser `media_delete_requests: true`, når den private kode og tabellen er klar. Indtil da er medlemmernes markeringer deaktiveret; admins eksisterende direkte sletning virker fortsat.

## Slet en designpakke som admin

Åbn **Design & udtryk**, og vælg **Slet pakke** ved den installerede pakke. Bekræft sletningen i kortet. Standardpakken kan ikke slettes.

Sletter du den aktive pakke, går galleriet tilbage til standarddesignet. Sletning af en anden pakke bevarer det aktive design. Forhåndsvisning afsluttes, så siden viser det design, der faktisk er aktivt.

Sletning af designpakker og medlemmers oprettelse af gallerier aktiveres med samme opdaterede [private/app.php](private/app.php) og offentlige appfiler som mediesletning. Der kræves ingen yderligere private programfiler eller SQL-migrering.

## Reservekoder og ny telefon

Som admin finder du **Nye reservekoder** i **Min profil**. Bekræft med din adgangskode og en frisk Authenticator-kode eller en ubrugt reservekode. Gem den nye liste; den erstatter de tidligere reservekoder.

Vælg **Skift Authenticator**, når du skal tilknytte en anden telefon eller en anden app. Bekræft på samme måde, og gennemfør derefter den nye QR-/nøgleopsætning og kodebekræftelse. Gem de nye reservekoder. Den tidligere Authenticator erstattes, når den nye opsætning er bekræftet; du skal fortsat have Authenticator for at bruge administratorkontoen.

Har du mistet telefonen, kan du logge ind med adgangskoden og en ubrugt reservekode. Brug derefter en anden ubrugt reservekode til at bekræfte **Skift Authenticator**, og tilknyt din nye app. Hver reservekode kan kun bruges én gang.

## Fejlfinding

- **Kontosikkerheden mangler efter opdatering:** Kontrollér `004_account_security.sql` i LexGalleris database samt `app.php` og `security.php` fra samme version. Brug din egen serveradgang til installationen.
- **Koden afvises:** Kontrollér automatisk dato og tid på telefonen, den rigtige konto i Authenticator og en ny kode, som endnu ikke er brugt. Gentagne fejl udløser en midlertidig begrænsning af loginforsøg.
- **Du har mistet telefonen:** Brug en ubrugt reservekode sammen med adgangskoden til adminlogin, og følg afsnittet om ny telefon. Reservekoder vises ikke i profilens almindelige oplysninger.
- **Den private nøgle kan ikke oprettes:** Kontrollér PHP's adgang til `config/` og OpenSSL på webhotellet. Bevar en eksisterende `mfa.key`; udskift den ikke med en vilkårlig ny fil.
- **En profilrettelse afvises:** Kontrollér din nuværende adgangskode, en ubrugt Authenticator-kode som admin og om e-mailadressen allerede bruges af en anden konto.

## Invitation via telefonnummer og genbesøg

Efter [migrering 007 og programopdateringen](installation/telefon-mp4/INSTALLER.md) vælger admin e-mail eller dansk telefonnummer i invitationsdialogen. Kun det valgte felt er påkrævet. Telefonkontoen kan bruge sit telefonnummer og adgangskode ved almindeligt login; e-mail er valgfri. Admin beholder e-maillogin og Authenticator.

Linket er personligt og deles privat af admin. Det bekræfter ikke ejerskab af et telefonnummer, og der sendes ingen automatisk SMS. Første accept binder linket til kontoen og anvender de valgte rettigheder én gang. Genbesøg kræver kontoadgangskoden og ændrer ingen rettigheder. Linket udløber efter syv dage. **Invitationslinks** viser status og mulighed for tilbagekaldelse; eksisterende kontoadgang administreres separat.
