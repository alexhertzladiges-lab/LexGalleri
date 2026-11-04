# LexGalleri: tydeligere knaptekst

»Markér til sletning« er ændret til »Markér billeder til sletning« på medlemsknapperne i gallerioversigten og inde i et galleri samt i de to tilhørende dialogoverskrifter. Teksten ligger i `public/static/app.js`; på webhotellet er filen `static/app.js` i LexGalleris offentlige rod. Adfærden er uændret.

Kilde: `95b30289414d961ce75b115244084dea724a93fa`. Den eksisterende browserforventning er opdateret. JavaScript-syntaks og den målrettede Chromium-prøve på mobil/pc:5 PASS,0 FAIL. [Samlet CI41811970538](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41811970538): SUCCESS.

Ejeren godkendte installationen med »installer, hvor gemmer den tekst sig ?«. [Installation41812499715](https://github.com/alexhertzladiges-lab/LexGalleri/actions/runs/41812499715), job126514963809: SUCCESS. Artifact13312752933 blev låst med SHA-256 `7dca51dabd67c26061d23da01d827d0dda11793503a9ad0ccbb095f9a0993a0a`. Kontrollen bekræftede, at kun fire tekstforekomster adskilte sig fra installeret runtime; de øvrige11 offentlige filer og privat app.php er identiske.

Alle12 offentlige filer blev overført med den eksisterende FTPS-allowlist, mål-/bootstrapkontrol og obligatorisk verificeret TLS. Alle12 blev genlæst med korrekte SHA-256; den præcise lille HTTPS-adresse, den nye tekst, JavaScript/CSS og backendfunktioner blev efterkontrolleret. Ingen privat upload, SQL, produktionssletning eller ændring af Fiskerhyttens LexApp.

Installationsbevis artifact13313271576 er genhentet, ZIP-hashkontrolleret og sammenholdt med alle12 kildefiler: `3728a95c197d8c86f9fd2a5ecc82315651af56bd88a5302fbb7490d790830e2c`. Journalen ligger i `installation/media-delete-label/public-installed.json`. Godkendelsen er forbrugt, og engangsworkflowet er lukket. Ingen merge.
