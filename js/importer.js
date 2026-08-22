// Garden import/export. Two accepted formats:
// 1. The app's own save format: {v:1, terrain:[[...]], plants:{"x,y":{...}}}
// 2. The Claude-interview layout format (see GARDEN_INTERVIEW.md):
//    { format:"cliffwood-garden-v1",
//      terrain:[{type,rect:[x,y,w,h]}...],   // painted in order over all-grass
//      plants:[{name,x,y,age_days?,count_along?}...] }
(function () {
  const Y = () => window.YARD;

  const TERRAIN_TYPES = { grass: 1, soil: 1, path: 1, driveway: 1, house: 1 };

  function matchPlant(name) {
    const q = String(name).toLowerCase().trim();
    let p = window.PLANTS.find(pl => pl.id === q)
      || window.PLANTS.find(pl => pl.name.toLowerCase() === q)
      || window.PLANTS.find(pl => pl.name.toLowerCase().includes(q) || q.includes(pl.name.toLowerCase()))
      || window.PLANTS.find(pl => pl.botanical.toLowerCase().includes(q));
    return p || null;
  }

  function applyLayoutSpec(data) {
    const yard = Y();
    const { W, H } = yard;
    const skipped = [];

    yard.state.terrain = Array.from({ length: H }, () => Array(W).fill('grass'));
    yard.state.plants = {};

    for (const f of data.terrain || []) {
      if (!TERRAIN_TYPES[f.type] || !Array.isArray(f.rect)) { skipped.push('terrain:' + JSON.stringify(f.type)); continue; }
      const [x, y, w, h] = f.rect.map(Number);
      for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
        for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++)
          yard.state.terrain[yy][xx] = f.type;
    }

    let planted = 0;
    for (const pl of data.plants || []) {
      const def = matchPlant(pl.name || pl.id);
      if (!def) { skipped.push('plant:"' + (pl.name || pl.id) + '"'); continue; }
      const ageDays = Number(pl.age_days) || 0;
      const count = Math.max(1, Math.min(20, Number(pl.count_along) || 1));
      for (let i = 0; i < count; i++) {
        const x = Math.max(0, Math.min(yard.W - 1, Number(pl.x) + i * (pl.direction === 'down' ? 0 : 1)));
        const y = Math.max(0, Math.min(yard.H - 1, Number(pl.y) + i * (pl.direction === 'down' ? 1 : 0)));
        if (yard.plantAt(x, y)) continue;
        const t = yard.terrainAt(x, y);
        if (t !== 'soil' && t !== 'grass') continue;
        yard.state.plants[yard.key(x, y)] = {
          id: def.id,
          planted: yard.todayStr(-ageDays),
          lastWatered: ageDays > def.establishDays ? null : yard.todayStr(),
        };
        planted++;
      }
    }
    return { ok: true, message: `Imported: ${planted} plantings placed.` + (skipped.length ? ` Skipped: ${skipped.join(', ')}` : '') };
  }

  window.IMPORTER = {
    exportText() {
      const s = Y().state;
      return JSON.stringify({ v: 1, terrain: s.terrain, plants: s.plants }, null, 1);
    },
    importText(text) {
      let data;
      try { data = JSON.parse(text); } catch (e) { return { ok: false, message: 'Not valid JSON: ' + e.message }; }
      try {
        if (data && data.format === 'cliffwood-garden-v1') return applyLayoutSpec(data);
        if (data && data.v === 1 && Array.isArray(data.terrain) && data.terrain.length === Y().H) {
          Y().state.terrain = data.terrain;
          Y().state.plants = data.plants || {};
          return { ok: true, message: 'Save file restored.' };
        }
        return { ok: false, message: 'Unrecognized format — expected "cliffwood-garden-v1" or an app save file.' };
      } catch (e) {
        return { ok: false, message: 'Import failed: ' + e.message };
      }
    },
  };
})();
