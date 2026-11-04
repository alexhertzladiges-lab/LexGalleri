# LexGalleri – projektidentitet og installationsgrænser

Dette repository gælder appen **LexGalleri**. Produktnavnet har stort L og G.
Den offentlige adresse er altid **https://lexan.dk/lexgalleri/** med små
bogstaver i URL-stien. Repositoryet hedder `alexhertzladiges-lab/LexGalleri`.

## Hold de to apps adskilt

| App | Offentlig adresse | Repository |
| --- | --- | --- |
| LexGalleri | `https://lexan.dk/lexgalleri/` | `alexhertzladiges-lab/LexGalleri` |
| Fiskerhyttens LexApp | `https://fiskerhyttenkoege.dk/dk/` | `alexhertzladiges-lab/lexapp` |

Læs `DEPLOYMENT.md`, `ROUTING.md` og `INSTALLATION.md` før installationsarbejde.
Kontrollér projekt, repository, host, konto og installationsrod før ændringer.
Genbrug ikke den anden apps pakker, private filer, credentials eller
installationsgodkendelser. En eksisterende godkendelse til den samme konkrete
app og pakke gælder fortsat; spørg ikke om den igen.

LexGalleris eksisterende offentlige FTPS-konto er `chatgpt@lexan.dk` på
`web3.e-studio.dk:21`. Den faste kontrol i `scripts/ftps-plan.mjs` skal bevares.
LexApps server `web7.e-studio.dk` og konto `chatgpt@fiskerhyttenkoege.dk` er
andre mål og må ikke anvendes her. Hold altid TLS-, certifikat-, værtsnavne-
og bootstrapkontroller aktive. Adgangskoder må ikke skrives i logs eller kode.

FTPS-kontoens `/` er dens eksisterende begrænsede offentlige rod. `PWD /`
alene identificerer ikke den fysiske mappe; den godkendte offentlige index.php
skal også kontrolleres før upload. Der må kun overføres de 12 tilladte offentlige
filer. Privat programkode ligger separat i `/home/lexandkk/lexgalleri-private/`
og er ikke tilgængelig via denne offentlige FTPS-konto.

URL og fysisk mappenavn er forskellige forhold: eksisterende routing kan
betjene den lille URL fra en historisk fysisk `LexGalleri`-mappe. Omdøb ikke
mapper, og ændr ikke routing eller `base_path` på baggrund af produktnavnets
store bogstaver. Følg den eksisterende verificerede rod og `ROUTING.md`.
Store bogstaver i syntetiske testadresser er kompatibilitetsprøver, ikke
produktionsmål. Foretag ikke en global søg/erstat af `LexGalleri`.

## Nuværende galleri-slettepakke

Kilde `8c70814d44cfd95adfc32e28ef1e5ca878485d20`, grøn CI41801200808,
artifact13307512756: 1.274 PHP-kontroller og209 Node-/browserprøver bestået.
Pakken er kodet/testet og godkendt, men **ikke installeret**. Installationskørsel
41804486568 stoppede før offentlige filændringer, fordi privat app.php endnu
ikke annoncerer gallery_delete/gallery_delete_requests. FTPS-kontoen kan ikke
opdatere den private fil. Ejeren skal uploade den testede app.php med 0600,
hvorefter den allerede godkendte installation kan fortsættes ved bevidst
genkørsel af job126488017307 på commit b7635c1e25c8bd55d18b62439b3cf4fcc93d28d5.
Engangsworkflowets nye kørsler er sat på pause. Pins findes i
`installation/gallery-delete/release.json`; rapporten er
`docs/GALLERY_DELETE_KONTROL.md`. Ret kun dokumentationen om navn/adresse
uden at ændre den allerede fastlåste pakke eller dens SHA256SUMS.

Tests bruger kun syntetiske konti, medier og engangsdatabaser. Installation
af kode er ikke tilladelse til at slette rigtige gallerier som en prøve.
