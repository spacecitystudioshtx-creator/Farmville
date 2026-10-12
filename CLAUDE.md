# GardenStar — working notes for Claude

GardenStar is a cozy farm game where the farm is the player's real yard
(prototype: 11102 Cliffwood Dr, Houston, zone 9b). Product decisions live in the
owner's **GardenStar Build Guide** doc; read its "Questions for you" table for
overrides before changing behavior.

## The one rule
The game never rewards something bad for the real garden: no XP for watering a
plant that isn't thirsty or was covered by rain, none for out-of-season
planting. New reward paths must respect this.

## Architecture (plain HTML/CSS/JS, no build step)
Scripts load in order from `index.html`; each exposes one global.

| File | Global | Role |
|---|---|---|
| `js/config.js` | `SITE` | Address, coords, grid size, monetization switches (all off) |
| `js/plants.js` | `PLANTS`, `PLANT_BY_ID` | 41-plant Houston catalog + wildlife / host tags |
| `js/art.js` | `ART` | Optional image tileset from `assets/art/manifest.json` with facsimile fallback |
| `js/sprites.js` | `SPRITES` | Procedural pixel renderer; uses `ART` images when present |
| `js/grid.js` | `YARD` | Garden state (terrain, plants, journal, lost), shade, undo, save v2 |
| `js/weather.js` | `WEATHER` | Open-Meteo, falls back to Houston monthly normals |
| `js/care.js` | `CARE` | Watering status, planting warnings, garden insights (pure) |
| `js/game.js` | `GAME` | XP, levels, streak, badges, quests; emits events |
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
  (window, trim, foundation), with corner posts and a door where a path meets
  it. Walls (brick, cream/white siding from Modern Exteriors, four barn colors)
  and roofs (gray shingle, red, brown, metal) are picked in Garden > More.
  The free Sprout Lands pack is non-commercial: don't commit its assets.
- Plant shop has "New planting" (warnings + XP) and "Already in my yard"
  (`YARD.addExisting`: full-grown, no warnings, no XP) plus a Trees filter.

## Test
```bash
npm install          # playwright
npm test             # phone + desktop end-to-end test flight
CHROMIUM_PATH=/opt/pw-browsers/chromium SHOTS=shots npm test   # cloud sessions; saves screenshots
```
Run it before every push. Weather and Google Fonts are blocked in cloud
sandboxes; the app's fallbacks cover that and the suite ignores those network
errors.
