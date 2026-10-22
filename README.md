# Pengeflyt – formue og forbruk på ett sted

**Pengeflyt** samler hele formuen din på ett sted: bankkontoer, sparing og BSU, fond, aksjer, krypto
(f.eks. Firi og Binance) og gjeld som studielån. Kryptoverdiene følger markedet **i sanntid**, og når du
setter inn eller tar ut penger, oppdateres totalen med en gang. Appen viser også hvordan formuen har
utviklet seg over tid og hvor mye avkastning fond, aksjer og krypto har gitt. I tillegg kan du følge
forbruket ditt måned for måned og sette budsjetter per kategori.

Appen kjører helt i nettleseren. Det finnes ingen konto, innlogging eller server, og dataene dine forlater
aldri maskinen (de lagres i nettleserens `localStorage`). Bare kryptokursene hentes fra nettet.

> Laget i Oppgave 3 i *Intro til KI* (vibe coding): appen er planlagt, skrevet, testet og forbedret sammen
> med en KI-kodeagent. Se [Slik ble KI brukt](#slik-ble-ki-brukt).

## Funksjoner

**1. Formueoversikt**
- Kontoer av alle typer: bank, sparing, fond, aksjer, krypto, annet og gjeld
- Nettoformue (eiendeler minus gjeld), fordeling per type og avkastning på det du har satt inn
- Graf over formuen dag for dag (1 mnd, 3 mnd, 6 mnd, 1 år eller alt), med tabellvisning
- En egen side per konto med verdi, beholdning, graf og alle bevegelser

**2. Innskudd, uttak og overføringer**
- Registrer innskudd, uttak eller ny saldo/verdi med et par trykk; totalen oppdateres med en gang
- Kryptokjøp og -salg: skriv antall *eller* beløp, så regner appen ut det andre med live-kursen
- Overføringer: velg «Pengene kom fra Brukskonto», så trekkes beløpet fra banken automatisk og formuen
  telles ikke dobbelt
- Du kan ikke selge flere mynter enn du har, og alt kan slettes og angres (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>)

**3. Live kryptokurser**
- Ny pris hvert sekund fra Binance (WebSocket), regnet om til kroner med kursen fra CoinGecko
- Tallene som endres, blinker kort grønt eller rødt, og et «Live»-merke viser at strømmen er aktiv
- Historiske dagskurser fra CoinGecko brukes i grafen, så kryptoverdien bakover i tid blir riktig
- Ingen innlogging eller API-nøkler: appen spør bare om kurser, aldri om hva du eier

**Forbruk og budsjett** (fra første versjon av appen)
- Inntekter og utgifter med kategorier, søk, filtre og CSV-eksport (semikolon og desimalkomma for norsk Excel)
- Månedlige budsjetter som varsler ved 80 % og viser hvor mye du kan bruke per dag resten av måneden
- «Foreslå budsjetter» ut fra hva du har brukt de siste tre månedene

**Ellers**
- Eksempeldata: et år med kontoer for en student i Norge, med ekte historiske kryptokurser
- Sikkerhetskopi og gjenoppretting (JSON), og sletting av alt (med angre)
- Fungerer på mobil (fanelinje nederst, dialoger som bunnark) og PC, i lyst og mørkt tema

## Kom i gang

Du trenger bare Python 3 (følger med macOS; på Windows fra python.org). Ingenting må installeres.

```bash
python3 serve.py
```

Åpne **http://localhost:8000** og trykk **Prøv med eksempeldata**, eller legg inn dine egne kontoer.

Hvorfor en server? Nettlesere nekter å laste JavaScript-moduler fra en side som er åpnet som fil (`file://`).
Dobbeltklikker du `index.html`, får du en melding som forklarer hvordan appen startes.

## Tester

105 enhetstester dekker beregningene, tolkning av tall, lagring, overføringer, kurser og eksport.

- **I nettleseren:** start serveren og åpne **http://localhost:8000/tests/**
- **I terminalen på Mac** (med JavaScript-motoren som følger med macOS):
  ```bash
  /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/cli.js
  ```

Se [Testing](#testing) for hva som ble testet for hånd, og feilene testingen fant.

## Publisering med GitHub Pages

Appen er bare statiske filer, så GitHub Pages kan vise den gratis:

1. Lag et nytt, offentlig repository på GitHub og push denne mappen dit.
2. Gå til **Settings → Pages**, velg **Deploy from a branch**, `main` og `/ (root)`, og lagre.
3. Etter et minutt ligger appen på `https://<brukernavn>.github.io/<repository>/`.

## Slik er appen bygget

Vanlig HTML, CSS og JavaScript (ES-moduler) – ingen rammeverk, ingen byggesteg og ingen avhengigheter.

```
index.html            sideskall: meny og dialoger
styles.css            all stil, lyst/mørkt tema og mobilvisning
serve.py              liten lokal webserver
src/
  app.js              startpunkt: ruting (#/formue …), tegning av sider, knapper og kursstrøm
  store.js            dataene: kontoer, bevegelser, transaksjoner, budsjetter; sjekk og lagring
  networth.js         formueberegninger: saldo fra bevegelser, avkastning, formue dag for dag
  prices.js           kryptokurser: Binance (sanntid), CoinGecko (kroner, døgnendring, historikk)
  accounts.js         kontotyper og kryptovalutaer
  finance.js          forbruksberegninger: måneder, kategorier, budsjetter, forslag
  money.js, dates.js  tall, kroner og datoer på norsk
  charts.js           linjegraf, søylediagram, kategorilinjer og budsjettlinjer
  dialogs.js          dialogene for konto, bevegelse, transaksjon og budsjett
  demo.js             eksempeldata
  csv.js, html.js     CSV-eksport og trygge HTML-maler
  views/              én fil per side, pluss live.js som oppdaterer tall når kursene endres
tests/                enhetstester og en liten testkjører
```

Noen valg som er tatt:
- **Saldoen regnes ut fra bevegelsene** (startsaldo, innskudd, uttak, ny verdi, kjøp, salg) i stedet for å
  lagres som ett tall. Da stemmer alt også etter sletting og angring, og formuen kan regnes ut for hver dag
  bakover i tid.
- **Penger lagres i øre (heltall)**: `1 234,50 kr` lagres som `123450`, fordi desimaltall ikke summeres
  nøyaktig i JavaScript (`0.1 + 0.2 = 0.30000000000000004`).
- **Live-tall oppdateres uten å tegne siden på nytt**, så åpne lister, verktøytips og markøren ikke
  forstyrres hvert sekund.
- **Ingen hemmeligheter i koden.** Automatisk henting av saldo fra bank (krever lisensiert PSD2-aktør og
  BankID) og fra Binance/Firi (krever API-nøkler som må holdes hemmelige) ble bevisst valgt bort; åpne
  kursdata gir sanntid uten nøkler.
- **Alt brukeren skriver blir «escapet»** før det vises (`src/html.js`), og CSV-eksporten hindrer at
  regneark kjører tekst som formler.
- **Fargene i grafene** er sjekket for kontrast og fargeblindhet, og status vises aldri bare med farge
  (alltid også ikon, pil eller ord).

## Slik ble KI brukt

Appen er bygget med **Claude Code** (Anthropics KI-kodeagent, modellen Claude Opus 5.5), som jobbet direkte
i prosjektmappen.

1. **Første versjon.** Fra oppgaveteksten og «jeg vil lage en personal finance tracker» foreslo KI-en en
   budsjettapp (transaksjoner, budsjetter, oversikt) som en webapp uten installasjon. Node.js fantes ikke
   på maskinen, så den valgte en løsning som bare trenger nettleser og Python.
2. **Ny retning.** Etter første versjon ombestemte jeg meg: jeg ville heller ha en samlet oversikt over
   *formuen* min (bank, fond/aksjer, Binance/Firi) som holder seg oppdatert i sanntid. KI-en forklarte hva
   som er realistisk: automatisk banksaldo krever lisens og BankID, og børsnøkler må holdes hemmelige.
   Den foreslo heller live-kurser fra åpne kilder, og stilte tre spørsmål: erstatte eller beholde budsjett-
   delen, språk, og automatisk synk med nøkler. Svarene ble: behold, norsk, og live-kurser uten nøkler.
3. **Undersøke før bygging.** KI-en testet i nettleseren hvilke kurstjenester som svarer uten nøkler
   (CoinGecko, Binance og Firi gjorde det; én annen ble blokkert) og at Binance sender priser hvert sekund.
4. **Logikk først, med tester.** Beregningene (saldo fra bevegelser, avkastning, formue per dag,
   overføringer, kurser) ble skrevet som rene funksjoner med enhetstester før skjermene.
5. **Skjermer og oversetting.** Formuesiden, kontosiden og de nye dialogene ble laget, og hele appen ble
   oversatt til norsk (også dato- og tallformat og CSV).
6. **Testing i ekte nettleser.** KI-en klikket gjennom alle funksjonene på PC- og mobilstørrelse og i lyst
   og mørkt tema, leste av siden og tok skjermbilder. Feil den fant, ble rettet og testet på nytt.

## Testing

**Automatisk:** 105 enhetstester (`tests/`) for blant annet tolkning av beløp og antall, norsk tallformat,
datoer over måneds- og årsskifter, saldo fra bevegelser, avkastning, formue dag for dag med historiske
kurser, overføringer (begge sider, sletting og angring), salg av flere mynter enn man har, tolkning av svar
fra CoinGecko og Binance, budsjetter, lagring (også ødelagte data og full lagring), sikkerhetskopier,
CSV-eksport og eksempeldata.

**For hånd i nettleseren** (PC og mobil 375 px, lyst og mørkt tema):

| Testet | Resultat |
|---|---|
| Ny bankkonto med startsaldo; ny kryptokonto med 0,01 BTC uten oppgitt pris (bruker dagens kurs) | ✅ |
| «Live»-merket og verdier som oppdateres fra Binance-strømmen | ✅ |
| Nytt fond med innskutt beløp; innskudd «fra Brukskonto» trekker fra banken; avkastning +10 % stemmer | ✅ |
| Kjøp av ny mynt (ETH) for 500 kr: antall regnes ut fra live-kursen | ✅ |
| Salg av mer BTC enn kontoen har gir feilmelding | ✅ |
| Sletting av bevegelse og angring | ✅ |
| Eksempeldata med ekte historiske kurser; graf med 366 dager; fordeling og avkastning | ✅ |
| Forbruk, transaksjoner, budsjett og innstillinger på norsk | ✅ |
| Ingen side kan rulles sidelengs på mobil; dialogene vises som bunnark | ✅ |

**Feil som ble funnet under testing og gjennomgang (alle rettet):**

1. En kryptokonto opprettet uten «Betalt» fikk **0 kr som kjøpspris** fordi kursen ikke var hentet ennå –
   da ville hele verdien vist som gevinst. Nå hentes kursen før lagring.
2. **«Live»-merket dukket aldri opp** første gang en mynt ble lagt til, fordi kursstrømmen fortsatt sto som
   «inaktiv» da siden ble tegnet.
3. Live-oppdateringen ville **snudd fortegnet på gjelden** i oversikten (funnet ved gjennomgang).
4. Dialogene kunne gått i **løkke** hvis kurshentingen feilet (funnet ved gjennomgang).
5. Blinkingen ved kursendringer var **for kraftig** (hele blokker ble farget); nå blinker bare tallet.
6. Lange antall som `51,6865696 USDT` i oversikten; nå `51,69 USDT` (full presisjon på kontosiden).

Fra første versjon:
7. **Slett**-knappen synlig i «ny transaksjon» (CSS overstyrte `hidden`).
8. **Negative beløp ble rundet annerledes** (`Math.round(-1234.5)` er `-1234`); nå finnes en test for det.
9. Ved **redigering ble nytt beløp lagt til bak det gamle**; nå markeres beløpet når dialogen åpnes.
10. **Dialogen var bredere enn mobilskjermen** (standardbredden til et `<input>`).
11. **Den lokale serveren hang ved oppstart** på enkelte nettverk (navneoppslag i Python).

## Videre arbeid

- Faste overføringer (f.eks. BSU-sparing den 20. hver måned) som legges inn automatisk
- Kurser for aksjer og fond (krever en kursleverandør med nøkkel, via en liten server)
- Sparemål («ny PC: 4 500 av 12 000 kr»)
- Import av kontoutskrift (CSV) fra banken
- Installere som app på mobilen og bruke den uten nett (PWA)
