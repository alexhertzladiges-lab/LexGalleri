# LexGalleri – Del via Signal

Brugeren valgte deling via telefonens delmenu og bad om status på medlemmers rettigheder. Kontrol af den eksisterende backend viste: medlemmer kan oprette egne gallerier; opretteren får upload/download/GPS og, med installeret rettighedsmigrering, redigering i det nye galleri. Invitationer, tildeling af andre brugeres adgang og invitationsoversigt ligger under adminbeskyttede endpoints. Disse rettigheder er uændrede i denne opdatering.

## Ændring

Et delingsvalg i et åbent galleri samt ved admins nyoprettede invitationslink. Native Web Share API kaldes direkte ved brugerens tryk i sikker browserkontekst. Systemets menu vælger modtagerprogrammet; appen tvinger ikke Signal. Uden API eller ved en afvist delingsmenu vises en eksplicit Kopiér link-dialog. AbortError er stille annullering uden automatisk clipboard/fallback. Ingen serverkontakt til Signal, automatisk besked eller ændring af medlemsrettigheder.

Normale links indeholder kun installations-URL og #gallery=<32 hex>. Oprindelig query/invitation/session kopieres ikke ind i gallerilinket. Destinationen fastholdes kun i den aktuelle JavaScript-side gennem login/MFA og forbruges én gang. Der oprettes intet nyt vedvarende browserlager. Kun gallerier fra den autentificerede brugers serverliste åbnes; backendens adgangskontrol gælder fortsat. Et hashskift i en åben app understøttes også. Ukendt/utilgængeligt id giver en generel adgangsbesked.

Admins personlige invitationslink er et særskilt privilegeret valg og har en tydelig forklaring. Det opretter ikke en ny invitation, ændrer ikke udløb og åbner ikke invitationer for medlemmer. Ingen invitation bliver automatisk sendt. Sene svar efter kontoskift kan ikke genåbne en tidligere privat dialog.

## Kontrol

Eksisterende konto-/UI-prøver udvidet med URL-validering, native payload uden netkald, annullering, afvist chooser, eksplicit clipboard, medlemsafvisning fra invitationsdeling, sent svar efter kontoskift og engangsforbrug af autoriseret link.

Rigtig PHP/database/browser kontrollerer, at et delt link overlever både medlemslogin og admins Authenticator/recovery-forløb, samt at et medlem stadig får 403 fra admin-invitationsendpointet. Der testes også admins deling af et rigtigt syntetisk invitationslink og ukendt destination efter login. OS-delings- og clipboardfunktioner erstattes med lokale teststubbe; ingen virkelig besked, invitation, mail eller SMS sendes.

Rigtig browser kontrollerer delingsknappen ved 320, 390 og 1280 px, native payload, afbrudt/afvist chooser og manglende gallerirettighed. En tidlig prøvefejl skyldtes en read-only native API-teststub; stubben blev gjort skrivbar, så annullering og afvisning reelt afprøves som forskellige scenarier. Appkoden blev ikke ændret for at skjule denne prøvefejl.

Lokale og GitHub-resultater tilføjes efter afslutning. Pakken bygges med den eksisterende pakker: python3 scripts/package-telefon-mp4.py --signal-sharing. Kun offentlige filer og vejledning, ingen privat kode eller SQL. Installation er endnu ikke udført som del af denne ændring.

Lokalt bestået på PHP 8.4.24, MariaDB 11.8.6 og Chromium: **30 konto-/UI-prøver**, **14 rigtige PHP/database/browserprøver** og **74 webapp-browserprøver**, alle uden fejl. Første administrators loginprøve starter nu direkte på et delt gallerilink og kontrollerer, at destinationen først åbnes efter fuldført Authenticator og recovery-kvittering. Det særlige medlemslink afprøves både med tilladt og ukendt destination. Engangsdatabaser efterlod nul testdatabaser, og serveren er stoppet. Kun syntetiske data og lokale stubbe er brugt.
