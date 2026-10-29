# LexGalleri – registreret udgangspunkt 29. oktober 2026

Denne registrering fastholder den senest dokumenterede installation, teknologien og funktionerne, som skal bevares. Den gennemfører kun planens første trin. Eksisterende funktioner, data og privat opsætning skal bevares ved senere arbejde.

**Ejerens status:** Ingen kendte fejl oplyst 29. oktober 2026. Dette erstatter ikke en ny prøve af alle funktioner på den aktuelle server.

## Teknologi

HTML, CSS og almindelig JavaScript. PHP leverer HTML og API. PWA giver installation som app på mobil og pc. Backend: PHP/MySQL med PHP 8.4 som aftalt mål.

**Adresse:** https://lexan.dk/lexgalleri/

[Frontendkilde](https://github.com/alexhertzladiges-lab/LexGalleri/blob/1ee89613ead572de8597a029770a0e876edec22c/public/static/app.js) · [HTML/API-kilde](https://github.com/alexhertzladiges-lab/LexGalleri/blob/1ee89613ead572de8597a029770a0e876edec22c/private/app.php)

## Versionsregistrering

| Felt | Registrering |
| --- | --- |
| Offentlig kildeversion | `1ee89613ead572de8597a029770a0e876edec22c` |
| Kildegren | `main` |
| Seneste dokumenterede offentlige overførsel | 29/10 2026 kl. 15:52 UTC |
| Private PHP-programmer på serveren | Installeres af ejeren; aktuel version er ikke verificeret i denne registrering. |
| Databasemigreringer på serveren | Ikke verificeret. Filernes tilstedeværelse i repository betyder ikke, at SQL er importeret. |

[Seneste dokumenterede udrulning](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/40905344689) · [Bestået CI på den registrerede kilde](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/40905313356)

Udrulningsloggen bekræfter overførsel med `web3.e-studio.dk:21` og `chatgpt@lexan.dk`. Ejerens oplyste offentlige placering er `/home/lexandkk/public_html/lexgalleri`, med små bogstaver. Loggen dokumenterer ikke en efterfølgende genlæsning og kontrolsum af serverfilerne. Den private backend og SQL installeres separat.

Commit- og pakke-id er versionsreferencen. Et versionsnummer fra en kildefil bruges ikke alene som bevis for det, der er installeret eller vises på serveren.

## Funktioner der skal bevares

Tabellen er en kilde- og CI-baseret funktionsregistrering. Alle rækker mangler en ny live-funktionsprøve i dette trin. Afhængigheder af privat opsætning er angivet, så en funktion i repository ikke automatisk bliver betragtet som aktiveret på serveren.

| Funktion | Bevaringskrav | Installation / forudsætning |
| --- | --- | --- |
| LG-01 · Login og kontosikkerhed | Login, admin-authenticator, gendannelseskoder, profiler, adgangskodeskift og vis/skjul adgangskode skal bevares. | Matchende private app.php og security.php; 004_account_security.sql ved eksisterende installation |
| LG-02 · Gallerier og rettigheder | Kun tilladte gallerier er synlige. Admin styrer adgang; medlemmer/gæster kan oprette gallerier. Navn og beskrivelse kan redigeres efter rettighed. | Aktuel privat programversion; 006_gallery_permissions.sql for særskilt medlemsredigering |
| LG-03 · Medlemmer og invitationer | Admin kan invitere til udvalgte gallerier med særskilte rettigheder, administrere profiler og slette medlemmer uden at fjerne deres medier og uploaderhistorik. | Aktuelle private programfiler; 006_gallery_permissions.sql for invitation til flere gallerier |
| LG-04 · Billeder og videoer | Billedvisning og MP4-afspilning, originale filer, visningsbilleder og miniaturebilleder samt serverens adgangskontrol skal bevares. | Eksisterende opsætning og rettigheder bevares. |
| LG-05 · Fotooplysninger | Uploader, uploadtidspunkt, optagedato med forskellig præcision, sted og GPS skal bevares og vises efter rettighed. Metadataredigering må ikke fjerne skjulte GPS-data. | Eksisterende opsætning og rettigheder bevares. |
| LG-06 · Visning og navigation | Pile i medievisningen, samlet Info-panel og tilbagevenden til samme galleri uden at genindlæse hele billedoversigten skal bevares. | Eksisterende opsætning og rettigheder bevares. |
| LG-07 · Sletning og sletteønsker | Admin kan slette billeder/MP4 fra galleriets markeringstilstand. Medlemmer kan kun markere egne uploads til godkendelse. Afbrudte handlinger skal kunne håndteres sikkert. | 005_media_delete_requests.sql for sletteønsker; Aktuel privat programversion |
| LG-08 · Søgning, tidslinje og favoritter | Søgning, sortering, tidslinje og personlige favoritter skal bevares. | Eksisterende opsætning og rettigheder bevares. |
| LG-09 · Designpakker | Admin kan installere, aktivere og slette understøttede designpakker. Standarddesign, farver, fontvalg, radius og tæthed skal bevares. | Eksisterende opsætning og rettigheder bevares. |
| LG-10 · PWA og adresser | Mobil/pc og installation som webapp med egne ikoner skal bevares. Den offentlige adresse er /lexgalleri/ med små bogstaver. Private medier må ikke lægges i offlinecache. | Eksisterende opsætning og rettigheder bevares. |
| LG-11 · Importspor og mediereferencer | Eksisterende importhistorik, medieplaceringer og relationer skal bevares. Importværktøjets kode er en særskilt administrativ funktion og må ikke automatisk startes af denne registrering. | Eksisterende opsætning og rettigheder bevares. |

## Data og privat opsætning

- Originale billeder og videoer, previews og thumbnails
- Galleri-/medie-id’er og placeringer
- Medlemmer, profiler, uploadernavne og historik
- Rettigheder, invitationer, favoritter og sletteønsker
- Fotooplysninger, GPS, datoer og importspor
- Aktive designindstillinger og ejerens private sikkerhedskonfiguration

Registreringen indeholder kun kode-/versionsreferencer og filhashes. Den er ikke en sikkerhedskopi af billeder eller database. Aktuel backupstatus er ikke verificeret, og der er ikke oprettet en ny backup i dette trin. Ingen private konfigurationer, konti, billeder, databaseindhold eller rigtige beskeder er læst, ændret eller kopieret som del af registreringen.

## Verifikationsgrænse

GitHub-kilder, CI-status og eksisterende installationsbeviser er kontrolleret. Direkte netværksadgang til hjemmesiden og FTPS mangler i denne session. Derfor er serverens aktuelle filer, private aktivering, databasemigreringer og fysiske appinstallationer ikke genverificeret. 

Android, iPhone/iPad og Windows/pc er relevante platforme. Ingen fysisk platformgodkendelse påstås gennemført i dette trin.

## Registreringsfiler og videre kontrol

[Maskinlæsbar registrering](baseline/2026-10-29.json) indeholder kildereferencer, filhashes, funktions-id’er og kildefiler til hver funktion. Hashene beskriver repository-versionen; de er ikke nyobserverede serverhashes.

- Ejeren bekræfter den installerede private programversion og de anvendte databasemigreringer med sin egen adgang.
- Offentlige filer og API-funktioner genkontrolleres, når der er læseadgang til hjemmesiden.
- Aftalte roller prøves på den aktuelle installation med handlinger, som bevarer eksisterende data.
