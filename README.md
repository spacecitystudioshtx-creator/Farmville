# 🌻 Cliffwood Farm

A FarmVille-style garden manager for a **real yard** — prototyped on 11102 Cliffwood Dr,
Houston, TX (USDA zone 9b, Gulf Coast Prairies & Marshes ecoregion).

Instead of a fictional farm, you paint an 8-bit map of your actual lot (or let
[Claude interview you](GARDEN_INTERVIEW.md) and import the result), plant real Gulf
Coast natives and Harris County vegetables on it, and the app tells you what to
plant this month, what needs water (based on actual rainfall from Open-Meteo),
and what seasonal chores are due.

## Run it

No build step — plain HTML/CSS/JS:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy it (free)

A GitHub Pages workflow is included (`.github/workflows/pages.yml`). One-time setup:
repo **Settings → Pages → Source: "GitHub Actions"**, then push (or run the workflow
manually). The site appears at `https://<owner>.github.io/Farmville/`.

For ad revenue you'll want a custom domain (~$10/yr) pointed at Pages — see below.

## 💰 Getting paid

All monetization is configured in **`js/config.js` → `monetization`** and is off
until you paste your IDs. In order of fastest-to-first-dollar:

1. **Tip jar (instant).** Create a [Buy Me a Coffee](https://buymeacoffee.com) or
   [Ko-fi](https://ko-fi.com) page (or a Stripe Payment Link) and set `supportUrl`.
   A "☕ Support this project" button appears in the header.
2. **Amazon Associates (days).** Sign up at
   [affiliate-program.amazon.com](https://affiliate-program.amazon.com), set
   `amazonTag` (e.g. `cliffwoodfarm-20`). Every plant card grows a "🛒 Buy
   seeds/plants" button with your tag. Gardening shoppers coming off a "plant
   this now" recommendation are high-intent — this is the app's natural revenue
   engine. Note: Amazon requires ~3 qualified sales in the first 180 days to
   keep the account, and you must disclose affiliate links (the footer does).
   Later, add higher-commission gardening programs (Botanical Interests, Nature
   Hills, True Leaf Market via ShareASale/Impact) using the same button.
3. **Google AdSense (weeks).** Needs a custom domain (approval on bare
   `*.github.io` subdomains is unreliable) and a content review. Once approved,
   set `adsenseClient` (+ optional slot IDs); two responsive units render — a
   sidebar rectangle and an under-map leaderboard. Until then the slots show
   quiet placeholders.
4. **Premium tier (later).** Multiple properties, e-mail frost/watering alerts,
   printable planting calendar. Needs accounts + Stripe + a small backend — on
   the roadmap, not in this static prototype.

## What the app does

- **8-bit yard map** (1 tile = 3 ft) with neighbor-aware tiles: timber-edged
  beds, flagstone paths, shingled roof with ridge caps, front walls with
  windows and a door where the walk arrives, a picket fence around the lot,
  drop shadows under every plant, and mow-stripes on the lawn. All sprites are
  procedural; the renderer lives in `js/sprites.js`, so a drawn tileset
  (Kenney / Sprout Lands style) can replace it without touching game logic.
- **Growth simulation on real time**: sprites advance sprout → establishing →
  established using actual days since planting, and show bloom sprites in each
  species' real bloom months.
- **Region-scoped catalog**: ~25 Gulf Coast natives + the Harris County
  fall/spring vegetable calendar, with real planting windows, sun/water needs,
  spacing, and local notes.
- **Live weather** (Open-Meteo, keyless): current conditions, 7-day forecast,
  past-7-day rainfall.
- **Task engine**: frost & extreme-heat alerts, rainfall-aware watering
  reminders with a per-tile watering log, "plant now" counts, Houston monthly
  chores.
- **Claude onboarding**: [GARDEN_INTERVIEW.md](GARDEN_INTERVIEW.md) contains a
  prompt that interviews you about your real yard and emits importable JSON —
  no manual painting needed.
- **Import / Export / Share**: JSON backup and restore, one-click PNG export of
  your pixel yard (the social growth hook).
- **Persistence** via localStorage.

## Files

- `js/config.js` — property config + monetization switches
- `js/plants.js` — plant database (Gulf Coast natives + Houston veggie calendar)
- `js/sprites.js` — procedural 8-bit terrain + plant sprites (swap point for real art)
- `js/grid.js` — yard model, starter layout, growth stages, localStorage
- `js/weather.js` — Open-Meteo client
- `js/tasks.js` — task engine (weather alerts, watering logic, monthly chores)
- `js/importer.js` — garden JSON import/export (incl. the Claude interview format)
- `js/main.js` — UI wiring (canvas, tools, catalog, panels, monetization slots)
- `GARDEN_INTERVIEW.md` — the Claude onboarding interview prompt

## Roadmap

1. Custom domain + AdSense approval; swap in higher-commission garden affiliates.
2. Address input → geocode → auto zone/ecoregion; per-user gardens (small backend).
3. Real pixel-art tileset (Aseprite/Piskel or a CC0 pack like Kenney's).
4. E-mail/push frost and watering alerts (the retention loop).
5. Photo journal per bed; harvest logging; shareable garden pages.

*Prototype; not affiliated with FarmVille/Zynga. Some outbound links may be
affiliate links.*
