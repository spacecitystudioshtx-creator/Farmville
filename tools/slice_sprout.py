#!/usr/bin/env python3
"""Slice the Sprout Lands asset pack into GardenStar's assets/art/ layout.

Usage:
  python3 tools/slice_sprout.py --pack "/path/to/Sprout Lands - Sprites - Basic pack" --out assets/art

Sources are 16px sprites; terrain tiles are scaled 2x to the app's 32px grid.
Plant sprites keep native pixel density (the renderer draws them at 2x,
anchored bottom-center). Facsimile sprites (fac_*) stand in for whole plant
categories — see js/art.js for the fallback chain.

LICENSE NOTE: the free Basic pack is NON-COMMERCIAL ONLY and may not be
redistributed. Run this only with a pack you are licensed to use for this
project (premium/commercial license from Cup Nooble), and keep the required
credit line (written into manifest.json, shown in the app footer).
"""
import argparse
import json
import os
from PIL import Image

NEAREST = Image.NEAREST

# (source file, x, y, w, h) in source pixels
TILES = {
    'grass':  ('Tilesets/Grass.png', 32, 80, 16, 16),
    'soil':   ('Tilesets/Tilled_Dirt_Wide_v2.png', 16, 96, 16, 16),
}
PATH_PLANKS = ('Objects/Paths.png', 16, 48, 32, 16)  # composited over grass

EXTRA = {
    'fence_h':        ('Tilesets/Fences.png', 32, 48, 16, 16),
    'fence_v':        ('Tilesets/Fences.png', 0, 16, 16, 16),
    'house/roof':     ('Tilesets/Wooden_House_Roof_Tilset.png', 16, 16, 16, 16),
    'house/roof_top': ('Tilesets/Wooden_House_Roof_Tilset.png', 16, 0, 16, 16),   # over grass
    'house/wall':     ('Tilesets/Wooden_House_Walls_Tilset.png', 16, 32, 16, 16),
    'house/window':   ('Tilesets/Wooden_House_Walls_Tilset.png', 52, 4, 16, 16),  # over wall
    'house/door':     ('Tilesets/Doors.png', 0, 48, 16, 16),                      # over wall
}
# pieces with transparency get composited onto a background tile
COMPOSITE_OVER = { 'house/roof_top': 'grass', 'house/window': 'wall', 'house/door': 'wall' }

# plant sprites: bbox crops, bottom-center anchored into 16px-multiple cells
PLANTS = {
    'fac_tree':           [(2, ('Objects/Basic_Grass_Biom_things.png', 16, 0, 32, 32))],
    'fac_tree_flowering': [(2, ('Objects/Basic_Grass_Biom_things.png', 48, 0, 32, 32))],
    'fac_bush':           [(2, ('Objects/Basic_Grass_Biom_things.png', 64, 49, 16, 14))],
    'fac_bush_flowering': [(2, ('Objects/Basic_Grass_Biom_things.png', 0, 48, 32, 16))],
    'fac_grassclump':     [(2, ('Objects/Basic_Grass_Biom_things.png', 36, 64, 32, 16))],
    'fac_groundcover':    [(2, ('Objects/Basic_Grass_Biom_things.png', 128, 64, 16, 15))],
    'fac_flower_yellow':  [(2, ('Objects/Basic_Grass_Biom_things.png', 114, 37, 11, 9))],
    'fac_flower_pink':    [(2, ('Objects/Basic_Grass_Biom_things.png', 99, 54, 9, 6))],
    'fac_flower_red':     [(2, ('Objects/Basic_Grass_Biom_things.png', 114, 52, 11, 9))],
    'fac_sunflower':      [(2, ('Objects/Basic_Grass_Biom_things.png', 129, 34, 14, 29))],
    'fac_sprout':         [(0, ('Objects/Basic_Grass_Biom_things.png', 115, 3, 7, 8))],
    'fac_crop_leafy': [
        (0, ('Objects/Basic_Plants.png', 16, 0, 16, 16)),
        (1, ('Objects/Basic_Plants.png', 32, 0, 16, 16)),
        (2, ('Objects/Basic_Plants.png', 48, 0, 16, 16)),
        (3, ('Objects/Basic_Plants.png', 64, 0, 16, 16)),
    ],
    'fac_crop_fruit': [
        (0, ('Objects/Basic_Plants.png', 32, 16, 16, 16)),
        (1, ('Objects/Basic_Plants.png', 48, 16, 16, 16)),
        (2, ('Objects/Basic_Plants.png', 64, 16, 16, 16)),
        (3, ('Objects/Basic_Plants.png', 80, 16, 16, 16)),
    ],
}

CREDIT = 'Assets: Sprout Lands by Cup Nooble'


def crop(pack, spec):
    f, x, y, w, h = spec
    return Image.open(os.path.join(pack, f)).convert('RGBA').crop((x, y, x + w, y + h))


def cell(img):
    """Anchor a sprite bottom-center in a 16px-multiple transparent cell."""
    cw = max(16, (img.width + 15) // 16 * 16)
    ch = max(16, (img.height + 15) // 16 * 16)
    out = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    out.alpha_composite(img, ((cw - img.width) // 2, ch - img.height - 1))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', required=True)
    ap.add_argument('--out', default='assets/art')
    a = ap.parse_args()

    tiles_dir = os.path.join(a.out, 'tiles')
    plants_dir = os.path.join(a.out, 'plants')
    extra_dir = os.path.join(a.out, 'extra')
    for d in (tiles_dir, plants_dir, extra_dir):
        os.makedirs(d, exist_ok=True)

    manifest = {'credit': CREDIT, 'tiles': [], 'plants': {}, 'extra': {}}

    for name, spec in TILES.items():
        img = crop(a.pack, spec).resize((32, 32), NEAREST)
        img.save(os.path.join(tiles_dir, name + '.png'))
        manifest['tiles'].append(name)

    # path tile: planks composited over the grass tile
    grass = crop(a.pack, TILES['grass'])
    planks = crop(a.pack, PATH_PLANKS)
    pathtile = grass.copy()
    pathtile.alpha_composite(planks.crop((0, 0, 16, 16)), (0, 0))
    pathtile.resize((32, 32), NEAREST).save(os.path.join(tiles_dir, 'path.png'))
    manifest['tiles'].append('path')

    wall_bg = crop(a.pack, EXTRA['house/wall'])
    for key, spec in EXTRA.items():
        img = crop(a.pack, spec)
        over = COMPOSITE_OVER.get(key)
        if over:
            base = (grass if over == 'grass' else wall_bg).copy()
            base.alpha_composite(img)
            img = base
        fname = 'extra/' + key.replace('/', '_') + '.png'
        img.resize((32, 32), NEAREST).save(os.path.join(a.out, fname))
        manifest['extra'][key] = fname

    for pid, stages in PLANTS.items():
        manifest['plants'][pid] = []
        for stage, spec in stages:
            cell(crop(a.pack, spec)).save(os.path.join(plants_dir, f'{pid}_s{stage}.png'))
            manifest['plants'][pid].append(stage)

    with open(os.path.join(a.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print('sliced ->', a.out)


if __name__ == '__main__':
    main()
