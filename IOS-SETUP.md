# SoloFit — native iOS build (optional)

> **Recommended for most users:** install via **PWA** (no `.ipa`, works offline). See **[DEPLOY-PWA.md](./DEPLOY-PWA.md)**.

This guide is only if you want a **native** Capacitor/Xcode build. The Android project has been removed.

## What you need

- A **Mac** with **Xcode** (from the Mac App Store)
- **CocoaPods** (`sudo gem install cocoapods` or `brew install cocoapods`)
- **Node.js** 20+ and npm

You cannot build a signed `.ipa` for a real iPhone from Windows alone. On Windows you can edit the web app (`app.js`, `index.html`, `styles.css`) and sync files; your friend (or any Mac) runs the Xcode steps below.

## After changing the web app

From the project folder:

```bash
npm run cap:sync
```

This copies `www/` into the iOS app and updates plugins.

## First-time setup on a Mac

1. Copy this whole folder to the Mac (or clone from git).
2. Install dependencies (if `node_modules` is missing):

   ```bash
   npm install
   ```

3. Sync the native project:

   ```bash
   npm run cap:sync
   ```

4. Install iOS pods:

   ```bash
   cd ios/App
   pod install
   cd ../..
   ```

5. Open in Xcode:

   ```bash
   npm run cap:open
   ```

   Or open `ios/App/App.xcworkspace` (use the **workspace**, not `.xcodeproj`).

6. In Xcode: select the **App** target → **Signing & Capabilities** → choose your **Team** (Apple ID / developer account).

7. Connect an iPhone or pick a simulator → **Run** (▶).

## Install on your friend’s iPhone

- **Development:** Add their device in Xcode (Window → Devices and Simulators), use a free Apple ID team, run from Xcode to their phone.
- **TestFlight / App Store:** Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year), archive in Xcode, upload to App Store Connect.

## App identity

- **Bundle ID:** `com.system.fitness`
- **Display name:** SoloFit
- **Saved game data:** `localStorage` key `solo_leveling_fitness_system_v2` (per install)

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run build:web` | Copy web assets to `www/` |
| `npm run cap:sync` | Build web + sync to `ios/` |
| `npm run cap:open` | Open Xcode |
| `npm run cap:add:ios` | Re-add iOS platform (rare; only if `ios/` was deleted) |
