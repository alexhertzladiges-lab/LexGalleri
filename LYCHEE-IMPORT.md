# Flyt fra Lychee 6.6.12 til LexGalleri

Importøren læser Lychees database og overfører originalerne direkte på dit webhotel. Du vælger **kopiering** eller **flytning** efter prøvevisningen. Du behøver ingen eksport fra Lychee, og Lychee bliver ikke opgraderet. Den understøttede kilde er **præcis Lychee 6.6.12**, med databaseversionsværdien `060612`.

Galleriets offentlige adresse er **https://lexan.dk/lexgalleri/**. [Adressevejledningen](ROUTING.md) ændrer kun adgangen via domænet; Lychees kildekonfiguration, originalmapper og importhistorik følger deres eksisterende placeringer.

En fungerende Lychee-installation er ikke nødvendig: databasen og de bevarede originalmapper er nok. Manglende programfiler og gamle visningsbilleder eller miniaturer forhindrer ikke importen. LexGalleri læser kun originalvarianter: JPEG, PNG, WebP og MP4. Billeder får nye visningsbilleder og miniaturer; MP4 får et neutralt videomotiv uden udtræk af videobilleder.

Du installerer selv de private filer og indtaster databaseoplysningerne i en privat konfigurationsfil. GitHub/vores FTPS-konto får fortsat kun adgang til LexGalleris offentlige mappe. Importen køres af dig, mens du er logget ind som admin i LexGalleri.

## 1. Tag backup og kontrollér pladsen

Tag backup af LexGalleris database og private billedmapper, før du installerer migreringen. Bevar også en selvstændig backup af Lychees database og billeder. En databasebackup indeholder ikke selve billederne. Ved pladsmangel bør sikkerhedskopierne opbevares uden for det berørte webhotel.

| Valg | Originaler og plads |
|---|---|
| **Kopiér** | Lychees originaler bliver liggende. LexGalleri gemmer egne originalkopier samt nye visningsbilleder og miniaturer. Et foto i flere albummer får en originalkopi i hvert tilsvarende galleri. |
| **Flyt originalerne** | Originalen flyttes til LexGalleris private lager på samme filsystem. Der laves ingen ekstra originalkopi. Flere albummer kan bruge den samme original på disken. Nye visningsbilleder og miniaturer kræver stadig ledig plads. |

En flytning undgår pladsen til en ekstra originalkopi; originalens eksisterende diskplads bruges fortsat, nu i LexGalleri. Gamle Lychee-mapper som `medium`, `small` og `thumb` ryddes ikke automatisk op.

Undgå ændringer i Lychees database, originaler og importkonfiguration under scanning og overførsel, så albummer, metadata og billedfiler passer sammen. Prøvevisningen er et øjebliksbillede, ikke en løbende synkronisering.

## 2. Find Lychees database og billedrod

Brug din egen adgang til Lychees konfiguration og webhotellets kontrolpanel til at finde databaseværten, porten, databasenavnet og et eventuelt tabelpræfiks. Opret helst en særskilt databasebruger med **kun SELECT på Lychee-databasen**. Importøren skal ikke kunne ændre Lychees tabeller. Hvis kontrolpanelet ikke tilbyder en læsebruger, bed webhotellet om at oprette den.

Databaseoplysningerne står normalt i Lychee-installationens `.env` som `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` og `DB_PASSWORD`. Aktivér eventuelt **vis skjulte filer** i filmanageren. Hvis programfilerne eller `.env` er væk, bruger du webhotellets databaseoversigt til at finde databasen og oprette læsebrugeren; `.env` er ikke et krav. Læs eksisterende oplysninger kun med din egen adgang; ændr ikke Lychees konfiguration. Den nye læsebruger til importen kan have et andet brugernavn og en anden adgangskode end Lychees egen databasebruger.

Find samtidig den absolutte serversti til Lychees lokale `images`-disk. Har du en struktur med `uploads/original/01/`, `uploads/original/02/` osv., skal `uploads_root` pege på **`uploads`**, mappen lige over `original`. Eksempel:

```text
uploads_root: /home/DIT_LOGIN/public_html/Lychee/uploads
short_path:   original/01/02/EKSEMPEL.jpg
fuld filsti:  /home/DIT_LOGIN/public_html/Lychee/uploads/original/01/02/EKSEMPEL.jpg
```

Dette er et generelt eksempel. I den aktuelle installation er `uploads_root` **`/home/lexandkk/public_html/public/uploads`**. `uploads_root` skal være **hele diskens rod**, ikke `original`, `01` eller en anden undermappe. Importøren finder hver original gennem `size_variants` med `type=0` og dens relative `short_path`, inklusive alle undermapper. Mapper som `medium`, `small` og `thumb` bruges ikke som kilde. Behold filnavne og mappestruktur uændret; filnavnet alene fortæller ikke, hvilket album et billede hører til.

Vil du først slå en bestemt fil op, kan du åbne [lychee-originals.sql](private/tools/lychee-originals.sql), erstatte `DIT_FILNAVN.jpg` med dens filnavn og køre forespørgslen i phpMyAdmins **SQL**-fane i **Lychees database**. Tilpas tabelnavnene, hvis de har et præfiks. Forespørgslen læser kun originalens registrerede sti, fotooplysninger og albumtilknytninger; den ændrer ingen data. Flere rækker kan betyde, at samme foto hører til flere albummer. Gem eventuelle resultater privat.

Et databaseopslag kan vise den forventede sti, men ikke om filen stadig findes. Det kontrolleres af importørens prøvevisning. Manglende originalregistreringer eller originalfiler vises som manglende; databasen kan ikke genskabe slettede billedfiler. Filer uden en databasepost får heller ikke gættet en albumtilknytning.

LexGalleris PHP-proces skal kunne læse denne mappe og originalerne. Ved flytning skal PHP også kunne skrive i originalernes mapper og i LexGalleris private lager, og PHP-funktionerne `rename` og `link` skal være tilgængelige. Originalerne og mållageret skal ligge på samme filsystem. Flere albummer deler originalens indhold gennem filsystemets hardlinks; de ekstra filnavne opretter ingen ekstra originalkopier.

En FTPS-kontos mappebegrænsning giver ikke i sig selv PHP adgang. Hvis `open_basedir` forhindrer adgang, skal webhotellet tillade PHP at læse begge billedområder og, ved flytning, skrive i dem. Importøren kontrollerer flytteforudsætningerne før start og afviser en flytning mellem forskellige filsystemer. Den falder ikke tilbage til at kopiere originalen. Vælg ikke serverens rod eller LexGalleris egen private mappe som kilde. Importøren afviser stier og symlinks, der forlader den angivne billedrod.

**Del ikke databaseadgangskoder eller den udfyldte konfiguration i chatten eller på GitHub.**

## 3. Installér de private filer selv

Den aktuelle app kræver også kontosikkerhedsmodulet og obligatorisk admin-Authenticator. Har installationen endnu ikke dette, skal du følge [ACCOUNTS.md](ACCOUNTS.md) og installere `security.php` samt `004_account_security.sql` i LexGalleris database sammen med den nye `app.php`.

Hent følgende filer fra **samme kodeversion** i GitHub, og læg dem ind med webhotellets filmanager eller din egen fulde filadgang:

| Fil i GitHub | Placering på dit webhotel |
|---|---|
| [private/app.php](private/app.php) | `/home/lexandkk/lexgalleri-private/app.php` — erstat den tidligere app-fil |
| [private/lychee-import.php](private/lychee-import.php) | `/home/lexandkk/lexgalleri-private/lychee-import.php` |
| [private/config/lychee-import.example.php](private/config/lychee-import.example.php) | `/home/lexandkk/lexgalleri-private/config/lychee-import.php` — kun ved første opsætning: kopiér, omdøb og udfyld selv |

Behold din eksisterende `config/config.php`, billedmapper og database. Du skal ikke geninstallere LexGalleri eller genimportere `schema.sql`. Private filer bør normalt have rettighed 600 og kun være læsbare for den bruger, som PHP kører under; se [installationsvejledningen](INSTALLATION.md).

**Opdatér en eksisterende installation til MP4:** Erstat begge private programfiler, [app.php](private/app.php) og [lychee-import.php](private/lychee-import.php), i `/home/lexandkk/lexgalleri-private/`. `app.php` indeholder den beskyttede videoafspilning; importmodulet håndterer MP4-filerne. Behold din udfyldte `config/lychee-import.php` med de eksisterende kildeoplysninger og stier. Valget mellem kopiering og flytning foretages på adminsiden.

Er du kun nået til prøvevisningen, skal du efter opdateringen vælge **Lav ny prøvevisning**. Den undersøger også MP4-filer, som en tidligere version kaldte ikke understøttede. Har du allerede startet en overførsel, skal du først sætte den på pause, opdatere programfilerne og derefter **fortsætte samme job i det valgte forløb**. En ny prøvevisning kan først laves, når jobbet er afsluttet; aktive og pausede job bevarer deres flyttejournal og kan ikke scannes om.

Der er to forskellige filer med navnet `lychee-import.php`: programfilen i den private mappes rod og din udfyldte konfigurationsfil i `config`-undermappen. Programopdateringen skal erstatte programfilen.

I den nye, private `config/lychee-import.php` udfylder du:

- `db_host`, `db_port`, `db_name`, `db_user`, `db_password`: **Lychees** database og helst dens nye læsebruger. LexGalleris databaseoplysninger bliver i den eksisterende `config.php`.
- `table_prefix`: præfikset foran Lychees tabeller, eller `''` hvis der ikke bruges et præfiks.
- `uploads_root`: den kontrollerede, absolutte billedrod fra trin 2.
- `expected_version`: behold `'6.6.12'`.
- `enabled`: behold `false`, indtil næste trin er udført.

Hvis en værdi indeholder `'` eller `\`, skal tegnene escapes i PHP-strengen som henholdsvis `\'` og `\\`. Den udfyldte fil skal kun ligge privat på serveren.

## 4. Tilføj importtabeller i LexGalleris database

Importtabellerne tilføjes med disse filer:

| SQL-fil | Formål |
|---|---|
| [002_lychee_import.sql](private/migrations/002_lychee_import.sql) | Grundlaget: tre tabeller til job, albummer og importposter. Kræves til både kopiering og flytning. |
| [003_lychee_move.sql](private/migrations/003_lychee_move.sql) | To nye tabeller til overførselsvalg og flyttejournal. Kræves til flytning. |

Åbn phpMyAdmin, vælg **LexGalleris database**, og brug **Importér** til at køre `002` og derefter `003`. Kontrollér det valgte databasenavn, før du starter. Har du allerede installeret `002`, mangler kun `003` til flytning. **MP4 kræver ingen ny SQL-migrering; er begge allerede installeret, skal du ikke importere SQL igen.** Begge filer skal køres i LexGalleris database; de ændrer ikke Lychees skema.

Skift derefter `'enabled' => false` til `'enabled' => true` i din private `config/lychee-import.php`.

De offentlige og private programfiler skal være fra samme kodeversion. [FTPS-workflowet](DEPLOYMENT.md) overfører kun de tolv offentlige appfiler, inklusive webappens manifest, service worker og ikoner. Det overfører hverken den private PHP-kode, konfigurationen eller SQL-migreringen. Når de offentlige filer er deployet, installerer du selv de tilhørende private programfiler. **Lad importen være pauset eller endnu ikke startet, indtil begge dele er opdateret**, og opdatér derefter status.

## 5. Lav prøvevisningen

Log ind som admin, vælg **Import fra Lychee**, og tryk **Opdatér status**, hvis siden allerede er åben. Vælg derefter **Lav prøvevisning**.

Scanningen læser Lychees albummer, metadata og albumtilknytninger. Den gemmer importoplysninger i LexGalleris importtabeller, men opretter endnu ingen gallerier, fotos eller originalkopier og flytter ingen originaler. Det er derfor normalt, at der endnu ikke kommer noget frem under Gallerier. Efter opdatering fra en tidligere version skal en eksisterende prøvevisning laves på ny, før du starter overførslen. Et allerede startet job genoptages i stedet.

Hold siden åben, mens scanningen arbejder i små portioner. Du kan afbryde mellem portionerne og senere vælge **Fortsæt prøvevisning**. Gennemgå derefter antallene, albumoversigten og eventuelle poster til gennemgang. Albumoversigten viser højst 100 albummer; importen omfatter alle de scannede albummer.

Tælleren **billedplaceringer** er antal tilknytninger til albummer. Det samme foto i to albummer tæller derfor to gange. Fotos uden et almindeligt album samles i `Lychee / Ikke sorteret`. Manglende filer og formater, der ikke understøttes, registreres særskilt.

Der er ikke valg af enkelte albummer i denne version. Når du bekræfter, behandler importen hele den scannede kilde. Hvis du ønsker at afprøve forløbet på et mindre arkiv først, skal det ske med en separat testkopi og testinstallation.

## 6. Vælg overførslen og kontrollér resultatet

Kopiering er standardvalget. Vælg **Flyt originalerne**, hvis du vil undgå en ekstra originalkopi på serveren. Valget låses ved første start og følger jobbet ved pause og genoptagelse. Et job, der allerede har kopieret billeder, kan ikke ændres til flytning.

Gennemgå tællerne og det valgte forløb, markér bekræftelsesfeltet, og vælg **Start kopiering** eller **Start flytning**. Først nu oprettes gallerier, og originalerne behandles. Siden arbejder i små portioner automatisk, mens du bliver på importsiden.

Store MP4-filer kontrolleres og, ved kopiering, overføres i begrænsede datastykker. Siden viser fremdriften for den aktuelle fil. En fil flyttes først, når kontrollen er gennemført; videofilen genkodes ikke.

Ved flytning gemmer importøren en flyttejournal, før originalen omdøbes til sin placering i det private lager. Den kontrollerer filens indhold og bevarer journalen, så en afbrudt handling kan genoptages. Originalen flyttes kun på samme filsystem. Flyttede billeder kan derefter findes i LexGalleri, mens Lychees database fortsat henviser til de gamle stier. Lychee kan derfor ikke længere vise disse originaler fra sine tidligere mapper.

Brug pauseknappen, hvis du vil stoppe efter den aktuelle portion. Lukning af fanen eller navigation væk fra siden stopper nye anmodninger; en allerede startet portion kan stadig afsluttes. Åbn importsiden igen, opdatér status, og vælg knappen til at fortsætte jobbet. Færdige importposter huskes. Hvis en flytning afbrydes, skal du genoptage det samme job, så importøren kan bruge den gemte flyttejournal.

Originaler, som mangler eller har et format, der ikke understøttes, registreres særskilt og flyttes ikke. Det samme gælder filer, der afvises af kontrollen, før flytningen begynder.

Alle importerede gallerier er kun tilgængelige for admin, indtil du selv giver gæster adgang under **Familie & gæster**. Lychees delingslinks og adgangsrettigheder følger ikke med.

Gennemgå resultatet, før du tager Lychee ud af brug:

- Sammenhold antal albummer og billedplaceringer med Lychee, og medregn dubletter, fejl og formater, der er sprunget over.
- Åbn billeder fra flere albummer. Kontrollér billedindhold, orientering, titel, optagetid og GPS.
- Åbn importerede MP4-filer, prøv afspilning og søgning i videoen, og kontrollér originaldownload.
- Se de bevarede kildeoplysninger i billedets **Fra Lychee**-felt som admin, herunder ejer, beskrivelse, tags og tidsregistreringer.
- Kontrollér gæsteadgang i en anden browserprofil, efter at du bevidst har tildelt adgang.

En afsluttet import kan godt indeholde fejl eller oversprungne poster. Siden viser op til 50 poster til gennemgang. Hele importhistorikken ligger privat i databasens `lychee_import_jobs`, `lychee_import_albums` og `lychee_import_items`. Flyttevalget og filjournalen ligger i `lychee_import_transfer_jobs` og `lychee_import_move_files`.

Når jobbet er afsluttet, kan du efter rettelse af eksempelvis manglende filer vælge **Lav ny prøvevisning**. Den kan finde reparerede og nye poster, herunder MP4-filer afvist af en ældre version. Allerede gennemførte importposter og flyttejournaler bevares; ændrede titler, albumtilknytninger eller metadata fra disse poster synkroniseres ikke automatisk til eksisterende fotos. Importøren er ikke et værktøj til løbende synkronisering eller automatisk oprydning efter sletninger i Lychee.

Behold Lychees database, de tilbageværende kildefiler og dine backups, indtil resultatet er kontrolleret. Du kan bagefter sætte importkonfigurationens `enabled` tilbage til `false`. Bevar alle import- og flyttetabeller som historik. Flyttejournalen skal forblive intakt under et aktivt eller afbrudt job.

## Hvad følger med?

| Oplysning | Håndtering |
|---|---|
| Almindelige albummer og underalbummer | Oprettes som separate gallerier med det fulde navn, fx `Lychee / Sommer / Bornholm`. Tomme albummer bevares. Meget lange navne forkortes med et id-afledt suffiks; den fulde kildesti bevares i importhistorikken. |
| Foto i flere albummer | Lychees `photo_album` bruges. Der oprettes en placering i hvert tilsvarende galleri. Kopiering gemmer en originalkopi pr. galleri; flytning lader placeringerne dele den flyttede original på disken. Dubletter med samme SHA-256 inden for ét galleri genbruger fotoposten. |
| Originaler | Indholdet bevares uændret ved både kopiering og flytning. Kildens SHA-1 kontrolleres mod `checksum` eller `original_checksum`; Lychee kan have gendannet den urørte original efter at have beregnet en checksum på en roteret udgave. LexGalleri beregner selv SHA-256. |
| Visningsbilleder og miniaturer | Genereres på ny uden originalens EXIF. Originalens orientering anvendes ved billedbehandlingen. MP4 får et neutralt JPEG-videomotiv; der udtrækkes ingen videobilleder. |
| Titel, sted og GPS | Overføres fra Lychees database, hvor koordinaterne er gyldige. |
| Optagetid | Lychees UTC-værdi omregnes med `taken_at_orig_tz`, når den findes. LexGalleris optagetid gemmes som lokal klokketid uden tidszone; rå kildetid og oprindelig tidszone bevares i importhistorikken. |
| Uploadtid og ejer | Uploadtid i LexGalleri er importtidspunktet, og uploader er den admin, der udfører importen. Kildens registreringstid og ejer bevares særskilt; Lychee-ejeren er ikke nødvendigvis den oprindelige uploader. |
| Beskrivelse, tags og øvrige billedmetadata | Bevares privat som kildeoplysninger. Udvalgte oplysninger vises til admin; de bliver ikke automatisk til alle de samme søge- og redigeringsfelter i LexGalleri. |
| Brugere, adgangskoder og delingsrettigheder | Importeres ikke. Tildel gæsteadgang manuelt i LexGalleri. |

## Grænser og fejlfinding

Denne version importerer lokale **JPEG-, PNG- og WebP-originaler** på højst **25 MB og 20 megapixel** samt **MP4-originaler på højst 2 GiB på 64-bit PHP**. PHP-hukommelsen kan sætte en lavere praktisk grænse for billeder. MP4 kontrolleres som videofil og overføres uændret uden genkodning eller krav om ffmpeg. For store, beskadigede eller afviste kildefiler bliver stående og registreres til gennemgang. HEIC, RAW, MOV, WebM, øvrige videoformater og originaler på S3 understøttes ikke. Der er højst 10.000 almindelige albummer pr. kilde. Smartalbummer og Lychees øvrige funktioner genskabes ikke som særskilte funktioner.

MP4 vises med browserens videokontroller på mobil og pc. Browseren skal understøtte filens konkrete video- og lydkodek; MP4-filendelsen garanterer ikke afspilning. Originalen kan downloades, hvis browseren ikke kan afspille den. Direkte upload i LexGalleri er fortsat begrænset til billeder; MP4-understøttelsen gælder Lychee-importen.

Afspilning læser den uændrede original, som kan indeholde GPS. Derfor kræver både videoafspilning og originaldownload **download- og GPS-adgang** til galleriet, ud over almindelig se-adgang. Admin har adgang. En gæst med kun se-adgang kan se titel og videomotiv, men får ikke selve videofilen.

Ved databasefejl viser den opdaterede importør en fast forklaring og MySQL-fejlnummeret. Den gengiver ingen adgangskoder eller rå SQL-fejl. Brug nummeret til næste trin:

| MySQL-fejl | Næste trin |
|---|---|
| **1045 eller 1698** — login afvist | Kontrollér parret `db_user`/`db_password` samt brugerens adgang fra den valgte PHP-server. |
| **1044** — manglende databaseadgang | Tilknyt brugeren til Lychees database med SELECT i webhotellets MySQL-administration. |
| **1142 eller 1143** — manglende SELECT | Tildel brugeren SELECT på kildedatabasen. |
| **1146** — forventet tabel mangler | Kontrollér `db_name` og `table_prefix` mod Lychees database og tabelnavne. |
| **1049** — databasen blev ikke fundet | Kontrollér `db_name` og databaseværten. |
| **2002, 2003 eller 2005** — forbindelsen kunne ikke oprettes | Kontrollér `db_host`, `db_port` og webhotellets databaseindstillinger. |

- **Forkert databaseversion:** Kontrollér, at kilden faktisk er Lychee 6.6.12, og at den rigtige database er valgt. Importøren opgraderer ikke databasen.
- **Billedroden kan ikke læses:** Kontrollér stien og PHP-adgang samt eventuelt `open_basedir`. Ret det med din egen adgang eller webhotellets support.
- **Originalfil mangler:** Kontrollér `uploads_root` og filens faktiske placering. En forkert billedrod kan få mange eksisterende billeder til at se manglende ud.
- **Checksum matcher ikke:** Originalen stemmer ikke med nogen af de forventede SHA-1-værdier. Undersøg kildefilen. Afslut eller genoptag det aktuelle job, før du laver en ny prøvevisning efter rettelse. Omgå ikke kontrollen ved at redigere importtabellerne.
- **Original for stor:** Kontrollér filstørrelsen og, for billeder, dimensioner og PHP-hukommelse. Disse filer bliver stående i Lychee og vises til gennemgang.
- **Kopiering afbrudt:** Opdatér status og genoptag samme job fra importsiden. Importøren husker færdige poster; store MP4-filer behandles i datastykker, som kan fortsættes.
- **Flytning er ikke tilgængelig:** Kontrollér den nye programfil, `003`-migreringen og en ny prøvevisning. Adminsiden viser, hvilken forudsætning der mangler.
- **Flytning kan ikke starte:** Kontrollér, at kilde og mål ligger på samme filsystem, at PHP understøtter `rename` og `link`, og at PHP kan skrive i de nødvendige mapper. Afklar det med webhotellet ved behov.
- **Flytning afbrudt:** Opdatér status og genoptag det samme job. Originaler, der allerede er flyttet til det private lager, beskyttes af flyttejournalen. Ret den viste fejl, og behold journal og filer på deres registrerede placeringer.
- **MP4 kan ikke afspilles:** Kontrollér først gæstens download- og GPS-adgang. Prøv derefter originaldownload og en afspiller, der understøtter filens kodek. Importen ændrer ikke videoens format.

Importøren bruger kun SELECT på Lychees database og en UTC-indstilling for sin egen databaseforbindelse. Ved kopiering læses kildefilerne. Ved flytning ændres originalernes placering på filsystemet efter dit valg på adminsiden; Lychees database opdateres ikke. Nye jobtabeller, gallerier, visningsbilleder og miniaturer skrives i LexGalleri.

## Versionsgrundlag

Importformatet er kontrolleret mod [Lychee v6.6.12](https://github.com/LycheeOrg/Lychee/tree/2dc0d51165ec8750e3917ea7f4ef223b0c6e9475), især [albumtilknytningerne](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/database/migrations/2025_05_28_201707_create_photo_album_pivot.php), [originalvariantens type](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/app/Enum/SizeVariantType.php), [diskopsætningen](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/config/filesystems.php) og [billedmodellen](https://github.com/LycheeOrg/Lychee/blob/v6.6.12/app/Models/Photo.php). En anden Lychee-version kræver særskilt kontrol af skema og filhåndtering.
