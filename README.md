# 🌻 Cliffwood Farm

A FarmVille-style garden manager for a **real yard** — prototyped on 11102 Cliffwood Dr,
Houston, TX (USDA zone 9b, Gulf Coast Prairies & Marshes ecoregion).

Instead of a fictional farm, you paint an 8-bit map of your actual lot, plant real
Gulf Coast natives and Harris County fall-garden vegetables on it, and the app tells
you what to plant this month, what needs water (based on actual rainfall from
Open-Meteo), and what seasonal chores are due.

## Run it

No build step — it's plain HTML/CSS/JS:

```bash
cd Farmville
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly from disk also works in most browsers.

## What works in this prototype

- **8-bit yard map** of a Willow Meadows-style lot (1 tile = 3 ft), pre-seeded with a
  plausible house/driveway/bed layout you can repaint to match reality (lawn, beds,
  paths, driveway, house). Trees, shrubs, flowers, grasses, vines, groundcovers and
  vegetables all have procedural pixel sprites with growth stages tied to real
  elapsed time since you planted them — and bloom sprites in their real bloom months.
- **Region-scoped plant catalog**: ~25 Gulf Coast natives + Harris County fall/spring
  vegetables, each with real planting windows, sun/water needs, spacing, and notes.
  The "In season" tab shows only what can go in the ground this month.
- **Live weather** for the property (Open-Meteo, keyless): current conditions, 7-day
  forecast, and past-7-day rainfall.
- **Task engine**: frost and extreme-heat alerts from the forecast, deep-water
  reminders when weekly rainfall is under ~1", per-plant watering reminders (new
  plantings every 2–3 days; established plants by their drought tolerance — skipped
  when rain has it covered), what-to-plant-now counts, and Houston monthly chores.
- **Watering log**: mark tiles watered with the 🚿 tool; reminders use your log plus
  actual rainfall.
- **Persistence** via localStorage (auto-saves on every change).

## Deliberate prototype shortcuts

- **No auto-map from satellite imagery.** Google's ToS forbids tracing derivative
  maps from their imagery and auto-segmentation is a CV project; hand-painting the
  yard is faster, more accurate, and doubles as onboarding. A licensed imagery
  reference layer (e.g. public-domain NAIP) is a later milestone.
- **Geocode is hardcoded** in `js/config.js` (approximate street-level coords for the
  weather query). Multi-address support means adding a geocoding step + per-user storage.
- **Plant data is a curated starter set**, not a full database. Sources to grow it:
  USDA PLANTS, Native Plant Society of Texas (Houston chapter) lists, Harris County
  AgriLife planting calendars.

## Roadmap ideas

1. Address input → geocode → auto zone/ecoregion lookup, per-user gardens (needs a backend).
2. Affiliate links to native-plant nurseries from plant detail cards (better revenue than display ads).
3. Email/push notifications for frost alerts and watering days.
4. Photo journal per bed; harvest logging for edibles.
5. Shareable PNG export of your pixel yard (the growth-marketing hook).

## Files

- `js/config.js` — property config (address, coords, zone, grid size)
- `js/plants.js` — plant database (Gulf Coast natives + Houston veggie calendar)
- `js/sprites.js` — procedural 8-bit terrain + plant sprites
- `js/grid.js` — yard model, starter layout, growth stages, localStorage
- `js/weather.js` — Open-Meteo client
- `js/tasks.js` — task engine (weather alerts, watering logic, monthly chores)
- `js/main.js` — UI wiring (canvas, tools, catalog, panels)

*Prototype; not affiliated with FarmVille/Zynga.*
