# SoloFit — iPhone install (no .ipa)

SoloFit runs as an **offline PWA**: your friend opens a link once, adds it to the Home Screen, then uses it **without Wi‑Fi or mobile data**.

## What you need

- A free **[Netlify](https://www.netlify.com)** or **[Cloudflare Pages](https://pages.cloudflare.com)** account (or GitHub Pages)
- **HTTPS** (all hosts above provide it)
- **One** online visit to install; after that, offline works

## Deploy on Netlify (easiest)

1. Sign in at [app.netlify.com](https://app.netlify.com).
2. **Add new site** → connect **GitHub** (recommended) **or** drag & drop the **`www`** folder.
3. Before deploy, run locally: `npm run build:web`  
   This copies assets to `www/` and builds **`apple-touch-icon.png` from `icon.svg`** (iPhone ignores SVG on the home screen).
4. `netlify.toml` runs `node prepare-web.mjs` and publishes **`www/`** on Git builds.
5. Copy your site URL, e.g. `https://your-name.netlify.app`.
6. After an icon change: redeploy, then on iPhone **delete** the old home screen icon and **Add to Home Screen** again.

## Friend installs on iPhone

1. Open the **https** link in **Safari** (not Chrome).
2. Wait until the app loads (caches for offline).
3. Tap **Share** → **Add to Home Screen** → **Add**.
4. Open **SoloFit** from the home screen (standalone mode).
5. Optional: dismiss the install tip; play offline anytime.

## Verify offline

1. Open SoloFit from the home screen.
2. Enable airplane mode (no Wi‑Fi, no cellular).
3. Force-quit Safari/SoloFit and open SoloFit again from the icon.
4. Quests, ranks, and saves should still work (`localStorage` on device).

## Update the app later

Change `app.js` / `index.html` / `styles.css`, redeploy, then in `sw.js` bump `CACHE_VERSION` (e.g. `solofit-v2`) so phones fetch the new shell.

## Local test on your PC

```bash
npx --yes serve . -l 3000
```

Open `http://localhost:3000` in Chrome (service workers work on localhost). For iPhone testing, use the public Netlify URL.

## Alerts on iPhone web

- Alerts work **while the app is open** if the user allows notifications.
- iOS does **not** guarantee daily background reminders for home-screen web apps like a native app.
- Core gameplay does **not** need the network.

## Capacitor / `.ipa` (optional)

The `ios/` folder is legacy native packaging. **You do not need it** for the PWA path. See `IOS-SETUP.md` only if you later want a native build.
