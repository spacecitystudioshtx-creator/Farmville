// 8-bit rendering, v2: 16x16 fat pixels per tile, neighbor-aware terrain
// (bed edging, house walls/roof ridge, doors & windows), shadows, and a
// picket fence. Still 100% procedural — no image assets — but the renderer
// is isolated here, so swapping in a drawn tileset (Kenney / Sprout Lands
// style) later only touches this file.
(function () {
  const TILE = 32;       // canvas px per tile
  const P = TILE / 16;   // one fat pixel

  // deterministic per-tile randomness so textures don't shimmer between frames
  function hash(x, y, salt) {
    let h = (x * 73856093) ^ (y * 19349663) ^ ((salt || 0) * 83492791);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function px(ctx, tx, ty, ix, iy, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(tx * TILE + ix * P, ty * TILE + iy * P, (w || 1) * P, (h || 1) * P);
  }

  const at = (x, y) => (window.YARD ? window.YARD.terrainAt(x, y) : null);

  // ---------- terrain ----------
  const TERRAIN = {
    grass(ctx, x, y) {
      px(ctx, x, y, 0, 0, 16, 16, hash(x, y, 1) < 0.5 ? '#77b548' : '#71ae43');
      if (x % 2 === 0) { // mow stripes
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      for (let i = 0; i < 9; i++) { // blades
        const gx = Math.floor(hash(x, y, 10 + i) * 15);
        const gy = Math.floor(hash(x, y, 30 + i) * 15);
        px(ctx, x, y, gx, gy, 1, 2, i < 6 ? '#5f9c38' : '#8cc95c');
      }
      if (hash(x, y, 4) < 0.05) { // stray clover flower
        const fx = 3 + Math.floor(hash(x, y, 5) * 10);
        const fy = 3 + Math.floor(hash(x, y, 6) * 10);
        px(ctx, x, y, fx, fy, 2, 2, '#f3f0e2');
        px(ctx, x, y, fx, fy, 1, 1, '#f0d24a');
      }
    },
    soil(ctx, x, y) {
      px(ctx, x, y, 0, 0, 16, 16, '#6e4a2b');
      for (let r = 3; r < 16; r += 4) px(ctx, x, y, 0, r, 16, 1, '#5c3d22'); // furrows
      for (let i = 0; i < 6; i++) { // clods
        px(ctx, x, y, Math.floor(hash(x, y, 40 + i) * 15), Math.floor(hash(x, y, 50 + i) * 15), 2, 1, '#82593a');
      }
      // timber edging where the bed meets anything else
      const edge = '#8a6238', edgeDark = '#4a3018';
      if (at(x, y - 1) !== 'soil') { px(ctx, x, y, 0, 0, 16, 2, edge); px(ctx, x, y, 0, 2, 16, 1, edgeDark); }
      if (at(x, y + 1) !== 'soil') { px(ctx, x, y, 0, 14, 16, 2, edge); px(ctx, x, y, 0, 13, 16, 1, edgeDark); }
      if (at(x - 1, y) !== 'soil') { px(ctx, x, y, 0, 0, 2, 16, edge); px(ctx, x, y, 2, 0, 1, 16, edgeDark); }
      if (at(x + 1, y) !== 'soil') { px(ctx, x, y, 14, 0, 2, 16, edge); px(ctx, x, y, 13, 0, 1, 16, edgeDark); }
    },
    path(ctx, x, y) {
      px(ctx, x, y, 0, 0, 16, 16, '#a89878'); // joint sand
      const off = (x + y) % 2 ? 0 : 4;        // staggered flagstones
      const stones = [[1, 1, 6, 6], [9, 1 + off / 2, 6, 5], [1, 9, 5, 6], [8, 8 + (off ? 1 : 0), 7, 6]];
      for (const [sx, sy, sw, sh] of stones) {
        px(ctx, x, y, sx, sy, sw, sh, hash(x + sx, y + sy, 7) < 0.5 ? '#c5b795' : '#bcae8c');
        px(ctx, x, y, sx, sy, sw, 1, '#d2c5a4'); // top light
        px(ctx, x, y, sx, sy + sh - 1, sw, 1, '#9c8d6d'); // bottom shade
      }
    },
    driveway(ctx, x, y) {
      px(ctx, x, y, 0, 0, 16, 16, '#9c9c9c');
      if (y % 3 === 0) px(ctx, x, y, 0, 0, 16, 1, '#828282'); // expansion joints
      if (x % 2 === 0) px(ctx, x, y, 0, 0, 1, 16, '#8a8a8a');
      for (let i = 0; i < 5; i++) { // aggregate speckle
        px(ctx, x, y, Math.floor(hash(x, y, 60 + i) * 15), Math.floor(hash(x, y, 70 + i) * 15), 1, 1,
          i % 2 ? '#a8a8a8' : '#8f8f8f');
      }
    },
    house(ctx, x, y) {
      const wallBelow = at(x, y + 1) !== 'house';
      const roofRows = wallBelow ? 9 : 16;
      // shingles
      px(ctx, x, y, 0, 0, 16, roofRows, '#9c4f30');
      for (let r = 0; r < roofRows; r += 3) {
        px(ctx, x, y, 0, r, 16, 1, '#7e3c24');
        px(ctx, x, y, ((x + r) % 2) * 8, r + 1, 1, 2, '#7e3c24'); // shingle offsets
        px(ctx, x, y, ((x + r) % 2) * 8 + 4, r + 1, 1, 2, '#7e3c24');
      }
      if (at(x, y - 1) !== 'house') { px(ctx, x, y, 0, 0, 16, 2, '#b96f47'); } // ridge cap
      if (at(x - 1, y) !== 'house') px(ctx, x, y, 0, 0, 1, roofRows, '#6e3420');
      if (at(x + 1, y) !== 'house') px(ctx, x, y, 15, 0, 1, roofRows, '#6e3420');
      if (wallBelow) { // visible front wall: siding + door/window
        px(ctx, x, y, 0, 9, 16, 7, '#e6d6ae');
        px(ctx, x, y, 0, 9, 16, 1, '#8a6238'); // eave trim
        px(ctx, x, y, 0, 15, 16, 1, '#b8a67e'); // foundation shadow
        if (at(x, y + 1) === 'path') { // front door where the walk arrives
          px(ctx, x, y, 5, 10, 6, 6, '#7a4a28');
          px(ctx, x, y, 5, 10, 6, 1, '#5c3d22');
          px(ctx, x, y, 9, 13, 1, 1, '#e8c860');
        } else if (hash(x, y, 8) < 0.6) { // window
          px(ctx, x, y, 4, 10, 8, 5, '#6b4a2c');
          px(ctx, x, y, 5, 11, 6, 3, '#9ad4e8');
          px(ctx, x, y, 7, 11, 1, 3, '#6b4a2c'); // mullion
          px(ctx, x, y, 5, 12, 6, 1, 'rgba(255,255,255,0.5)');
        }
      }
    },
  };

  // picket fence overlay for the lot border (drawn on grass border tiles)
  function drawFence(ctx, x, y, vertical) {
    const c = '#ece4cf', s = '#b6ab8e';
    if (!vertical) {
      px(ctx, x, y, 0, 8, 16, 2, c); px(ctx, x, y, 0, 10, 16, 1, s);   // rail
      for (const ix of [1, 6, 11]) {
        px(ctx, x, y, ix, 4, 3, 9, c); px(ctx, x, y, ix + 1, 3, 1, 1, c); // picket + point
        px(ctx, x, y, ix + 2, 5, 1, 8, s);
      }
    } else {
      px(ctx, x, y, 7, 0, 2, 16, c); px(ctx, x, y, 9, 0, 1, 16, s);    // rail
      for (const iy of [2, 9]) {
        px(ctx, x, y, 5, iy, 6, 3, c); px(ctx, x, y, 5, iy + 2, 6, 1, s); // post
      }
    }
  }

  // ---------- plant sprites ----------
  // stage: 0 sprout, 1 young, 2 mature, 3 mature+blooming
  function shadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(30,40,20,0.22)';
    ctx.fillRect(x * TILE + (8 - w) * P, y * TILE + 14 * P, w * 2 * P, 2 * P);
  }

  function sprout(ctx, x, y, color) {
    shadow(ctx, x, y, 2);
    px(ctx, x, y, 7, 10, 2, 4, shade(color, 1.15));
    px(ctx, x, y, 5, 9, 2, 2, color);
    px(ctx, x, y, 9, 9, 2, 2, color);
  }

  function flower(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, dark = shade(p.color, 0.8), lite = shade(p.color, 1.25);
    shadow(ctx, x, y, stage === 1 ? 3 : 5);
    px(ctx, x, y, 7, 7, 2, 7, dark);                    // main stem
    px(ctx, x, y, 4, 10, 3, 2, c); px(ctx, x, y, 9, 10, 3, 2, c); // lower leaves
    if (stage >= 2) {
      px(ctx, x, y, 4, 12, 2, 2, c); px(ctx, x, y, 10, 12, 2, 2, c);
      px(ctx, x, y, 5, 8, 2, 2, lite); px(ctx, x, y, 9, 8, 2, 2, lite);
      px(ctx, x, y, 4, 6, 2, 2, dark); px(ctx, x, y, 10, 6, 2, 2, dark); // side stems
    }
    if (stage === 3) { // blossom cluster with bright centers
      const b = p.bloom, bl = shade(p.bloom, 1.35);
      px(ctx, x, y, 5, 2, 4, 4, b); px(ctx, x, y, 6, 3, 2, 2, bl);
      px(ctx, x, y, 10, 4, 4, 3, b); px(ctx, x, y, 11, 5, 2, 1, bl);
      px(ctx, x, y, 2, 4, 3, 3, b); px(ctx, x, y, 3, 5, 1, 1, bl);
      px(ctx, x, y, 8, 1, 2, 2, b);
    }
  }

  function grassClump(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, dark = shade(p.color, 0.78), lite = shade(p.color, 1.2);
    shadow(ctx, x, y, 5);
    const blades = [[2, 6, 8], [4, 4, 10], [6, 2, 12], [8, 3, 11], [10, 4, 10], [12, 6, 8], [7, 5, 9]];
    for (let i = 0; i < blades.length; i++) {
      const [bx, by, bh] = blades[i];
      px(ctx, x, y, bx, by, 2, bh, i % 3 === 0 ? dark : i % 3 === 1 ? c : lite);
    }
    px(ctx, x, y, 2, 12, 12, 2, dark); // base tuft
    if (stage === 3) { // seed-head haze
      const b = p.bloom;
      px(ctx, x, y, 2, 1, 3, 3, b); px(ctx, x, y, 7, 0, 4, 2, b);
      px(ctx, x, y, 12, 2, 3, 2, b); px(ctx, x, y, 5, 3, 2, 1, shade(p.bloom, 1.25));
    }
  }

  function shrub(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, dark = shade(p.color, 0.75), lite = shade(p.color, 1.25);
    if (stage === 1) {
      shadow(ctx, x, y, 3);
      px(ctx, x, y, 5, 7, 6, 6, c); px(ctx, x, y, 6, 6, 4, 1, c);
      px(ctx, x, y, 6, 8, 2, 1, lite);
      return;
    }
    shadow(ctx, x, y, 6);
    px(ctx, x, y, 2, 5, 12, 9, dark);          // silhouette
    px(ctx, x, y, 3, 3, 10, 2, dark);
    px(ctx, x, y, 3, 5, 10, 7, c);             // body
    px(ctx, x, y, 4, 3, 8, 2, c);
    px(ctx, x, y, 4, 4, 4, 3, lite);           // light cluster
    px(ctx, x, y, 9, 6, 3, 2, lite);
    if (stage === 3) {
      const b = p.bloom;
      for (const [fx, fy] of [[4, 5], [8, 3], [11, 7], [5, 9], [9, 10], [12, 4], [3, 7]])
        px(ctx, x, y, fx, fy, 2, 2, b);
    }
  }

  function tree(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const dark = shade(p.color, 0.72), mid = p.color, lite = shade(p.color, 1.28);
    if (stage === 1) { // sapling
      shadow(ctx, x, y, 3);
      px(ctx, x, y, 7, 8, 2, 6, '#6b4a2c');
      px(ctx, x, y, 4, 2, 8, 7, dark);
      px(ctx, x, y, 5, 3, 6, 5, mid);
      px(ctx, x, y, 5, 3, 3, 2, lite);
      return;
    }
    // mature: rounded top-down canopy spilling over neighbors
    // (second render pass keeps layering right)
    const T = TILE, cx = x * T + T / 2, cy = y * T + T / 2;
    const deep = shade(p.color, 0.55), hi = shade(p.color, 1.45);
    // offset ground shadow (sun from the upper-left)
    ctx.fillStyle = 'rgba(20,30,12,0.3)';
    ctx.fillRect(cx - T * 0.95 + 6, cy - T * 0.15 + 8, T * 2.1, T * 1.1);
    // dark silhouette: stacked rows approximating a circle, r ≈ 1.25 tiles
    const rows = [
      [-1.30, -0.95, 0.75], [-0.95, -0.45, 1.10], [-0.45, 0.30, 1.28],
      [0.30, 0.70, 1.05], [0.70, 0.95, 0.65],
    ];
    ctx.fillStyle = deep;
    for (const [y0, y1, hw] of rows) ctx.fillRect(cx - T * hw, cy + T * y0, T * hw * 2, T * (y1 - y0));
    // mid body, inset so a dark rim stays visible
    ctx.fillStyle = mid;
    for (const [y0, y1, hw] of rows) {
      const w = Math.max(0, hw - 0.16);
      ctx.fillRect(cx - T * w, cy + T * (y0 + 0.1), T * w * 2, T * (y1 - y0 - 0.06));
    }
    // leaf-cluster texture: highlights on the sun side, holes on the shade side
    ctx.fillStyle = hi;
    ctx.fillRect(cx - T * 0.85, cy - T * 0.95, T * 0.65, T * 0.38);
    ctx.fillRect(cx - T * 0.35, cy - T * 1.15, T * 0.55, T * 0.3);
    ctx.fillRect(cx - T * 1.0, cy - T * 0.35, T * 0.45, T * 0.3);
    ctx.fillRect(cx - T * 0.15, cy - T * 0.55, T * 0.42, T * 0.26);
    ctx.fillStyle = lite;
    ctx.fillRect(cx + T * 0.25, cy - T * 0.85, T * 0.5, T * 0.32);
    ctx.fillRect(cx - T * 0.55, cy + T * 0.05, T * 0.5, T * 0.28);
    ctx.fillStyle = dark;
    ctx.fillRect(cx + T * 0.35, cy + T * 0.25, T * 0.55, T * 0.32);
    ctx.fillRect(cx + T * 0.7, cy - T * 0.3, T * 0.4, T * 0.35);
    ctx.fillRect(cx - T * 0.2, cy + T * 0.5, T * 0.5, T * 0.28);
    if (stage === 3 && p.bloom !== p.color) {
      ctx.fillStyle = p.bloom;
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(cx - T * 1.05 + hash(x, y, 80 + i) * T * 2.1,
          cy - T * 1.2 + hash(x, y, 90 + i) * T * 1.9, P * 2, P * 2);
      }
    }
  }

  function vine(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, dark = shade(p.color, 0.78), lite = shade(p.color, 1.22);
    shadow(ctx, x, y, 5);
    px(ctx, x, y, 2, 0, 2, 15, '#8a7a5a'); px(ctx, x, y, 12, 0, 2, 15, '#8a7a5a'); // trellis
    px(ctx, x, y, 2, 2, 12, 2, '#8a7a5a');
    px(ctx, x, y, 3, 1, 3, 12, dark); px(ctx, x, y, 10, 2, 3, 11, dark);           // vines
    px(ctx, x, y, 4, 2, 2, 10, c); px(ctx, x, y, 11, 3, 2, 9, c);
    if (stage >= 2) { px(ctx, x, y, 6, 4, 4, 3, c); px(ctx, x, y, 7, 5, 2, 1, lite); px(ctx, x, y, 6, 9, 4, 2, c); }
    if (stage === 3) {
      const b = p.bloom;
      px(ctx, x, y, 4, 3, 2, 2, b); px(ctx, x, y, 11, 6, 2, 2, b);
      px(ctx, x, y, 7, 10, 2, 2, b); px(ctx, x, y, 5, 12, 2, 2, b);
    }
  }

  function groundcover(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, dark = shade(p.color, 0.8), lite = shade(p.color, 1.2);
    px(ctx, x, y, 0, 10, 16, 6, dark);
    px(ctx, x, y, 1, 11, 14, 4, c);
    px(ctx, x, y, 2, 8, 4, 2, c); px(ctx, x, y, 8, 9, 5, 2, c);
    px(ctx, x, y, 3, 11, 3, 1, lite); px(ctx, x, y, 9, 12, 3, 1, lite);
    if (stage === 3) {
      const b = p.bloom;
      px(ctx, x, y, 3, 9, 2, 2, b); px(ctx, x, y, 9, 10, 2, 2, b);
      px(ctx, x, y, 13, 11, 2, 2, b); px(ctx, x, y, 6, 12, 2, 2, b);
    }
  }

  function edible(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, '#7ec850');
    const c = p.color, dark = shade(p.color, 0.78), lite = shade(p.color, 1.22);
    shadow(ctx, x, y, 5);
    for (const bx of [3, 10]) { // two plants per tile
      px(ctx, x, y, bx + 1, 8, 2, 6, dark);              // stem
      px(ctx, x, y, bx - 1, 5, 6, 4, dark);              // leaf silhouette
      px(ctx, x, y, bx, 5, 4, 3, c);
      px(ctx, x, y, bx, 5, 2, 1, lite);
      if (stage >= 2) { px(ctx, x, y, bx - 1, 9, 6, 2, c); }
    }
    if (stage === 3 && p.bloom !== p.color) { // fruit
      const b = p.bloom;
      px(ctx, x, y, 3, 7, 2, 2, b); px(ctx, x, y, 11, 9, 2, 2, b); px(ctx, x, y, 6, 10, 2, 2, b);
    }
  }

  const PLANT_PAINTERS = {
    perennial: flower,
    grass: grassClump,
    shrub: shrub,
    tree: tree,
    vine: vine,
    groundcover: groundcover,
    edible: edible,
  };

  window.SPRITES = {
    TILE,
    drawTerrain(ctx, type, x, y) {
      const img = window.ART && window.ART.tile(type);
      if (img) { ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE); return; }
      (TERRAIN[type] || TERRAIN.grass)(ctx, x, y);
    },
    drawPlant(ctx, plantDef, x, y, stage) {
      const img = window.ART && window.ART.plant(plantDef.id, stage);
      if (img) {
        if (plantDef.type === 'tree' && stage >= 2) {
          ctx.drawImage(img, (x - 1) * TILE, (y - 1.4) * TILE, TILE * 3, TILE * 3); // canopy overflow
        } else {
          ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE);
        }
        return;
      }
      PLANT_PAINTERS[plantDef.type](ctx, x, y, plantDef, stage);
    },
    drawFence,
    // small canvas swatch for the catalog list
    makeSwatch(plantDef) {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      c.className = 'plant-swatch';
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#6e4a2b';
      ctx.fillRect(0, 0, TILE, TILE);
      if (plantDef.type === 'tree') {
        px(ctx, 0, 0, 6, 9, 3, 6, '#5d3f24');
        px(ctx, 0, 0, 2, 1, 12, 8, shade(plantDef.color, 0.75));
        px(ctx, 0, 0, 3, 2, 10, 6, plantDef.color);
        px(ctx, 0, 0, 4, 3, 4, 2, shade(plantDef.color, 1.25));
        if (plantDef.bloom !== plantDef.color) px(ctx, 0, 0, 5, 4, 2, 2, plantDef.bloom);
      } else {
        PLANT_PAINTERS[plantDef.type](ctx, 0, 0, plantDef, 3);
      }
      return c;
    },
  };
})();
