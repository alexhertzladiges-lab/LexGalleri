# LexGalleri som app på mobil og pc

![LexGalleris appikon](public/static/icon.svg)

LexGalleri kan installeres fra browseren og åbne i sit eget appvindue fra et ikon på telefonens hjemmeskærm eller på pc'en. Det er samme galleri, konti og adgangsrettigheder som på websitet. Der skal ikke installeres noget fra App Store eller Google Play.

Appen skal åbnes via **HTTPS**, og webhotellets offentlige og private programfiler skal være opdateret til samme version. Browseren afgør, hvilke installationsmuligheder den tilbyder.

## Opdatér en eksisterende installation

1. Sæt en eventuel igangværende import på pause.
2. Lad [FTPS-workflowet](DEPLOYMENT.md) overføre de elleve offentlige appfiler fra den nye kodeversion. Det overfører ikke private programfiler eller konfiguration.
3. Hent [private/app.php](private/app.php) fra samme version i GitHub med **Download raw file**. Erstat selv `/home/lexandkk/lexgalleri-private/app.php` gennem webhotellets filmanager eller din egen fulde filadgang.
4. Behold dine eksisterende filer i `config/`, Lychee-importmodulet, databasen og private medier. Der er ingen ny SQL-migrering til webappen.
5. Opdatér browsersiden på galleriets HTTPS-adresse; på pc kan du bruge **Ctrl+F5**. Genoptag derefter et pauset importjob som det samme job.

Privat og offentlig kode kan installeres i den rækkefølge, din adgang tillader. Vent med at bruge den nye webapp og genoptage importen, indtil begge dele er opdateret.

## Android med Chrome

1. Åbn galleriets almindelige HTTPS-adresse i Chrome, fx dit eget domæne efterfulgt af `/LexGalleri/`.
2. Vælg **Installér app**, hvis LexGalleri eller browseren viser knappen. Du kan også åbne Chromes **⋮**-menu og vælge **Installér app** eller **Føj til startskærm**, afhængigt af browserens version.
3. Bekræft, og åbn LexGalleri fra det nye ikon.

Hvis browseren kun tilbyder en genvej, kan den åbne websitet i en browserfane. Brug en opdateret browser, og kontrollér, at du har åbnet HTTPS-adressen efter serveropdateringen. Knappen **Installér app** viser installationsdialogen, når browseren tilbyder den, og viser ellers hjælp til browserens installationsmenu.

## iPhone og iPad med Safari

1. Åbn galleriets HTTPS-adresse i **Safari**.
2. Tryk på **Del** og vælg **Føj til hjemmeskærm**. Rul eventuelt ned i delingsmenuen for at finde punktet.
3. Behold navnet LexGalleri, og vælg **Åbn som webapp**, hvis denne indstilling vises. Tryk derefter **Tilføj**.
4. Åbn LexGalleri fra ikonet på hjemmeskærmen.

iOS kan bruge en separat session til webappen. Log ind igen fra appikonet, hvis du bliver bedt om det; brug din eksisterende konto. Du skal ikke oprette en ny bruger.

## Windows med Edge eller Chrome

Åbn galleriets HTTPS-adresse. Brug **Installér app**, hvis knappen vises, eller browserens installationsikon ved adresselinjen. I Edge findes muligheden også under **⋯ → Apps → Installér dette websted som en app**; Chromes menunavn afhænger af versionen. Bekræft installationen, og åbn LexGalleri fra den oprettede genvej eller Start-menuen.

## Forbindelse, login og adgang

Billeder, videoer og gallerier kræver internetforbindelse. Uden forbindelse viser webappen kun en generisk besked med mulighed for at prøve igen. Service workeren opretter ingen offlinecache med private sider, API-svar, billeder eller videoer. Installationen downloader ikke hele familiens arkiv til enheden.

Login og de separate gallerirettigheder kontrolleres fortsat af serveren. Den eksisterende session er sat til højst syv dage; browserens indstillinger, sletning af webstedsdata eller oprydning på webhotellet kan kræve tidligere login. Brug **Log ud**, når en delt enhed skal overlades til andre.

Billeder åbnes oven på oversigten. Når du lukker visningen eller bruger Escape på pc, bevares miniaturerne, søgningen, sorteringen og din position. En almindelig lukning genindlæser ikke alle billeder.

## Kontrollér efter installation

Åbn et ufølsomt testgalleri fra appikonet, prøv at åbne og lukke et billede, og kontrollér en gæstekonto i en anden browserprofil. Kontrollér også log ud og tilbagekaldt gallerirettighed. En grøn filoverførsel eller automatiske tests erstatter ikke kontrollen på din egen telefon og dit webhotel.

Hvis ikonet åbner en browserfane, så kontrollér først HTTPS, at begge kodeområder er opdateret, og at appen er tilføjet gennem browserens installationsfunktion. Luk og åbn appen igen efter opdatering; hjælper det ikke, opdatér den almindelige browserside og tilføj appen igen.
