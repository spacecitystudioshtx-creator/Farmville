// Optional image-art layer. If assets/art/manifest.json exists, listed images
// are preloaded and the renderer draws them instead of procedural sprites —
// per asset, so art can land incrementally (anything missing falls back to
// the built-in procedural art). File naming spec lives in ART_PIPELINE.md.
//
// manifest.json shape:
//   { "tiles": ["grass", "soil", "path", "driveway"],
//     "plants": { "turkscap": [0, 1, 2, 3], "liveoak": [1, 2] } }
// -> assets/art/tiles/<type>.png (32x32, seamless)
// -> assets/art/plants/<id>_s<stage>.png (32x32 transparent; trees 96x96)
window.ART = (function () {
  const cache = {};

  function load(key, url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { cache[key] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  return {
    async init(onReady) {
      try {
        const res = await fetch('assets/art/manifest.json', { cache: 'no-store' });
        if (res.ok) {
          const m = await res.json();
          const jobs = [];
          for (const t of m.tiles || []) jobs.push(load('tiles/' + t, `assets/art/tiles/${t}.png`));
          for (const [id, stages] of Object.entries(m.plants || {}))
            for (const s of stages) jobs.push(load(`plants/${id}/${s}`, `assets/art/plants/${id}_s${s}.png`));
          await Promise.allSettled(jobs);
        }
      } catch (e) { /* no manifest -> procedural art only */ }
      if (onReady) onReady();
    },
    tile(type) { return cache['tiles/' + type] || null; },
    // nearest available stage at or below the requested one
    plant(id, stage) {
      for (let s = stage; s >= 0; s--) if (cache[`plants/${id}/${s}`]) return cache[`plants/${id}/${s}`];
      return null;
    },
  };
})();
