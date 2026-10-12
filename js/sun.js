// Sun and shade for the real site: where the sun is (from the address's
// latitude/longitude), which way the lot faces (the front door's compass
// direction; the street is always at the bottom of the map), and what the
// house, fences and trees shade.
//
// Light levels are growing-season sun hours, the way gardeners count them:
// averaged over the spring equinox and the summer solstice, 6+ hours is full
// sun, 3-6 part shade, under 3 shade.
window.SUN = (function () {
  const rad = Math.PI / 180;
  const FACING = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const Y = () => window.YARD;

  // Solar elevation and azimuth (degrees; azimuth clockwise from north).
  // Low-precision almanac formulas: well under a degree, plenty for shadows.
  function position(date) {
    const S = window.SITE;
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = (23.439 - 0.0000004 * n) * rad;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const ha = (gmst + S.lon) * rad - ra;
    const lat = S.lat * rad;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    return { elevation: el / rad, azimuth: (az / rad + 360) % 360 };
  }

  const facing = () => FACING[(Y().state.home && Y().state.home.facing) || 'S'];
  // map vector (x right, y down) for a compass bearing: map-down is the way
  // the front door faces
  function mapVector(bearing) {
    const d = (bearing - facing()) * rad;
    return { x: -Math.sin(d), y: Math.cos(d) };
  }

  // Local clock time at the site, today (or on a given month/day)
  function siteDate(hour, month, day) {
    const now = new Date();
    const y = now.getFullYear(), m = month || now.getMonth() + 1, d = day || now.getDate();
    // Central time: UTC-5 in daylight time (Mar-Oct), UTC-6 otherwise. Close enough for shade.
    const off = m >= 3 && m <= 10 ? 5 : 6;
    return new Date(Date.UTC(y, m - 1, d, 0, 0) + (hour + off) * 3600000);
  }

  // ---------- what casts shade ----------
  // Per tile: { bot, top } in feet, and who it belongs to.
  function obstacles() {
    const yard = Y(), W = yard.W, H = yard.H, grid = new Array(W * H).fill(null);
    const home = yard.state.home || {};
    const houseFt = (home.stories || 1) >= 2 ? 24 : 14;
    const put = (x, y, bot, top, src) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x, c = grid[i];
      if (!c) grid[i] = { bot, top, src };
      else { c.bot = Math.min(c.bot, bot); if (top > c.top) { c.top = top; c.src = src; } }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (yard.terrainAt(x, y) === 'house') put(x, y, 0, houseFt, 'house');
      if (yard.fenceAt && yard.fenceAt(x, y)) put(x, y, 0, 6, 'fence');
    }
    let maxTop = houseFt;
    for (const p of yard.allPlants()) {
      if (p.def.type !== 'tree') continue;
      const r = yard.canopyRadius(p.rec) * 0.85;
      if (!r) continue;
      const h = p.def.heightFt * (yard.growthStage(p.rec) >= 2 ? 1 : 0.45);
      maxTop = Math.max(maxTop, h);
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++)
        if (Math.hypot(dx, dy) <= r) put(p.x + dx, p.y + dy, h * 0.15, h, p.key); // low, wide crowns (live oaks)
    }
    return { grid, W, H, maxTop };
  }

  // Is the sun blocked for tile (x, y)? Walks from the tile toward the sun.
  function blockedBy(ob, x, y, sun, toward) {
    const t = Math.tan(sun.elevation * rad), feet = window.SITE.tileFeet;
    const maxDist = ob.maxTop / t / feet;
    for (let s = 0.5; s <= maxDist; s += 0.75) {
      const cx = Math.round(x + toward.x * s), cy = Math.round(y + toward.y * s);
      if (cx < 0 || cy < 0 || cx >= ob.W || cy >= ob.H) return null;
      const c = ob.grid[cy * ob.W + cx];
      if (!c) continue;
      const h = s * feet * t;
      if (h >= c.bot && h <= c.top) return c.src;
    }
    return null;
  }

  // ---------- growing-season sun hours, cached ----------
  let cache = null, sigAt = 0, sig = '';
  function signature() {
    const yard = Y(), home = yard.state.home || {};
    let s = (home.facing || 'S') + (home.stories || 1);
    for (let y = 0; y < yard.H; y++) for (let x = 0; x < yard.W; x++) if (yard.terrainAt(x, y) === 'house') s += x * 97 + y + ',';
    s += '|' + Object.keys(yard.state.fences || {}).join(';');
    for (const p of yard.allPlants()) if (p.def.type === 'tree') s += '|' + p.key + p.def.id + yard.growthStage(p.rec);
    return s;
  }
  function compute() {
    const yard = Y(), ob = obstacles();
    const hours = new Float32Array(yard.W * yard.H), by = new Array(yard.W * yard.H).fill(null);
    const days = [[3, 20], [6, 21]];
    const counts = new Array(yard.W * yard.H);
    for (const [m, d] of days) {
      for (let hr = 5.5; hr <= 20.5; hr += 1) {
        const sun = position(siteDate(hr, m, d));
        if (sun.elevation < 8) continue;
        const toward = mapVector(sun.azimuth);
        for (let y = 0; y < yard.H; y++) for (let x = 0; x < yard.W; x++) {
          const i = y * yard.W + x, src = blockedBy(ob, x, y, sun, toward);
          if (!src) hours[i] += 1 / days.length;
          else (counts[i] = counts[i] || {})[src] = ((counts[i] || {})[src] || 0) + 1;
        }
      }
    }
    for (let i = 0; i < counts.length; i++) if (counts[i]) by[i] = Object.entries(counts[i]).sort((a, b) => b[1] - a[1])[0][0];
    return { hours, by, W: yard.W };
  }
  function grid() {
    const now = Date.now();
    if (!cache || now - sigAt > 250) {
      const s = signature();
      sigAt = now;
      if (!cache || s !== sig) { sig = s; cache = compute(); }
    }
    return cache;
  }

  // { level: 'full'|'part'|'shade', hours, by: 'house'|'fence'|<tree rec>|null }
  function at(x, y) {
    const g = grid(), i = y * g.W + x, hours = g.hours[i];
    const src = g.by[i];
    const by = src === 'house' || src === 'fence' || !src ? src : Y().state.plants[src] || null;
    return { level: hours >= 6 ? 'full' : hours >= 3 ? 'part' : 'shade', hours, by };
  }

  // ---------- shadows on the map right now (or at a chosen hour) ----------
  function shadowsAt(hour) {
    const now = new Date();
    const sun = position(hour == null ? now : siteDate(hour));
    if (sun.elevation < 4) return null;
    const away = mapVector((sun.azimuth + 180) % 360);
    const perFoot = 1 / Math.tan(sun.elevation * rad) / window.SITE.tileFeet; // tiles of shadow per foot of height
    return { sun, away, perFoot };
  }

  return { FACING, position, mapVector, siteDate, at, shadowsAt, obstacles };
})();
