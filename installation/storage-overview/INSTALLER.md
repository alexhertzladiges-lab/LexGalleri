# LexGalleri – medieplads og adminvalgt grænse

Opdatering til den eksisterende LexGalleri-installation på lexan.dk. Pakken indeholder 12 offentlige filer, én privat app.php, vejledning og SHA256SUMS. **Ingen SQL skal importeres.** Denne pakke indeholder kun pladsoversigten; det tidligere arbejde med nyt design, påmindelser og aktivitet er pauset og aktiveres ikke her.

## Installation

1. Erstat `private/app.php` fra pakken i `/home/lexandkk/lexgalleri-private/app.php` via cPanels Filmanager. Rettighed **0600**. Bevar security.php, lychee-import.php, alle konfigurationsfiler, MFA-nøglen, database og medier. Læg aldrig den private programfil i public_html.
2. Installér pakkens `public/` i den eksisterende offentlige LexGalleri-mappe, inklusive `.htaccess`. Der skal ikke oprettes en ekstra public-mappe. Mapper 0755, offentlige filer 0644. Den eksisterende begrænsede FTPS-konto kan udføre dette offentlige trin.
3. Genindlæs appen. Log ind som admin og åbn **Administration → Overblik** eller **Drift og sikkerhed**. Her vises **Medieplads** med total, procent og en udfoldelig fordeling pr. galleri.
4. Vælg **Ret grænse** og angiv den samlede ramme i GB. Startværdien er **25 GB**. Decimaler kan bruges; 1 GB = 1.000.000.000 bytes. Valget gemmes i den eksisterende settings-tabel.

Grænsen er en planlægnings- og visningsramme for mediepladsen. Den ændrer ikke abonnementet på webhotellet og blokerer ikke i sig selv uploads. Tilpas den til den plads, der er aftalt med webhotellet.

## Hvad opgøres?

Filstørrelser i originals, previews, thumbnails og eventuel igangværende medieoprydning. Delte originaler med hardlinks tælles én gang i totalen og medregnes i hvert tilknyttet galleri. Gallerital kan derfor overlappe. Midlertidige eller endnu ikke tilknyttede mediefiler indgår også i totalen og vises særskilt.

Opgørelsen bruger filmetadata; billeder og videoer afkodes ikke. Den måler ikke MySQL-databasens størrelse, private konfigurationer, sessionsfiler eller andre websites. Tal er filstørrelser og er ikke webhotellets egen kvotetæller eller blokallokering.

Normale adminbesøg bruger en snapshot-cache i højst 60 sekunder. **Opdatér** laver en ny opgørelse. Tidspunktet vises. Ændring af grænsen vises straks uden krav om ny filscanning. En gul delvis opgørelse kræver kontrol/genopdatering; den vises ikke som nul forbrug eller præcist resterende plads.

## Efterkontrol

- Admin kan se total og de enkelte gallerier, ændre grænsen og opdatere opgørelsen på mobil og pc.
- Et almindeligt medlem har ikke adgang til den globale pladsoversigt, andre galleristørrelser eller grænseindstillingen.
- Hævet/sænket grænse bevares efter genindlæsning og ændrer ikke medlemsrettigheder eller eksisterende uploadfunktioner.
- Ved overforbrug vises den faktiske størrelse og antal bytes over grænsen; procenttal afkortes ikke i teksten.
