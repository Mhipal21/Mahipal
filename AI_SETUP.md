# AI setup — multi-asset detection

PV Capture is hosted as a public client-side PWA, so the OpenAI API key must stay on a secure server. The included Cloudflare Worker receives the compressed verification photo and asks the OpenAI Responses API to identify visible fixed-asset types and quantities.

## 1. Cloudflare Worker
1. Sign in to Cloudflare.
2. Go to **Workers & Pages** → create/open your Worker.
3. Replace its code with `cloudflare-worker/worker.js` from this package.
4. Deploy.

## 2. Worker variables and secret
Under the Worker settings add:
- `OPENAI_API_KEY` — your OpenAI API key, stored as a **Secret**.
- `ALLOWED_ORIGIN` — normally `https://mhipal21.github.io` for your GitHub Pages account.
- Optional `OPENAI_MODEL` — defaults to `gpt-5.6-luna`.

Never place the OpenAI key in GitHub, `app.js`, `index.html`, or the PV Capture Settings screen.

## 3. Configure PV Capture once
Open the installed app → ⚙ Settings:
- enter the three team-member names;
- enable **AI multi-asset detection**;
- paste the Worker URL only, for example `https://pv-asset-ai.<subdomain>.workers.dev`;
- Save Settings.

## 4. What AI now does
After every camera or gallery photo, the app asks AI to detect visible fixed-asset TYPES and quantities.

Example result:
- Office Chair — 3
- Desktop Computer — 1
- Table — 1
- Split AC — 1

All names and quantities are editable. Serial Number, Condition and Not Found Reason remain user-editable fields because they generally require physical verification rather than visual guessing.

## 5. Offline behaviour
The app itself and saved photos can continue working without AI if the page is already installed/cached. AI identification requires an internet connection. If AI fails, add or edit asset rows manually and save normally.
