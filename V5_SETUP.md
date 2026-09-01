# Version 5 deployment

## 1. GitHub Pages

In your existing `Mhipal21/Mahipal` repository replace:

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg` (recommended)

Your public app link remains:

`https://mhipal21.github.io/Mahipal/`

## 2. Cloudflare Worker

Open `pv-capture-ai` → **Edit code** → replace the current Worker with `cloudflare-worker/worker.js` from Version 5 → Deploy.

Keep the resources you already created:

- D1 binding: `DB` → `pv-capture-db`
- R2 binding: `Photos` → `pv-capture-photos`
- Secret: `OPENAI_API_KEY`

The Worker automatically creates the Version 5 database tables on the first request.

Open the Worker URL after deploying. Health should return service `PRS.AssetVerify v5`, with `databaseBound`, `photoBucketBound`, and `openAIConfigured` true.

## 3. Password reset email

The app is already built with a **Forgot password** workflow. It does not reveal old passwords; it sends a reset code.

Two supported delivery options are built into the Worker:

### Option A — Cloudflare Email Service

Add a send-email binding named `RESET_EMAIL` and a normal environment variable:

`RESET_FROM_EMAIL = noreply@your-verified-domain.com`

The sender domain must be onboarded/verified in Cloudflare Email Service. The destination is fixed in code as `mahipal.office21@gmail.com`.

### Option B — webhook

Add a secret/variable:

`RESET_EMAIL_WEBHOOK = https://...`

The Worker POSTs JSON containing `to`, `subject`, and `text` to the webhook. This can be connected to Apps Script, Make, Zapier, etc.

If neither is configured, the reset code is generated and stored but no email is sent; the app clearly reports that email delivery is not configured.

## 4. iPhone refresh

Because Version 5 has a new service-worker cache, after GitHub deploys:

1. Open the app in Safari and refresh.
2. If the old Version 4 UI still appears, close the Home Screen app and reopen it.
3. If necessary, remove the old Home Screen shortcut and add it again from Safari.

## 5. First test

1. Open the common link.
2. Create a brand-new company.
3. Add at least one Admin and one Verifier, each with a username and password.
4. Login as Admin and take a photo.
5. Login from another device as Verifier and confirm the same company photo is visible.
6. Confirm the Verifier has no delete button.
7. Confirm the Admin does have delete, Users & Rights, Edit Company and Delete Company.
8. Test Search & Filters, Usage and Excel export.
