# LexGalleri – rigtige videominiaturer

Opdatering til den eksisterende LexGalleri-installation på **lexan.dk** med telefon/MP4-funktionen allerede installeret. Denne pakke indeholder 12 offentlige filer, én privat programfil, denne vejledning og SHA256SUMS. **Ingen SQL skal importeres.** Konfiguration, medlemskonti, originaler, importdata og MFA-nøgle bevares.

## Installation

1. Brug cPanels Filmanager til at erstatte pakkens `private/app.php` i `/home/lexandkk/lexgalleri-private/app.php`. Sæt filen til **0600**. Læg den aldrig i public_html. De eksisterende `security.php` og `lychee-import.php` bevares.
2. Brug webhotellets PHP-indstillinger: `upload_max_filesize=100M`, `post_max_size=102M`, `memory_limit=256M`. Eventuel Apache/LiteSpeed-requestgrænse skal tillade 102 MiB. Den lille JPEG-miniature sendes sammen med videoen, så der skal være lidt ekstra plads i requesten.
3. Erstat indholdet af den eksisterende offentlige gallerimappe med pakkens `public/`, inklusive `.htaccess`. Brug **den eksisterende mappe**, hvor FTPS-kontoen har sin rod (`/home/lexandkk/public_html/lexgalleri`, historisk kan mappen hedde `LexGalleri`). Opret ikke en ny variant af mappen. Filer 0644, mapper 0755. Den eksisterende FTPS-arbejdsgang kan udføre dette offentlige trin.
4. Genindlæs `https://lexan.dk/lexgalleri/`. Ny kode finder automatisk ud af, om den private opdatering er klar. Indtil da bruges det eksisterende MP4-flow uden billedudtræk.

Der installeres ingen FFmpeg og køres ingen shellkommandoer på webhotellet. Browseren laver billedudtrækket; PHP validerer JPEG-filen og gemmer en ny miniature og visningsversion uden metadata. Originalvideoen ændres ikke.

## Brug og efterkontrol

- **Nye MP4-filer:** Upload som før. Browseren laver automatisk et billede omkring ét sekund inde i videoen (halvvejs ved meget korte klip). Billedet gemmes sammen med videoen og bruges i gallerioversigten og som poster i afspilleren.
- **Eksisterende videoer, herunder Lychee-import:** Åbn videoen → **Info → Lav miniaturebillede fra video**. Admin kan gøre det; en galleriredaktør skal også have download- og GPS-rettighed til originalvideoen. Rettigheder udvides ikke af funktionen.
- **Andre medlemmer:** Kan fortsat se miniaturen med almindelig galleriadgang. Det giver ikke adgang til originalfilen. Et medlem med uploadrettighed kan sende en miniature til sin nye upload uden at få ekstra rettigheder.
- **Format, som browseren ikke kan læse:** Standardikonet bruges fortsat, og uploaden kan gennemføres. Regenerering viser en fejl uden at ændre originalen. H.264 i MP4 anbefales til bred understøttelse; HEVC afhænger af browser og enhed.
- Prøv en ufølsom video på mobil og pc. Bekræft rigtig miniature, afspilning, normal galleriadgang og at en gæst ikke kan ændre miniaturer.

Grænser: MP4 100 MiB, billeder 25 MiB, JPEG-miniature 1 MiB og højst 2.073.600 pixels. Browseren laver højst 960 pixels på længste side. Ingen automatisk gennemlæsning af alle gamle videoer: admin vælger dem enkeltvis, så store arkiver og båndbredde ikke belastes i baggrunden.

Ved afbrudt netværk under udskiftning af de to JPEG-versioner kan én version være opdateret før den anden. Begge er gyldige JPEG-filer; tryk **Lav miniaturebillede fra video** igen for at færdiggøre. Originalvideoen er ikke del af udskiftningen.
