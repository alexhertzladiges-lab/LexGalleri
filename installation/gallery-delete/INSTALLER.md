# LexGalleri: slet hele gallerier

Denne pakke gælder kun LexGalleri. Fiskerhyttens LexApp er en anden app og må ikke opdateres med disse filer.

Admin kan slette ethvert galleri inklusive alle billeder og videoer. Galleriets præcise navn skal indtastes først. Store gallerier behandles i små portioner; en afbrudt sletning kan genoptages under Administration → Sletteønsker.

Almindelige brugere kan sende deres egne gallerier til sletning og annullere en afventende anmodning. Admin kan godkende eller afvise. Indhold slettes først efter admins godkendelse. Adgang til at se, uploade eller redigere et delt galleri er ikke ejerskab. Ældre gallerier skal have en ejer udpeget af admin under Del med medlemmer → Galleriets ejer.

## Installation efter godkendelse

1. Kontrollér den præcise grønne kildecommit, CI-artifact og alle poster i SHA256SUMS.
2. Upload kun `private/app.php` til den eksisterende private LexGalleri-mappe, med rettighed 0600. Bevar config, sessions, originals, previews, thumbnails og importørens øvrige private filer. Placér aldrig den private app.php under den offentlige webrod.
3. Installér de 12 offentlige filer fra `public/` i LexGalleris eksisterende offentlige mappe. Brug det allerede kontrollerede FTPS-planforløb, uden sletning eller spejling af brugerdata. Backend skal være opdateret først; den nye brugerflade åbner først funktionerne, når serveren annoncerer `gallery_delete` og `gallery_delete_requests`.
4. Kontrollér PHP-syntaks, statusfunktionerne og offentlige filhashes. Genindlæs appen. Test ejerens sletteanmodning med et aftalt tomt prøvegalleri, afvisning/annullering og admins navnebekræftelse.

Ingen ny SQL, nye pakkeafhængigheder eller credentials er nødvendige. Moderation og genoptagelig status gemmes i den eksisterende settings-tabel med faste nøgler; eksisterende fotosletning bruges til filer, favoritter og importkvitteringer. Invitationslinks, som også gælder andre gallerier, bevarer kun de andre galleriers rettigheder. Importkildens originalfiler og andre gallerier berøres ikke.

Sletning er endelig. Annullering er kun mulig, mens en medlemsanmodning afventer godkendelse. Når admin har startet sletningen, kan den genoptages; allerede slettede filer gendannes ikke af appen.

Automatiske tests bruger udelukkende syntetiske konti, medier, lokale webservere og engangsdatabaser. Pakken installerer ikke sig selv og sletter ingen produktionsgallerier under test eller installation.
