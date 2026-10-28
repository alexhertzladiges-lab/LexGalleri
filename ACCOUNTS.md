# Profiler og Authenticator-login

Alle brugere har en profil med navn, e-mail og rolle. Administratoren kan se og redigere både sin egen og medlemmers profiler, ændre deres e-mail og sætte en ny adgangskode. Adgangskoder gemmes som hashes og kan ikke vises eller læses tilbage.

Administratorer skal bruge adgangskode og en kode fra en Authenticator-app for at logge ind. Medlemmer bruger deres almindelige login. Galleriernes separate adgangsrettigheder gælder fortsat.

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

Du inviterer nye medlemmer med **Invitér en gæst** og sender selv invitationslinket. Det kan bruges én gang og udløber efter syv dage. Et medlem kan kun se og rette sin egen profil; administratoren administrerer medlemmerne.

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
