# Automatisk filoverførsel fra GitHub til webhotellet

Workflowet **Deploy PHP via SFTP** overfører kun seks kodefiler fra `main`, når det startes manuelt. PHP/MySQL-testene på netop den commit skal bestå først. Der bruges SFTP, så SSH-shelladgang er ikke nødvendig. Node og sshpass bruges kun af GitHub-runneren, ikke på webhotellet.

## Hvad er allerede indstillet?

- Port: **22**.
- Offentlig appmappe: **`/home/lexandkk/public_html/LexGalleri`**.
- Privat appmappe: **`/home/lexandkk/lexgalleri-private`**.
- Rettigheder på overførte filer: privat **600**, offentlig **644**.
- Første opsætning, konti, billeder, sessioner og udfyldt konfiguration håndteres stadig af PHP-appen og din private servermappe; de kommer ikke med i deploy.

GitHub-adgang til kode er ikke det samme som webhoteladgang. Workflowet får adgang gennem repositoryets Actions secrets/variables. Eksisterende værdier med navnene nedenfor kan genbruges. Secrets i et andet repository bliver ikke automatisk tilgængelige her; en organisationssecret kan deles med LexGalleri, hvis organisationens indstillinger tillader det.

## Forbindelsesoplysninger

Åbn repositoryets **Settings → Secrets and variables → Actions**.

| Navn | Placering | Indhold |
|---|---|---|
| `SFTP_PASSWORD` | Secret | SFTP-kontoens adgangskode |
| `SFTP_HOST` | Variable eller eksisterende secret | Den faktiske SFTP-server fra webhotellets kontrolpanel |
| `SFTP_USERNAME` | Variable eller eksisterende secret | SFTP-brugernavnet |
| `SFTP_KNOWN_HOSTS` | Variable eller eksisterende secret | Verificeret SSH-værtsnøgle i OpenSSH known_hosts-format |
| `SFTP_PORT` | Valgfri variable/secret | Kun nødvendig, hvis porten ikke er 22 |

Der skal ikke oprettes en port-secret, hvis webhotellet bruger standardporten. `e-studio.dk` er oplyst som udbyder; det er ikke i sig selv en bekræftelse på SFTP-værtsnavnet.

En known_hosts-linje har fx formen `sftp.example.dk ssh-ed25519 AAAA...` eller `[sftp.example.dk]:2222 ssh-ed25519 AAAA...` ved en anden port. Brug serverens rigtige nøgle, og kontrollér fingerprint mod webhotellets oplysning eller en allerede verificeret SFTP-forbindelse. Workflowet accepterer ikke ukendte eller ændrede værtsnøgler automatisk. Værtsnøglen er offentlig og kan godt være en variable. Den er forskellig fra din private SSH-login-nøgle; det nuværende workflow bruger adgangskode-login.

Hvis der allerede findes passende secrets under andre navne, kan workflowets mapping ændres i stedet for at oprette dubletter. Del kun navnene på secrets i chatten, aldrig adgangskoderne.

## Kontroller SFTP-stierne én gang

Nogle konti er begrænset til en bestemt mappe (chroot). Det betyder, at SFTP-programmet kan vise andre stier end PHP's filsystemstier. Hvis din SFTP-forbindelse starter direkte i `/home/lexandkk/`, kan de synlige stier fx være `/public_html/LexGalleri` og `/lexgalleri-private`.

Workflowet gætter ikke alternative stier. Hvis de aftalte absolutte stier ikke er dem, du ser via SFTP, opret disse to repository-variables med de verificerede SFTP-stier:

- `SFTP_PUBLIC_PATH`
- `SFTP_PRIVATE_PATH`

Den private mappe skal fortsat være uden for webroden. PHP-appens konfiguration bruger den virkelige serversti fra INSTALLATION.md; SFTP-stiernes eventuelle chroot ændrer ikke PHP-stien.

## Første installation

Følg [INSTALLATION.md](INSTALLATION.md) for database, private mapper, rettigheder og `config.php`. Deployworkflowet overfører ikke konfigurationen eller et konfigurationseksempel, og det opretter ikke nye loginoplysninger. Første installation kan derfor først fungere, når den private konfiguration er udfyldt.

Kodeoverførslen kan oprette de to appmapper og den offentlige `static/`-mappe, hvis kontoens rettigheder tillader det. Sørg selv for de private mappers ejer/rettigheder som beskrevet i installationsvejledningen. Workflowet sætter selve privatmappen til 700 og de to offentlige kode-mapper til 755. Rettigheder på eksisterende datamapper ændres ikke. Det forudsætter den samme ejer som i installationsvejledningen; brug en tilpasset opsætning, hvis webhotellets PHP kører som en anden bruger.

## Start overførslen

1. Sørg for, at PHP-versionen og deployworkflowet ligger på `main`.
2. Åbn **Actions → Deploy PHP via SFTP → Run workflow**.
3. Vælg **main**, og start kørslen. Andre branches bliver sprunget over.
4. Workflowet kører PHP/MySQL-tests, kontrollerer forbindelsesfelterne og overfører derefter kodefilerne.
5. Kontrollér galleriets HTTPS-adresse og et ufølsomt testfoto bagefter.

Workflowet er manuelt og starter aldrig på et almindeligt push eller en pull request. Det kræver ikke, at nogen deler adgangskoden i chatten. En administrator af GitHub-repositoryet kan starte det, når forbindelsen er oprettet.

## Hvad bliver overført?

| Fra GitHub | Til serveren |
|---|---|
| `private/app.php` | Privat mappe / `app.php` |
| `private/schema.sql` | Privat mappe / `schema.sql` |
| `public/static/style.css` | Offentlig mappe / `static/style.css` |
| `public/static/app.js` | Offentlig mappe / `static/app.js` |
| `public/.htaccess` | Offentlig mappe / `.htaccess` |
| `public/index.php` | Offentlig mappe / `index.php` |

Ingen rekursiv synkronisering eller sletning bruges. Alle seks filer uploades under midlertidige navne, før nogen aktiv fil erstattes. Derefter erstattes hver fil via SFTP-rename. Serveren skal understøtte rename med erstatning af eksisterende fil (typisk OpenSSH `posix-rename`). Hvis det ikke understøttes, stopper overførslen uden at slette målfilen først.

Hele installationen på tværs af mapper er ikke én atomisk transaktion: hvis forbindelsen afbrydes under den sidste rename-fase, kan der være en blanding af gamle og nye kodefiler. Kør igen med samme kodeversion, eller gendan kode fra backup. En afbrudt overførsel kan efterlade skjulte midlertidige kodefiler med præfikset `.lexgalleri-`; de kan fjernes manuelt efter kontrol. Der bruges ingen automatisk oprydning, som risikerer at slette billeder eller konfiguration.

## Hvad er verificeret?

Planens fil-liste, rækkefølge, stier og validering testes automatisk. PHP/MySQL-integrationen testes separat. En rigtig SFTP-overførsel og det konkrete webhotel er ikke verificeret, før forbindelsesoplysningerne er tilgængelige og workflowet er kørt med succes. Et grønt testresultat alene er ikke bevis for, at appen er installeret på serveren.
