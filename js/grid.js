// Yard model: terrain grid + planted plants, persistence, growth stages.
(function () {
  const { gridW: W, gridH: H, storageKey } = window.SITE;

  const state = {
    terrain: [],          // H rows of W terrain codes
    plants: {},           // "x,y" -> { id, planted: 'YYYY-MM-DD', lastWatered: 'YYYY-MM-DD'|null }
  };

  function key(x, y) { return x + ',' + y; }

  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((Date.now() - new Date(dateStr + 'T12:00:00')) / 86400000);
  }

  // Starter layout approximating a Willow Meadows ranch lot:
  // street at the bottom, house + garage mid-lot, driveway on the right,
  // front foundation beds, back patio, veggie beds in the back corner.
  function buildDefaultLayout() {
    state.terrain = Array.from({ length: H }, () => Array(W).fill('grass'));
    state.plants = {};

    const fill = (type, x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) state.terrain[y][x] = type;
    };

    fill('house', 7, 9, 22, 15);      // main house
    fill('house', 22, 11, 27, 15);    // attached garage
    fill('driveway', 23, 16, 26, 25); // driveway to street
    fill('path', 14, 16, 14, 25);     // front walk
    fill('soil', 8, 16, 13, 16);      // front bed, left of walk
    fill('soil', 15, 16, 22, 16);     // front bed, right of walk
    fill('path', 16, 7, 22, 8);       // back patio
    fill('soil', 30, 1, 38, 3);       // back veggie beds

    // Existing plantings (mature): the trees a 1960s Willow Meadows lot
    // almost certainly has, plus a few natives to show off the sprites.
    const est = (x, y, id, yearsOld) => {
      state.plants[key(x, y)] = { id, planted: todayStr(-yearsOld * 365), lastWatered: null };
    };
    est(4, 3, 'pecan', 30);
    est(32, 20, 'liveoak', 30);
    est(2, 18, 'yaupon', 10);
    est(8, 16, 'turkscap', 2);
    est(9, 16, 'turkscap', 2);
    est(21, 16, 'gcmuhly', 2);
    est(22, 16, 'gcmuhly', 2);
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: 1, terrain: state.terrain, plants: state.plants }));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.terrain || data.terrain.length !== H) return false;
      state.terrain = data.terrain;
      state.plants = data.plants || {};
      return true;
    } catch (e) { return false; }
  }

  // Growth stage from real elapsed time vs. establishment period.
  // 0 sprout, 1 young, 2 mature, 3 mature + currently blooming
  function growthStage(rec) {
    const p = window.PLANT_BY_ID[rec.id];
    const age = daysSince(rec.planted);
    const t = age / p.establishDays;
    let stage = t < 0.25 ? 0 : t < 1 ? 1 : 2;
    if (stage === 2 && p.bloomMonths.includes(new Date().getMonth() + 1)) stage = 3;
    return stage;
  }

  const plantableTerrain = { soil: true, grass: true };

  window.YARD = {
    W, H, state, key, todayStr, daysSince, growthStage,
    buildDefaultLayout, save, load,
    terrainAt(x, y) { return state.terrain[y] && state.terrain[y][x]; },
    plantAt(x, y) { return state.plants[key(x, y)]; },
    canPlantAt(x, y) { return plantableTerrain[this.terrainAt(x, y)] && !this.plantAt(x, y); },
    setTerrain(x, y, type) {
      state.terrain[y][x] = type;
      if (!plantableTerrain[type]) delete state.plants[key(x, y)];
    },
    addPlant(x, y, id) {
      state.plants[key(x, y)] = { id, planted: todayStr(), lastWatered: todayStr() };
    },
    removePlant(x, y) { delete state.plants[key(x, y)]; },
    waterPlant(x, y) {
      const rec = this.plantAt(x, y);
      if (rec) rec.lastWatered = todayStr();
    },
    allPlants() {
      return Object.entries(state.plants).map(([k, rec]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, rec, def: window.PLANT_BY_ID[rec.id] };
      });
    },
  };
})();
