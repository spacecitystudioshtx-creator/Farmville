#!/usr/bin/env python3
"""Build GardenStar's art atlas from LimeZu farm sheets (16x16 versions).

Usage:
  python3 tools/slice_limezu.py --sheets DIR --out assets/art

DIR must hold (rename the pack files to these):
  barn_red.png, barn_teal.png, barn_yellow.png, barn_gray.png
               - the big barn in each color (256x256, or a 3x export: 768x768)
  me_13.png, me_14.png, me_147.png, me_150.png, me_155.png
               - Modern Exteriors sheets (Tileset_13/14/147/150/155; the RPG Maker MV
                 edition's 768px sheets are fine, they're 3x the 16px originals)
  terrain.png  - ground autotiles (grass, sand, tilled soil, dirt, water)
  fences.png   - fences and garden beds
  crops.png    - crops, one 32px-tall row per crop, a column per growth stage
  trees.png    - fruit trees with saplings and fruiting variants

Output: one atlas.png plus manifest.json (frames, autotiles, credit). Only the
pieces the game draws are copied; LimeZu's license allows editing and use in
commercial games with credit, but not redistributing the pack itself.

Natives the pack has no art for are facsimiles: a pack plant with its flowers
or fruit recolored to the species' real bloom color (from js/plants.js).
"""
import argparse
import colorsys
import json
import os
import re

from PIL import Image

CREDIT = 'Art: LimeZu (limezu.itch.io)'
CELL_W, CELL_H = 16, 32  # crop cells

# crop rows: y of each 32px row in crops.png
ROW = {
    'cabbage': 0, 'radish': 32, 'carrot': 64, 'strawberry': 96, 'wheat': 128,
    'pepper': 160, 'cotton': 224, 'garlic': 256, 'cauliflower': 288,
    'tomato': 352, 'grape': 384, 'flowerbush': 416, 'berrybush': 448,
    'bean': 480, 'pumpkin': 512, 'melon': 576,
}

# trees.png bounding boxes (x, y, w, h)
TREE = {
    'apple_plain': (53, 83, 68, 77), 'apple_dots': (133, 83, 68, 77), 'apple_red': (213, 83, 68, 77),
    'apple_sapling': (16, 44, 32, 36),
    'tall_plain': (53, 225, 56, 79), 'tall_fruit': (181, 225, 56, 79), 'tall_sapling': (16, 193, 32, 31),
    'dense_plain': (53, 513, 70, 79), 'dense_fruit': (213, 513, 70, 79), 'dense_sapling': (16, 480, 31, 32),
}

# Each plant: list of (stage, source, recolor) where source is
#   ('crop', row, col) | ('tree', name)
# and recolor is None or (mask kind) to tint with the plant's bloom color.
def crop(row, col, recolor=None):
    return ('crop', ROW[row], col, recolor)


def tree(name, recolor=None):
    return ('tree', name, recolor)


TALL_FLOWER = [crop('flowerbush', 2), crop('flowerbush', 3), crop('flowerbush', 6), crop('flowerbush', 5, 'red')]
LOW_FLOWER = [crop('strawberry', 2), crop('strawberry', 3), crop('strawberry', 5), crop('cotton', 4, 'white')]
GRASS = [crop('wheat', 2), crop('wheat', 3), crop('wheat', 4), crop('wheat', 5, 'gold')]
SHRUB = [crop('berrybush', 2), crop('berrybush', 3), crop('berrybush', 5), crop('berrybush', 4, 'red')]
GROUND = [crop('strawberry', 2), crop('strawberry', 3), crop('strawberry', 5), crop('strawberry', 4, 'red')]
VINE = [crop('grape', 3), crop('grape', 3), crop('grape', 6), crop('grape', 4, 'purple')]

PLANTS = {
    # natives: facsimiles tinted to the real bloom color
    'turkscap': TALL_FLOWER, 'txlantana': TALL_FLOWER, 'flameacanthus': SHRUB,
    'coneflower': TALL_FLOWER, 'cardinalflower': TALL_FLOWER,
    'autumnsage': LOW_FLOWER, 'scarletsage': LOW_FLOWER, 'mistflower': LOW_FLOWER,
    'blackeyedsusan': LOW_FLOWER, 'indianblanket': LOW_FLOWER, 'mealysage': LOW_FLOWER,
    'aquaticmilkweed': LOW_FLOWER,
    'gcmuhly': GRASS, 'littlebluestem': GRASS, 'seaoats': GRASS,
    'beautyberry': SHRUB, 'yaupon': SHRUB, 'buttonbush': SHRUB,
    'winecup': GROUND, 'frogfruit': GROUND,
    'coralhoneysuckle': VINE, 'passionvine': VINE,
    # trees
    'liveoak': [crop('cabbage', 2), tree('dense_sapling'), tree('dense_plain'), tree('dense_plain')],
    'pecan': [crop('cabbage', 2), tree('apple_sapling'), tree('apple_plain'), tree('apple_plain')],
    'possumhaw': [crop('cabbage', 2), tree('apple_sapling'), tree('apple_plain'), tree('apple_red')],
    'txredbud': [crop('cabbage', 2), tree('tall_sapling'), tree('tall_plain'), tree('tall_fruit', 'orange')],
    'mexicanplum': [crop('cabbage', 2), tree('apple_sapling'), tree('apple_plain'), tree('apple_dots', 'orange')],
    # edibles: the matching crop where the pack has one
    'falltomato': [crop('tomato', 2), crop('tomato', 3), crop('tomato', 5), crop('tomato', 4)],
    'pepper': [crop('pepper', 2), crop('pepper', 3), crop('pepper', 6), crop('pepper', 4)],
    'bushbeans': [crop('bean', 3), crop('bean', 3), crop('bean', 5), crop('bean', 4)],
    'cucumber': [crop('melon', 2), crop('melon', 3), crop('melon', 3), crop('melon', 4)],
    'squash': [crop('pumpkin', 2), crop('pumpkin', 3), crop('pumpkin', 3), crop('pumpkin', 4)],
    'broccoli': [crop('cauliflower', 2), crop('cauliflower', 3), crop('cauliflower', 6), crop('cauliflower', 4)],
    'kale': [crop('cabbage', 2), crop('cabbage', 3), crop('cabbage', 4), crop('cabbage', 4)],
    'lettuce': [crop('cabbage', 2), crop('cabbage', 3), crop('cabbage', 3), crop('cabbage', 4)],
    'spinach': [crop('cabbage', 2), crop('cabbage', 2), crop('cabbage', 3), crop('cabbage', 3)],
    'carrot': [crop('carrot', 2), crop('carrot', 3), crop('carrot', 5), crop('carrot', 6)],
    'radish': [crop('radish', 2), crop('radish', 3), crop('radish', 5), crop('radish', 6)],
    'garlic': [crop('garlic', 2), crop('garlic', 3), crop('garlic', 4), crop('garlic', 4)],
    'cilantro': [crop('carrot', 2), crop('carrot', 3), crop('carrot', 3), crop('carrot', 3)],
    'basil': [crop('pepper', 2), crop('pepper', 3), crop('pepper', 6), crop('pepper', 6)],
}

# ground: 48x48 islands (3x3 autotile blocks) in terrain.png
AUTOTILES = {'soil': (0, 128), 'path': (0, 64)}  # driveway is drawn as concrete in js/sprites.js
GRASS_TILE = (48, 32)
# barn pieces the house is assembled from (x0, y0, x1, y1 in the 256px barn)
HOUSE_COLORS = ('red', 'teal', 'yellow', 'gray')
HOUSE_ROOF = (192, 96, 208, 112)    # seamless 16x16 corrugated metal
HOUSE_WALL = (176, 183, 230, 239)   # eave, boards, two windows, foundation; repeats sideways
HOUSE_PILLAR = (230, 186, 237, 239)  # white corner post for wall ends
HOUSE_DOOR = (96, 207, 121, 256)    # X-braced barn door with its header

# Modern Exteriors pieces for suburban houses: (sheet, x0, y0, x1, y1), 256px sheets
ME_ROOFS = {
    'gray': ('me_155', 128, 16, 144, 32),   # slate / asphalt shingle
    'red': ('me_13', 16, 32, 32, 48),
    'brown': ('me_14', 16, 32, 32, 48),
}
ME_BRICK = ('me_150', 40, 200, 56, 216)          # seamless brick
ME_WINDOW_WIDE = ('me_150', 33, 166, 71, 187)    # white three-pane window
ME_WHITE_SIDING = ('me_150', 22, 160, 82, 194)   # siding + window unit, repeats sideways
ME_CREAM_SIDING = ('me_13', 96, 160, 112, 168)   # cream boards (8px, tiles vertically)
ME_WINDOW_FRAMED = ('me_13', 48, 96, 80, 113)    # wood-framed window
ME_DOOR = ('me_13', 32, 146, 48, 178)            # front door with glass panel
ME_GARAGE = ('me_147', 36, 192, 102, 224)        # roll-up garage door, stretched to the driveway
ME_CHIMNEY = ('me_14', 160, 166, 175, 191)       # stack; roof pixels around it are masked out
ME_BOXES = {                                     # window flower boxes (trimmed to their bbox)
    'red': ('me_13', 196, 64, 220, 76), 'purple': ('me_13', 196, 96, 220, 108),
    'pink': ('me_13', 132, 112, 156, 124), 'white': ('me_13', 164, 112, 188, 124),
    'yellow': ('me_13', 196, 112, 220, 124),
}
ME_POTS = {'round': ('me_13', 129, 15, 143, 32), 'cone': ('me_13', 145, 9, 159, 32)}

# recolors: walls, roofs and doors keep the pack's shading, new hue
BRICK_COLORS = {'brick': None, 'brick_tan': '#c8a57a', 'brick_white': '#e6e2da', 'brick_gray': '#8f8f96'}
SIDING_COLORS = {'cream': None, 'blue': '#86a6c2', 'sage': '#a3b58c', 'gray': '#a9a9b0',
                 'yellow': '#ead07e', 'navy': '#4d5f80'}
ROOF_COLORS = {'black': ('gray', '#45454f'), 'blue': ('gray', '#4f6b8c'), 'green': ('red', '#557a4a')}
DOOR_COLORS = {'wood': None, 'red': '#b23a30', 'blue': '#2f5d8c', 'green': '#3f6e48',
               'black': '#33333b', 'white': '#ecebe6', 'yellow': '#e3b947'}
FENCE_H = (304, 96)
FENCE_V = (288, 112)


def bloom_colors(plants_js):
    """id -> bloom hex, read straight from js/plants.js so the art follows the data."""
    src = open(plants_js).read()
    out = {}
    for m in re.finditer(r"id: '(\w+)'.*?bloom: '(#[0-9a-fA-F]{6})'", src, re.S):
        out[m.group(1)] = m.group(2)
    return out


def is_masked(r, g, b, a, kind):
    if a < 128:
        return False
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if kind == 'white':
        return s < 0.22 and v > 0.72
    if s < 0.35 or v < 0.3:
        return False
    if kind == 'red':
        return h >= 330 or h <= 18
    if kind == 'gold':
        return 30 <= h <= 58
    if kind == 'orange':  # bright fruit only, so brown trunks stay brown
        return s > 0.5 and v > 0.62 and (h <= 55 or h >= 340)
    if kind == 'purple':
        return 250 <= h <= 335
    return False


def tint(img, kind, target_hex):
    """Recolor the masked pixels (flowers, fruit, seed heads) to target_hex,
    keeping each pixel's light/dark shading relative to the group."""
    img = img.copy()
    px = img.load()
    tr, tg, tb = (int(target_hex[i:i + 2], 16) / 255 for i in (1, 3, 5))
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    pts = [(x, y) for y in range(img.height) for x in range(img.width) if is_masked(*px[x, y], kind)]
    if not pts:
        return img
    vals = [colorsys.rgb_to_hsv(*(c / 255 for c in px[x, y][:3]))[2] for x, y in pts]
    vmean = sum(vals) / len(vals)
    for (x, y), v in zip(pts, vals):
        nv = max(0.08, min(1.0, tv * (v / vmean)))
        ns = ts if ts > 0.12 else ts * (0.6 + 0.4 * (1 - v))
        r, g, b = colorsys.hsv_to_rgb(th, ns, nv)
        px[x, y] = (round(r * 255), round(g * 255), round(b * 255), px[x, y][3])
    return img


def recolor(img, target_hex, keep=None):
    """Move every pixel (or those keep(x, y, h, s, v) accepts) to target_hex's
    hue and saturation, scaling brightness around the group mean so the
    pack's shading survives."""
    img = img.copy()
    px = img.load()
    tr, tg, tb = (int(target_hex[i:i + 2], 16) / 255 for i in (1, 3, 5))
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    pts = []
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if keep is None or keep(x, y, h * 360, s, v):
                pts.append((x, y, v))
    if not pts:
        return img
    vmean = sum(v for _, _, v in pts) / len(pts)
    for x, y, v in pts:
        nv = max(0.06, min(1.0, tv * (v / vmean)))
        r, g, b = colorsys.hsv_to_rgb(th, ts, nv)
        px[x, y] = (round(r * 255), round(g * 255), round(b * 255), px[x, y][3])
    return img


def trim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img


def bbox_trim_top(img):
    """Crop transparent rows from the top only, keeping the bottom anchor."""
    bb = img.getbbox()
    if not bb:
        return img
    return img.crop((0, bb[1], img.width, img.height))


def grass_variants(base):
    """Plain pack grass plus two variants with sparse tufts in the pack's own
    greens, so a big lawn doesn't read as one flat color."""
    r, g, b, a = base.getpixel((8, 8))
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    dark = tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, min(1, s * 1.1), v * 0.82)) + (255,)
    lite = tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s * 0.9, min(1, v * 1.12))) + (255,)
    out = [base]
    for spots in ([(3, 4), (11, 11)], [(9, 3), (4, 12), (13, 7)]):
        t = base.copy()
        for x, y in spots:  # a 3-pixel tuft: dark base, light tip
            t.putpixel((x, y + 1), dark)
            t.putpixel((x + 1, y + 1), dark)
            t.putpixel((x, y), lite)
        out.append(t)
    return out


def wall_unit(width, texture, window=None, height=32):
    """A repeating 1-story wall: eave trim, texture, a centered window,
    foundation strip. Repeats sideways, so the house can be any width."""
    trim, edge, base = (226, 226, 236, 255), (43, 36, 51, 255), (128, 128, 146, 255)
    u = Image.new('RGBA', (width, height))
    for y in range(0, height, texture.height):
        for x in range(0, width, texture.width):
            u.alpha_composite(texture, (x, y))
    if window is not None:
        u.alpha_composite(window, ((width - window.width) // 2, 7))
    for x in range(width):
        u.putpixel((x, 0), edge)
        u.putpixel((x, 1), trim)
        u.putpixel((x, 2), trim)
        u.putpixel((x, 3), edge)
        for y in range(height - 3, height):
            u.putpixel((x, y), base if y < height - 1 else edge)
    return u


def add_suburban_walls(frames, windows, me):
    """Brick and siding walls in several colors, doors, garage door, extras.
    windows[wall] = [window center x, sill y] inside the wall unit, for flower boxes."""
    brick = me(ME_BRICK)
    for wid, color in BRICK_COLORS.items():
        tex = recolor(brick, color) if color else brick
        frames[f'house/wall/{wid}'] = wall_unit(48, tex, me(ME_WINDOW_WIDE))
        windows[wid] = [24, 28]
    cream = me(ME_CREAM_SIDING)
    for wid, color in SIDING_COLORS.items():
        tex = recolor(cream, color) if color else cream
        frames[f'house/wall/{wid}'] = wall_unit(48, tex, me(ME_WINDOW_FRAMED))
        windows[wid] = [24, 24]
    white = me(ME_WHITE_SIDING)
    frames['house/wall/white'] = wall_unit(white.width, white.crop((0, 2, white.width, white.height)), None, 34)
    windows['white'] = [30, 25]

    door = me(ME_DOOR)
    # the door leaf is warm wood; the doormat (bottom rows) and frame stay put
    leaf = lambda x, y, h, s, v: y < 25 and 12 <= h <= 48 and s > 0.3
    for name, color in DOOR_COLORS.items():
        frames[f'house/door/{name}'] = recolor(door, color, leaf) if color else door

    frames['house/garage'] = me(ME_GARAGE)
    # chimney: drop the roof pixels around the stack (saturated browns)
    chim = me(ME_CHIMNEY)
    px = chim.load()
    for y in range(chim.height):
        for x in range(chim.width):
            r, g, b, a = px[x, y]
            h, s_, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if a and s_ > 0.3:
                px[x, y] = (0, 0, 0, 0)
    frames['house/chimney'] = trim(chim)
    for name, spec in ME_BOXES.items():
        frames[f'house/box/{name}'] = trim(me(spec))
    for name, spec in ME_POTS.items():
        frames[f'house/pot/{name}'] = trim(me(spec))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheets', required=True)
    ap.add_argument('--out', default='assets/art')
    ap.add_argument('--plants-js', default=os.path.join(os.path.dirname(__file__), '..', 'js', 'plants.js'))
    a = ap.parse_args()

    load = lambda n: Image.open(os.path.join(a.sheets, n)).convert('RGBA')
    terrain, fences, crops, trees = load('terrain.png'), load('fences.png'), load('crops.png'), load('trees.png')
    blooms = bloom_colors(a.plants_js)

    frames = {}  # key -> Image

    def me(spec):
        sheet, x0, y0, x1, y1 = spec
        im = load(sheet + '.png')
        if im.width == 768:
            im = im.resize((256, 256), Image.NEAREST)
        return im.crop((x0, y0, x1, y1))

    for name, spec in ME_ROOFS.items():
        frames[f'house/roof/{name}'] = me(spec)
    for name, (base, color) in ROOF_COLORS.items():
        frames[f'house/roof/{name}'] = recolor(me(ME_ROOFS[base]), color)
    windows = {}
    add_suburban_walls(frames, windows, me)

    for color in HOUSE_COLORS:
        barn = load(f'barn_{color}.png')
        if barn.width == 768:  # 3x nearest-neighbor export of the 256px original
            barn = barn.resize((256, 256), Image.NEAREST)
        if color == 'red':
            frames['house/roof/metal'] = barn.crop(HOUSE_ROOF)
        frames[f'house/wall/barn_{color}'] = barn.crop(HOUSE_WALL)
        frames[f'house/pillar/barn_{color}'] = barn.crop(HOUSE_PILLAR)
        frames[f'house/door/barn_{color}'] = barn.crop(HOUSE_DOOR)

    gx, gy = GRASS_TILE
    for i, t in enumerate(grass_variants(terrain.crop((gx, gy, gx + 16, gy + 16)))):
        frames['tiles/grass' + ('' if i == 0 else '_' + str(i))] = t
    for name, (x, y) in AUTOTILES.items():
        frames['auto/' + name] = terrain.crop((x, y, x + 48, y + 48))
    frames['fence_h'] = fences.crop((FENCE_H[0], FENCE_H[1], FENCE_H[0] + 16, FENCE_H[1] + 16))
    frames['fence_v'] = fences.crop((FENCE_V[0], FENCE_V[1], FENCE_V[0] + 16, FENCE_V[1] + 16))

    for pid, stages in PLANTS.items():
        for stage, src in enumerate(stages):
            if src[0] == 'crop':
                _, ry, col, kind = src
                img = bbox_trim_top(crops.crop((col * CELL_W, ry, col * CELL_W + CELL_W, ry + CELL_H)))
            else:
                _, name, kind = src
                x, y, w, h = TREE[name]
                img = trees.crop((x, y, x + w, y + h))
            if kind:
                img = tint(img, kind, blooms[pid])
            frames[f'plants/{pid}/{stage}'] = img

    # shelf-pack into one atlas
    order = sorted(frames, key=lambda k: -frames[k].height)
    width, x, y, shelf, pos = 512, 0, 0, 0, {}
    for k in order:
        im = frames[k]
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[k] = (x, y, im.width, im.height)
        x += im.width + 1
        shelf = max(shelf, im.height)
    atlas = Image.new('RGBA', (width, y + shelf), (0, 0, 0, 0))
    for k, (x, y, w, h) in pos.items():
        atlas.alpha_composite(frames[k], (x, y))

    os.makedirs(a.out, exist_ok=True)
    atlas.save(os.path.join(a.out, 'atlas.png'), optimize=True)
    manifest = {
        'credit': CREDIT,
        'plantScale': 2,
        'atlas': 'atlas.png',
        'frames': {k: list(v) for k, v in sorted(pos.items())},
        'autotiles': sorted(AUTOTILES),
        'tileVariants': {'grass': ['grass', 'grass_1', 'grass_2']},
        'houseWalls': list(BRICK_COLORS) + list(SIDING_COLORS) + ['white'] + [f'barn_{c}' for c in HOUSE_COLORS],
        'houseRoofs': ['gray', 'black', 'red', 'brown', 'green', 'blue', 'metal'],
        'houseDoors': list(DOOR_COLORS),
        'houseBoxes': list(ME_BOXES),
        'houseWindows': windows,
    }
    with open(os.path.join(a.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print(f'{len(frames)} frames -> {a.out}/atlas.png ({atlas.width}x{atlas.height})')


if __name__ == '__main__':
    main()
