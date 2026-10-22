# Aksjekurser via Cloudflare Worker

Yahoo Finance tillater ikke at nettsider henter kurser direkte fra nettleseren (de sender ikke
CORS-tillatelse). `worker.js` er en liten mellomstasjon som kjører gratis hos Cloudflare: appen spør
Workeren, Workeren spør Yahoo og sender svaret tilbake med tillatelse.

Ingen nøkler eller hemmeligheter trengs, og adressen til Workeren kan gjerne stå i koden.

## Oppsett (ca. 5 minutter, ingenting å installere)

1. Lag en gratis konto på **https://dash.cloudflare.com/sign-up** og bekreft e-posten.
2. Velg **Workers & Pages** i menyen til venstre (ligger under *Compute*), og trykk **Create**.
3. Velg **Start with Hello World!** (en Worker), gi den navnet `pengeflyt-kurser` og trykk **Deploy**.
4. Trykk **Edit code**, slett alt som står der, lim inn hele innholdet i `worker.js` og trykk **Deploy**.
5. Kopier adressen øverst, f.eks. `https://pengeflyt-kurser.<ditt-navn>.workers.dev`.

## Test at den virker

Åpne disse adressene i nettleseren (bytt inn din adresse):

- `https://pengeflyt-kurser.<ditt-navn>.workers.dev/?symbol=EQNR.OL` – skal gi JSON med `"regularMarketPrice"`
- `https://pengeflyt-kurser.<ditt-navn>.workers.dev/?search=equinor` – skal gi en liste der `EQNR.OL` er med

## Greit å vite

- **Gratis:** Cloudflare sin gratisplan tåler 100 000 oppslag per dag, og svar mellomlagres i 60 sekunder.
- **Hvem kan bruke den:** bare sidene i `ALLOWED_ORIGINS` (GitHub Pages-siden og `localhost:8000`) får
  lese svarene fra en nettleser. Bytter du brukernavn eller domene, må listen oppdateres og Workeren
  deployes på nytt.
- **Forsinkelse:** Yahoo-kursene er ca. 15 minutter forsinket for Oslo Børs.
- **Uoffisielt:** Yahoo har ikke et offisielt API. Oppslaget kan endre seg uten varsel; da faller appen
  tilbake til verdien du har lagt inn selv.
