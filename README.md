# Kiwi Kraft Production Planner

Single-user production planner for Kiwi Kraft Boats. React (Vite) on Netlify, with the plan stored as one JSON document in Netlify Blobs — no database to set up.

## What it does
- **Schedule** – Gantt by boat, four phases (Pre-CNC → Fabrication → Coatings → Fit Out), driven by estimated hours and updated with actual hours. Gold diamond = target delivery; "Late" flag when the projected finish passes it.
- **Bays** – occupancy by bay (Pre-CNC ×1, Fabrication ×2, Coatings ×1, Fit Out ×2 by default). Red outline = two boats in the same bay at the same time.
- **Log Hours** – foreman's screen: type actual hours or add hours, tick a phase Done.
- **Archive** – completed boats with estimated vs actual hours variance.
- **Settings** – model list & build hours, phase % split, bay counts, hours per bay per day, backup download.

## Deploy (GitHub Desktop + Netlify)
1. Create a new repo `kk-productionplan` in GitHub Desktop, copy these files in, commit and publish.
2. Netlify → Add new site → Import from GitHub → pick the repo. Build settings are read from `netlify.toml`.
3. Optional: Site settings → Environment variables → add `EDIT_PIN` to require a PIN before changes can be saved (viewing stays open).

Netlify Blobs needs no setup — the `/api/data` function creates the store on first save.

## Local development
`npm install` then `npm run dev`. Without Netlify running, the app works "offline" and saves to the browser only. Use `netlify dev` to test with the real save function.
