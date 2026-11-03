# LexGalleri – del kun med eksisterende medlemmer

Pakken samler Signal-linkdeling og deling med allerede registrerede medlemmer. Indeholder 12 offentlige filer, én privat app.php, vejledning og SHA256SUMS. Ingen SQL, konfiguration, credentials eller medier. Eksisterende design, pladsgrænse, kontosikkerhed og nyhedspåmindelser bevares.

## Installation på lexan.dk

1. Tag en privat sikkerhedskopi af den nuværende app.php uden for public_html. Upload pakkens private/app.php til **/home/lexandkk/lexgalleri-private/app.php**, rettighed **0600**, via cPanel. Bevar security.php og alle konfigurationsfiler/MFA-nøgler. Ingen privat programfil må ligge i public_html.
2. Installér pakkens public/-filer i den eksisterende offentlige LexGalleri-mappe, inklusive .htaccess, med den begrænsede FTPS-konto. Opret ikke en ekstra public-mappe. Offentlige filer 0644, mapper 0755.
3. Genindlæs appen. /api/status skal vise **member_gallery_sharing=true**. Funktionen benytter de allerede installerede redigeringsrettigheder fra SQL 006 og den eksisterende settings-tabel. Der er **ingen ny SQL-import** og ingen ændring af konti eller datamodel.

## Sådan bruges funktionen

- **Admin inviterer nye medlemmer ind i LexGalleri.** Medlemmer har ingen mulighed for at oprette nye konti eller invitationslinks.
- **Ejeren åbner sit galleri → Del med medlemmer.** Søg på navn, vælg eksisterende medlemmer, og vælg Giv valgte læseadgang. Højst 50 valgte ad gangen. Navnelisten kan rulle og viser, hvem der allerede har adgang.
- Nye modtagere får kun læseadgang. Upload, redigering, originaler og præcis GPS gives ikke med. MP4-originalafspilning følger fortsat de eksisterende original-/GPS-rettigheder, som admin administrerer.
- En modtager kan kopiere et link, men kan ikke tildele nye personer adgang. Signal-knappen åbner systemets delingsmenu; en almindelig gallerihenvisning giver ikke i sig selv nogen rettigheder. Ingen besked sendes automatisk.
- Nye gallerier får automatisk den autentificerede opretter som ejer. Der gættes ikke på ejer ud fra billeder, tidligere uploads eller redigeringsadgang.
- **Ældre gallerier:** Admin åbner Del med medlemmer → Galleriets ejer, vælger medlem og bekræfter overdragelsen. Den valgte ejer får fuld adgang til dette galleri: upload, redigering, originaler og GPS samt deling med eksisterende medlemmer. Eksisterende adgang bevares. Admin kan vælge Ingen medlemsejer, så kun admin kan tildele adgang.
- Admin kan stadig ændre eller fjerne adgang. Fjernes ejerens galleriadgang eller redigeringsret, blokeres deling også. Efter overdragelse er den tidligere ejer ikke længere berettiget til at tilføje medlemmer.

## Efterkontrol

Opret et testgalleri som medlem og giv et andet eksisterende medlem læseadgang. Kontrollér med modtagerens konto, at galleriet kan ses, men upload og videre adgangstildeling er skjult/afvist. Kontrollér også, at admin kan udpege ejer for et ældre galleri, og at Signal/Kopiér link stadig virker. Uden den private opdatering bliver de nye tildelingsknapper skjult; eksisterende galleriadgang og linkdeling fungerer stadig.
