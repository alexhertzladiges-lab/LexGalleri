# LexGalleri – telefoninvitationer og MP4

Denne pakke er til **LexGalleri på lexan.dk**, ikke Fiskerhyttens LexApp.
En samlet installation kræver både database, privat programkode og offentlige filer.
Den eksisterende GitHub/FTPS-konto har kun adgang til den offentlige gallerimappe.

## Opgradering af den eksisterende installation

1. Hold galleriet ude af brug under opdateringen. En eventuel Lychee-import skal være pauset.
2. Vælg **LexGalleris eksisterende database** i phpMyAdmin og importér `sql/007_reusable_phone_invitations.sql`. Tidligere kontosikkerhed (004) og galleriadgang (006) skal være installeret. **Genimportér ikke schema.sql, og opret ikke admin igen.** Migrering 007 kan genkøres og bevarer eksisterende konti, adgangskoder og medier.
3. Brug cPanels Filmanager til at erstatte disse tre programfiler i `/home/lexandkk/lexgalleri-private/`: `app.php`, `security.php`, `lychee-import.php` fra pakkens `private/`. Sæt dem til **0600**. Bevar alle eksisterende konfigurationsfiler, MFA-nøglen, medier, sessionsmapper og importdata. Importørfilen leverer også den eksisterende MP4-kontrol og neutrale videominiature; upload bruger ingen Lychee-forbindelse.
4. I cPanels PHP-indstillinger vælges mindst `upload_max_filesize=100M`, `post_max_size=102M`, `memory_limit=256M`. Anbefal `max_execution_time=120`, `max_input_time=120`. Apache/LiteSpeeds eventuelle requestgrænse skal også tillade mindst 102 MiB; ellers må webhotellet ændre den. Appen kan ikke hæve disse servergrænser selv.
5. Erstat **indholdet** af den offentlige gallerimappe `/home/lexandkk/public_html/lexgalleri/` med indholdet af pakkens `public/` – ikke en ekstra public-mappe. Husk `.htaccess`. Offentlige filer 0644, mapper 0755. **Læg aldrig private/ eller sql/ i public_html.** FTPS-arbejdsgangen kan alene udføre dette offentlige trin, efter at trin 2–4 er afsluttet.
6. Genindlæs `https://lexan.dk/lexgalleri/` og kontrollér nedenstående. Genoptag først en eksisterende import, når koden matcher i begge mapper.

Der medfølger ingen udfyldt konfiguration, adgangskoder, medlemmer eller familiefiler. `SHA256SUMS` dokumenterer pakkens filer. Der udføres ingen automatisk SMS- eller mailudsendelse.

## Efterkontrol

- Log ind som admin med uændret Authenticator-beskyttelse.
- Vælg **Personer og adgang → Invitér en person → Telefon**. Opret en syntetisk gæst og vælg de ønskede gallerier/rettigheder. Kopiér linket og del det privat. Telefonfeltet er kontakt/login – det bekræfter ikke, hvem der ejer nummeret.
- Åbn linket i en anden browserprofil. Vælg en adgangskode første gang. Åbn samme link igen med den samme adgangskode. Det udløber fortsat efter **7 dage**.
- Admin kan se og tilbagekalde links under **Invitationslinks**. Tilbagekaldelse lukker linket; eksisterende galleriadgang ændres separat under personens galleriadgang. Serveren gemmer kun linkets hash, så et mistet råt link kan ikke genskabes fra oversigten.
- Gæsten kan senere logge ind med sit 8-cifrede danske telefonnummer (også +45/0045) og adgangskode. E-mailinvitationer og eksisterende e-maillogin fungerer fortsat.
- Upload en ufølsom MP4 med uploadrettighed og prøv afspilning, miniature, dubletafvisning og adgang som en anden gæst. Afspilning/original kræver fortsat **både download- og GPS-rettighed**, fordi originalen kan indeholde metadata.
- Grænsen er **100 MiB = 104.857.600 bytes pr. MP4** (vises som 100 MB i appen). Billeder er fortsat højst 25 MiB. Nye uploads får automatisk et stillbillede udtrukket i browseren. Hvis browseren ikke kan læse videoen, bruges en neutral miniature. På eksisterende videoer kan admin eller en redaktør med video-adgang vælge **Info → Lav miniaturebillede fra video**. Originalen ændres ikke. Der sker ingen omkodning. H.264/AAC i MP4 anbefales til bred browserunderstøttelse; MP4 med fx HEVC kan kræve en anden browser/enhed.

## Hvis noget ikke er klart

Telefoninvitationer og genanvendelige links aktiveres kun med afsluttet migrering 007. Før da bevares det gamle e-mailflow. Manglende videomodul giver en tydelig fejl uden at gemme en fil. Hvis en privat programfil ikke kan uploades med den eksisterende FTPS-konto, bruges cPanels Filmanager; kontoen skal ikke udvides til alle private data.

## Kun opdatering til rigtige videominiaturer

Hvis telefon/MP4-opgraderingen allerede er installeret, kræver videominiaturer **ingen ny SQL**. Erstat kun den private `app.php` (0600) og de offentlige filer fra samme version. Hæv post_max_size til 102M, så en 100 MiB-video og dens lille JPEG-miniature kan uploades sammen. Der kræves ingen FFmpeg. Gæsters galleriadgang og beskyttelsen af originalerne bevares.
