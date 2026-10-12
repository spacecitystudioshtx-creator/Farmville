// Yard model: terrain grid, planted plants, journal, shade, persistence, undo.
(function () {
  const { gridW: W, gridH: H, storageKey } = window.SITE;

  const state = {
    terrain: [],   // H rows of W terrain codes
    plants: {},    // "x,y" -> { id, planted, lastWatered, notes:[], harvests:[] }
    journal: [],   // newest last: { date, type, plantId, key, text }
    lost: [],      // plants marked as died: { id, planted, died, cause }
    home: null,    // house style + builder plan, see HOME_DEFAULT
    fences: {},    // "x,y" -> 1: fence pieces the player built
  };

  // House look (drawn by SPRITES.drawHouses) and the builder's plan: which
  // preset shape sits where, and the tiles it set (so moving it can put the
  // lawn back). A painted house has plan null.
  // facing: compass direction the front door faces (sets where the sun and shadows fall)
  const HOME_DEFAULT = { wall: 'brick', roof: 'gray', door: 'wood', stories: 1, chimney: false, boxes: '', pots: false, facing: 'S', plan: null };
  function normalizeHome(h) {
    if (!h) { // saves from before houses lived in the garden: take the old UI prefs
      h = {};
      try {
        const p = JSON.parse(localStorage.getItem('gardenstar-ui-v1') || '{}');
        if (p.houseWall) h.wall = p.houseWall;
        if (p.houseRoof) h.roof = p.houseRoof;
      } catch (e) { /* private mode */ }
    }
    return Object.assign({}, HOME_DEFAULT, h);
  }

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
    state.home = normalizeHome({});
    state.fences = {};
  }

  // ---------- lot shapes ----------
  // A preset marks what isn't yours: 'street' (road + sidewalk out front) and
  // 'offlot' (the neighbors). Everything else starts as lawn.
  const STREET = 2;           // rows of street along the bottom
  const FRONT = H - STREET;   // first street row
  const LOTS = {
    standard: { name: 'Standard', desc: 'A rectangle with the street out front', inLot: () => true },
    corner: { name: 'Corner lot', desc: 'Streets along the front and one side', side: true, inLot: () => true },
    culdesac: {
      name: 'Cul-de-sac', desc: 'Pie-shaped: narrow at the street, wide in back',
      inLot: (x, y) => Math.abs(x + 0.5 - W / 2) <= (W / 2) * (1 - 0.5 * y / (FRONT - 1)),
    },
    narrow: { name: 'Narrow and deep', desc: 'A city lot, half as wide', inLot: x => x >= 10 && x < 30 },
    wide: { name: 'Wide and shallow', desc: 'Lots of frontage, a small back yard', inLot: (x, y) => y >= 9 },
    angled: { name: 'Angled back', desc: 'The back fence runs on a slant', inLot: (x, y) => y >= Math.round(10 * (1 - x / (W - 1))) },
    draw: { name: 'Draw my own', desc: 'Start empty and drag out your lot', inLot: () => false },
  };
  function lotTerrain(id, x, y) {
    const lot = LOTS[id] || LOTS.standard;
    if (y >= FRONT || (lot.side && x >= W - STREET)) return 'street';
    return lot.inLot(x, y) ? 'grass' : 'offlot';
  }
  function applyLot(id) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) state.terrain[y][x] = lotTerrain(id, x, y);
    state.plants = {};
    state.fences = {};
  }

  // ---------- house builder ----------
  // Preset footprints, front wall at the bottom. rects are [x, y, w, h] from
  // the plan origin; door is the column the front walk leaves from.
  const HOUSE_SHAPES = {
    cottage: { name: 'Cottage', rects: [[0, 0, 10, 5]], door: 4 },
    ranch: { name: 'Ranch', rects: [[0, 0, 16, 7]], door: 7 },
    lshape: { name: 'L-shape', rects: [[0, 0, 16, 5], [0, 5, 6, 3]], door: 9 },
    courtyard: { name: 'Courtyard', rects: [[0, 0, 18, 5], [0, 5, 5, 3], [13, 5, 5, 3]], door: 8 },
    split: { name: 'Split', rects: [[0, 0, 9, 7], [9, 1, 8, 5]], door: 4 },
  };
  const GARAGE_W = 6, GARAGE_D = 5;

  // garage rect beside the shape, its front flush with that side's front wall
  function footprint(plan) {
    const sh = HOUSE_SHAPES[plan.shape] || HOUSE_SHAPES.ranch;
    const rects = sh.rects.slice();
    const right = Math.max(...rects.map(r => r[0] + r[2]));
    let garage = null;
    if (plan.garage === 'left' || plan.garage === 'right') {
      const edge = plan.garage === 'left' ? rects.filter(r => r[0] === 0) : rects.filter(r => r[0] + r[2] === right);
      const front = Math.max(...edge.map(r => r[1] + r[3]));
      garage = [plan.garage === 'left' ? -GARAGE_W : right, front - GARAGE_D, GARAGE_W, GARAGE_D];
      rects.push(garage);
    }
    const x0 = Math.min(...rects.map(r => r[0])), y0 = Math.min(...rects.map(r => r[1]));
    const x1 = Math.max(...rects.map(r => r[0] + r[2])), y1 = Math.max(...rects.map(r => r[1] + r[3]));
    return { sh, rects, garage, box: [x0, y0, x1 - x0, y1 - y0] };
  }

  // house, driveway (from the garage to the street) and front walk tiles
  function planTiles(plan) {
    const fp = footprint(plan);
    const house = new Set(), out = [];
    const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    for (const [rx, ry, rw, rh] of fp.rects)
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
        const k = key(plan.x + x, plan.y + y);
        if (!house.has(k) && inMap(plan.x + x, plan.y + y)) { house.add(k); out.push([plan.x + x, plan.y + y, 'house']); }
      }
    const toStreet = (x, y, type, stopAt) => {
      for (; inMap(x, y) && state.terrain[y][x] !== 'street' && !house.has(key(x, y)); y++) {
        if (stopAt && stopAt.has(key(x, y))) break;
        out.push([x, y, type]);
      }
    };
    const drive = new Set();
    if (fp.garage) {
      const [gx, gy, , gh] = fp.garage;
      for (let i = 1; i <= 4; i++) {
        const x = plan.x + gx + i, y = plan.y + gy + gh;
        const before = out.length;
        toStreet(x, y, 'driveway');
        for (let j = before; j < out.length; j++) drive.add(key(out[j][0], out[j][1]));
      }
    }
    const dx = plan.x + fp.sh.door;
    let dy = plan.y;
    while (house.has(key(dx, dy))) dy++;
    toStreet(dx, dy, 'path', drive);
    return out;
  }

  function stampHome(plan) {
    const home = state.home;
    const prev = home.plan;
    if (prev && prev.tiles) { // put back what the last stamp covered, unless repainted since
      for (const [k, [was, set]] of Object.entries(prev.tiles)) {
        const [x, y] = k.split(',').map(Number);
        if (state.terrain[y] && state.terrain[y][x] === set) state.terrain[y][x] = was;
      }
    } else { // first build replaces a painted house
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (state.terrain[y][x] === 'house') state.terrain[y][x] = 'grass';
    }
    const tiles = {};
    for (const [x, y, type] of planTiles(plan)) {
      const k = key(x, y);
      if (!tiles[k]) tiles[k] = [state.terrain[y][x], type];
      else tiles[k][1] = type;
      state.terrain[y][x] = type;
      delete state.plants[k];
      delete state.fences[k];
    }
    home.plan = { shape: plan.shape, garage: plan.garage, x: plan.x, y: plan.y, tiles };
  }

  // plants a stamp would cover (the builder refuses rather than bulldoze them)
  function planConflicts(plan) {
    return planTiles(plan).filter(([x, y]) => state.plants[key(x, y)]).map(([x, y]) => key(x, y))
      .filter((k, i, a) => a.indexOf(k) === i);
  }

  // centered on the lot, front wall ~7 tiles (21 ft) back from the street
  // (or from the front of a lot drawn short of it)
  function defaultPlan(shape, garage) {
    const fp = footprint({ shape, garage });
    const [bx, by, bw, bh] = fp.box;
    let l = W, r = -1, t = H, b = -1, street = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = state.terrain[y][x];
      if (v === 'street') { if (x === Math.floor(W / 2)) street = Math.min(street, y); continue; }
      if (v === 'offlot') continue;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    if (r < 0) { l = 0; r = W - 1; t = 0; b = street - 1; }
    const front = Math.max(t + bh, Math.min(street - 8, b - 5));
    const x = Math.round((l + r + 1) / 2 - bw / 2) - bx;
    return clampPlan({ shape, garage, x, y: front - bh - by });
  }
  function clampPlan(plan) {
    const [bx, by, bw, bh] = footprint(plan).box;
    plan.x = Math.max(1 - bx, Math.min(W - 1 - bw - bx, plan.x));
    plan.y = Math.max(1 - by, Math.min(H - 3 - bh - by, plan.y));
    return plan;
  }

  // Starter layout approximating a Willow Meadows ranch lot:
  // street at the bottom, house + garage mid-lot, driveway on the right,
  // front foundation beds, back patio, veggie beds in the back corner.
  function buildDefaultLayout() {
    emptyLot();
    applyLot('standard');
    const fill = (type, x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) state.terrain[y][x] = type;
    };
    stampHome({ shape: 'ranch', garage: 'right', x: 7, y: 9 });
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
    return JSON.stringify({ v: 2, terrain: state.terrain, plants: state.plants, journal: state.journal, lost: state.lost, home: state.home, fences: state.fences });
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
    state.home = normalizeHome(data.home);
    state.fences = data.fences || {};
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

  // 'full' | 'part' | 'shade', plus what casts it. With sun.js loaded this is
  // traced from the real sun path; the fallback below only knows tree canopies.
  function sunAt(x, y) {
    if (window.SUN) return window.SUN.at(x, y);
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
    LOTS, HOUSE_SHAPES, applyLot, lotTerrain, footprint, stampHome, planConflicts, defaultPlan, clampPlan,
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
    inLot(x, y) { const t = this.terrainAt(x, y); return t != null && t !== 'offlot' && t !== 'street'; },
    canPlantAt(x, y) { return this.isPlantable(x, y) && !this.plantAt(x, y) && !this.fenceAt(x, y); },
    // never paves over a plant: returns 'blocked' so the brush can say so
    setTerrain(x, y, type) {
      if (state.terrain[y][x] === type) return false;
      if (!plantableTerrain[type] && state.plants[key(x, y)]) return 'blocked';
      state.terrain[y][x] = type;
      if (type === 'house' || type === 'street') delete state.fences[key(x, y)];
      return true;
    },
    fenceAt(x, y) { return !!state.fences[key(x, y)]; },
    setFence(x, y, on) {
      const k = key(x, y);
      if (!!state.fences[k] === on) return false;
      if (on && state.plants[k]) return 'blocked';
      if (on && (!this.inLot(x, y) || state.terrain[y][x] === 'house')) return false;
      if (on) state.fences[k] = 1; else delete state.fences[k];
      return true;
    },
    // moves a plant with its whole history (planted date, notes, harvests)
    movePlant(from, to) {
      const rec = this.plantAt(from.x, from.y);
      if (!rec || !this.canPlantAt(to.x, to.y) || !this.inLot(to.x, to.y)) return false;
      delete state.plants[key(from.x, from.y)];
      state.plants[key(to.x, to.y)] = rec;
      this.log('moved', rec.id, key(to.x, to.y));
      return true;
    },
    addPlant(x, y, id) {
      state.plants[key(x, y)] = newRecord(id, todayStr(), todayStr());
      // out-of-season plantings never count toward rewards (the one rule)
      if (!window.PLANT_BY_ID[id].plantMonths.includes(new Date().getMonth() + 1)) state.plants[key(x, y)].offSeason = true;
      this.log('planted', id, key(x, y));
    },
    // a plant that already grows in the yard: full-grown, rain-fed, no history of planting
    addExisting(x, y, id) {
      const def = window.PLANT_BY_ID[id];
      state.plants[key(x, y)] = newRecord(id, todayStr(-Math.max(400, def.establishDays + 30)), null);
      this.log('added', id, key(x, y));
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
