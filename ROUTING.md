# Adressen lexan.dk/lexgalleri

Den offentlige adresse er **https://lexan.dk/lexgalleri/** med små bogstaver. **https://lexan.dk/** sender videre til denne adresse. Gamle adresser med `/LexGalleri/` sendes også til den nye adresse.

Galleriets eksisterende fysiske mappe kan fortsat hedde `LexGalleri`. Med denne mappe kan den lille URL bruges uden omdøbning eller ændring af FTPS-kontoens rod. Rodens routing vælger en `lexgalleri`-mappe med `index.php` først og ellers `LexGalleri`; har begge mapper en `index.php`, skal den valgte appmappe og FTPS-kontoens rod passe sammen. Produktnavnet og GitHub-repositoryet hedder fortsat LexGalleri.

## 1. Ret stien i din eksisterende private konfiguration

Åbn selv `/home/lexandkk/lexgalleri-private/config/config.php` med webhotellets filmanager eller din egen fulde adgang. Ret denne værdi:

```php
'base_path' => '/lexgalleri',
```

Behold resten af den udfyldte konfiguration, herunder databaseoplysninger, `secure_cookies` og eksisterende nøgler. Der skal ikke oprettes en ny database eller køres SQL til adresseændringen. Den udfyldte konfiguration bliver privat på serveren.

## 2. Læg routingblokken i domænets rod

Åbn webhotellets domæneoversigt, og kontrollér **dokumentroden for `lexan.dk`**. Det er mappen, som domænets `/` faktisk åbner. Den skal være den offentlige mappe, der indeholder galleriets `LexGalleri`- eller `lexgalleri`-mappe. Et typisk eksempel er:

```text
/home/lexandkk/public_html/
├── .htaccess          ← domænets routingblok skal ind her
└── LexGalleri/        ← galleriets eksisterende mappe
    ├── .htaccess      ← galleriets egen fil bevares
    ├── index.php
    └── static/
```

Hent [hosting/root/.htaccess](hosting/root/.htaccess) fra GitHub med **Download raw file**.

- Findes der allerede en `.htaccess` i domænets rod, så gem en privat backup og indsæt filens markerede **BEGIN/END-blok før de eksisterende routingregler**. Behold de øvrige regler.
- Findes der ingen `.htaccess` i domænets rod, kan du lægge filen dér med præcis navnet `.htaccess`. Aktivér eventuelt visning af skjulte filer i filmanageren.

Rodfilen skal ligge ved siden af galleri-mappen. Galleriets egen `.htaccess` ligger fortsat inde i galleri-mappen. Den begrænsede FTPS-konto overfører kun galleriets offentlige appfiler; du installerer selv rodblokken med din egen adgang.

**Hvis dokumentroden er en anden mappe:** Peger `lexan.dk` eksempelvis på `/home/lexandkk/public_html/public`, mens galleriet ligger i `/home/lexandkk/public_html/LexGalleri`, ligger galleriet uden for domænets rod. Blokken kan ikke gøre en søskendemappe tilgængelig derfra. Få webhotellet til at tilpasse dokumentrod og placering af galleriets offentlige filer korrekt. Kontrollér, at en ændret domænerod kun åbner offentlige filer; projektkonfiguration og private programfiler skal forblive uden for webadgangen. Ændres appens fysiske placering, skal dens reference til privatmappen også passe efter [installationsvejledningen](INSTALLATION.md).

Behold eksisterende Lychee-regler, kildeoriginaler og private billedmapper. Adresseændringen flytter ingen billeder og ændrer ikke importhistorikken.

### Valgfri indgangsfil i domænets rod

[hosting/root/index.php](hosting/root/index.php) kan også bruges som en enkel indgangsfil, der sender videre til galleriet. `.htaccess`-blokken er normalt tilstrækkelig. Læg kun denne `index.php` i domænets rod, hvis der ingen indgangsfil findes, eller hvis du bevidst vil erstatte den eksisterende indgang. En eksisterende root-`index.php` skal ikke erstattes som en del af indsættelsen af routingblokken.

## Kontrollér adresserne

Åbn adresserne via HTTPS:

| Adresse | Forventet resultat |
|---|---|
| `https://lexan.dk/` | Viderestilling til `/lexgalleri/` |
| `https://lexan.dk/index.php` | Viderestilling til `/lexgalleri/` |
| `https://lexan.dk/lexgalleri` | Viderestilling til `/lexgalleri/` |
| `https://lexan.dk/lexgalleri/` | Galleriets login eller allerede åbne session |
| `https://lexan.dk/LexGalleri/` | Viderestilling til `/lexgalleri/` |

Viderestillingerne bevarer query-parametre, herunder et eksisterende invitationslink. Invitationernes normale udløb og engangsbrug gælder fortsat. Routing af API-kald bevarer deres HTTP-metode og indhold.

På pc opdaterer du med **Ctrl+F5**. Du kan blive bedt om at logge ind igen, fordi sessionens cookiesti følger den nye adresse. Brug din eksisterende konto og Authenticator.

## En allerede installeret webapp

Har du installeret webappen fra den gamle store adresse, kan den gamle genvej have `/LexGalleri/` som startadresse og scope. Fjern den gamle genvej eller installation, åbn **https://lexan.dk/lexgalleri/**, og installér igen efter [WEBAPP.md](WEBAPP.md). Log ind med den eksisterende konto, hvis browseren beder om det.

Adresseændringen opretter ingen nye Authenticator-nøgler. Bevar `config/mfa.key` og dine eksisterende reservekoder i den private backup.
