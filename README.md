# 🔔 Philly Guide — a 2-day Center City visit

A lightweight, mobile-friendly travel guide built for a friend visiting Philadelphia
**June 30 – July 1, 2026**. Curated favorites + also-recommended local picks, with maps,
addresses, phones, multi-platform reviews, average costs, day-by-day open hours, reservation
flags, geolocation ("places near me"), and configurable getting-around modes.

No build step, no framework — just static `HTML + CSS + JS` with [Leaflet](https://leafletjs.com/)
maps over free OpenStreetMap/CARTO tiles. Deploys to Vercel in seconds.

## Features
- 📍 **Find places near me** (browser geolocation) or type any hotel/address (free OSM geocoding) → list sorts by distance.
- 🗺️ Interactive map, color-coded by category; tap a pin or "Show on map" on any card.
- 🚶🚗🚲 **Getting around** toggle (Walk+SEPTA / Uber-Lyft / Indego bike) — changes the travel tips *and* the Directions links.
- 📅 **Day toggle** (Tue Jun 30 / Wed Jul 1) with an "open only" filter — catches closures (Angelo's closed Tue, DAWA closed Wed, Magic Gardens closed Tue, etc.).
- 🔔 John's picks vs ✨ Also-recommended, filterable; category chips; search.
- Reservation badges (walk-in / reserve ahead / required / timed ticket), average costs, and reviews aggregated from Google, Yelp, Tripadvisor, OpenTable & more.

## Run locally
Just open `index.html` in a browser, or serve the folder:
```bash
npx serve .
```

## Files
| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | All styling (responsive) |
| `data.js` | All curated place/transport data — **edit here to add or change places** |
| `app.js` | Rendering, filtering, map, geolocation logic |
| `vercel.json` | Static deploy config |

---

## 🚀 Deploy to Vercel via GitHub

I can't log into your GitHub or Vercel accounts directly — but here's the 3-minute path. Pick **A** (easiest, all in the browser) or **B** (command line).

### Option A — GitHub website + Vercel (no terminal)
1. **Create the repo:** go to [github.com/new](https://github.com/new), name it e.g. `philly-guide`, create it.
2. **Upload these files:** on the new repo page click **"uploading an existing file"**, then drag in `index.html`, `styles.css`, `data.js`, `app.js`, `vercel.json`, `README.md`. Commit.
3. **Connect Vercel:** go to [vercel.com/new](https://vercel.com/new), sign in **with GitHub**, click **Import** next to `philly-guide`.
4. Framework preset = **Other** (auto-detected). Leave build settings empty. Click **Deploy**.
5. ~20 seconds later you get a live URL like `https://philly-guide.vercel.app` — share it with your friend. Every future GitHub edit auto-redeploys.

### Option B — Command line
```bash
# from this folder
git init && git add . && git commit -m "Philly guide"
gh repo create philly-guide --public --source=. --push   # needs GitHub CLI, logged in

npm i -g vercel        # if not installed
vercel                 # follow prompts → preview URL
vercel --prod          # production URL
```

### How to give an AI agent access (optional, for future edits)
- **GitHub:** install the [GitHub CLI](https://cli.github.com/) and run `gh auth login`, *or* create a fine-grained Personal Access Token (GitHub → Settings → Developer settings → Tokens) scoped to just this repo.
- **Vercel:** install the CLI (`npm i -g vercel`) and run `vercel login`, *or* create a token at Vercel → Account Settings → Tokens. With either in place, an agent in this folder can push and deploy on your behalf.

> Tip: the site is 100% static, so it also deploys for free to GitHub Pages, Netlify, or Cloudflare Pages with no changes.
