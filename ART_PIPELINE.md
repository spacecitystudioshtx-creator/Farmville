# 🎨 GardenStar art pipeline (PixelLab → app)

The engine now supports **image art with per-asset fallback**: any sprite you
provide is drawn instead of the built-in procedural art; anything missing keeps
the procedural version. So art can land incrementally — five tiles today, ten
plants next week — and the app never breaks.

## How the app picks up art

1. Drop PNGs into `assets/art/` using the names below.
2. List them in `assets/art/manifest.json`:

```json
{
  "tiles": ["grass", "soil", "path", "driveway"],
  "plants": { "turkscap": [0, 1, 2, 3], "liveoak": [1, 2], "falltomato": [0, 1, 2, 3] }
}
```

3. Push. Done — the renderer (`js/art.js` + `js/sprites.js`) does the rest.

### File spec

| Asset | Path | Size | Notes |
|---|---|---|---|
| Terrain tile | `assets/art/tiles/<type>.png` | 32×32 | Must tile seamlessly. Types: `grass`, `soil`, `path`, `driveway`. (`house` stays engine-drawn for now — it needs edge-aware 9-slice pieces; phase 2.) |
| Plant sprite | `assets/art/plants/<id>_s<stage>.png` | 32×32, transparent bg | Stages: 0 sprout · 1 young · 2 mature · 3 blooming. Missing stages fall back to the nearest lower one. |
| Tree sprite | same as plants | **96×96**, transparent | Drawn over a 3×3-tile area; put the trunk base at bottom-center. |

Plant `<id>`s are in `js/plants.js` (e.g. `turkscap`, `gcmuhly`, `liveoak`,
`falltomato` — 39 total).

## The PixelLab workflow (one evening + a weekend)

1. **Set the style once.** Generate one 32×32 tile you love (start with grass) —
   iterate on the prompt until the palette/vibe is right. Save that image: it
   becomes the **style reference** for every later generation, which is what
   keeps 150 sprites looking like one game.
   - Prompt skeleton: *"32x32 pixel art tile, top-down lawn grass, seamless
     tileable, warm saturated palette, soft two-tone shading, cozy farm game
     style"* — then swap the subject per tile.
2. **Terrain (30 min).** Use the tileset/seamless tool for `grass`, `soil`
   (dark tilled bed), `path` (flagstone), `driveway` (concrete). Verify seams
   by tiling 3×3 in the preview.
3. **Top-20 plants first (the visible ones).** For each: generate the mature
   sprite (stage 2) on a transparent background, then use **inpainting /
   style-consistent edit** to derive stage 3 (add blooms in the plant's real
   color — see `bloom` hex in `js/plants.js`), stage 1 (smaller, sparser), and
   stage 0 (a 2-leaf sprout — honestly, one shared generic sprout is fine for
   all species).
4. **Trees at 96×96** (`liveoak`, `pecan`, `txredbud`, `mexicanplum`,
   `possumhaw`, `yaupon`): big rounded canopy, trunk at bottom-center,
   transparent background.
5. **Export PNGs**, name per the spec, fill in `manifest.json`, push (or hand
   the folder to Claude to wire, verify seams/scale in-app, and deploy).

### Quality expectations (honest)

- **Terrain tiles: excellent.** Seamless generation is a solved problem; expect
  shippable grass/soil/path in a few attempts each.
- **Single plants: very good, with iteration.** Expect 2–5 generations per
  plant to get one you like; distinctive species (muhly's pink haze, beautyberry's
  purple clusters) may need prompt nudging with color words.
- **Cross-set consistency: the real work.** This is where the style reference +
  inpainting discipline matters. Budget says: 20% generating, 80% curating.
- **Cleanup: some.** A stray pixel, a background that isn't fully transparent,
  a sprite that reads badly at 32px — fix in PixelLab's editor or any pixel
  editor (Piskel is free, in-browser).
- **Bail-out rule:** if the first hour doesn't produce a grass tile + one plant
  you'd ship, stop — use the Sprout Lands pack (free, itch.io) with the same
  file spec instead. Don't spend the week generating.

## Priority order (if time-boxed)

`grass`, `soil` → `liveoak`, `pecan` → `turkscap`, `gcmuhly`, `falltomato`,
`autumnsage`, `txlantana`, `beautyberry` → `path`, `driveway` → everything else.
The default yard shows these first; screenshots improve immediately.
