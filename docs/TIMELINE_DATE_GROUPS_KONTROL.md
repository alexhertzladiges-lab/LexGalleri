# LexGalleri: kompakt tidslinje efter dato

Godkendt af ejeren: seks miniaturer pr. række på pc og tre på mobil, samlet i lodrette datosektioner. Kun tidslinjen ændres; gallerier og favoritter bevarer deres visning. Optagedato foretrækkes, ellers bruges uploaddato. År, måneder og omtrentlige år vises med deres faktiske præcision; ugyldige/manglende datoer vises som ukendte.

Implementering: `public/static/app.js` og `public/static/style.css`. Eksisterende billedkort, adgangskontroller, billedviser og videofunktioner genbruges. En rettet optagedato flytter det eksisterende kort til den rette sektion uden at genhente miniaturen. Ingen privat backend, SQL eller konfiguration ændres.

Lokal Chromium-kørsel: **20 PASS, 0 FAIL, 0 skipped**. Den omfatter de nye dato-/layoutforløb og eksisterende billedviser-/adgangsregressioner. Dækket: samme dag fra flere gallerier, klokkeslæt omkring midnat, upload-fallback, år/måned/cirka, tom tidslinje, tilbagekaldt adgang, favoritter, åbning/lukning med bevarede billednoder og flytning efter datorettelse. Layout kontrolleret ved bredder320,390,850,1280 og1920: tre/seks kolonner, lodrette sektioner, ingen vandret overflow og klikmål mindst44px.

Genkørsel:

```sh
node --check public/static/app.js
node --test --test-name-pattern='timeline keeps each date|editing a capture date|photo overlay retains loaded grid|members see freshly authorized galleries' tests/webapp-browser.test.mjs
```

Prøverne bruger udelukkende syntetiske data og lokal Chromium. Skærmbilleder fra den faktiske implementation er visuelt gennemgået på mobil og pc. Installation af den godkendte ændring udføres først efter grøn samlet CI og gennem den eksisterende offentlige FTPS-allowlist med mål-, TLS- og hashkontroller. Produktionsgallerier ændres ikke som prøve. Fiskerhyttens LexApp er en separat app og indgår ikke.
