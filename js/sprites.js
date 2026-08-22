// 8-bit rendering: each tile is 8x8 "fat pixels". All drawing is procedural
// fillRect so we need no image assets.
(function () {
  const TILE = 24;      // canvas px per tile
  const P = TILE / 8;   // one fat pixel

  // deterministic per-tile randomness so textures don't shimmer between frames
  function hash(x, y, salt) {
    let h = (x * 73856093) ^ (y * 19349663) ^ ((salt || 0) * 83492791);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function px(ctx, tx, ty, ix, iy, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(tx * TILE + ix * P, ty * TILE + iy * P, (w || 1) * P, (h || 1) * P);
  }

  // ---------- terrain ----------
  const TERRAIN = {
    grass(ctx, x, y) {
      px(ctx, x, y, 0, 0, 8, 8, hash(x, y, 1) < 0.5 ? '#6aa84f' : '#63a04a');
      for (let i = 0; i < 4; i++) {
        const gx = Math.floor(hash(x, y, 10 + i) * 8);
        const gy = Math.floor(hash(x, y, 20 + i) * 8);
        px(ctx, x, y, gx, gy, 1, 1, '#578f41');
      }
      if (hash(x, y, 3) < 0.08) px(ctx, x, y, 3, 3, 1, 1, '#8fc46a'); // odd bright blade
    },
    soil(ctx, x, y) {
      px(ctx, x, y, 0, 0, 8, 8, '#6b4a2c');
      for (let r = 1; r < 8; r += 3) px(ctx, x, y, 0, r, 8, 1, '#5d3f24'); // furrows
      for (let i = 0; i < 3; i++) {
        const gx = Math.floor(hash(x, y, 30 + i) * 8);
        const gy = Math.floor(hash(x, y, 40 + i) * 8);
        px(ctx, x, y, gx, gy, 1, 1, '#7d5a38');
      }
    },
    path(ctx, x, y) {
      px(ctx, x, y, 0, 0, 8, 8, '#b8b2a4');
      px(ctx, x, y, 0, 0, 8, 1, '#c6c0b2');
      // paver joints
      px(ctx, x, y, (x % 2) * 4, 0, 1, 8, '#9a947f');
      px(ctx, x, y, 0, 4, 8, 1, '#9a947f');
    },
    driveway(ctx, x, y) {
      px(ctx, x, y, 0, 0, 8, 8, '#8f8f8f');
      if (hash(x, y, 5) < 0.3) px(ctx, x, y, Math.floor(hash(x, y, 6) * 7), Math.floor(hash(x, y, 7) * 7), 2, 1, '#7f7f7f');
      if (y % 4 === 0) px(ctx, x, y, 0, 0, 8, 1, '#7a7a7a'); // expansion joints
    },
    house(ctx, x, y) {
      px(ctx, x, y, 0, 0, 8, 8, '#8a4a3a');           // shingle base
      px(ctx, x, y, 0, (y % 2) * 4, 8, 1, '#733c2e'); // shingle rows
      px(ctx, x, y, 0, (y % 2) * 4 + 2, 8, 1, '#9a5644');
      px(ctx, x, y, (x % 3) * 3, 1, 1, 2, '#733c2e');
    },
  };

  // ---------- plant sprites ----------
  // stage: 0 sprout, 1 young, 2 mature, 3 mature+blooming
  function sprout(ctx, x, y, color) {
    px(ctx, x, y, 3, 5, 1, 2, color);
    px(ctx, x, y, 2, 4, 1, 1, color);
    px(ctx, x, y, 4, 4, 1, 1, color);
  }

  function flower(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color, b = p.bloom;
    px(ctx, x, y, 3, 3, 2, 4, c);                    // stems
    px(ctx, x, y, 1, 4, 2, 1, c); px(ctx, x, y, 5, 4, 2, 1, c); // leaves
    if (stage >= 2) { px(ctx, x, y, 2, 2, 4, 2, c); }
    if (stage === 3) {                                // bloom cluster
      px(ctx, x, y, 2, 1, 2, 2, b);
      px(ctx, x, y, 5, 2, 2, 2, b);
      px(ctx, x, y, 3, 0, 2, 1, b);
      px(ctx, x, y, 1, 3, 1, 1, b);
    }
  }

  function grassClump(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color;
    for (let i = 0; i < 5; i++) {
      const bx = 1 + i * 1.3;
      px(ctx, x, y, Math.round(bx), 2 + (i % 2), 1, 5 - (i % 2), c);
    }
    px(ctx, x, y, 0, 5, 8, 2, c);
    if (stage === 3) { // seed-head haze
      px(ctx, x, y, 1, 0, 2, 2, p.bloom);
      px(ctx, x, y, 4, 1, 3, 1, p.bloom);
      px(ctx, x, y, 6, 0, 1, 2, p.bloom);
    }
  }

  function shrub(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color;
    if (stage === 1) { px(ctx, x, y, 2, 3, 4, 4, c); px(ctx, x, y, 3, 2, 2, 1, c); return; }
    px(ctx, x, y, 1, 2, 6, 5, c);
    px(ctx, x, y, 2, 1, 4, 1, c);
    px(ctx, x, y, 0, 4, 8, 2, c);
    px(ctx, x, y, 2, 3, 1, 1, '#ffffff22');
    if (stage === 3) {
      px(ctx, x, y, 2, 2, 1, 1, p.bloom); px(ctx, x, y, 5, 3, 1, 1, p.bloom);
      px(ctx, x, y, 3, 5, 1, 1, p.bloom); px(ctx, x, y, 6, 5, 1, 1, p.bloom);
      px(ctx, x, y, 1, 4, 1, 1, p.bloom);
    }
  }

  function tree(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    if (stage === 1) { // sapling
      px(ctx, x, y, 3, 4, 2, 4, '#6b4a2c');
      px(ctx, x, y, 2, 1, 4, 4, p.color);
      return;
    }
    // mature: canopy spills over neighbors (drawn in a second pass, so it layers)
    const T = TILE, cx = x * T + T / 2, cy = y * T + T / 2;
    ctx.fillStyle = '#5d3f24';
    ctx.fillRect(cx - P, cy, P * 2, T);                        // trunk
    const c = p.color;
    ctx.fillStyle = c;
    ctx.fillRect(cx - T * 1.2, cy - T * 0.9, T * 2.4, T * 1.3); // canopy block
    ctx.fillRect(cx - T * 0.8, cy - T * 1.3, T * 1.6, T * 0.6);
    ctx.fillStyle = '#ffffff18';
    ctx.fillRect(cx - T * 0.9, cy - T * 1.1, T * 0.7, P);       // highlight
    if (stage === 3 && p.bloom !== p.color) {
      ctx.fillStyle = p.bloom;
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(cx - T + hash(x, y, 60 + i) * T * 2, cy - T * 1.2 + hash(x, y, 70 + i) * T, P, P);
      }
    }
  }

  function vine(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color;
    px(ctx, x, y, 1, 0, 1, 8, '#8a7a5a'); px(ctx, x, y, 6, 0, 1, 8, '#8a7a5a'); // trellis
    px(ctx, x, y, 1, 2, 6, 1, c);
    px(ctx, x, y, 2, 0, 1, 6, c); px(ctx, x, y, 5, 1, 1, 6, c);
    if (stage >= 2) px(ctx, x, y, 1, 4, 6, 1, c);
    if (stage === 3) { px(ctx, x, y, 2, 1, 1, 1, p.bloom); px(ctx, x, y, 5, 3, 1, 1, p.bloom); px(ctx, x, y, 3, 5, 1, 1, p.bloom); }
  }

  function groundcover(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, p.color);
    const c = p.color;
    px(ctx, x, y, 0, 5, 8, 3, c);
    px(ctx, x, y, 1, 4, 2, 1, c); px(ctx, x, y, 4, 4, 3, 1, c);
    if (stage === 3) { px(ctx, x, y, 2, 5, 1, 1, p.bloom); px(ctx, x, y, 5, 6, 1, 1, p.bloom); px(ctx, x, y, 7, 5, 1, 1, p.bloom); }
  }

  function edible(ctx, x, y, p, stage) {
    if (stage === 0) return sprout(ctx, x, y, '#7ec850');
    const c = p.color;
    px(ctx, x, y, 2, 3, 1, 4, c); px(ctx, x, y, 5, 3, 1, 4, c); // two plants per tile
    px(ctx, x, y, 1, 2, 3, 2, c); px(ctx, x, y, 4, 2, 3, 2, c);
    if (stage >= 2) { px(ctx, x, y, 1, 4, 3, 1, c); px(ctx, x, y, 4, 4, 3, 1, c); }
    if (stage === 3 && p.bloom !== p.color) { // "fruit"
      px(ctx, x, y, 2, 3, 1, 1, p.bloom); px(ctx, x, y, 5, 4, 1, 1, p.bloom); px(ctx, x, y, 3, 2, 1, 1, p.bloom);
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
    drawTerrain(ctx, type, x, y) { (TERRAIN[type] || TERRAIN.grass)(ctx, x, y); },
    drawPlant(ctx, plantDef, x, y, stage) { PLANT_PAINTERS[plantDef.type](ctx, x, y, plantDef, stage); },
    // small canvas swatch for the catalog list
    makeSwatch(plantDef) {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      c.className = 'plant-swatch';
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#6b4a2c';
      ctx.fillRect(0, 0, TILE, TILE);
      if (plantDef.type === 'tree') {
        // trees overflow their tile; draw a contained mini version
        px(ctx, 0, 0, 3, 4, 2, 4, '#5d3f24');
        px(ctx, 0, 0, 1, 0, 6, 4, plantDef.color);
        if (plantDef.bloom !== plantDef.color) px(ctx, 0, 0, 2, 1, 1, 1, plantDef.bloom);
      } else {
        PLANT_PAINTERS[plantDef.type](ctx, 0, 0, plantDef, 3);
      }
      return c;
    },
  };
})();
