// Yard model: terrain grid, planted plants, journal, shade, persistence, undo.
(function () {
  const { gridW: W, gridH: H, storageKey } = window.SITE;

  const state = {
    terrain: [],   // H rows of W terrain codes
    plants: {},    // "x,y" -> { id, planted, lastWatered, notes:[], harvests:[] }
    journal: [],   // newest last: { date, type, plantId, key, text }
    lost: [],      // plants marked as died: { id, planted, died, cause }
  };

  function key(x, y) { return x + ',' + y; }

  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    const [y, m, d] = dateStr.split('-').map(Number);
    const then = new Date(y, m - 1, d);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((now - then) / 86400000);
  }

  function emptyLot() {
    state.terrain = Array.from({ length: H }, () => Array(W).fill('grass'));
    state.plants = {};
    state.journal = [];
    state.lost = [];
  }

  // Starter layout approximating a Willow Meadows ranch lot:
  // street at the bottom, house + garage mid-lot, driveway on the right,
  // front foundation beds, back patio, veggie beds in the back corner.
  function buildDefaultLayout() {
    emptyLot();
    const fill = (type, x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) state.terrain[y][x] = type;
    };
    fill('house', 7, 9, 22, 15);
    fill('house', 22, 11, 27, 15);
    fill('driveway', 23, 16, 26, 25);
    fill('path', 14, 16, 14, 25);
    fill('soil', 8, 16, 13, 16);
    fill('soil', 15, 16, 22, 16);
    fill('path', 16, 7, 22, 8);
    fill('soil', 30, 1, 38, 3);

    const est = (x, y, id, yearsOld) => {
      state.plants[key(x, y)] = newRecord(id, todayStr(-Math.round(yearsOld * 365)), null);
    };
    est(4, 3, 'pecan', 30);
    est(32, 20, 'liveoak', 30);
    est(2, 18, 'yaupon', 10);
    est(8, 16, 'turkscap', 2);
    est(9, 16, 'turkscap', 2);
    est(21, 16, 'gcmuhly', 2);
    est(22, 16, 'gcmuhly', 2);
  }

  function newRecord(id, planted, lastWatered) {
    return { id, planted, lastWatered, notes: [], harvests: [] };
  }

  function normalize(rec) {
    rec.notes = rec.notes || [];
    rec.harvests = rec.harvests || [];
    if (rec.lastWatered === undefined) rec.lastWatered = null;
    return rec;
  }

  function serialize() {
    return JSON.stringify({ v: 2, terrain: state.terrain, plants: state.plants, journal: state.journal, lost: state.lost });
  }

  function restore(data) {
    state.terrain = data.terrain;
    state.plants = data.plants || {};
    for (const k of Object.keys(state.plants)) {
      if (!window.PLANT_BY_ID[state.plants[k].id]) delete state.plants[k];
      else normalize(state.plants[k]);
    }
    state.journal = data.journal || [];
    state.lost = data.lost || [];
  }

  function save() {
    try { localStorage.setItem(storageKey, serialize()); return true; } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.terrain || data.terrain.length !== H) return false;
      restore(data);
      return true;
    } catch (e) { return false; }
  }

  // Growth stage from real elapsed time vs. establishment period.
  // 0 sprout, 1 young, 2 mature, 3 mature + currently blooming
  function growthStage(rec) {
    const p = window.PLANT_BY_ID[rec.id];
    const t = daysSince(rec.planted) / p.establishDays;
    let stage = t < 0.25 ? 0 : t < 1 ? 1 : 2;
    if (stage === 2 && p.bloomMonths.includes(new Date().getMonth() + 1)) stage = 3;
    return stage;
  }

  const STAGE_NAMES = ['Sprout', 'Establishing', 'Established', 'Blooming'];

  // Trees shade the tiles around them. Canopy radius scales with mature height
  // (a 45 ft live oak shades ~18 ft around its trunk) and is smaller while young.
  function canopyRadius(rec) {
    const p = window.PLANT_BY_ID[rec.id];
    if (p.type !== 'tree') return 0;
    const full = Math.min(6, Math.max(2, Math.round(p.heightFt * 0.4 / 3)));
    const stage = growthStage(rec);
    return stage === 0 ? 0 : stage === 1 ? 1 : full;
  }

  // 'full' | 'part' | 'shade', plus the tree casting it
  function sunAt(x, y) {
    let best = { level: 'full', by: null };
    for (const [k, rec] of Object.entries(state.plants)) {
      const r = canopyRadius(rec);
      if (!r) continue;
      const [tx, ty] = k.split(',').map(Number);
      if (tx === x && ty === y) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d <= r * 0.55) return { level: 'shade', by: rec };
      if (d <= r && best.level === 'full') best = { level: 'part', by: rec };
    }
    return best;
  }

  // ---------- undo ----------
  const undoStack = [];
  function checkpoint(extra) {
    undoStack.push({ garden: serialize(), extra: extra ? extra() : null });
    if (undoStack.length > 40) undoStack.shift();
  }

  const plantableTerrain = { soil: true, grass: true };

  window.YARD = {
    W, H, state, key, todayStr, daysSince, growthStage, STAGE_NAMES,
    buildDefaultLayout, emptyLot, save, load, serialize, restore, sunAt, canopyRadius,
    checkpoint,
    canUndo() { return undoStack.length > 0; },
    popUndo() {
      const snap = undoStack.pop();
      if (!snap) return null;
      restore(JSON.parse(snap.garden));
      return snap;
    },
    clearUndo() { undoStack.length = 0; },
    dropCheckpoint() { undoStack.pop(); },
    terrainAt(x, y) { return state.terrain[y] && state.terrain[y][x]; },
    plantAt(x, y) { return state.plants[key(x, y)]; },
    isPlantable(x, y) { return !!plantableTerrain[this.terrainAt(x, y)]; },
    canPlantAt(x, y) { return this.isPlantable(x, y) && !this.plantAt(x, y); },
    setTerrain(x, y, type) {
      if (state.terrain[y][x] === type) return false;
      state.terrain[y][x] = type;
      if (!plantableTerrain[type]) delete state.plants[key(x, y)];
      return true;
    },
    addPlant(x, y, id) {
      state.plants[key(x, y)] = newRecord(id, todayStr(), todayStr());
      this.log('planted', id, key(x, y));
    },
    removePlant(x, y) { delete state.plants[key(x, y)]; },
    markDied(x, y, cause) {
      const rec = this.plantAt(x, y);
      if (!rec) return;
      state.lost.push({ id: rec.id, planted: rec.planted, died: todayStr(), cause: cause || '' });
      this.log('died', rec.id, key(x, y), cause || '');
      delete state.plants[key(x, y)];
    },
    waterPlant(x, y) {
      const rec = this.plantAt(x, y);
      if (rec) rec.lastWatered = todayStr();
      return rec;
    },
    log(type, plantId, k, text) {
      state.journal.push({ date: todayStr(), type, plantId: plantId || null, key: k || null, text: text || '' });
      if (state.journal.length > 600) state.journal.splice(0, state.journal.length - 600);
    },
    allPlants() {
      return Object.entries(state.plants).map(([k, rec]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, key: k, rec, def: window.PLANT_BY_ID[rec.id] };
      });
    },
    houseTiles() {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.terrain[y][x] === 'house') out.push([x, y]);
      return out;
    },
  };
})();
