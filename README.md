# Familiearkiv

En selvstændig første version af et privat familiearkiv. Python 3.12+, FastAPI, SQLite og lokal billedlagring. Dansk brugerflade, tilpasset mobil og pc. Ingen eksterne skrifttyper, billedtjenester eller analytics.

## Start lokalt

```bash
cd familiearkiv
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export SETUP_TOKEN="$(python -c 'import secrets;print(secrets.token_urlsafe(32))')"
export COOKIE_SECURE=0
printf 'Opsætningsnøgle: %s\n' "$SETUP_TOKEN"
uvicorn app:app --host 127.0.0.1 --port 8000
```

Åbn http://127.0.0.1:8000. Brug opsætningsnøglen til at oprette administrator. Der er ingen standardadgangskode. Opsætning kan kun bruges én gang. Fjern SETUP_TOKEN efter opsætning. Data oprettes først ved kørsel i `data/`; alternativt sættes `ARCHIVE_DATA` til en vedvarende mappe.

## Implementeret

- Konti, scrypt-adgangskoder, HttpOnly-sessioner, logout og grundlæggende begrænsning af loginforsøg.
- Admin opretter gallerier og styrer se/upload/download/GPS pr. konto og galleri.
- Personlige engangsinvitationer til et galleri, gyldige i 7 dage. Admin sender selv linket. Eksisterende brugere kan acceptere med deres eksisterende adgangskode.
- Sekventiel upload af flere billeder; JPEG, PNG og WebP, højst 25 MB pr. billede og 40 millioner pixels. Dubletkontrol pr. galleri.
- Originaler, metadatafrie visningsbilleder og miniaturebilleder. EXIF-optagetid og GPS aflæses ved upload.
- Redigér titel, sted, koordinater og dato med præcision: tidspunkt/dag/måned/år/cirka/ukendt. EXIF-tid uden tidszone bevares som kameraets lokale tid; uploadtid er UTC.
- Tidslinje, favoritter, søgning, billedvisning og forrige/næste.
- Rettigheder kontrolleres på serveren ved hver adgang, også direkte billedlinks. Tilbagekaldt adgang slår igennem ved næste forespørgsel.
- GPS returneres kun til konti med tilladelse. Originaldownload kræver både download- og GPS-rettighed, fordi originalen kan indeholde GPS i EXIF.
- Designpakker installeres i databasen og kan forhåndsvises, aktiveres og erstattes af standardtemaet.

## Designpakker

Upload en JSON-fil eller ZIP, der indeholder præcis én fil med navnet `theme.json`. Se `themes/hav/theme.json`. Kun følgende værdier understøttes:

```json
{
  "version": 1,
  "name": "Hav",
  "colors": {
    "background": "#f2f6f8",
    "surface": "#ffffff",
    "text": "#203e50",
    "accent": "#336b87"
  },
  "font": "sans",
  "radius": 14,
  "density": "comfortable"
}
```

Farver skal være sekscifrede hexværdier. `font`: sans/serif. `radius`: heltal 0–32. `density`: compact/comfortable. Der installeres ingen scripts, HTML eller vilkårlig CSS fra pakkerne. Eksempelpakken kan også hentes i adminpanelet. Forhåndsvisning er lokal; aktivering gemmes for alle.

## Drift

Kør bag en HTTPS-reverseproxy med korrekt videresendt host/protokol. Sæt `COOKIE_SECURE=1` (standard) og eksponér ikke app-porten direkte. Brug én app-worker for den nuværende loginbegrænsning, og tilføj proxybaseret rate limiting samt uploadgrænse 26 MB. Ved proxy skal kun proxyens IP have tillid til forwarded headers. Datamappen indeholder private originaler og skal ligge uden for offentlige webmapper med begrænset filadgang og krypteret disk/backup. Appen leverer selv filerne efter adgangskontrol.

SQLite er egnet til en mindre familieinstallation. Billedbehandling sker i processen og kan kortvarigt blokere andre forespørgsler. Ved større arkiver bør den flyttes til en jobkø og filerne til privat objektlagring. Begræns også samlet lagerforbrug på driftsniveau.

## Backup og gendannelse

```bash
python backup.py /sikker/mappe/familiearkiv-backup.zip
```

Gem ZIP-filen privat og krypteret. Den indeholder alle konti, adgangskodehashes, sessioner, temaer, metadata og billeder. Værktøjet bruger SQLite backup-API og inkluderer kun de filer, som databasesnapshot henviser til. Stop appen, pak en betroet backup ud til en tom datamappe, og start med `ARCHIVE_DATA` pegende på den. Ryd sessions-tabellen ved sikkerhedsgendannelse. Afprøv gendannelse på separat installation før rigtig drift.

## Kontrol

```bash
pip install httpx
python -m unittest -v test_app.py
node --check static/app.js
```

Testen dækker kontoopsætning, login/session, invitation én gang, galleriisolering, upload, dubletter, redigering, GPS-skjulning, originaldownload, adgangstilbagekaldelse, origin-kontrol og designpakker. Brug ikke testdata som produktionsdata. API-kontroller bestået i leveringsmiljøet; visuel browserkontrol er ikke udført.

## Ikke implementeret endnu

Kortvisning, kommentarer, personmærkning, HEIC/video, genoptagelig upload, offline/PWA, papirkurv/sletning, automatisk backupplan, MFA, selvbetjent adgangskodegendannelse, kontosletning og automatisk udløb af gæstekonti. Invitationens udløb er ikke et udløb af efterfølgende gallerirettigheder. Rettigheder kan fjernes af admin. Der sendes ingen e-mails. Arkivet starter tomt.

Dette er en fungerende første version, ikke en færdig driftssat eller uafhængigt sikkerhedsrevideret tjeneste.
