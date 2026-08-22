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

## 📣 Marketing plan

Organic-first, seasonal, one channel at a time. Gardening is a compounding-channel
category (SEO, Pinterest, email) — spikes are for launch week, compounding is the
business. Founder time budget: **5–8 hrs/week**. Cash budget: **$12 minimum**
(domain), **~$460 recommended** across 6 months.

### Phase 1 — Launch moments (weeks 1–2 · $0 · ~10 hrs)

| Play | Why it's current best practice |
|---|---|
| **Show HN + Product Hunt + r/SideProject**, same week | "I turned my real yard into FarmVille" is a strong indie-launch hook; the Claude-interview onboarding is the demo moment. Expect a 2–5k-visit spike and, more importantly, the backlinks that seed SEO. |
| **Value-first Reddit** in r/NativePlantGardening, r/NoLawns, r/vegetablegardening, r/Houston | Post the pixel yard + what you're planting this fall, not a pitch. These communities are the exact ICP and reward genuine builders. |
| **Build-in-public thread** (X/Threads) | Compounds credibility; costs nothing; feeds later creator outreach. |

### Phase 2 — Compounding channels (weeks 3–12 · ~$150 optional · 5 hrs/wk)

| Channel | Cadence | Notes |
|---|---|---|
| **Programmatic SEO + AEO** | 2–3 pages/wk | Zone × month pages ("What to plant in October, zone 9b") with FAQ schema and direct answers — written to be *cited by AI search* (Google AI Overviews, ChatGPT, Perplexity) as well as ranked. AEO is the single biggest 2026 shift: answer-shaped content wins twice. Each page CTAs into the app. |
| **Pinterest** | 3–5 pins/wk | Gardening is a top-Pinterest vertical and pins compound for 6–12 months (vs hours on X). Vertical pins per plant/month from the app's own art. Optional $100 promoted-pin test in week 6. |
| **Short-form video** | 2/wk | The proven format: split-screen **pixel garden ↔ real garden** timelapse, 15–30s, native captions, posted to TikTok + Reels + Shorts simultaneously (CapCut, free). Cozy-game aesthetic × garden-transformation is two large communities overlapping. |
| **Email list** | weekly | "Frost alert + what to plant this week in 9b." Signup = the retention loop AND the owned channel. Buttondown/MailerLite free tier. Optional $50 Meta retargeting test. |

### Phase 3 — Multipliers (months 3–6 · ~$300 optional)

- **Creator seeding:** gift 15–20 garden-tok / cozy-gaming micro-creators (5–50k
  followers) a custom pixel render of *their* yard. Micro-creator gifting beats paid
  ads on CAC in almost every 2025–26 benchmark; budget is postage + time.
- **Local Houston:** talk at a Native Plant Society of Texas chapter meeting; QR
  cards at 2–3 native nurseries (they hand cards to buyers, the app sends them
  buyers back — symmetric value).
- **Catalog expansion** beyond Houston → unlocks national SEO pages (the ceiling-raiser).

### Expected market penetration (honest numbers)

Serviceable market: ~1.2M gardening households in Houston metro; realistic early-adopter
pool (native-plant-curious, app-open) ~100k. US TAM ~80M gardening households.

| Milestone | Traffic | Active gardens | Penetration |
|---|---|---|---|
| Day 30 | 3–6k visits (launch spike + tail) | 150–400 | 0.2–0.4% of Houston early adopters |
| Day 90 | 5–10k/mo (compounding starts) | 600–1,500 | ~1% of Houston early adopters |
| Month 6 | 10–25k/mo | 2–5k | 2–5% Houston EA; revenue ≈ $150–600/mo |
| Month 12 | 30–80k/mo (requires national catalog) | 8–20k | still <0.1% of US TAM — normal and fine for year 1 |

Weekly KPI review: visits → import-completion rate → D7 return → affiliate CTR →
email signups. Rule: kill any channel that doesn't move after 4 honest weeks;
double down on the one that does. Time the big pushes to the two gardening surges
(Sep–Oct fall planting, Feb–Apr spring).

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
