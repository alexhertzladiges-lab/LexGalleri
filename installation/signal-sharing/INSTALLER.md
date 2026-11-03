# LexGalleri – Del via Signal

Denne opdatering indeholder kun 12 offentlige filer, denne vejledning og SHA256SUMS. Ingen privat PHP-fil, SQL, konfiguration eller credentials skal uploades eller ændres. Opdateringen bevarer pladsoversigten, designet og den eksisterende private nyheds-/aktivitetsfunktion.

## Installation

Overfør filerne fra public/ til den eksisterende offentlige LexGalleri-mappe, inklusive .htaccess, med den begrænsede FTPS-konto. Opret ikke en ekstra public-mappe. Mapper 0755, offentlige filer 0644. Genindlæs appen.

## Brug

- Åbn et galleri og vælg **Del via Signal**. På en telefon med understøttet delingsmenu vælges Signal og derefter en modtager/samtale. Webappen kan ikke tvinge et bestemt program frem i systemets menu.
- På pc og telefoner uden delingsmenu vises et link og **Kopiér link**. Indsæt det i Signal. Hvis clipboard ikke understøttes, kan linket markeres og kopieres manuelt.
- Admin får samme delingsvalg ved et nyoprettet personligt invitationslink. Invitationens eksisterende udløb, modtager og valgte rettigheder bevares. Det personlige link bør kun sendes til den pågældende gæst.
- En annulleret delingsmenu kopierer ikke noget og åbner ikke en ny dialog. Ingen SMS, e-mail, bot eller serverbesked sendes automatisk. Ingen Signal-konto eller API-nøgle konfigureres i LexGalleri.

## Rettigheder og links

Medlemmer kan allerede oprette egne gallerier, uploade samt redigere i egne gallerier, når den eksisterende rettighedsmigrering er installeret. De kan stadig ikke oprette invitationer eller tildele andre brugere adgang. Det er forbeholdt admin.

Et normalt gallerilink indeholder kun installationens URL og #gallery= med galleri-id. Det indeholder ingen kontooplysninger, invitationsnøgle, session eller adgangstildeling. Modtageren skal logge ind og have eksisterende adgang til galleriet. Linket bevares gennem almindeligt login og admins Authenticator-forløb. Ukendte eller utilgængelige gallerier åbnes ikke. De eksisterende backendkontroller beskytter stadig alle medier.

## Efterkontrol

Afprøv med en telefon med Signal installeret, om systemets delingsmenu tilbyder Signal. Afprøv også Kopiér link, annullering og åbning af linket i en anden browser uden login. Kontrollér både en konto med adgang og en konto uden adgang. En automatisk browserprøve kan kontrollere payload og login/adgang, men kan ikke bekræfte en virkelig Signal-apps modtagelse eller sende på brugerens vegne.
