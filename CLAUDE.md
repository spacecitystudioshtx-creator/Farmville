# GardenStar — working notes for Claude

GardenStar is a cozy farm game where the farm is the player's real yard
(prototype: 11102 Cliffwood Dr, Houston, zone 9b). Product decisions live in the
owner's **GardenStar Build Guide** doc; read its "Questions for you" table for
overrides before changing behavior.

## The one rule
The game never rewards something bad for the real garden: no XP for watering a
plant that isn't thirsty or was covered by rain, none for out-of-season
planting. New reward paths must respect this. Out-of-season plantings are
flagged `offSeason` and don't count toward badges either.

## Architecture (plain HTML/CSS/JS, no build step)
Scripts load in order from `index.html`; each exposes one global.

| File | Global | Role |
|---|---|---|
| `js/config.js` | `SITE` | Address, coords, grid size, monetization switches (all off) |
| `js/plants.js` | `PLANTS`, `PLANT_BY_ID` | 52-plant Houston catalog + wildlife / host tags, light range (`sunRange`), life cycle (`life`) |
| `js/art.js` | `ART` | Optional image tileset from `assets/art/manifest.json` with facsimile fallback |
| `js/sprites.js` | `SPRITES` | Procedural pixel renderer; uses `ART` images when present |
| `js/grid.js` | `YARD` | Garden state (terrain, plants, fences, journal, lost, home), undo, save v2 |
| `js/sun.js` | `SUN` | Sun position for the address, growing-season sun hours per tile, live shadows (house, fences, trees; front-door direction sets the compass) |
| `js/weather.js` | `WEATHER` | Open-Meteo, falls back to Houston monthly normals |
| `js/care.js` | `CARE` | Watering status and schedule, trip plans, per-plant agenda (`plantAgenda`, `gardenDashboard`), planting warnings, garden insights, "what to plant" ranking (pure) |
| `js/game.js` | `GAME` | XP, levels, streak, badges, to-dos (`quests()` internally), trip dates; emits events |
| `js/importer.js` | `IMPORTER` | Backup + Claude-interview JSON import |
| `js/icons.js` | `ICONS` | 12×12 pixel icons from character maps |
| `js/main.js` | — | Camera, gestures, tools, sheets, welcome; test hook `window.__GS` |

Storage keys: `cliffwood-farm-v1` (garden, format v2), `gardenstar-game-v1`,
`gardenstar-ui-v1`. Undo snapshots garden + game together, so undoing an
action also takes back its XP.

## Conventions
- Mobile first: map fills the screen, toolbar at the bottom, panels are sheets
  (docked right at ≥900px). One finger pans (paints in Build); two fingers pinch.
- UI copy is plain and specific; plant advice is conservative.
- Map art is LimeZu (paid pack, commercial use with credit; the credit line is
  in `assets/art/manifest.json` and shows in the app). Rebuild the atlas with
  `tools/slice_limezu.py`; commit only the atlas, never the pack's sheets.
  Natives without pack art are pack plants tinted to their real bloom color.
  The house is assembled per column from a roof tile and a repeating wall unit
  (window, trim, foundation), one unit per story, with corner posts, a front
  door where a path meets it and a garage door across a driveway. Driveway and
  street are procedural concrete/asphalt.
- House and lot live in the garden save: `YARD.state.home` holds the style
  (wall, roof, door, stories, chimney, boxes, pots) and the builder `plan`
  (preset shape, garage side, position, tiles it set). `stampHome` puts back
  the previous stamp's tiles before stamping again. Lot presets mark
  `street` and `offlot` tiles; neither is plantable and the fence follows
  the `offlot` line. The builder is the "Your house" sheet (Build > My house,
  Garden > More, and step two of "Build my own yard").
  The free Sprout Lands pack is non-commercial: don't commit its assets.
- Plant shop has "New planting" (warnings + XP) and "Already in my yard"
  (`YARD.addExisting`: full-grown, no warnings, no XP) plus a Trees filter.
  New planting is ranked by `CARE.rankPlants` (timing, light, room, goals,
  bloom gaps, ease, variety), for the whole yard or for an empty tile tapped
  in Look. The plan and weights are in `PLANT_PICKING.md`; keep them in sync.
  `buy` in `js/plants.js` (bigbox / seed / nursery) is typical Houston stock.
- Build never destroys plants: brushes skip them (`setTerrain`/`setFence`
  return 'blocked'), the house builder refuses to land on them
  (`planConflicts`), and Move carries a plant with its history. Box mode
  fills a rectangle (Fence draws its outline). "Draw my own" lot starts empty.
- Garden > Plants (the default tab) is the per-plant dashboard: every plant
  grouped by its next action (today / this week / this month / later). A
  plant's card shows Next up, What it needs (checked against its spot), What
  it gives. Seasonal care lives in `TYPE_CARE` / `PLANT_CARE` in `js/care.js`
  (conservative Houston timing, e.g. live oaks pruned only Jul–Jan).
- The Build palette has its own Undo (same stack as the map's undo button).
- To-dos (toolbar) = today's list (XP), a calendar of projected watering,
  rain, frost and heat (`CARE.waterSchedule`), and "Going away?"
  (`CARE.tripPlan`: soak the day before, then the days a helper must water).

## Test
```bash
npm install          # playwright
npm test             # phone + desktop end-to-end test flight
CHROMIUM_PATH=/opt/pw-browsers/chromium SHOTS=shots npm test   # cloud sessions; saves screenshots
```
Run it before every push. Weather and Google Fonts are blocked in cloud
sandboxes; the app's fallbacks cover that and the suite ignores those network
errors.
