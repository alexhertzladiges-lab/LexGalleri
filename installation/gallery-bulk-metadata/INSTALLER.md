# LexGalleri: redigér oplysninger for hele galleriet

Kun LexGalleri på https://lexan.dk/lexgalleri/. Fiskerhyttens LexApp indgår ikke.

Admin åbner et galleri og vælger **Redigér alle billeder**. Vælg felter med flueben: dato/datopræcision, sted, fælles titel eller GPS. Kun valgte felter ændres. Gennemgå antallet af billeder/videoer og de præcise nye værdier, og skriv galleriets navn før **Gem på alle billeder og videoer**. Tomt valgt sted eller to tomme GPS-felter fjerner disse oplysninger. Ukendt dato kræver tom dato. Originalfiler og EXIF ændres ikke.

Gennemgangen gælder i10 minutter, er knyttet til admins session og bruges kun én gang. Nye gennemgange erstatter gamle. Hvis galleriet, antallet af filer eller deres metadata er ændret, kræves en ny gennemgang. Hele ændringen sker i én SQL-transaktion. Ved en usikker forbindelse: opdatér galleriet og kontrollér oplysningerne før en ny gennemgang.

## Installation

1. Kontrollér grøn kilde, den konkrete CI-pakke og SHA256SUMS.
2. Ejeren erstatter pakkens **private/app.php** på **/home/lexandkk/lexgalleri-private/app.php**, rettighed **0600**, via cPanel. Offentlig FTPS har ingen adgang hertil. Bevar security.php, config, sessions, medier og importmodulet.
3. Installér de12 offentlige filer fra samme testede pakke gennem det eksisterende kontrollerede FTPS-forløb. Funktionen vises først, når privat backend annoncerer gallery_bulk_metadata=true. Ingen SQL-migrering, nye credentials eller routingændring.
4. Kontrollér offentlig filgenlæsning, HTTPS-hashes og backendfunktioner. Genindlæs LexGalleri. Foretag kun en virkelig masserettelse efter gennemgang og bekræftelse af de ønskede værdier.

Pakken indeholder12 offentlige filer, privat app.php, denne vejledning og SHA256SUMS. Den indeholder ingen konfiguration, medlemsdata, sessionsfiler eller medier. Testene bruger udelukkende syntetiske billeder/videoer og engangsdatabaser. Installationen masseredigerer ingen produktionsgallerier som prøve.
