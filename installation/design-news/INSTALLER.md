# LexGalleri – kompakt design, nye billeder og aktivitet

Opdatering til https://lexan.dk/lexgalleri/. Bevarer pladsoversigten og admins valgte pladsgrænse. Pakken indeholder 12 offentlige filer, to private programfiler, SQL 008, denne vejledning og SHA256SUMS. Ingen konfiguration, adgangskoder, medlemmer, sessionsfiler eller medier følger med.

## Offentligt design

De 12 filer i `public/` installeres i den eksisterende offentlige LexGalleri-mappe, inklusive `.htaccess`. Opret ikke en ekstra public-mappe. Den begrænsede FTPS-konto kan udføre dette trin. Mapper 0755, filer 0644.

Designet virker også med den allerede installerede backend: kompakt header, to gallerier ved siden af hinanden på mobil, bundmenu, søgning og handlinger i en menu. Kun den oprindelige urørte Nordisk-palet får de nye varme standardfarver under denne overgang; tilpassede farver bevares. Påmindelser og aktivitetslog aktiveres først, når den private opdatering nedenfor er fuldført. Ingen nye API-kald foretages til funktioner, serveren ikke understøtter.

## Privat opdatering – kun via ejerens cPanel

Den eksisterende FTPS-konto har kun adgang til de offentlige filer. Den kan ikke udføre de følgende trin, og der oprettes ingen offentlig installationsgenvej.

1. Tag en privat sikkerhedskopi af eksisterende `app.php`, `security.php` og LexGalleris database. Opbevar den uden for public_html.
2. Erstat **begge** programfiler fra pakkens `private/` i `/home/lexandkk/lexgalleri-private/`: `app.php` og `security.php`. Rettighed **0600**. Bevar alle øvrige filer, konfiguration, MFA-nøgler og medier. De private filer må aldrig ligge i public_html.
3. Vælg **den eksisterende LexGalleri-database** i phpMyAdmin, og importér kun `sql/008_gallery_news_activity.sql`. Importér ikke schema.sql, opret ikke administrator igen, og brug ikke Fiskerhyttens database.
4. SQL 008 opretter kun tre tabeller til påmindelser/aktivitet og aktiverer den aftalte varme palet én gang. Genkørsel bevarer senere designvalg og pladsgrænsen. Eksisterende konti, adgangskoder, MFA, gallerier og mediefiler bevares.
5. Genindlæs appen. Offentlig `/api/status` skal nu vise `gallery_news`, `member_activity`, `compact_gallery` og `storage_overview` som true. Log ind som admin og åbn **Administration → Aktivitet og nyt**.

## Adfærd og efterkontrol

- Første brug etablerer en læst baseline for den pågældende bruger; det gamle arkiv bliver ikke fremstillet som helt nyt.
- Derefter giver andre brugeres nye billeder/videoer en påmindelse ved login og under brug. Kun gallerier med aktuel adgang indgår. Egne uploads giver ikke en påmindelse til en selv.
- En åben galleriside viser en knap, når nyt indhold ankommer. Brugeren vælger selv at hente det nye; en igangværende visning erstattes ikke automatisk. Der kontrolleres hvert 30. sekund, mens siden er synlig, samt ved tilbagevendende fokus.
- Admin ser kun fuldførte login og åbnede gallerier, ikke åbning af enkeltbilleder/videoer, læsetid eller IP-adresser. En oplysning om dette vises ved login og i kontomenuen. Hændelser beholdes i 30 dage og samles ved gentagne galleribesøg inden for fem minutter.
- Afprøv med to konti i samme galleri: log ind, upload et nyt testbillede på den ene, kontrollér påmindelsen på den anden, åbn galleriet og kontrollér admins aktivitetsoversigt. Slet eventuelt testbilledet gennem den normale funktion.
- Kontrollér også **Administration → Medieplads**, søgning, mobilmenu, billedvisning og MP4. En større pladsgrænse ændrer stadig ikke webhotellets abonnement eller blokerer uploads.

Ingen mail eller SMS udsendes af denne opdatering. Der kræves ingen nye credentials.

## Hvis en tidligere import viste advarsel #1265 for themes.id

Den første udgave havde et design-id på 34 tegn til et CHAR(32)-felt. Denne udgave bruger de samme første 32 tegn, som databasen allerede gemte. Hvis importen ellers afsluttede uden fejl, er der ikke behov for at ændre eller slette rækken eller genimportere databasen. Advarslen vedrører kun designpakkens id. En eventuel genkørsel af denne rettede SQL 008 bevarer den eksisterende nøgle og senere designvalg. Brug ikke den oprindelige SQL-fil igen.
