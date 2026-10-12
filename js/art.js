// Optional image-art layer. If assets/art/manifest.json exists, listed images
// are preloaded and the renderer draws them instead of procedural sprites —
// per asset, so art can land incrementally (anything missing falls back to
// the built-in procedural art). File naming spec lives in ART_PIPELINE.md.
//
// manifest.json shape:
//   { "credit": "Assets: ...",                       // shown in the footer
//     "tiles": ["grass", "soil", "path"],            // assets/art/tiles/<t>.png
//     "plants": { "turkscap": [2,3], "fac_tree": [2] },  // assets/art/plants/<id>_s<stage>.png
//     "extra": { "fence_h": "extra/fence_h.png", "house/roof": "extra/house_roof.png" } }
//
// Plants fall back through a FACSIMILE chain: exact species art first, then a
// generic sprite for the plant's category/bloom color (fac_*), then the
// procedural painter. So a handful of pack sprites covers the whole catalog.
window.ART = (function () {
  const cache = {};
  let credit = '';
  let plantScale = 1; // canvas px per sprite px: 1 for 32px art, 2 for 16px packs

  function load(key, url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { cache[key] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  // One atlas image, cut into a canvas per frame so the renderer can treat
  // every frame like a standalone image (drawImage + width/height).
  function loadAtlas(url, frames) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        for (const [key, [x, y, w, h]] of Object.entries(frames)) {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
          cache[key] = c;
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }
  let autotiles = new Set();
  let houseColors = [], houseColor = 'red';
  let variants = {};

  function bloomBucket(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 30) return 'yellow';               // whites/neutrals
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    h = (h * 60 + 360) % 360;
    if (h < 25 || h >= 335) return 'red';
    if (h < 75) return 'yellow';
    if (h < 180) return 'yellow';                    // greens read as foliage
    return 'pink';                                   // pinks, purples, blues
  }

  const SPECIAL = { blackeyedsusan: 'fac_sunflower', indianblanket: 'fac_sunflower' };
  const FRUITING = { falltomato: 1, pepper: 1, cucumber: 1, squash: 1, bushbeans: 1 };

  function candidates(def) {
    const c = [def.id];
    if (SPECIAL[def.id]) c.push(SPECIAL[def.id]);
    switch (def.type) {
      case 'perennial':
        c.push('fac_flower_' + bloomBucket(def.bloom), 'fac_flower_yellow');
        break;
      case 'grass': c.push('fac_grassclump'); break;
      case 'shrub':
        c.push(def.bloom !== def.color ? 'fac_bush_flowering' : 'fac_bush', 'fac_bush');
        break;
      case 'tree':
        c.push(def.bloomMonths.length ? 'fac_tree_flowering' : 'fac_tree', 'fac_tree');
        break;
      case 'vine': c.push('fac_bush_flowering', 'fac_bush'); break;
      case 'groundcover': c.push('fac_groundcover'); break;
      case 'edible': c.push(FRUITING[def.id] ? 'fac_crop_fruit' : 'fac_crop_leafy'); break;
    }
    return c;
  }

  return {
    async init(onReady) {
      try {
        const res = await fetch('assets/art/manifest.json', { cache: 'no-store' });
        if (res.ok) {
          const m = await res.json();
          credit = m.credit || '';
          plantScale = m.plantScale || 1;
          const jobs = [];
          if (m.atlas) jobs.push(loadAtlas('assets/art/' + m.atlas, m.frames || {}));
          autotiles = new Set(m.autotiles || []);
          variants = m.tileVariants || {};
          houseColors = m.houseColors || [];
          for (const t of m.tiles || []) jobs.push(load('tiles/' + t, `assets/art/tiles/${t}.png`));
          for (const [id, stages] of Object.entries(m.plants || {}))
            for (const s of stages) jobs.push(load(`plants/${id}/${s}`, `assets/art/plants/${id}_s${s}.png`));
          for (const [key, file] of Object.entries(m.extra || {}))
            jobs.push(load(key, 'assets/art/' + file));
          await Promise.allSettled(jobs);
        }
      } catch (e) { /* no manifest -> procedural art only */ }
      if (onReady) onReady();
    },
    get(key) { return cache[key] || null; },
    tile(type, x, y) {
      const v = variants[type];
      if (v && x != null) {
        // sparse variation: most tiles plain, every ~6th gets a decorated variant
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const pick = h % 6 === 0 ? v[1 + (h >> 3) % (v.length - 1)] : v[0];
        if (cache['tiles/' + pick]) return cache['tiles/' + pick];
      }
      return cache['tiles/' + type] || null;
    },
    // 48x48 (3x3 pieces) ground island for edge-aware terrain, or null
    autotile(type) { return autotiles.has(type) ? cache['auto/' + type] || null : null; },
    creditLine() { return credit; },
    houseColors() { return houseColors; },
    houseColor() { return houseColor; },
    setHouseColor(c) { if (houseColors.includes(c)) houseColor = c; },
    plantScale() { return plantScale; },
    // exact species art, then facsimiles, at the nearest available stage
    plant(id, stage) {
      const def = window.PLANT_BY_ID && window.PLANT_BY_ID[id];
      const cands = def ? candidates(def) : [id];
      if (stage === 0) cands.push('fac_sprout');
      for (const cid of cands)
        for (let s = stage; s >= 0; s--)
          if (cache[`plants/${cid}/${s}`]) return cache[`plants/${cid}/${s}`];
      return null;
    },
  };
})();
