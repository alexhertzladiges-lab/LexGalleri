# Flyt fra Lychee 6.6.12 til LexGalleri

Importøren læser Lychees database og kopierer originalerne direkte på dit webhotel. Du behøver ingen eksport fra Lychee, og Lychee bliver ikke opgraderet. Den understøttede kilde er **præcis Lychee 6.6.12**, med databaseversionsværdien `060612`.

Du installerer selv de private filer og indtaster databaseoplysningerne i en privat konfigurationsfil. GitHub/vores FTPS-konto får fortsat kun adgang til LexGalleris offentlige mappe. Importen køres af dig, mens du er logget ind som admin i LexGalleri.

## 1. Tag backup og kontrollér pladsen

Tag backup af LexGalleris database og private billedmapper, før du installerer migreringen. Bevar også en selvstændig backup af Lychees database og billeder. En databasebackup indeholder ikke selve billederne.

Importen kopierer til LexGalleri; den flytter eller sletter ingen Lychee-filer. Der skal være ledig plads til originaler samt nye visningsbilleder og miniaturer. Et foto i flere Lychee-albummer får en separat kopi i hvert tilsvarende LexGalleri-galleri.

Undgå ændringer i Lychee under scanning og kopiering, så albummer, metadata og billedfiler passer sammen. Prøvevisningen er et øjebliksbillede, ikke en løbende synkronisering.

## 2. Find Lychees database og billedrod

Brug din egen adgang til Lychees konfiguration og webhotellets kontrolpanel til at finde databaseværten, porten, databasenavnet og et eventuelt tabelpræfiks. Opret helst en særskilt databasebruger med **kun SELECT på Lychee-databasen**. Importøren skal ikke kunne ændre Lychees tabeller. Hvis kontrolpanelet ikke tilbyder en læsebruger, bed webhotellet om at oprette den.

Databaseoplysningerne står normalt i Lychee-installationens `.env` som `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` og `DB_PASSWORD`. Aktivér eventuelt **vis skjulte filer** i filmanageren. Læs dem kun med din egen adgang; ændr ikke Lychees konfiguration. Den nye læsebruger til importen kan have et andet brugernavn og en anden adgangskode end Lychees egen databasebruger.

Find samtidig den absolutte serversti til Lychees lokale `images`-disk. Ved en standardinstallation er det Lychees `public/uploads`-mappe, eksempelvis:

```text
/home/DIT_LOGIN/public_html/Lychee/public/uploads
```

Dette er et eksempel, ikke en sti du skal kopiere ukritisk. Lychees indstillinger som `LYCHEE_UPLOADS`/`LYCHEE_UPLOADS_DIR` kan ændre placeringen. `uploads_root` skal være **hele diskens rod**, ikke en underliggende `big/`-mappe. Importøren finder hver original gennem `size_variants` med `type=0` og dens relative `short_path`.

LexGalleris PHP-proces skal kunne læse denne mappe og originalerne. En FTPS-kontos mappebegrænsning giver ikke i sig selv PHP adgang. Hvis `open_basedir` forhindrer adgang, skal webhotellet tillade PHP at læse både Lychees billedrod og LexGalleris private mappe. Vælg ikke serverens rod eller LexGalleris egen private mappe som kilde. Importøren afviser stier og symlinks, der forlader den angivne billedrod.

**Del ikke databaseadgangskoder eller den udfyldte konfiguration i chatten eller på GitHub.**

## 3. Installér de private filer selv

Hent følgende filer fra **samme kodeversion** i GitHub, og læg dem ind med webhotellets filmanager eller din egen fulde filadgang:

| Fil i GitHub | Placering på dit webhotel |
|---|---|
| [private/app.php](private/app.php) | `/home/lexandkk/lexgalleri-private/app.php` — erstat den tidligere app-fil |
| [private/lychee-import.php](private/lychee-import.php) | `/home/lexandkk/lexgalleri-private/lychee-import.php` |
| [private/config/lychee-import.example.php](private/config/lychee-import.example.php) | `/home/lexandkk/lexgalleri-private/config/lychee-import.php` — kopiér, omdøb og udfyld selv |

Behold din eksisterende `config/config.php`, billedmapper og database. Du skal ikke geninstallere LexGalleri eller genimportere `schema.sql`. Private filer bør normalt have rettighed 600 og kun være læsbare for den bruger, som PHP kører under; se [installationsvejledningen](INSTALLATION.md).

I den nye, private `config/lychee-import.php` udfylder du:

- `db_host`, `db_port`, `db_name`, `db_user`, `db_password`: **Lychees** database og helst dens nye læsebruger. LexGalleris databaseoplysninger bliver i den eksisterende `config.php`.
- `table_prefix`: præfikset foran Lychees tabeller, eller `''` hvis der ikke bruges et præfiks.
- `uploads_root`: den kontrollerede, absolutte billedrod fra trin 2.
- `expected_version`: behold `'6.6.12'`.
- `enabled`: behold `false`, indtil næste trin er udført.

Hvis en værdi indeholder `'` eller `\`, skal tegnene escapes i PHP-strengen som henholdsvis `\'` og `\\`. Den udfyldte fil skal kun ligge privat på serveren.

## 4. Tilføj importtabeller i LexGalleris database

Hent [private/migrations/002_lychee_import.sql](private/migrations/002_lychee_import.sql).

Åbn phpMyAdmin, vælg **LexGalleris database**, og brug **Importér** til at køre denne SQL-fil. Kontrollér det valgte databasenavn, før du starter. Migreringen opretter tre tabeller til job, albummer og importposter. Den skal ikke køres i Lychees database og ændrer ikke Lychees skema.

Skift derefter `'enabled' => false` til `'enabled' => true` i din private `config/lychee-import.php`.

De offentlige filer fra samme kodeversion skal også være installeret, før den nye adminside kan bruges. [FTPS-workflowet](DEPLOYMENT.md) overfører fortsat kun `index.php`, `.htaccess`, `static/app.js` og `static/style.css`. Det overfører hverken den private PHP-kode, konfigurationen eller SQL-migreringen. Opdatér de private filer, før den offentlige kode deployes.

## 5. Lav prøvevisningen

Log ind som admin, vælg **Import fra Lychee**, og tryk **Opdatér status**, hvis siden allerede er åben. Vælg derefter **Lav prøvevisning**.

Scanningen læser Lychees albummer, billedmetadata og albumtilknytninger. Den gemmer importoplysninger i LexGalleris nye importtabeller, men opretter endnu ingen gallerier, fotos eller billedkopier. Det er derfor normalt, at der endnu ikke kommer noget frem under Gallerier.

Hold siden åben, mens scanningen arbejder i små portioner. Du kan afbryde mellem portionerne og senere vælge **Fortsæt prøvevisning**. Gennemgå derefter antallene, albumoversigten og eventuelle poster til gennemgang. Albumoversigten viser højst 100 albummer; importen omfatter alle de scannede albummer.

Tælleren **billedplaceringer** er antal tilknytninger til albummer. Det samme foto i to albummer tæller derfor to gange. Fotos uden et almindeligt album samles i `Lychee / Ikke sorteret`. Manglende filer og formater, der ikke understøttes, registreres særskilt.

Der er ikke valg af enkelte albummer i denne version. Når du bekræfter, behandler importen hele den scannede kilde. Hvis du ønsker at afprøve forløbet på et mindre arkiv først, skal det ske med en separat testkopi og testinstallation.

## 6. Start kopieringen og kontrollér resultatet

Markér, at du har gennemgået prøvevisningen, og vælg **Start kopiering**. Først nu oprettes gallerier, og billeder kopieres til LexGalleri. Siden behandler små portioner automatisk, mens du bliver på importsiden.

Brug pauseknappen, hvis du vil stoppe efter den aktuelle portion. Lukning af fanen eller navigation væk fra siden stopper nye anmodninger; en allerede startet portion kan stadig afsluttes. Åbn importsiden igen, opdatér status, og vælg **Fortsæt kopiering** for at genoptage. Færdige importposter huskes, så de ikke kopieres igen ved genoptagelse.

Alle importerede gallerier er kun tilgængelige for admin, indtil du selv giver gæster adgang under **Familie & gæster**. Lychees delingslinks og adgangsrettigheder følger ikke med.

Gennemgå resultatet, før du tager Lychee ud af brug:

- Sammenhold antal albummer og billedplaceringer med Lychee, og medregn dubletter, fejl og formater, der er sprunget over.
- Åbn billeder fra flere albummer. Kontrollér billedindhold, orientering, titel, optagetid og GPS.
- Se de bevarede kildeoplysninger i billedets **Fra Lychee**-felt som admin, herunder ejer, beskrivelse, tags og tidsregistreringer.
- Kontrollér gæsteadgang i en anden browserprofil, efter at du bevidst har tildelt adgang.

En afsluttet import kan godt indeholde fejl eller oversprungne poster. Siden viser op til 50 poster til gennemgang. Hele importhistorikken ligger privat i databasens `lychee_import_jobs`, `lychee_import_albums` og `lychee_import_items`.

Efter rettelse af eksempelvis manglende filer kan du vælge **Lav ny prøvevisning**. Den kan finde reparerede og nye poster. Allerede gennemførte importposter bevares; ændrede titler, albumtilknytninger eller metadata fra disse poster synkroniseres ikke automatisk til eksisterende fotos. Importøren er ikke et værktøj til løbende synkronisering eller automatisk oprydning efter sletninger i Lychee.

Behold Lychee og dine backups, indtil resultatet er kontrolleret. Du kan bagefter sætte importkonfigurationens `enabled` tilbage til `false`. Bevar importtabellerne som historik.

## Hvad følger med?

| Oplysning | Håndtering |
|---|---|
| Almindelige albummer og underalbummer | Oprettes som separate gallerier med det fulde navn, fx `Lychee / Sommer / Bornholm`. Tomme albummer bevares. Meget lange navne forkortes med et id-afledt suffiks; den fulde kildesti bevares i importhistorikken. |
| Foto i flere albummer | Lychees `photo_album` bruges. Fotoet kopieres til hvert tilsvarende galleri. Dubletter med samme SHA-256 inden for ét galleri genbruges. |
| Originaler | Kopieres uden ændring. Kildens SHA-1 kontrolleres mod `checksum` eller `original_checksum`; Lychee kan have gendannet den urørte original efter at have beregnet en checksum på en roteret udgave. LexGalleri beregner selv SHA-256. |
| Visningsbilleder og miniaturer | Genereres på ny uden originalens EXIF. Originalens orientering anvendes ved billedbehandlingen. |
| Titel, sted og GPS | Overføres fra Lychees database, hvor koordinaterne er gyldige. |
| Optagetid | Lychees UTC-værdi omregnes med `taken_at_orig_tz`, når den findes. LexGalleris optagetid gemmes som lokal klokketid uden tidszone; rå kildetid og oprindelig tidszone bevares i importhistorikken. |
| Uploadtid og ejer | Uploadtid i LexGalleri er importtidspunktet, og uploader er den admin, der udfører importen. Kildens registreringstid og ejer bevares særskilt; Lychee-ejeren er ikke nødvendigvis den oprindelige uploader. |
| Beskrivelse, tags og øvrige billedmetadata | Bevares privat som kildeoplysninger. Udvalgte oplysninger vises til admin; de bliver ikke automatisk til alle de samme søge- og redigeringsfelter i LexGalleri. |
| Brugere, adgangskoder og delingsrettigheder | Importeres ikke. Tildel gæsteadgang manuelt i LexGalleri. |

## Grænser og fejlfinding

Denne version importerer lokale **JPEG-, PNG- og WebP-originaler** på højst **25 MB og 20 megapixel**. PHP-hukommelsen kan sætte en lavere praktisk grænse. Video, HEIC, RAW og originaler på S3 registreres som formater eller lagring, der endnu ikke understøttes. Der er højst 10.000 almindelige albummer pr. kilde. Smartalbummer og Lychees øvrige funktioner genskabes ikke som særskilte funktioner.

- **Forkert databaseversion:** Kontrollér, at kilden faktisk er Lychee 6.6.12, og at den rigtige database er valgt. Importøren opgraderer ikke databasen.
- **Databasen kan ikke læses:** Kontrollér kildekonfiguration, tabelpræfiks og læsebrugerens SELECT-rettigheder. Kildens adgangsoplysninger skal være i den private importkonfiguration.
- **Billedroden kan ikke læses:** Kontrollér stien og PHP-adgang samt eventuelt `open_basedir`. Ret det med din egen adgang eller webhotellets support.
- **Originalfil mangler:** Kontrollér `uploads_root` og filens faktiske placering. En forkert billedrod kan få mange eksisterende billeder til at se manglende ud.
- **Checksum matcher ikke:** Originalen stemmer ikke med nogen af de forventede SHA-1-værdier. Undersøg kildefilen, og lav en ny prøvevisning efter rettelse. Omgå ikke kontrollen ved at redigere importtabellerne.
- **Billede for stort:** Kontrollér dimensioner, filstørrelse og PHP-hukommelse. Disse filer bliver stående i Lychee og vises til gennemgang.
- **Kopiering afbrudt:** Genoptag fra importsiden. Importøren husker færdige poster og rydder egne ufærdige kopier ved næste forsøg.

Importøren udfører kun læsninger af Lychees data og filer. Den bruger en UTC-indstilling for sin egen databaseforbindelse, men ændrer ingen kildedata. De nye jobtabeller, gallerier og billedfiler skrives kun i LexGalleri.

## Versionsgrundlag

Importformatet er kontrolleret mod [Lychee v6.6.12](https://github.com/LycheeOrg/Lychee/tree/2dc0d51165ec8750e3917ea7f4ef223b0c6e9475), især [albumtilknytningerne](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/database/migrations/2025_05_28_201707_create_photo_album_pivot.php), [originalvariantens type](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/app/Enum/SizeVariantType.php), [diskopsætningen](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/config/filesystems.php) og [billedmodellen](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/app/Models/Photo.php). En anden Lychee-version kræver særskilt kontrol af skema og filhåndtering.
