# Praksisrom – Booking helsefag

Bookingsystem for praksisrom og omsorgsleilighet, helsefag, skoleåret 2026/2027.

## Funksjoner

- Felles kalender for begge rom (Praksisrom og Omsorgsleilighet)
- Booking av formiddag, ettermiddag eller hel dag
- Kun skoledager man–fre, ferier og helger filtreres ut automatisk
- Registrering av klasse og lærer per booking
- Eksport til Excel (.xlsx)
- Import fra Excel med forhåndsvisning og duplikatsjekk
- Eksport til kalender (.ics) — fungerer i Outlook, Google Kalender og Apple Kalender
- Eksport kan filtreres på rom eller lærer

## Lokal kjøring (for testing før publisering)

Du trenger Node.js 18 eller nyere. Last ned fra [nodejs.org](https://nodejs.org) hvis du ikke har det fra før.

```bash
# 1. Installer avhengigheter
npm install

# 2. Start utviklingsserver
npm run dev
```

Åpne `http://localhost:5173` i nettleseren. Endringer i koden oppdateres automatisk.

## Bygg produksjonsversjon

```bash
npm run build
```

Filene legges i `dist/`-mappen og kan kopieres til hvilken som helst webserver.

## Publisering — tre alternativer

### Alternativ A: Vercel (enklest, anbefales for første test)

1. Lag konto på [vercel.com](https://vercel.com) (gratis, kan logge inn med GitHub-konto)
2. Klikk "Add New Project" → "Import" eller bruk drag-and-drop
3. Hvis du laster opp en mappe: dra hele prosjektmappen til Vercel-vinduet
4. Hvis du bruker GitHub: koble GitHub-kontoen og velg repoet
5. Vercel oppdager Vite automatisk — klikk "Deploy"
6. Etter ca. 1 minutt får du en lenke som `praksisrom-booking.vercel.app`

Lenken kan du sende til kollegene som skal teste.

### Alternativ B: GitHub Pages (gratis, fast nettadresse)

1. Lag konto på [github.com](https://github.com)
2. Lag et nytt offentlig repo, f.eks. `praksisrom-booking`
3. Last opp prosjektfilene (eller bruk `git push` hvis du kjenner Git)
4. I `package.json`, sjekk at `name`-feltet matcher repo-navnet
5. Bygg med riktig base-path:
   ```bash
   VITE_BASE=/praksisrom-booking/ npm run build
   ```
   På Windows PowerShell:
   ```powershell
   $env:VITE_BASE="/praksisrom-booking/"; npm run build
   ```
6. Publiser:
   ```bash
   npm run deploy
   ```
7. På GitHub: gå til repo-innstillinger → Pages → velg branch `gh-pages` og rotmappe
8. Vent et minutt — siden blir tilgjengelig på `https://<brukernavn>.github.io/praksisrom-booking/`

### Alternativ C: Netlify (drag-and-drop)

1. Lag konto på [netlify.com](https://netlify.com)
2. Bygg lokalt først:
   ```bash
   npm run build
   ```
3. Dra `dist/`-mappen til Netlifys drag-and-drop-felt
4. Du får umiddelbart en lenke som `random-name.netlify.app`

Du kan endre navnet i Netlify-innstillingene etterpå.

## Viktig om data og deling

Denne versjonen bruker **localStorage** — det vil si at bookingene lagres lokalt i hver brukers nettleser.

Det betyr:
- Hver person som åpner systemet ser sin egen tomme kalender til de selv legger inn bookinger
- Bookinger deles **ikke** automatisk mellom brukere
- Bra for testing: hver tester kan utforske uten å påvirke andre
- Ikke egnet for ekte fler-bruker-produksjon

**For ekte deling mellom lærere**, byttes `storage`-objektet øverst i `BookingSystem.jsx` ut med en kobling til en backend som Firebase, Supabase, eller fylkeskommunens egen Microsoft 365-løsning. Dette er neste steg etter at testfasen er ferdig.

## Praktisk arbeidsflyt under testing

Selv om data ikke deles automatisk, kan du fortsatt teste effektivt:

1. **En person legger inn bookinger** (f.eks. deg)
2. **Eksporter til Excel** — dette gir en .xlsx-fil med all data
3. **Send fila til testere**
4. **Testere importerer fila** — de ser akkurat samme kalender som deg
5. Få tilbakemeldinger på funksjonalitet, layout og arbeidsflyt

Eller alternativt: alle tester på samme PC/nettleser i tur og orden.

## Mappestruktur

```
praksisrom-booking/
├── index.html              # Inngangspunkt
├── package.json            # Avhengigheter og scripts
├── vite.config.js          # Bygge-konfigurasjon
├── src/
│   ├── main.jsx            # React-oppstart
│   ├── BookingSystem.jsx   # Hovedkomponent (all logikk og UI)
│   └── index.css           # Global styling
└── README.md
```

All logikk og styling for selve bookingsystemet ligger i `BookingSystem.jsx`. Hvis du vil endre rom, tidsslots, eller skoleferier, finner du konstantene øverst i fila.

## Vanlige spørsmål

**Kan jeg endre romnavn eller legge til flere rom?**
Ja. Åpne `BookingSystem.jsx` og endre `ROOMS`-arrayen øverst i fila.

**Kan jeg justere tidsslotene?**
Ja. Endre `SLOTS`-arrayen, samt `slotTimes`-objektet inne i `buildICS`-funksjonen og `slotTime`-objektet i `handleExport`-funksjonen.

**Skoleferiene stemmer ikke med vår skole.**
Endre `HOLIDAYS_2026_27`-settet øverst i fila. Datoer skrives som strenger i formatet `YYYY-MM-DD`.

**Hvordan oppdaterer jeg appen etter en endring?**
Bygg på nytt med `npm run build` og last opp `dist/`-mappen til Vercel/Netlify, eller kjør `npm run deploy` for GitHub Pages.

## Lisens

Internt verktøy for Vestfold fylkeskommune.
