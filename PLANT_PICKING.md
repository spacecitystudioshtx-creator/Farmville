# 🌱 What should I plant? How GardenStar decides

The plant shop is sorted the way a good local gardener would answer "what
should I plant?" for *your* yard, today: things you can actually buy this
weekend, that go in the ground now, in light you actually have. It doesn't
sort A to Z. This page is the plan behind that: how real home gardeners decide,
then how the app turns each step into a score.

## How real home gardeners decide

Extension agents and experienced gardeners all use roughly the same funnel:
**right plant, right place, right time.** This is the version Texas A&M AgriLife
(Earth-Kind), the Harris County Master Gardeners' planting calendars and the
Native Plant Society of Texas teach. Each step either rules a plant out or
moves it up or down.

1. **Will it survive here at all?** Zone 9b (a hard freeze every few years),
   humid summers in the upper 90s, Gulf Coast clay that drains slowly, and
   about 50 inches of rain a year that comes in bursts. Most garden-center
   failures happen at this step: plants sold nationally that melt in a Houston
   August or rot in clay.
2. **Is it the right time?** Houston runs opposite to the North. **Fall
   (Oct–Nov) is the best time for perennials, shrubs and trees**, because
   roots grow all winter and the plant is established before summer.
   Vegetables have two seasons: warm crops Feb–Apr and again in late summer
   (fall tomatoes go in during July), and cool crops Sep–Feb. Planting in
   summer means transplant shock and daily watering.
3. **Do I have a spot it will thrive in?**
   - **Light:** full sun is 6+ hours, part shade 3–6, shade under 3. That
     changes through the day and the seasons.
   - **Space at full size:** spacing and height, about 15 ft from the
     foundation for big trees, and nothing under power lines.
   - **Drainage:** a soggy low spot or a mounded bed. Plants that hate wet
     feet need raised beds in this clay.
4. **What do I want from it?** Food, color, wildlife (nectar, caterpillar host
   plants, berries for birds), privacy, shade to cool the house, or low
   maintenance.
5. **What's my garden missing?** Something in bloom every month, layers
   (canopy tree, understory, shrubs, perennials, groundcover), host plants
   (monarchs need milkweed), and variety, since twenty of one thing invites
   pests and looks flat.
6. **Can I keep it alive?** Water once it's established, upkeep (pruning,
   deadheading), and experience. **Perennial or annual** is a time and budget
   decision: perennials come back every year, while annuals give one season of
   food or color and get replanted.
7. **Can I buy it?** Most people buy plants where they buy everything else:
   the Home Depot or Lowe's garden center, a seed rack, or Amazon. A great plant
   that only a native nursery stocks is a weekend errand, not an impulse buy.
8. **Practical limits:** budget, HOA rules, and pets and kids (toxic plants).

## How the app turns that into a ranking

Code: `gardenContext`, `scorePlant` and `rankPlants` in `js/care.js`. Data:
`sunRange` and `life` in `js/plants.js`.

| Step | What the app knows | Score |
|---|---|---|
| 1. Survives here | Every plant in the 52-plant catalog is picked for Houston | not scored: a filter, not a rank |
| 2. Right time | Planting months for each plant (Harris County calendar, native-plant guides) | **+40** in its window now ("Plant now", or "Last month to plant"), +15 next month, +5 in two months. Otherwise the plant shows "Plant Mar–May" |
| 3. Right light | Growing-season sun hours for every tile, traced from the sun's real path over your address with your house, fences and trees (`js/sun.js`), and the light range each plant tolerates | Whole yard: up to **+20** by how much of your open lawn and beds suits it, **−50** if nothing open does. A spot you tapped: **+25** (+8 if it's the plant's favorite light), **−60** if the light is wrong |
| 3. Room | House tiles and your trees | Big trees (30 ft+) need a spot 15 ft from the house and other trees. Small trees (redbud, plum, possumhaw) need 9 ft from the house. **−35 to −40** if there's no such spot |
| 4. Goals | Native, wildlife, host plants, food | Native **+12**. Caterpillar host **+10**. First plant for butterflies, hummingbirds, bees or birds **+6** (+2 if you already have one). Food in season **+8**, up to +12 more the more of your garden is edible |
| 5. What's missing | Bloom months of everything you've planted | **+3** for each month it blooms when nothing else does (max +15) |
| 6. Ease | Water needs | Low water **+6**, high water **−4** |
| 6. Variety | What you already have | **−5** for each one you already have (max −20) |
| 7. Can I buy it | Where each plant is usually sold in Houston (`buy` in `js/plants.js`) | Big-box garden centers (Home Depot, Lowe's) **+18**. Seed packet (racks, Amazon) **+10**. Native nurseries only **−10** |

Ties sort A to Z. Each plant in the shop shows its top three reasons in green
and its biggest drawback in rust, so the list explains itself, the way an
advisor would.

**Two modes:**
- **Whole yard** (default): ranked against all the open space you have.
- **A spot:** tap an empty tile in Look, then Plant. Picks are ranked for that
  tile's light and distance from the house, and tapping one plants it there.

"Already in my yard" mode is A to Z, because you're looking for a name.

Ranking never pays XP. XP still follows the one rule (natives in season, real
watering), so a good suggestion and a reward always agree.

## Worked example: the Cliffwood demo yard, mid-October

The yard has a pecan, a live oak, a yaupon, Turk's cap and muhly. It has no
bee plants and nothing blooming in March or April. Top of the list:

1. **Autumn Sage:** plant now, sold at Home Depot and Lowe's, first plant
   for bees, fills the March–April gap.
2. **Mealy Blue Sage:** same reasons, and its last month to plant.
3. **Texas Redbud:** fall is tree season. It's a small understory tree that
   fits the part shade, and big-box stores carry it.
4. **Purple Coneflower**, **Black-eyed Susan**, **Coral Honeysuckle**,
   **Rosemary**.

Frogfruit, a fine native that only native nurseries sell, sits mid-list.

Cool-season vegetables (garlic, lettuce, kale, carrots) are in season and sit
in the middle. Spring crops (tomatoes, squash, cucumbers) sink to the bottom
with "Plant Feb–Mar". Tap the deep shade under the live oak and the list
becomes Inland Sea Oats, Possumhaw, Yaupon, Beautyberry and Turk's Cap. That
matches what a Houston nursery would hand you for dry shade.

## What it doesn't know yet

These are listed by how much they'd change the answer:

1. **Live inventory.** "Sold at Home Depot" means typical seasonal stock, not
   what's on the shelf today. Fix: link each plant to a store search.
2. **Your goals.** Today they're inferred only from what you've planted (more
   edibles means food ranks higher). Fix: a three-chip picker at the start
   (Food / Flowers and wildlife / Low maintenance).
3. **Wet spots and drainage.** Fix: a "soggy spot" brush. Then high-water
   plants (buttonbush, cardinal flower, milkweed) can rank up there, and
   drainage-fussy ones (muhly, autumn sage) can rank down.
4. **Room in a specific bed.** The crowding warning checks neighbors at
   planting time, but the ranking doesn't yet.
5. **Budget, HOA, pets, and what the nursery has.**
6. **Catalog size.** The ranking can only pick from the 52 plants it has.

House shade is no longer a gap: tell the house builder which way your front
door faces, and sun hours come from the sun's real path past your house,
fences and trees.

## Changing it

Weights are plain numbers in `scorePlant`. Change one, then run `npm test`.
The suite checks that the top picks are plantable now, that a deep-shade spot
gets shade plants, and that tapping a pick plants it in that spot.
