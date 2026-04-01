# Pjak

Easter egg treasure hunt game. Players walk around with the phone app finding hidden objects, while the desktop app provides the game master view.

## Architecture

```
app/        — Expo React Native phone app (player walks, finds eggs)
desktop/    — Vite React web app (front-facing game master screen)
dashboard/  — Vite React web app (admin: place objects on map)
editor/     — Vite React web app (object editor)
sdk/        — Shared game logic & event system
shared/     — Shared types, Supabase config, seed data
supabase/   — Database schema (objects + devices tables, realtime)
```

All apps connect to the same Supabase backend for real-time coordination.

## Quick Start

### 1. Phone app (Expo)

```bash
cd app
npm install        # also runs postinstall patch for ngrok v3
npm run tunnel     # starts with tunnel (works over mobile data)
```

Scan the QR code **from inside Expo Go** (not the iPhone camera app).

Requires Expo Go on the phone (latest version from App Store, supports SDK 54).

### 2. Desktop app (game master screen)

```bash
cd desktop
npm install
npm run dev        # http://localhost:5174
```

### 3. Dashboard (admin/object placement)

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173
```

## Running everything together

Open three terminal tabs:

```bash
# Tab 1 — phone app
cd app && npm run tunnel

# Tab 2 — desktop (front-facing)
cd desktop && npx vite --port 5174

# Tab 3 — dashboard (admin)
cd dashboard && npx vite --port 5173
```

## ngrok v3 patch (automatic)

The `@expo/ngrok` package bundles ngrok v2 which is EOL (service shut down mid-2025). A postinstall script (`app/patches/fix-ngrok-v3.js`) automatically:

1. Swaps the v2 binary with ngrok v3 (from the `ngrok` npm dev dependency)
2. Patches the wrapper to use v3 API format
3. Patches the authtoken command for v3 syntax

This runs automatically on `npm install`. If the tunnel ever breaks, run:

```bash
cd app && node patches/fix-ngrok-v3.js
```

## Troubleshooting

- **Tunnel fails**: Run `node patches/fix-ngrok-v3.js` in the app/ directory
- **"Inga anvundbara data hittades" when scanning QR**: Scan from **inside Expo Go**, not the iPhone camera
- **Port conflict**: Kill existing processes with `kill $(lsof -ti:8081)` or `kill $(lsof -ti:5173)`
- **Fresh setup**: Just `npm install` in each directory — the postinstall handles ngrok patching
