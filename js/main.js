// GardenStar UI: camera + gestures, tools, panels (sheets), rewards, welcome.
(function () {
  const Y = window.YARD, S = window.SPRITES, G = window.GAME, C = window.CARE, I = window.ICONS;
  const T = S.TILE;
  const MON = window.SITE.monetization || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const canvas = $('yard');
  const ctx = canvas.getContext('2d');
  const world = document.createElement('canvas');
  world.width = Y.W * T; world.height = Y.H * T;
  const wctx = world.getContext('2d');
  wctx.imageSmoothingEnabled = false;

  // ---------- preferences ----------
  const PREF_KEY = 'gardenstar-ui-v1';
  let prefs = { welcomed: false, shade: false, tipsSeen: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* private mode */ }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }

  const ui = {
    tool: 'look', plantId: null, terrain: 'soil',
    selected: null, hover: null, highlight: null, highlightUntil: 0,
    weather: null, sheet: null, shopFilter: 'all', shopQuery: '', gardenTab: 'plants', plantMode: 'new',
  };

  // ---------- camera ----------
  const cam = { s: 1, x: 0, y: 0 };
  let dpr = 1;
  const view = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
  const fitScale = () => { const v = view(); return Math.min(v.w / world.width, v.h / world.height); };
  const clampS = s => Math.min(4, Math.max(fitScale() * 0.9, s));

  function clampCam() {
    const v = view(), ww = world.width * cam.s, wh = world.height * cam.s, m = 48;
    cam.x = ww <= v.w ? (v.w - ww) / 2 : Math.min(m, Math.max(v.w - ww - m, cam.x));
    cam.y = wh <= v.h ? (v.h - wh) / 2 : Math.min(m, Math.max(v.h - wh - m, cam.y));
  }
  function zoomAt(s, sx, sy) {
    s = clampS(s);
    const wx = (sx - cam.x) / cam.s, wy = (sy - cam.y) / cam.s;
    cam.s = s; cam.x = sx - wx * s; cam.y = sy - wy * s;
    clampCam(); requestDraw();
  }
  function centerOn(tx, ty, s) {
    if (s) cam.s = clampS(s);
    const v = view();
    cam.x = v.w / 2 - (tx + 0.5) * T * cam.s;
    cam.y = v.h / 2 - (ty + 0.5) * T * cam.s;
    clampCam(); requestDraw();
  }
  function initialCamera() {
    const v = view();
    const house = Y.houseTiles();
    let cx = Y.W / 2, cy = Y.H / 2;
    if (house.length) {
      cx = house.reduce((a, [x]) => a + x, 0) / house.length;
      cy = house.reduce((a, [, y]) => a + y, 0) / house.length + 2;
    }
    if (v.w < 700) centerOn(cx, cy, Math.max(fitScale(), v.w / (15 * T)));
    else { cam.s = fitScale(); clampCam(); requestDraw(); }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const v = view();
    canvas.width = Math.max(1, Math.round(v.w * dpr));
    canvas.height = Math.max(1, Math.round(v.h * dpr));
    clampCam(); requestDraw();
  }
  const tileAt = (sx, sy) => {
    const x = Math.floor((sx - cam.x) / cam.s / T), y = Math.floor((sy - cam.y) / cam.s / T);
    return x >= 0 && y >= 0 && x < Y.W && y < Y.H ? { x, y } : null;
  };

  // ---------- rendering ----------
  let worldDirty = true, drawQueued = false, shadeGrid = null;
  const floaters = [];

  // Shadows for the sun's real position (now, or the hour on the sun slider):
  // the house and fences swept along the shadow direction, tree crowns as
  // offset disks. Drawn on one layer so overlaps don't double up.
  const shadowLayer = document.createElement('canvas');
  shadowLayer.width = world.width; shadowLayer.height = world.height;
  function drawShadows(target) {
    const sh = window.SUN && window.SUN.shadowsAt(ui.sunHour);
    if (!sh) return;
    const sc = shadowLayer.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, shadowLayer.width, shadowLayer.height);
    sc.fillStyle = '#0b1630';
    const house = new Path2D(), fence = new Path2D();
    for (const [x, y] of Y.houseTiles()) house.rect(x * T, y * T, T, T);
    for (const k of Object.keys(Y.state.fences)) {
      const [x, y] = k.split(',').map(Number);
      if (Y.fenceAt(x - 1, y) || Y.fenceAt(x + 1, y) || !(Y.fenceAt(x, y - 1) || Y.fenceAt(x, y + 1))) fence.rect(x * T, y * T + T * 0.4, T, T * 0.2);
      else fence.rect(x * T + T * 0.4, y * T, T * 0.2, T);
    }
    const sweep = (path, feet) => {
      const len = Math.min(30 * T, feet * sh.perFoot * T), steps = Math.max(1, Math.ceil(len / 3));
      for (let i = 0; i <= steps; i++) { sc.setTransform(1, 0, 0, 1, sh.away.x * len * i / steps, sh.away.y * len * i / steps); sc.fill(path); }
      sc.setTransform(1, 0, 0, 1, 0, 0);
    };
    sweep(house, (Y.state.home.stories || 1) >= 2 ? 24 : 14);
    sweep(fence, 6);
    for (const p of Y.allPlants()) {
      if (p.def.type !== 'tree') continue;
      const r = Y.canopyRadius(p.rec) * 0.85 * T;
      if (!r) continue;
      const h = p.def.heightFt * (Y.growthStage(p.rec) >= 2 ? 1 : 0.45);
      const off = Math.min(30 * T, h * 0.65 * sh.perFoot * T);
      sc.beginPath();
      sc.ellipse((p.x + 0.5) * T + sh.away.x * off, (p.y + 0.5) * T + sh.away.y * off, r, r * 0.9, 0, 0, Math.PI * 2);
      sc.fill();
    }
    target.save();
    target.globalAlpha = 0.28;
    target.drawImage(shadowLayer, 0, 0);
    target.restore();
  }

  function renderWorld() {
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) S.drawTerrain(wctx, Y.terrainAt(x, y), x, y);
    drawShadows(wctx);
    S.drawHouses(wctx);
    // fence along the lot line: lawn tiles next to a neighbor or the map edge
    // (the street side stays open)
    const outside = (x, y) => { const t = Y.terrainAt(x, y); return t == null || t === 'offlot'; };
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) {
      if (Y.terrainAt(x, y) !== 'grass') continue;
      if (outside(x, y - 1) || outside(x, y + 1)) S.drawFence(wctx, x, y, false);
      else if (outside(x - 1, y) || outside(x + 1, y)) S.drawFence(wctx, x, y, true);
    }
    // built fences join up with their neighbors
    for (const k of Object.keys(Y.state.fences)) {
      const [x, y] = k.split(',').map(Number);
      const h = Y.fenceAt(x - 1, y) || Y.fenceAt(x + 1, y), v = Y.fenceAt(x, y - 1) || Y.fenceAt(x, y + 1);
      if (h || !v) S.drawFence(wctx, x, y, false);
      if (v) S.drawFence(wctx, x, y, true);
    }
    const plants = Y.allPlants().sort((a, b) => a.y - b.y);
    for (const p of plants) if (p.def.type !== 'tree') S.drawPlant(wctx, p.def, p.x, p.y, Y.growthStage(p.rec));
    for (const p of plants) if (p.def.type === 'tree') S.drawPlant(wctx, p.def, p.x, p.y, Y.growthStage(p.rec));
    shadeGrid = null;
  }

  function computeShade() {
    shadeGrid = [];
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) {
      const s = Y.sunAt(x, y).level;
      if (s !== 'full') shadeGrid.push([x, y, s]);
    }
  }

  function requestDraw(dirtyWorld) {
    if (dirtyWorld) worldDirty = true;
    if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); }
  }

  function frame(now) {
    drawQueued = false;
    if (worldDirty) { renderWorld(); worldDirty = false; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#22331a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world, 0, 0);

    if (prefs.shade) {
      if (!shadeGrid) computeShade();
      for (const [x, y, s] of shadeGrid) {
        ctx.fillStyle = s === 'shade' ? 'rgba(18,28,58,0.42)' : 'rgba(18,28,58,0.2)';
        ctx.fillRect(x * T, y * T, T, T);
      }
    }

    let animating = false;
    // ghost preview of the selected plant under the mouse
    if (ui.tool === 'plant' && ui.plantId && ui.hover) {
      const { x, y } = ui.hover;
      const ok = Y.canPlantAt(x, y);
      ctx.save();
      ctx.globalAlpha = 0.6;
      if (ok) S.drawPlant(ctx, window.PLANT_BY_ID[ui.plantId], x, y, 2);
      ctx.restore();
      ctx.strokeStyle = ok ? '#ffe066' : '#ff6b5a';
      ctx.lineWidth = 2 / cam.s * 1.5;
      ctx.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
    } else if (ui.tool === 'build' && ui.boxRect) {
      const b = ui.boxRect, x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
      const w = Math.abs(b.x1 - b.x0) + 1, h = Math.abs(b.y1 - b.y0) + 1;
      ctx.fillStyle = 'rgba(255,224,102,0.25)';
      if (ui.terrain !== 'fence') ctx.fillRect(x * T, y * T, w * T, h * T);
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3 / cam.s;
      ctx.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    } else if (ui.tool === 'build' && ui.hover) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3 / cam.s;
      ctx.strokeRect(ui.hover.x * T + 1, ui.hover.y * T + 1, T - 2, T - 2);
    }

    if (ui.tool === 'build' && ui.moving) { // what's being moved
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 3 / cam.s;
      const tiles = ui.moving.kind === 'house' ? Y.houseTiles() : [[ui.moving.from.x, ui.moving.from.y]];
      ctx.setLineDash([6 / cam.s, 4 / cam.s]);
      for (const [x, y] of tiles) ctx.strokeRect(x * T + 2, y * T + 2, T - 4, T - 4);
      ctx.setLineDash([]);
    }

    if (ui.highlight && now < ui.highlightUntil) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(90,180,255,${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = (2.5 + pulse * 2) / cam.s * 1.3;
      for (const k of ui.highlight) {
        const [x, y] = k.split(',').map(Number);
        ctx.beginPath();
        ctx.arc((x + 0.5) * T, (y + 0.5) * T, T * (0.62 + 0.1 * pulse), 0, Math.PI * 2);
        ctx.stroke();
      }
      animating = true;
    } else if (ui.highlight) ui.highlight = null;

    if (ui.selected) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3 / cam.s * 1.2;
      ctx.strokeRect(ui.selected.x * T + 1, ui.selected.y * T + 1, T - 2, T - 2);
    }

    // floating reward text, in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], t = (now - f.t0) / 1300;
      if (t >= 1) { floaters.splice(i, 1); continue; }
      const sx = cam.x + (f.x + 0.5) * T * cam.s, sy = cam.y + f.y * T * cam.s - 6 - t * 42;
      ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      ctx.font = '700 18px "Pixelify Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2e1d0f';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
      ctx.globalAlpha = 1;
      animating = true;
    }
    if (animating) requestDraw();
  }

  function floatAt(at, text, color) {
    if (!at) return;
    floaters.push({ x: at.x, y: at.y, text, color: color || '#ffd56a', t0: performance.now() });
    requestDraw();
  }

  // ---------- swatches (plant thumbnails) ----------
  const swatchCache = {};
  function swatchURL(def, stage) {
    stage = stage == null ? 3 : stage;
    const k = def.id + ':' + stage + ':' + (window.ART.plant(def.id, stage) ? 'a' : 'p');
    if (swatchCache[k]) return swatchCache[k];
    const c = document.createElement('canvas');
    c.width = T * 3; c.height = T * 3;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    S.drawPlant(x, def, 1, 2, def.type === 'tree' ? Math.max(2, stage) : stage);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      if (d[(yy * c.width + xx) * 4 + 3] > 20) { x0 = Math.min(x0, xx); y0 = Math.min(y0, yy); x1 = Math.max(x1, xx); y1 = Math.max(y1, yy); }
    }
    const out = document.createElement('canvas');
    out.width = 48; out.height = 48;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    if (x1 >= x0) {
      const side = Math.max(x1 - x0, y1 - y0) + 4;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      o.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, 48, 48);
    }
    return (swatchCache[k] = out.toDataURL());
  }
  const swatchImg = (def, cls, stage) => `<img class="${cls || 'swatch'}" src="${swatchURL(def, stage)}" alt="">`;
  function iconFor(spec, cls) {
    if (spec.startsWith('plant:')) {
      const def = window.PLANT_BY_ID[spec.slice(6)];
      return `<img class="${cls || ''}" src="${swatchURL(def)}" alt="" style="image-rendering:pixelated">`;
    }
    return I.html(spec.replace('icon:', ''), cls);
  }

  // ---------- HUD ----------
  function refreshHUD() {
    const li = G.levelInfo();
    $('lv-num').textContent = li.level;
    $('lv-title').innerHTML = `<span>${esc(li.title)}</span><span class="lv-xp">${li.next ? `${li.xp}/${li.next} XP` : `${li.xp} XP`}</span>`;
    $('hud-level').setAttribute('aria-label', `Level ${li.level}, ${li.title}, ${li.xp} XP. Open badges`);
    $('xp-fill').style.width = Math.round(li.progress * 100) + '%';
    $('streak-num').textContent = G.state().streak;
    const w = ui.weather;
    if (w) {
      $('wx-temp').textContent = (w.fallback ? '~' : '') + w.current.tempF + '°';
      $('wx-icon').style.backgroundImage = `url(${I.url(w.current.icon)})`;
    }
    const open = G.quests(w).filter(q => !q.complete && q.id !== 'checkin').length;
    const badge = $('quest-count');
    badge.textContent = open;
    badge.classList.toggle('hidden', open === 0);
    $('undo').disabled = !Y.canUndo();
    $('pal-undo').disabled = !Y.canUndo();
  }

  // ---------- toasts, banners, dialogs ----------
  function toast(html, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => el.remove(), kind === 'warn' ? 4200 : 3000);
  }

  const bannerQueue = [];
  let bannerBusy = false;
  function banner(html) {
    bannerQueue.push(html);
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const b = $('banner');
    const html = bannerQueue.shift();
    if (!html) { bannerBusy = false; b.classList.add('hidden'); return; }
    bannerBusy = true;
    b.innerHTML = html;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(nextBanner, bannerQueue.length ? 1500 : 2300);
  }
  let bannerTimer = null;
  // any tap dismisses the celebration without eating the tap itself
  document.addEventListener('pointerdown', () => { if (bannerBusy) { clearTimeout(bannerTimer); nextBanner(); } }, true);

  function dialog(html, buttons) {
    return new Promise(resolve => {
      const box = $('dialog-box');
      box.innerHTML = html + `<div class="row">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`;
      $('dialog').classList.remove('hidden');
      I.apply(box);
      const done = v => { $('dialog').classList.add('hidden'); resolve(v); };
      box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => done(buttons[+btn.dataset.i].value));
      $('dialog').onclick = e => { if (e.target.id === 'dialog') done(null); };
    });
  }

  // ---------- game events ----------
  G.on(e => {
    if (e.type === 'xp' && e.at) floatAt(e.at, `+${e.amount} XP`);
    if (e.type === 'level') {
      banner(`<small>Level up!</small><strong>Level ${e.level}</strong><span>You're now a ${esc(e.title)}</span>`);
      Y.log('level', null, null, `Reached level ${e.level}: ${e.title}`);
    }
    if (e.type === 'badge') {
      banner(`<div class="medal">${iconFor(e.badge.icon)}</div><small>Badge unlocked</small><strong>${esc(e.badge.name)}</strong><span>${esc(e.badge.desc)} · +${G.XP.badge} XP</span>`);
      Y.log('badge', null, null, `Badge: ${e.badge.name}`);
    }
    if (e.type === 'quest') toast(`Done: ${esc(e.quest.title)} <b>+${e.quest.xp} XP</b>`);
  });

  function persist() {
    syncCompass();
    Y.save();
    G.syncQuests(ui.weather);
    G.save();
    requestDraw(true);
    refreshHUD();
    refreshSheet();
  }
  const snapshot = () => Y.checkpoint(() => G.serialize());

  // ---------- actions ----------
  const sunWords = { full: 'full sun', part: 'part shade', shade: 'shade' };
  const terrainNames = { grass: 'Lawn', soil: 'Garden bed', path: 'Path or patio', driveway: 'Driveway', house: 'House', street: 'Street', offlot: 'Not your lot' };

  async function tryPlant(t) {
    const def = window.PLANT_BY_ID[ui.plantId];
    const rec = Y.plantAt(t.x, t.y);
    if (rec) { toast(`That spot has a ${esc(window.PLANT_BY_ID[rec.id].name)}. Dig it up first, or pick an empty tile.`); return; }
    if (!Y.inLot(t.x, t.y)) { toast('That’s outside your lot. If it’s yours, paint it with Build first.'); return; }
    if (!Y.isPlantable(t.x, t.y)) { toast('Plants go on lawn or garden beds. Use Build to make a bed here.'); return; }
    if (ui.plantMode === 'existing') {
      snapshot();
      Y.addExisting(t.x, t.y, def.id);
      ui.selected = t;
      toast(`Added your ${esc(def.name)}. Tap it any time for its care card.`);
      persist();
      return;
    }
    const warnings = C.plantingWarnings(def, t.x, t.y);
    if (warnings.length) {
      const go = await dialog(
        `<h3>Plant ${esc(def.name)} here?</h3>${warnings.map(w => `<div class="warnline">${esc(w.text)}</div>`).join('')}`,
        [{ label: 'Cancel', cls: 'alt', value: false }, { label: 'Plant anyway', value: true }]
      );
      if (!go) return;
    }
    snapshot();
    Y.addPlant(t.x, t.y, def.id);
    ui.selected = t;
    const res = G.planted(def, t);
    toast(res.xp ? `Planted ${esc(def.name)}. Water it in today.` : `Planted ${esc(def.name)}. ${esc(res.reason)}.`);
    persist();
  }

  function waterAt(t) {
    const rec = Y.plantAt(t.x, t.y);
    if (!rec) { toast('Tap a plant to log that you watered it.'); return; }
    const def = window.PLANT_BY_ID[rec.id];
    if (rec.lastWatered === Y.todayStr()) { toast(`${esc(def.name)} is already logged for today.`); return; }
    const status = C.waterStatus(rec, ui.weather);
    snapshot();
    Y.waterPlant(t.x, t.y);
    const res = G.watered(status, t);
    if (res.xp) toast(`Watered ${esc(def.name)}`);
    else { floatAt(t, 'logged', '#a8dcf2'); toast(esc(res.reason), 'warn'); }
    persist();
  }

  function lookAt(t) {
    ui.selected = t;
    requestDraw();
    const rec = Y.plantAt(t.x, t.y);
    if (rec) { openSheet('plant', { x: t.x, y: t.y }); return; }
    const terr = Y.terrainAt(t.x, t.y);
    const sun = Y.sunAt(t.x, t.y);
    const by = (sun.by ? ` from ${C.shadeFrom(sun.by)}` : '') + (sun.hours != null ? ` (~${Math.round(sun.hours)} h of sun)` : '');
    const hint = Y.isPlantable(t.x, t.y) && Y.inLot(t.x, t.y) ? ' Tap Plant for the best picks for this spot.'
      : terr === 'house' ? ' Garden > More > Your house to change it.' : '';
    toast(`<b>${terrainNames[terr]}</b> · ${sunWords[sun.level]}${esc(by)}.${hint}`);
  }

  // one brush dab. Brushes never pave over a plant: they skip it and say so.
  function paintTile(x, y, brush) {
    let r = false;
    if (brush === 'dig') {
      if (Y.plantAt(x, y)) { Y.removePlant(x, y); r = true; } else r = Y.setFence(x, y, false);
    } else if (brush === 'fence') r = Y.setFence(x, y, true);
    else r = Y.setTerrain(x, y, brush);
    if (r === 'blocked') { stroke.skipped++; return false; }
    return r;
  }
  function paintAt(t) {
    if (!t || (stroke.last && stroke.last.x === t.x && stroke.last.y === t.y)) return;
    stroke.last = t;
    if (paintTile(t.x, t.y, ui.terrain)) { stroke.changed = true; requestDraw(true); }
  }
  const stroke = { active: false, last: null, changed: false, skipped: 0 };
  function startStroke(t) {
    stroke.active = true; stroke.last = null; stroke.changed = false; stroke.skipped = 0;
    snapshot();
    if (ui.box) { ui.boxRect = t ? { x0: t.x, y0: t.y, x1: t.x, y1: t.y } : null; requestDraw(); }
    else paintAt(t);
  }
  // box mode: fill the rectangle, or for fences draw its outline
  function fillBox() {
    const b = ui.boxRect;
    ui.boxRect = null;
    if (!b) return;
    const [xa, xb] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)], [ya, yb] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      if (ui.terrain === 'fence' && x !== xa && x !== xb && y !== ya && y !== yb) continue;
      if (paintTile(x, y, ui.terrain)) stroke.changed = true;
    }
  }
  function endStroke() {
    if (!stroke.active) return;
    stroke.active = false;
    if (ui.box) fillBox();
    if (stroke.changed) persist(); else { Y.dropCheckpoint(); refreshHUD(); requestDraw(); }
    if (stroke.skipped) toast(`Left ${stroke.skipped} plant${stroke.skipped === 1 ? '' : 's'} alone. Use <b>Move</b> or <b>Dig up</b> first.`);
  }

  // Move: tap a plant (or the house), then tap where it goes
  function moveTap(t) {
    const m = ui.moving;
    if (!m) {
      const rec = Y.plantAt(t.x, t.y);
      if (rec) { ui.moving = { kind: 'plant', from: t }; toast(`Moving your <b>${esc(window.PLANT_BY_ID[rec.id].name)}</b>. Tap where it should go.`); }
      else if (Y.terrainAt(t.x, t.y) === 'house' && Y.state.home.plan) { ui.moving = { kind: 'house', from: t }; toast('Moving your house. Tap where that spot should go.'); }
      else toast('Tap a plant or your house to move it.');
      requestDraw();
      return;
    }
    ui.moving = null;
    if (m.from.x === t.x && m.from.y === t.y) { requestDraw(); return; }
    if (m.kind === 'plant') {
      if (!Y.canPlantAt(t.x, t.y) || !Y.inLot(t.x, t.y)) { toast('That spot isn’t free. Pick empty lawn or bed.'); requestDraw(); return; }
      snapshot();
      const rec = Y.plantAt(m.from.x, m.from.y);
      Y.movePlant(m.from, t);
      ui.selected = t;
      toast(`Moved your ${esc(window.PLANT_BY_ID[rec.id].name)}. Its history came with it.`);
      persist();
      return;
    }
    const p = Y.state.home.plan;
    moveHouse(Y.clampPlan({ shape: p.shape, garage: p.garage, x: p.x + t.x - m.from.x, y: p.y + t.y - m.from.y }));
  }
  // restamp the house unless it would land on plants
  function moveHouse(plan) {
    const hit = Y.planConflicts(plan);
    if (hit.length) {
      toast(`That would cover ${hit.length} plant${hit.length === 1 ? '' : 's'}. Move ${hit.length === 1 ? 'it' : 'them'} first (Build &gt; Move).`, 'warn');
      ui.highlight = hit; ui.highlightUntil = performance.now() + 2500;
      requestDraw();
      return false;
    }
    snapshot();
    Y.stampHome(plan);
    persist();
    return true;
  }

  function undo() {
    const snap = Y.popUndo();
    if (!snap) return;
    if (snap.extra) G.restore(snap.extra);
    Y.save(); G.save();
    requestDraw(true); refreshHUD(); refreshSheet();
    toast('Undone');
  }

  function onTap(t) {
    if (!t) return;
    if (ui.tool === 'look') lookAt(t);
    else if (ui.tool === 'plant') { if (ui.plantId) tryPlant(t); else openSheet('shop'); }
    else if (ui.tool === 'water') waterAt(t);
    else if (ui.tool === 'build' && ui.terrain === 'move') moveTap(t);
  }

  // ---------- gestures ----------
  const pointers = new Map();
  let gesture = null;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      const p = local(e);
      gesture = { type: 'pending', start: p, last: p };
      if (e.pointerType === 'mouse' && e.button !== 0) gesture.type = 'pan';
      else if (ui.tool === 'build' && ui.terrain !== 'move') { gesture.type = 'paint'; startStroke(tileAt(p.x, p.y)); }
    } else if (pointers.size === 2) {
      endStroke();
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: cam.s, wx: (mid.x - cam.x) / cam.s, wy: (mid.y - cam.y) / cam.s };
    }
  });

  canvas.addEventListener('pointermove', e => {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const t = tileAt(p.x, p.y);
        if ((t && (!ui.hover || t.x !== ui.hover.x || t.y !== ui.hover.y)) || (!t && ui.hover)) { ui.hover = t; requestDraw(); }
      }
      return;
    }
    pointers.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.s = clampS(gesture.s0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0);
      cam.x = mid.x - gesture.wx * cam.s;
      cam.y = mid.y - gesture.wy * cam.s;
      clampCam(); requestDraw();
      return;
    }
    if (gesture.type === 'pending' && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 8) gesture.type = 'pan';
    if (gesture.type === 'pan') {
      cam.x += p.x - gesture.last.x; cam.y += p.y - gesture.last.y;
      clampCam(); requestDraw();
    } else if (gesture.type === 'paint' && ui.box) {
      const t = tileAt(p.x, p.y);
      if (t && ui.boxRect && (t.x !== ui.boxRect.x1 || t.y !== ui.boxRect.y1)) { ui.boxRect.x1 = t.x; ui.boxRect.y1 = t.y; requestDraw(); }
    } else if (gesture.type === 'paint') {
      paintAt(tileAt(p.x, p.y));
      if (e.pointerType === 'mouse') { ui.hover = tileAt(p.x, p.y); requestDraw(); }
    }
    gesture.last = p;
  });

  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.type === 'pending' && e.type === 'pointerup') onTap(tileAt(gesture.start.x, gesture.start.y));
    if (gesture && gesture.type === 'paint') endStroke();
    if (pointers.size === 0) gesture = null;
    else if (gesture && gesture.type === 'pinch') gesture = { type: 'idle' };
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && ui.hover) { ui.hover = null; requestDraw(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = local(e);
    zoomAt(cam.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  $('z-in').onclick = () => { const v = view(); zoomAt(cam.s * 1.35, v.w / 2, v.h / 2); };
  $('z-out').onclick = () => { const v = view(); zoomAt(cam.s / 1.35, v.w / 2, v.h / 2); };
  $('z-fit').onclick = () => { cam.s = fitScale(); clampCam(); requestDraw(); };
  $('undo').onclick = undo;
  const shadeBtn = $('shade-toggle');
  function syncShadeBtn() { shadeBtn.setAttribute('aria-pressed', prefs.shade ? 'true' : 'false'); }
  shadeBtn.onclick = () => {
    prefs.shade = !prefs.shade; savePrefs(); syncShadeBtn();
    if (!prefs.shade) ui.sunHour = null;
    if (prefs.shade && ui.tool !== 'look') setTool('look');
    renderModeChip(); requestDraw(true);
    toast(prefs.shade ? 'Sun map: darker tiles get fewer hours of sun in the growing season. Drag the slider to watch shadows move.' : 'Sun map off');
  };
  // compass: points north, set by which way the front door faces
  function syncCompass() {
    const v = window.SUN ? window.SUN.mapVector(0) : { x: 0, y: -1 };
    const deg = Math.atan2(v.x, -v.y) * 180 / Math.PI;
    $('compass').querySelector('.needle').style.transform = `rotate(${deg}deg)`;
    $('compass').setAttribute('aria-label', `North is ${['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'][Math.round(((deg + 360) % 360) / 45) % 8]} on this map. Tap to set which way your front door faces.`);
  }
  $('compass').onclick = () => openSheet('house');
  // shadows move: redraw every few minutes while showing the live sun
  setInterval(() => { if (ui.sunHour == null) requestDraw(true); }, 5 * 60 * 1000);

  // ---------- tools ----------
  function setTool(tool) {
    ui.tool = tool;
    ui.hover = null;
    document.querySelectorAll('.toolbar [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    $('palette').classList.toggle('hidden', tool !== 'build');
    renderModeChip();
    requestDraw();
  }

  function renderModeChip() {
    const chip = $('mode-chip');
    chip.classList.remove('above');
    let html = '';
    if (ui.tool === 'look' && prefs.shade) {
      const h = ui.sunHour == null ? (() => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; })() : ui.sunHour;
      const fmt = v => { const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
      html = `${I.html('sun')}<span class="chip-text grow"><b>Shadows at <span id="sun-time">${fmt(h)}</span></b>
        <input type="range" id="sun-slider" min="6" max="20.5" step="0.25" value="${Math.min(20.5, Math.max(6, h))}" aria-label="Time of day"></span>
        <button class="btn alt" id="sun-now">Now</button>`;
      chip.innerHTML = html;
      chip.classList.remove('hidden');
      const sl = $('sun-slider');
      sl.oninput = () => { ui.sunHour = Number(sl.value); $('sun-time').textContent = fmt(ui.sunHour); requestDraw(true); };
      $('sun-now').onclick = () => { ui.sunHour = null; renderModeChip(); requestDraw(true); };
      return;
    }
    if (ui.tool === 'plant' && ui.plantId) {
      const def = window.PLANT_BY_ID[ui.plantId];
      const hint = ui.plantMode === 'existing' ? 'Tap where it grows in your yard' : 'Tap a bed or lawn tile to plant';
      html = `${swatchImg(def, 'chip-sw')}<span class="chip-text"><b>${esc(def.name)}</b><br><span class="small muted">${hint}</span></span><button class="btn alt" id="chip-change">Change</button>`;
    } else if (ui.tool === 'water') {
      html = `${I.html('water')}<span class="chip-text"><b>Water</b><br><span class="small muted">After watering for real, tap the plant to log it</span></span>`;
    } else if (ui.tool === 'build' && ui.lotDraw) {
      chip.classList.add('above');
      html = `${I.html('build')}<span class="chip-text"><b>Draw your lot</b><br><span class="small muted">Drag boxes with Lawn to claim it. Trim with Not mine.</span></span><button class="btn" id="chip-next">Next: my house</button>`;
    } else if (ui.tool === 'build') {
      chip.classList.add('above');
      const how = ui.terrain === 'move' ? 'Tap a plant or your house, then tap where it goes.'
        : ui.box ? (ui.terrain === 'fence' ? 'Drag a box to fence it in.' : 'Drag a box to fill it.')
          : 'Drag one finger to paint. Two fingers move the map.';
      html = `${I.html('build')}<span class="chip-text"><b>${ui.terrain === 'move' ? 'Move' : 'Build'}</b><br><span class="small muted">${how}</span></span>`;
    }
    chip.innerHTML = html;
    chip.classList.toggle('hidden', !html);
    const nx = $('chip-next');
    if (nx) nx.onclick = finishLotDrawing;
    const ch = $('chip-change');
    if (ch) ch.onclick = () => openSheet('shop');
    const img = chip.querySelector('.chip-sw');
    if (img) { img.style.width = '36px'; img.style.height = '36px'; img.style.imageRendering = 'pixelated'; }
  }

  document.querySelectorAll('.toolbar [data-tool]').forEach(b => b.onclick = () => {
    const tool = b.dataset.tool;
    if (tool === 'plant') {
      // a spot you just looked at gets picks for that spot
      const fresh = !ui.plantId || (ui.tool === 'look' && shopSpot());
      setTool('plant');
      if (fresh) openSheet('shop'); else closeSheet();
      return;
    }
    setTool(tool);
    closeSheet();
  });
  document.querySelectorAll('.toolbar [data-open]').forEach(b => b.onclick = () => {
    const kind = b.dataset.open;
    if (ui.sheet && ui.sheet.kind === kind) closeSheet(); else openSheet(kind);
  });
  $('pal-house').onclick = () => openSheet('house');
  $('pal-undo').onclick = undo;
  $('pal-box').onclick = () => {
    ui.box = !ui.box;
    $('pal-box').classList.toggle('active', ui.box);
    $('pal-box').setAttribute('aria-pressed', ui.box ? 'true' : 'false');
    renderModeChip();
  };
  function selectBrush(brush) {
    ui.terrain = brush;
    ui.moving = null;
    document.querySelectorAll('#palette [data-terrain]').forEach(x => x.classList.toggle('active', x.dataset.terrain === brush));
    renderModeChip(); requestDraw();
  }
  document.querySelectorAll('#palette [data-terrain]').forEach(b => b.onclick = () => {
    selectBrush(b.dataset.terrain);
  });

  // ---------- sheets ----------
  const sheet = $('sheet');
  function openSheet(kind, args) {
    ui.sheet = { kind, args: args || {} };
    sheet.classList.add('open');
    sheet.classList.toggle('short', kind === 'house'); // keep the house in view while building
    sheet.setAttribute('aria-hidden', 'false');
    document.getElementById('app').classList.add('sheet-open');
    renderSheet(true);
    if (kind === 'house') focusHouse();
  }
  function closeSheet() {
    ui.sheet = null;
    sheet.classList.remove('open', 'full');
    sheet.setAttribute('aria-hidden', 'true');
    document.getElementById('app').classList.remove('sheet-open');
  }
  function refreshSheet() { if (ui.sheet) renderSheet(false); }
  $('sheet-close').onclick = closeSheet;

  // grip: tap toggles half/full; drag down closes, up expands
  (function () {
    const grip = $('sheet-grip');
    let y0 = null;
    grip.addEventListener('pointerdown', e => { y0 = e.clientY; try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    grip.addEventListener('pointerup', e => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null;
      if (Math.abs(dy) < 8) sheet.classList.toggle('full');
      else if (dy < -40) sheet.classList.add('full');
      else if (dy > 60) { if (sheet.classList.contains('full')) sheet.classList.remove('full'); else closeSheet(); }
    });
  })();

  function renderSheet(fresh) {
    const body = $('sheet-body');
    const scroll = fresh ? 0 : body.scrollTop;
    const { kind, args } = ui.sheet;
    const r = {
      shop: renderShop, plant: renderPlantCard, info: renderPlantInfo,
      quests: renderTodos, todos: renderTodos, garden: renderGarden, weather: renderWeather, house: renderHouse,
    }[kind](args);
    if (!r) { closeSheet(); return; }
    $('sheet-title').textContent = r.title;
    body.innerHTML = r.html;
    I.apply(body);
    if (r.bind) r.bind(body);
    body.scrollTop = scroll;
  }

  // shop ----------------------------------------------------------------
  const month = () => C.thisMonth();
  function shopList() {
    const m = month(), q = ui.shopQuery.trim().toLowerCase();
    let list = window.PLANTS.slice();
    if (ui.shopFilter === 'season') list = list.filter(p => p.plantMonths.includes(m));
    if (ui.shopFilter === 'native') list = list.filter(p => p.native);
    if (ui.shopFilter === 'wildlife') list = list.filter(p => p.wildlife.length);
    if (ui.shopFilter === 'edible') list = list.filter(p => p.type === 'edible');
    if (ui.shopFilter === 'tree') list = list.filter(p => p.type === 'tree' || (p.type === 'shrub' && p.heightFt >= 8));
    if (q) list = list.filter(p => (p.name + ' ' + p.botanical + ' ' + p.wildlife.join(' ') + ' ' + C.lifeLabel(p) + ' ' + C.sunLabel(p) + ' ' + p.buy.map(b => C.BUY_LABEL[b]).join(' ')).toLowerCase().includes(q));
    // mapping what already grows: you're looking for a name, so A to Z
    if (ui.plantMode === 'existing') return { ctx: null, ranked: list.sort((a, b) => a.name.localeCompare(b.name)).map(def => ({ def })) };
    // new planting: ranked like a gardener would advise, for a tapped spot or the whole yard
    return C.rankPlants(list, shopSpot());
  }
  // the empty lot tile you last tapped, if any: the shop ranks for that spot
  function shopSpot() {
    const t = ui.selected;
    return t && Y.canPlantAt(t.x, t.y) && Y.inLot(t.x, t.y) ? t : null;
  }
  function plantTags(def) {
    const m = month();
    const t = [];
    if (def.native) t.push('<span class="tag native">Native</span>');
    if (def.type === 'edible') t.push('<span class="tag edible">Edible</span>');
    t.push(`<span class="tag life">${C.lifeLabel(def)}</span>`);
    t.push(`<span class="tag buy buy-${def.buy[0]}">${C.BUY_LABEL[def.buy[0]]}</span>`);
    t.push(`<span class="tag sun sun-${def.sunRange.join('-')}">${C.sunLabel(def)}</span>`);
    t.push(def.plantMonths.includes(m) ? '<span class="tag now">Plant now</span>' : '<span class="tag off">Not now</span>');
    for (const w of def.wildlife) t.push(`<span class="tag wild">${w}</span>`);
    return t.join('');
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function renderShop() {
    const filters = [['all', ui.plantMode === 'existing' ? 'All' : 'Best picks'], ['season', 'Plant now'], ['tree', 'Trees'], ['native', 'Natives'], ['wildlife', 'Wildlife'], ['edible', 'Edibles']];
    const { ctx, ranked } = shopList();
    const spot = ctx && ctx.spot;
    // "Plant now" is already a tag; the why line keeps the more urgent "Last month to plant"
    const why = r => r.reasons ? `<span class="why">${esc(r.reasons.filter(t => t !== 'Plant now').slice(0, 3).join(' · '))}${r.blocker ? `<span class="why-not">${r.reasons.some(t => t !== 'Plant now') ? ' · ' : ''}${esc(r.blocker)}</span>` : ''}</span>` : '';
    const rankNote = !ctx ? ''
      : spot ? `<div class="rank-note">For the spot you tapped (<b>${C.LIGHT[spot.level]}</b>, ${spot.terrain === 'soil' ? 'bed' : 'lawn'}). Tap a pick to plant it there. <button class="linkbtn" id="shop-yard">Whole yard</button></div>`
      : `<div class="rank-note">Best for your yard in ${C.MONTHS[C.thisMonth() - 1]}. Tap a spot on the map first for picks for that spot.</div>`;
    return {
      title: 'Plant shop',
      html: `<div class="seg"><button data-mode="new" class="${ui.plantMode === 'new' ? 'active' : ''}">New planting</button><button data-mode="existing" class="${ui.plantMode === 'existing' ? 'active' : ''}">Already in my yard</button></div>
        ${ui.plantMode === 'existing' ? '<p class="small muted">Map what already grows in your yard. It goes in full-grown, with no planting XP.</p>' : ''}
        <div class="chips">${filters.map(([k, l]) => `<button data-f="${k}" class="${ui.shopFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <input class="search" id="shop-q" type="search" placeholder="Search plants, or try &quot;butterflies&quot; or &quot;shade&quot;" value="${esc(ui.shopQuery)}">
        ${rankNote}
        <div class="list">${ranked.map(r => { const p = r.def; return `<div class="item" data-pick="${p.id}" role="button" tabindex="0">
          ${swatchImg(p)}
          <span class="grow"><span class="name">${esc(p.name)}</span>
          ${why(r)}
          <span class="tags">${plantTags(p)}</span>
          <span class="meta">${p.water} water · ${p.heightFt} ft tall · ${p.spacingFt} ft apart</span></span>
          <button class="info" data-info="${p.id}" aria-label="About ${esc(p.name)}">i</button></div>`; }).join('') || '<p class="muted">No plants match. Try All.</p>'}</div>`,
      bind(body) {
        body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { ui.shopFilter = b.dataset.f; renderSheet(true); });
        body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
          ui.plantMode = b.dataset.mode;
          if (ui.plantMode === 'existing' && ui.shopFilter === 'season') ui.shopFilter = 'all';
          renderSheet(false);
        });
        const qi = body.querySelector('#shop-q');
        qi.oninput = () => { ui.shopQuery = qi.value; const pos = qi.selectionStart; renderSheet(false); const n = $('shop-q'); n.focus(); n.setSelectionRange(pos, pos); };
        body.querySelectorAll('[data-info]').forEach(b => b.onclick = e => { e.stopPropagation(); openSheet('info', { id: b.dataset.info }); });
        body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickPlant(b.dataset.pick, spot));
        const yb = $('shop-yard');
        if (yb) yb.onclick = () => { ui.selected = null; requestDraw(); renderSheet(true); };
      },
    };
  }
  // picked from a spot-ranked list: plant straight into that spot
  function pickPlant(id, spot) {
    ui.plantId = id;
    setTool('plant');
    closeSheet();
    const def = window.PLANT_BY_ID[id];
    if (spot) { tryPlant(spot); return; }
    toast(`Selected <b>${esc(def.name)}</b>. Tap a bed or lawn tile to plant.`);
  }

  // plant card ----------------------------------------------------------
  function calendar(def) {
    const now = month();
    const bloomCol = def.bloom !== def.color ? def.bloom : null;
    return `<div class="cal">${C.MONTHS.map((mn, i) => {
      const m = i + 1, b = bloomCol && def.bloomMonths.includes(m), pl = def.plantMonths.includes(m);
      return `<div class="${m === now ? 'now ' : ''}${b ? 'bloom ' : ''}${pl ? 'plantable' : ''}" style="${b ? `background:${bloomCol}` : ''}">${mn[0]}<i></i></div>`;
    }).join('')}</div>
    <div class="legend">${bloomCol ? `<span><i style="background:${bloomCol}"></i>In bloom</span>` : ''}<span><i style="background:var(--leaf)"></i>Planting window</span><span><i style="border:2px solid var(--wood-900)"></i>Now</span></div>`;
  }
  function facts(def) {
    return `<dl class="facts"><dt>Sun</dt><dd>${C.sunLabel(def)}${def.sunRange.length > 1 ? ` (best in ${C.LIGHT[def.sunPref]})` : ''}</dd>
      <dt>Lifespan</dt><dd>${{ perennial: 'Perennial: comes back every year', annual: 'Annual: one season, replant each year', reseeds: 'Annual that reseeds itself if you let it drop seed', woody: C.lifeLabel(def) + ': permanent, woody' }[def.life]}</dd>
      <dt>Where to buy</dt><dd>${def.buy.map(b => C.BUY_TEXT[b]).join('. ')}.</dd>
      <dt>Water</dt><dd>${cap(def.water)}</dd>
      <dt>Size</dt><dd>${def.heightFt} ft tall · space ${def.spacingFt} ft apart</dd>
      <dt>Plant</dt><dd>${C.monthList(def.plantMonths)}</dd>
      ${def.bloomMonths.length && def.bloom !== def.color ? `<dt>Blooms</dt><dd>${C.monthList(def.bloomMonths)}</dd>` : ''}</dl>`;
  }
  function headBlock(def, stage) {
    return `<div class="pc-head">${swatchImg(def, '', stage)}<div><h3>${esc(def.name)}</h3><div class="botanical">${esc(def.botanical)}</div><div class="tags">${plantTags(def)}</div></div></div>`;
  }
  function fmtDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: iso.slice(0, 4) === Y.todayStr().slice(0, 4) ? undefined : 'numeric' }); }

  function renderPlantInfo({ id }) {
    const def = window.PLANT_BY_ID[id];
    return {
      title: 'About this plant',
      html: `${headBlock(def, 3)}
        <p>${esc(def.notes)}</p>
        ${def.hostFor ? `<div class="card small"><b>Caterpillar host plant</b> for ${esc(def.hostFor)}: their young can only eat this.</div>` : ''}
        <div class="card"><h3>Calendar</h3>${calendar(def)}</div>
        ${facts(def)}
        <button class="btn block" id="plant-this">${I.html('plant')}Plant this</button>`,
      bind() { $('plant-this').onclick = () => pickPlant(id); },
    };
  }

  // what a plant needs, checked against its actual spot: [label, ok|warn|info, text]
  function plantNeeds(def, rec, x, y) {
    const sun = Y.sunAt(x, y), out = [];
    const hrs = sun.hours != null ? `about ${Math.round(sun.hours)} hours of sun` : sunWords[sun.level];
    const sunOk = def.type === 'tree' || def.sunRange.includes(sun.level);
    out.push(['Sun', sunOk ? 'ok' : 'warn', `Needs ${C.sunLabel(def).toLowerCase()}${def.sunRange.length > 1 ? ` (best in ${C.LIGHT[def.sunPref]})` : ''}. This spot gets ${hrs}${sun.by && sun.level !== 'full' ? ', shaded by ' + C.shadeFrom(sun.by) : ''}.`]);
    const every = { low: 10, medium: 7, high: 4 }[def.water];
    out.push(['Water', 'info', C.isEstablishing(rec)
      ? `Every 2 days while its roots establish (until ${fmtDate(Y.todayStr(def.establishDays - Y.daysSince(rec.planted)))}), then ${def.water}: about every ${every} days in dry weather.`
      : rec.lastWatered === null ? `${cap(def.water)}. Established, so rain covers it; water only in a long dry spell.` : `${cap(def.water)}: about every ${every} days in dry weather.`]);
    let near = null;
    for (const p of Y.allPlants()) {
      if ((p.x === x && p.y === y) || (p.def.type === 'tree') !== (def.type === 'tree')) continue;
      const ft = Math.hypot(p.x - x, p.y - y) * window.SITE.tileFeet;
      if (!near || ft < near.ft) near = { p, ft };
    }
    const need = def.spacingFt;
    out.push(['Space', near && near.ft < (need + near.p.def.spacingFt) / 2 * 0.6 ? 'warn' : 'ok',
      `${need} ft apart, ${def.heightFt} ft tall when grown.${near ? ` Nearest ${def.type === 'tree' ? 'tree' : 'plant'}: your ${near.p.def.name}, ${Math.round(near.ft)} ft away.` : ''}`]);
    const drain = /drain|wet feet|raised|mound/i.test(def.notes), wet = def.water === 'high';
    out.push(['Soil', drain ? 'warn' : 'info', drain ? 'Needs good drainage. In Houston clay, plant it high: a raised bed or a mound.'
      : wet ? 'Likes moist soil. A low spot that stays damp suits it.' : 'Fine in Houston clay with compost worked in.']);
    if (def.tender) out.push(['Cold', 'info', 'Tender: cover it when the forecast drops below freezing.']);
    return out;
  }

  function renderPlantCard({ x, y, from }) {
    const rec = Y.plantAt(x, y);
    if (!rec) return null;
    const def = window.PLANT_BY_ID[rec.id];
    const stage = Y.growthStage(rec);
    const age = Y.daysSince(rec.planted);
    const ws = C.waterStatus(rec, ui.weather);
    const sun = Y.sunAt(x, y);
    const agenda = C.plantAgenda({ x, y, key: Y.key(x, y), rec, def }, ui.weather).filter(a => a.date || a.kind === 'water');
    const nextUp = `<div class="card"><h3>Next up</h3><div class="agenda">${agenda.slice(0, 6).map(a =>
      `<div class="ag ${a.urgent ? 'urgent' : ''}"><b>${C.whenLabel(a) || 'Ongoing'}</b><span><span class="agt">${esc(a.text)}</span><span class="small muted">${esc(a.why)}</span></span></div>`).join('')}</div></div>`;
    const needs = `<div class="card"><h3>What it needs</h3><div class="needs">${plantNeeds(def, rec, x, y).map(([k, st, t]) =>
      `<div class="need ${st}"><b>${k}</b><span>${esc(t)}</span></div>`).join('')}</div></div>`;
    const gives = [def.wildlife.length ? `Feeds ${def.wildlife.join(', ')}.` : '', def.hostFor ? `Caterpillar host for ${def.hostFor}: chewed leaves mean it's working.` : '',
      def.harvestDays ? `Harvest about ${def.harvestDays} days after planting.` : '', def.native ? 'Texas native: built for this climate.' : ''].filter(Boolean);
    const sunNote = '';
    const notes = rec.notes.slice().reverse();
    const buy = MON.amazonTag
      ? `<a class="btn alt" target="_blank" rel="noopener sponsored" href="https://www.amazon.com/s?k=${encodeURIComponent(def.name + (def.type === 'edible' ? ' seeds' : ' plant'))}&tag=${encodeURIComponent(MON.amazonTag)}">Buy</a>` : '';
    return {
      title: def.name,
      html: `${from === 'garden' ? '<button class="linkbtn back" id="pc-back">&larr; All plants</button>' : ''}${headBlock(def, stage)}
        <div class="stat-line"><span><b>${Y.STAGE_NAMES[stage]}</b></span>
          <span>${age > 3650 ? 'Long-established' : `Planted ${fmtDate(rec.planted)} (${age === 0 ? 'today' : age + ' days ago'})`}</span>
          <span>${cap(sunWords[sun.level])} here</span></div>
        ${sunNote}
        ${nextUp}
        <div class="card status ${ws.state === 'due' ? 'due' : 'good'}">${I.html('water')}<div class="grow"><b>${esc(ws.label)}</b><div class="small muted">Needs ${def.water} water${C.isEstablishing(rec) ? ', more while establishing' : ''}.</div></div>
          <button class="btn" id="pc-water" ${rec.lastWatered === Y.todayStr() ? 'disabled' : ''}>${rec.lastWatered === Y.todayStr() ? 'Logged' : 'Watered it'}</button></div>
        ${needs}
        ${gives.length ? `<div class="card"><h3>What it gives</h3><p class="small">${esc(gives.join(' '))}</p></div>` : ''}
        <p>${esc(def.notes)}</p>
        <div class="card"><h3>Calendar</h3>${calendar(def)}</div>
        ${facts(def)}
        ${def.harvestable ? `<div class="card status good"><div class="grow"><b>Harvests: ${rec.harvests.length}</b><div class="small muted">${rec.harvests.length ? 'Last ' + fmtDate(rec.harvests[rec.harvests.length - 1]) : 'Nothing picked yet'}</div></div><button class="btn gold" id="pc-harvest">Log harvest</button></div>` : ''}
        <div class="card"><h3>Notes</h3>
          <textarea class="search" id="pc-note" placeholder="What did you notice? New growth, pests, first bloom…" maxlength="500"></textarea>
          <div class="row" style="margin-top:8px"><button class="btn" id="pc-add-note">Add note</button></div>
          <div class="notes" style="margin-top:8px">${notes.map(n => `<div class="note"><time>${fmtDate(n.date)}</time>${esc(n.text)}</div>`).join('') || '<span class="small muted">No notes yet.</span>'}</div></div>
        <div class="row"><button class="btn alt" id="pc-locate">Show on map</button><button class="btn alt" id="pc-move">Move it</button>${buy}<button class="btn danger" id="pc-died">It died</button><button class="btn danger" id="pc-dig">Dig up</button></div>`,
      bind() {
        const at = { x, y };
        const w = $('pc-water'); if (w) w.onclick = () => waterAt(at);
        const h = $('pc-harvest');
        if (h) h.onclick = () => { snapshot(); rec.harvests.push(Y.todayStr()); Y.log('harvest', rec.id, Y.key(x, y), `Harvested ${def.name}`); G.harvested(at); toast(`Harvest logged <b>+${G.XP.harvest} XP</b>`); persist(); };
        $('pc-add-note').onclick = () => {
          const ta = $('pc-note'), text = ta.value.trim();
          if (!text) { ta.focus(); return; }
          snapshot();
          rec.notes.push({ date: Y.todayStr(), text });
          Y.log('note', rec.id, Y.key(x, y), text);
          const xp = G.noted(at);
          toast(xp ? `Note saved <b>+${xp} XP</b>` : 'Note saved');
          persist();
        };
        $('pc-locate').onclick = () => { closeSheet(); centerOn(x, y, Math.max(cam.s, 2)); ui.selected = at; requestDraw(); };
        $('pc-move').onclick = () => {
          closeSheet(); setTool('build'); selectBrush('move');
          ui.moving = { kind: 'plant', from: at };
          centerOn(x, y, Math.max(cam.s, 1.6));
          toast(`Moving your <b>${esc(def.name)}</b>. Tap where it should go.`);
        };
        const back = $('pc-back');
        if (back) back.onclick = () => { ui.gardenTab = 'plants'; openSheet('garden'); };
        $('pc-died').onclick = async () => {
          const cause = await dialog(`<h3>Sorry about your ${esc(def.name)}</h3><p class="small">Recording what happened helps you pick better next time. It stays in your journal.</p>`,
            ['Too dry', 'Too wet', 'Freeze', 'Pests', 'Not sure'].map(c => ({ label: c, cls: 'alt', value: c })).concat([{ label: 'Cancel', value: null }]));
          if (!cause) return;
          snapshot(); Y.markDied(x, y, cause); closeSheet(); toast(`Recorded. Tile ${x},${y} is free to replant.`); persist();
        };
        $('pc-dig').onclick = async () => {
          const ok = await dialog(`<h3>Dig up this ${esc(def.name)}?</h3><p class="small">Use this for mistakes or moved plants. If it died, use "It died" instead so it stays in your history.</p>`,
            [{ label: 'Cancel', cls: 'alt', value: false }, { label: 'Dig up', value: true }]);
          if (!ok) return;
          snapshot(); Y.removePlant(x, y); closeSheet(); persist();
        };
      },
    };
  }

  // quests --------------------------------------------------------------
  // to-dos: today (with XP for real chores), a calendar, and trip planning
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dShort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const plantNames = list => { const n = [...new Set(list.map(p => p.name))]; return n.slice(0, 4).join(', ') + (n.length > 4 ? ` +${n.length - 4} more` : ''); };

  function renderTodos() {
    const tab = ui.todoTab || 'today';
    const seg = `<div class="seg">${[['today', 'Today'], ['calendar', 'Calendar'], ['trip', 'Going away?']].map(([k, l]) =>
      `<button data-ttab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const part = { today: todosToday, calendar: todosCalendar, trip: todosTrip }[tab]();
    return {
      title: 'To-dos',
      html: seg + part.html,
      bind(body) {
        body.querySelectorAll('[data-ttab]').forEach(b => b.onclick = () => { ui.todoTab = b.dataset.ttab; renderSheet(true); });
        if (part.bind) part.bind(body);
      },
    };
  }

  function todosToday() {
    const qs = G.quests(ui.weather);
    const daily = qs.filter(q => !q.monthly), monthly = qs.filter(q => q.monthly);
    const doneN = daily.filter(q => q.complete).length;
    const row = q => {
      const right = q.complete
        ? `<span class="stamp">${I.html('check')}</span>`
        : q.kind === 'manual' ? `<button class="btn" data-done="${q.id}">Done</button>` : '';
      const extra = q.id === 'water' && q.plants && q.plants.length ? `<button class="btn alt" data-show style="margin-top:6px;min-height:34px;padding:4px 10px">Show me</button>` : '';
      const prog = q.progress ? `<div class="prog"><i style="width:${Math.round(100 * q.progress.done / Math.max(1, q.progress.total))}%"></i></div>` : '';
      return `<div class="quest ${q.complete ? 'done' : ''}">${iconFor(q.icon)}<div class="grow"><div class="qt">${esc(q.title)}</div><div class="qs">${esc(q.sub)}</div>${prog}${extra}</div><span class="xp">+${q.xp}</span>${right}</div>`;
    };
    // the week ahead: projected watering, rain that covers it
    const plan = C.waterSchedule(ui.weather, 8);
    const ahead = [];
    for (let d = 1; d < 8; d++) {
      const iso = Y.todayStr(d), list = plan.byDate[iso];
      if (plan.rain[iso]) ahead.push(`<div class="ahead"><b>${dShort(iso)}</b><span>Rain (${plan.rain[iso].toFixed(1)}"): it does the watering</span></div>`);
      else if (list) ahead.push(`<div class="ahead"><b>${dShort(iso)}</b><span>Water ${list.length}: ${esc(plantNames(list))}</span></div>`);
    }
    const trip = G.state().trip;
    return {
      html: `<p class="muted small">${doneN} of ${daily.length} done today. Tick a to-do after you do it in your real garden.</p>
        <div class="section-title">Today</div>${daily.map(row).join('')}
        ${monthly.length ? `<div class="section-title">This month</div>${monthly.map(row).join('')}` : ''}
        <div class="section-title">This week</div>
        ${ahead.length ? ahead.join('') : `<p class="small muted">No hand watering expected this week.${plan.rainFed ? ` Your ${plan.rainFed} established plant${plan.rainFed === 1 ? '' : 's'} live on rain.` : ''}</p>`}
        ${trip ? `<div class="card"><b>Away ${dShort(trip.start)} to ${dShort(trip.end)}.</b> <button class="linkbtn" data-ttab-go="trip">See the watering plan</button></div>` : ''}
        <p class="small muted">Every plant's next step is in <button class="linkbtn" id="td-plants">Garden &gt; Plants</button>.</p>`,
      bind(body) {
        body.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
          snapshot();
          if (G.completeQuest(b.dataset.done, ui.weather)) persist(); else Y.dropCheckpoint();
        });
        $('td-plants').onclick = () => { ui.gardenTab = 'plants'; openSheet('garden'); };
        const go = body.querySelector('[data-ttab-go]');
        if (go) go.onclick = () => { ui.todoTab = 'trip'; renderSheet(true); };
        const show = body.querySelector('[data-show]');
        if (show) show.onclick = () => {
          const q = qs.find(x => x.id === 'water');
          closeSheet(); setTool('water');
          ui.highlight = q.plants; ui.highlightUntil = performance.now() + 5000;
          const [x, y] = q.plants[0].split(',').map(Number);
          centerOn(x, y, Math.max(cam.s, 1.6));
        };
      },
    };
  }

  // month grid: watering (projected ~6 weeks out), rain, frost/heat, trip days
  function todosCalendar() {
    const today = Y.todayStr();
    const base = new Date(today + 'T12:00:00');
    const off = ui.calMonth || 0;
    const first = new Date(base.getFullYear(), base.getMonth() + off, 1, 12);
    const plan = C.waterSchedule(ui.weather, 62);
    const fc = ui.weather && !ui.weather.fallback ? ui.weather.forecast : [];
    const trip = G.state().trip;
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const sel = ui.calDay || today;
    let cells = '';
    for (let i = 0; i < first.getDay(); i++) cells += '<span class="cd empty"></span>';
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= days; n++) {
      const d = iso(new Date(first.getFullYear(), first.getMonth(), n, 12));
      const water = plan.byDate[d], f = fc.find(x => x.date === d);
      const away = trip && d >= trip.start && d <= trip.end;
      const marks = (water ? `<i class="m-water">${water.length}</i>` : '') + (plan.rain[d] ? '<i class="m-rain"></i>' : '')
        + (f && f.loF <= 36 ? '<i class="m-frost"></i>' : '') + (f && f.hiF >= 98 ? '<i class="m-heat"></i>' : '');
      cells += `<button class="cd${d === today ? ' today' : ''}${d < today ? ' past' : ''}${away ? ' away' : ''}${d === sel ? ' sel' : ''}" data-day="${d}"><span>${n}</span><span class="marks">${marks}</span></button>`;
    }
    // details for the selected day
    const water = plan.byDate[sel], f = fc.find(x => x.date === sel), lines = [];
    if (sel < today) lines.push('<p class="small muted">That day has passed. Your journal has what you did.</p>');
    if (trip && sel >= trip.start && sel <= trip.end) lines.push(`<div class="ahead"><b>Away</b><span>${water ? 'Someone needs to water today (see Going away?)' : 'Nothing to water today'}</span></div>`);
    if (plan.rain[sel]) lines.push(`<div class="ahead"><b>Rain</b><span>${plan.rain[sel].toFixed(1)}" forecast: skip the hose</span></div>`);
    if (water) lines.push(`<div class="ahead"><b>Water ${water.length}</b><span>${esc(plantNames(water))}${water.some(p => p.establishing) ? '. New plants need it every 2 days until established.' : ''}</span></div>`);
    if (f && f.loF <= 36) lines.push(`<div class="ahead"><b>Frost</b><span>Low of ${Math.round(f.loF)}°F: cover tender plants the evening before</span></div>`);
    if (f && f.hiF >= 98) lines.push(`<div class="ahead"><b>Heat</b><span>High of ${Math.round(f.hiF)}°F: water the evening before</span></div>`);
    if (sel.endsWith('-01')) lines.push(`<div class="ahead"><b>This month</b><span>${esc((G.monthlyChores(Number(sel.slice(5, 7))) || []).join('. '))}</span></div>`);
    if (!lines.length && sel >= today) lines.push('<p class="small muted">Nothing to do this day.</p>');
    const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return {
      html: `<div class="cal-head"><button class="mapbtn small" data-cal="-1" ${off <= 0 ? 'disabled' : ''} aria-label="Previous month">&lsaquo;</button><b>${title}</b><button class="mapbtn small" data-cal="1" ${off >= 1 ? 'disabled' : ''} aria-label="Next month">&rsaquo;</button></div>
        <div class="calgrid">${WD.map(w => `<span class="cw">${w[0]}</span>`).join('')}${cells}</div>
        <div class="cal-legend small"><span><i class="m-water">2</i> water</span><span><i class="m-rain"></i> rain</span><span><i class="m-frost"></i> frost</span><span><i class="m-heat"></i> heat</span><span><i class="m-away"></i> away</span></div>
        <div class="section-title">${dShort(sel)}</div>${lines.join('')}
        <p class="small muted">Watering is projected from each plant's needs and the forecast, assuming you water when it's due.</p>`,
      bind(body) {
        body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { ui.calDay = b.dataset.day; renderSheet(false); });
        body.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => { ui.calMonth = Math.max(0, Math.min(1, off + Number(b.dataset.cal))); renderSheet(false); });
      },
    };
  }

  // Going away? Pick dates; get the soak-before list and the helper days
  function todosTrip() {
    const trip = G.state().trip;
    const start = trip ? trip.start : Y.todayStr(7), end = trip ? trip.end : Y.todayStr(13);
    const plan = trip ? C.tripPlan(ui.weather, trip.start, trip.end) : null;
    let out = '';
    if (trip && !plan) out = '<p class="small warnline">Pick an end date on or after the start date.</p>';
    else if (plan) {
      const soak = plan.soakOn ? `<div class="ahead"><b>${dShort(plan.soakOn)}</b><span>Before you go: soak ${plan.scheduled ? `all ${plan.scheduled} plant${plan.scheduled === 1 ? '' : 's'} on a schedule` : 'any new plantings'} deeply, then mulch bare soil.</span></div>` : '';
      const helper = plan.helper.map(h => `<div class="ahead need"><b>${dShort(h.date)}</b><span>Needs water: ${esc(plantNames(h.plants))}</span></div>`).join('');
      out = `<div class="section-title">Your plan</div>${soak}
        ${plan.helper.length ? `<p class="small"><b>Ask a neighbor or set a hose timer for these ${plan.helper.length} day${plan.helper.length === 1 ? '' : 's'}:</b></p>${helper}`
          : `<div class="card status good"><b>No watering needed while you're gone.</b></div>`}
        ${plan.rainDays.length ? `<p class="small">Rain is forecast on ${plan.rainDays.map(dShort).join(', ')}; that's already counted.</p>` : ''}
        ${plan.rainFed ? `<p class="small muted">${plan.rainFed} established plant${plan.rainFed === 1 ? '' : 's'} live on rain and will be fine.</p>` : ''}
        ${plan.helper.some(h => h.plants.some(p => p.establishing)) ? '<p class="small muted">New plants need water every 2 days until their roots establish. Planting right before a trip makes this list longer.</p>' : ''}`;
    }
    return {
      html: `<p class="small">Leaving town? Pick your dates and see what to water before you go, and which days someone needs to water for you.</p>
        <div class="trip-dates"><label>Leave<input type="date" id="trip-start" value="${start}" min="${Y.todayStr()}"></label><label>Back<input type="date" id="trip-end" value="${end}" min="${Y.todayStr()}"></label></div>
        <div class="row"><button class="btn" id="trip-save">${trip ? 'Update plan' : 'Plan my trip'}</button>${trip ? '<button class="btn alt" id="trip-clear">Clear trip</button>' : ''}</div>
        ${out}`,
      bind(body) {
        $('trip-save').onclick = () => {
          const s = $('trip-start').value, e = $('trip-end').value;
          if (!s || !e) { toast('Pick both dates.'); return; }
          G.setTrip({ start: s, end: e < s ? s : e }); G.save(); renderSheet(false);
        };
        const c = $('trip-clear');
        if (c) c.onclick = () => { G.setTrip(null); G.save(); renderSheet(false); };
      },
    };
  }

  // garden: report / badges / journal / more ----------------------------
  function renderGarden() {
    const tabs = [['plants', 'Plants'], ['report', 'Report'], ['badges', 'Badges'], ['journal', 'Journal'], ['more', 'More']];
    const seg = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${ui.gardenTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const part = { plants: gardenPlants, report: gardenReport, badges: gardenBadges, journal: gardenJournal, more: gardenMore }[ui.gardenTab]();
    return {
      title: 'Your garden',
      html: seg + part.html,
      bind(body) {
        body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ui.gardenTab = b.dataset.tab; renderSheet(true); });
        if (part.bind) part.bind(body);
      },
    };
  }

  // every plant with its next action and when; tap one for its dashboard
  const GROUPS = { today: 'Needs you today', week: 'This week', month: 'This month', later: 'Later' };
  function gardenPlants() {
    const rows = C.gardenDashboard(ui.weather);
    if (!rows.length) return { html: '<p class="muted">No plants yet. Open the Plant shop, or map what already grows with "Already in my yard".</p>' };
    const m = month();
    const inBloom = p => Y.growthStage(p.rec) === 3 && p.def.bloom !== p.def.color;
    const blooming = rows.filter(r => inBloom(r.p)).length;
    const establishing = rows.filter(r => C.isEstablishing(r.p.rec)).length;
    const thirsty = rows.filter(r => r.agenda.some(a => a.kind === 'water' && a.urgent)).length;
    let html = `<div class="tiles">
        <div class="tile ${thirsty ? 'warn' : ''}"><b>${thirsty}</b><span>need water today</span></div>
        <div class="tile"><b>${blooming}</b><span>blooming now</span></div>
        <div class="tile"><b>${establishing}</b><span>still establishing</span></div>
        <div class="tile"><b>${rows.length}</b><span>plants</span></div></div>`;
    for (const g of Object.keys(GROUPS)) {
      const list = rows.filter(r => r.group === g);
      if (!list.length) continue;
      html += `<div class="section-title">${GROUPS[g]} (${list.length})</div><div class="list">${list.map(r => {
        const { p, next } = r;
        const badges = [inBloom(p) ? '<span class="tag now">Blooming</span>' : '',
          C.isEstablishing(p.rec) ? `<span class="tag">Day ${Y.daysSince(p.rec.planted) + 1} of ${p.def.establishDays} settling in</span>` : ''].join('');
        return `<button class="item prow" data-plant="${p.x},${p.y}">${swatchImg(p.def, '', Y.growthStage(p.rec))}
          <span class="grow"><span class="name">${esc(p.def.name)}</span>
          <span class="next ${r.group}">${next ? `${next.date ? `<b>${C.whenLabel(next)}</b> · ` : ''}${esc(next.text)}` : 'Nothing to do'}</span>
          ${badges ? `<span class="tags">${badges}</span>` : ''}</span></button>`;
      }).join('')}</div>`;
    }
    return {
      html: html + '<p class="small muted">Watering dates come from each plant\'s needs and the forecast. Tap a plant for everything it needs.</p>',
      bind(body) {
        body.querySelectorAll('[data-plant]').forEach(b => b.onclick = () => {
          const [x, y] = b.dataset.plant.split(',').map(Number);
          openSheet('plant', { x, y, from: 'garden' });
        });
      },
    };
  }

  function gardenReport() {
    const ins = C.insights();
    const max = Math.max(1, ...ins.bloomByMonth);
    const now = month();
    const wl = Object.entries(ins.wildlifeTypes).filter(([, n]) => n).map(([k, n]) => `<span class="tag wild">${k}: ${n}</span>`).join('');
    const gapText = ins.gaps.length
      ? `<div class="card"><h3>Fill the gaps</h3><p class="small">Nothing blooms in ${ins.gaps.map(m => C.MONTHS[m - 1]).join(', ')}. Natives that would:</p>
          <div class="list" style="margin-top:8px">${ins.gapFillers.map(d => `<button class="item" data-info="${d.id}">${swatchImg(d)}<span class="grow"><span class="name">${esc(d.name)}</span><span class="meta">Blooms ${C.monthList(d.bloomMonths)}</span></span></button>`).join('')}</div></div>`
      : `<div class="card"><h3>Blooms all year</h3><p class="small">Something flowers in every month. Pollinators always have food here.</p></div>`;
    return {
      html: `<div class="tiles">
          <div class="tile"><b>${ins.total}</b><span>plants growing</span></div>
          <div class="tile"><b>${Math.round(ins.nativeShare * 100)}%</b><span>natives</span></div>
          <div class="tile"><b>${ins.wildlifePlants}</b><span>plants feeding wildlife</span></div>
          <div class="tile"><b>${ins.monthsInBloom}/12</b><span>months with blooms</span></div></div>
        <div class="card"><h3>Bloom calendar</h3><p class="small muted">Plants in flower each month</p>
          <div class="bars">${ins.bloomByMonth.map(n => `<div class="${n ? '' : 'gap'}">${n ? `<em>${n}</em>` : ''}<i style="height:${Math.round(100 * n / max)}%"></i></div>`).join('')}</div>
          <div class="bars-axis">${C.MONTHS.map((mn, i) => `<span class="${i + 1 === now ? 'now' : ''} ${ins.bloomByMonth[i] ? '' : 'gap'}">${mn[0]}</span>`).join('')}</div></div>
        ${gapText}
        <div class="card"><h3>Wildlife support</h3><div class="tags">${wl || '<span class="small muted">No wildlife plants yet. Try the Wildlife filter in the Plant shop.</span>'}</div>
          ${ins.hosts.length ? `<p class="small" style="margin-top:6px">Caterpillar host plants: ${ins.hosts.map(d => esc(d.name)).join(', ')}.</p>` : ''}</div>
        ${Y.state.lost.length ? `<div class="card"><h3>Lost plants: ${Y.state.lost.length}</h3><div class="small">${Y.state.lost.slice(-5).reverse().map(l => `${esc(window.PLANT_BY_ID[l.id] ? window.PLANT_BY_ID[l.id].name : l.id)}: ${esc(l.cause || 'unknown')} (${fmtDate(l.died)})`).join('<br>')}</div></div>` : ''}`,
      bind(body) { body.querySelectorAll('[data-info]').forEach(b => b.onclick = () => openSheet('info', { id: b.dataset.info })); },
    };
  }

  function gardenBadges() {
    const got = G.state().badges;
    const n = Object.keys(got).length;
    return {
      html: `<p class="muted small">${n} of ${G.BADGES.length} badges. Best streak: ${G.state().bestStreak} days.</p>
        <div class="badges">${G.BADGES.map(b => `<div class="badge ${got[b.id] ? '' : 'locked'}"><div class="medal">${got[b.id] ? iconFor(b.icon) : I.html('lock')}</div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join('')}</div>`,
    };
  }

  function gardenJournal() {
    const rows = Y.state.journal.slice().reverse().slice(0, 150);
    const name = id => (window.PLANT_BY_ID[id] ? window.PLANT_BY_ID[id].name : '');
    const line = j => ({
      planted: `Planted ${esc(name(j.plantId))}`,
      added: `Mapped your existing ${esc(name(j.plantId))}`,
      moved: `Moved your ${esc(name(j.plantId))}`,
      died: `Lost ${esc(name(j.plantId))}${j.text ? ' (' + esc(j.text) + ')' : ''}`,
      note: `<b>${esc(name(j.plantId))}:</b> ${esc(j.text)}`,
      harvest: esc(j.text),
      badge: esc(j.text),
      level: esc(j.text),
    }[j.type] || esc(j.text));
    return {
      html: rows.length
        ? `<div class="journal">${rows.map(j => `<div class="jrow"><time>${fmtDate(j.date)}</time><span>${line(j)}</span></div>`).join('')}</div>`
        : '<p class="muted">Your garden diary fills in as you plant, harvest and write notes.</p>',
    };
  }

  // house builder ------------------------------------------------------
  const WALLS = [
    ['Brick', { brick: 'Red brick', brick_tan: 'Tan brick', brick_gray: 'Gray brick', brick_white: 'Painted brick' }],
    ['Siding', { cream: 'Cream', white: 'White', gray: 'Gray', blue: 'Blue', sage: 'Sage', yellow: 'Yellow', navy: 'Navy' }],
    ['Barn', { barn_red: 'Red', barn_teal: 'Teal', barn_yellow: 'Yellow', barn_gray: 'Gray' }],
  ];
  const ROOFS = { gray: 'Gray shingle', black: 'Black', brown: 'Brown', red: 'Red', green: 'Green', blue: 'Blue', metal: 'Metal' };
  const DOORS = { wood: ['Wood', '#b7773e'], red: ['Red', '#b23a30'], blue: ['Blue', '#2f5d8c'], green: ['Green', '#3f6e48'], black: ['Black', '#33333b'], white: ['White', '#ecebe6'], yellow: ['Yellow', '#e3b947'] };
  const BOXES = { red: ['Red', '#d9442f'], pink: ['Pink', '#e58fb0'], purple: ['Purple', '#7a5cc8'], yellow: ['Yellow', '#ecd060'], white: ['White', '#f2f0e6'] };

  // average color of an atlas frame (left strip for walls, so the window doesn't count)
  const colorCache = {};
  function frameColor(key, strip) {
    if (colorCache[key]) return colorCache[key];
    const img = window.ART.get(key);
    if (!img || !img.getContext) return '#999'; // not loaded yet: don't cache
    const w = strip ? Math.min(5, img.width) : img.width, y0 = strip ? 5 : 0, h = img.height - y0 * 2;
    const d = img.getContext('2d').getImageData(0, y0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return (colorCache[key] = n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : '#999');
  }

  // footprint thumbnail: the preset's rects (garage dashed) as a tiny SVG
  function shapeIcon(shape) {
    const fp = Y.footprint({ shape, garage: 'none' });
    const [bx, by, bw, bh] = fp.box;
    const rects = fp.rects.map(([x, y, w, h]) => `<rect x="${x - bx}" y="${y - by}" width="${w}" height="${h}"/>`).join('');
    return `<svg class="shape-ico" viewBox="-1 -1 ${bw + 2} ${bh + 2}" aria-hidden="true">${rects}</svg>`;
  }

  function chipRow(field, options, cur, swatch) {
    return `<div class="chips wrap">${Object.entries(options).map(([v, label]) =>
      `<button data-home="${field}" data-v="${v}" class="${cur === v ? 'active' : ''}">${swatch ? `<span class="dot" style="background:${swatch(v)}"></span>` : ''}${label}</button>`).join('')}</div>`;
  }

  function renderHouse() {
    const h = Y.state.home, plan = h.plan, opts = window.ART.houseOptions();
    const has = list => v => !list.length || list.includes(v);
    const barn = /^barn_/.test(h.wall);
    const seg = (field, pairs, cur) => `<div class="seg">${pairs.map(([v, l]) => `<button data-home="${field}" data-v="${v}" class="${String(cur) === String(v) ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const shapes = Object.entries(Y.HOUSE_SHAPES).map(([id, sh]) =>
      `<button class="shape${plan && plan.shape === id ? ' active' : ''}" data-shape="${id}">${shapeIcon(id)}<span>${sh.name}</span></button>`).join('');
    const walls = WALLS.map(([group, names]) => {
      const avail = Object.fromEntries(Object.entries(names).filter(([v]) => has(opts.walls)(v)));
      return Object.keys(avail).length ? `<div class="small muted" style="margin-top:6px">${group}</div>${chipRow('wall', avail, h.wall, v => frameColor('house/wall/' + v, true))}` : '';
    }).join('');
    const roofs = Object.fromEntries(Object.entries(ROOFS).filter(([v]) => has(opts.roofs)(v)));
    const doors = Object.fromEntries(Object.entries(DOORS).map(([v, [l]]) => [v, l]));
    const boxes = Object.assign({ '': 'None' }, Object.fromEntries(Object.entries(BOXES).map(([v, [l]]) => [v, l])));
    return {
      title: 'Your house',
      html: `<div class="card"><h3>Shape</h3>
          <p class="small">${plan ? 'Tap a shape to swap it. The house never lands on plants: move them first with Build &gt; Move.' : 'Pick a shape to replace the house you painted.'}</p>
          <div class="shapes">${shapes}</div>
          ${plan ? `<div class="section-title" style="margin-top:10px">Garage</div>${seg('garage', [['none', 'None'], ['left', 'Left'], ['right', 'Right']], plan.garage || 'none')}
          <div class="section-title" style="margin-top:10px">Move</div>
          <div class="nudge"><button data-move="-1,0" aria-label="Move left">&larr;</button><button data-move="0,-1" aria-label="Move back">&uarr;</button><button data-move="0,1" aria-label="Move toward the street">&darr;</button><button data-move="1,0" aria-label="Move right">&rarr;</button></div>` : ''}
          <div class="section-title" style="margin-top:10px">Stories</div>${seg('stories', [[1, 'One'], [2, 'Two']], h.stories)}
          <div class="section-title" style="margin-top:10px">Your front door faces</div>
          <p class="small muted">Sets where the sun rises and which way shadows fall. Stand at your front door and check a compass app.</p>
          ${chipRow('facing', { N: 'North', NE: 'NE', E: 'East', SE: 'SE', S: 'South', SW: 'SW', W: 'West', NW: 'NW' }, h.facing || 'S')}</div>
        <div class="card"><h3>Walls</h3>${walls}</div>
        <div class="card"><h3>Roof</h3>${chipRow('roof', roofs, h.roof, v => frameColor('house/roof/' + v))}</div>
        ${barn ? '' : `<div class="card"><h3>Front door</h3>${chipRow('door', doors, h.door, v => DOORS[v][1])}</div>`}
        <div class="card"><h3>Extras</h3>
          ${barn ? '' : `<div class="small muted">Window boxes</div>${chipRow('boxes', boxes, h.boxes, v => v ? BOXES[v][1] : 'transparent')}`}
          <div class="chips wrap" style="margin-top:8px">
            <button data-toggle="chimney" class="${h.chimney ? 'active' : ''}">Chimney</button>
            <button data-toggle="pots" class="${h.pots ? 'active' : ''}">Planters by the door</button></div></div>
        <button class="btn block" id="house-done">Done</button>`,
      bind(body) {
        const change = fn => { snapshot(); fn(); persist(); };
        body.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => {
          const p = h.plan;
          if (moveHouse(p ? Y.clampPlan({ shape: b.dataset.shape, garage: p.garage, x: p.x, y: p.y }) : Y.defaultPlan(b.dataset.shape, 'right'))) focusHouse();
        });
        body.querySelectorAll('[data-home]').forEach(b => b.onclick = () => {
          const f = b.dataset.home, v = b.dataset.v, p = h.plan;
          if (f === 'garage') moveHouse(Y.clampPlan({ shape: p.shape, garage: v, x: p.x, y: p.y }));
          else change(() => { h[f] = f === 'stories' ? Number(v) : v; });
        });
        body.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => change(() => { h[b.dataset.toggle] = !h[b.dataset.toggle]; }));
        body.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
          const [dx, dy] = b.dataset.move.split(',').map(Number), p = h.plan;
          moveHouse(Y.clampPlan({ shape: p.shape, garage: p.garage, x: p.x + dx, y: p.y + dy }));
        });
        $('house-done').onclick = () => {
          closeSheet();
          if (ui.tool === 'build' || ui.afterHouse) {
            setTool('build');
            toast('Now paint beds, paths and patios with Build.');
          }
          if (ui.afterHouse) { ui.afterHouse = false; if (!prefs.tipsSeen) showTips(); }
        };
      },
    };
  }

  // center the house in the part of the map the open sheet doesn't cover
  function focusHouse() {
    const t = Y.houseTiles();
    if (!t.length) return;
    const xs = t.map(a => a[0]), ys = t.map(a => a[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 1;
    const v = view(), wide = window.innerWidth >= 900;
    const covX = wide ? sheet.offsetWidth : 0, covY = wide ? 0 : Math.max(0, sheet.offsetHeight - (window.innerHeight - canvas.getBoundingClientRect().bottom));
    const s = clampS(Math.min((v.w - covX) / ((Math.max(...xs) - Math.min(...xs) + 6) * T), (v.h - covY) / ((Math.max(...ys) - Math.min(...ys) + 6) * T)));
    cam.s = s;
    cam.x = (v.w - covX) / 2 - (cx + 0.5) * T * s;
    cam.y = (v.h - covY) / 2 - (cy + 0.5) * T * s;
    requestDraw();
  }

  function gardenMore() {
    const credit = window.ART.creditLine();
    return {
      html: `<div class="card"><h3>Your house</h3><p class="small">Shape, garage, stories, colors, door, and extras like flower boxes and a chimney.</p><div class="row" style="margin-top:8px"><button class="btn" id="m-house">Customize your house</button></div></div>
        <div class="card"><h3>Share</h3><p class="small">Save a picture of your pixel yard.</p><div class="row" style="margin-top:8px"><button class="btn" id="m-share">Save yard picture</button></div></div>
        <div class="card"><h3>Describe your yard to Claude</h3><p class="small">Chat about your real yard and Claude builds the map for you.</p><div class="row" style="margin-top:8px"><button class="btn alt" id="m-interview">Start interview</button></div></div>
        <div class="card"><h3>Backup</h3><p class="small">Copy your garden to keep it safe or move it to another device.</p>
          <div class="row" style="margin-top:8px"><button class="btn alt" id="m-export">Copy backup</button><button class="btn alt" id="m-import">Restore</button></div></div>
        <div class="card"><h3>Start over</h3><p class="small">Pick a new starting yard. This clears your map, XP and badges.</p><div class="row" style="margin-top:8px"><button class="btn danger" id="m-reset">Start over</button></div></div>
        ${MON.supportUrl ? `<a class="btn gold block" target="_blank" rel="noopener" href="${esc(MON.supportUrl)}">Support GardenStar</a>` : ''}
        <p class="small muted">GardenStar test flight. Prototype garden: ${esc(window.SITE.address)} (USDA zone ${window.SITE.usdaZone}). Plant data: Gulf Coast natives and the Harris County planting calendar. Weather: Open-Meteo.${credit ? ' ' + esc(credit) + '.' : ''} Not affiliated with FarmVille or Zynga.</p>`,
      bind(body) {
        $('m-house').onclick = () => openSheet('house');
        $('m-share').onclick = shareYard;
        $('m-interview').onclick = () => { closeSheet(); showWelcome('interview'); };
        $('m-export').onclick = exportGarden;
        $('m-import').onclick = importGarden;
        $('m-reset').onclick = async () => {
          const ok = await dialog('<h3>Start over?</h3><p class="small">Your map, XP, badges and journal will be cleared. Copy a backup first if you want to keep them.</p>',
            [{ label: 'Cancel', cls: 'alt', value: false }, { label: 'Start over', value: true }]);
          if (ok) { closeSheet(); showWelcome('home'); }
        };
      },
    };
  }

  function renderWeather() {
    const w = ui.weather;
    if (!w) return { title: 'Weather', html: '<p class="muted">Loading the forecast…</p>' };
    const rain7 = window.WEATHER.rainLast7(w);
    const day = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    return {
      title: 'Weather',
      html: `<div class="card status good">${I.html(w.current.icon, '')}<div class="grow"><b style="font-family:var(--pixel);font-size:22px">${w.fallback ? '~' : ''}${w.current.tempF}°F</b><div class="small">${esc(w.current.desc)}${w.current.humidity != null ? ` · ${w.current.humidity}% humidity` : ''}</div></div></div>
        ${w.fallback ? `<div class="warnline">The live forecast can't load here, so this shows Houston's typical ${new Date().toLocaleDateString('en-US', { month: 'long' })}: highs near ${w.forecast[0].hiF}°F and about ${w.monthRainIn}" of rain for the month. Watering advice uses your log instead of actual rainfall.</div>` : ''}
        <div class="forecast">${w.forecast.map(d => `<div><span>${day(d.date)}</span>${I.html(d.icon)}<b>${Math.round(d.hiF)}°</b><span>${Math.round(d.loF)}°</span><span>${d.rainIn >= 0.05 ? d.rainIn.toFixed(1) + '"' : d.rainProb != null ? d.rainProb + '%' : ''}</span></div>`).join('')}</div>
        ${rain7 !== null ? `<div class="card"><h3>Rain, last 7 days: ${rain7.toFixed(2)}"</h3><p class="small">${rain7 >= 1 ? 'That covers established plants this week. Only new plantings need you.' : 'Under the 1" a week that established beds want. Plan one deep soak.'}</p></div>` : ''}`,
    };
  }
  $('hud-weather').onclick = () => openSheet('weather');
  $('hud-level').onclick = () => { ui.gardenTab = 'badges'; openSheet('garden'); };

  // ---------- share / backup ----------
  function shareYard() {
    const a = document.createElement('a');
    a.download = 'my-gardenstar-yard.png';
    a.href = world.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
    toast('Yard picture saved');
  }
  async function exportGarden() {
    const text = Y.serialize();
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* clipboard blocked */ }
    if (copied) { toast('Backup copied. Paste it somewhere safe, like a note.'); return; }
    await dialog(`<h3>Your backup</h3><p class="small">Select all and copy this text.</p><textarea class="search" readonly style="min-height:160px">${esc(text)}</textarea>`, [{ label: 'Done', value: true }]);
  }
  async function importGarden() {
    const box = $('dialog-box');
    const p = dialog(`<h3>Restore a garden</h3><p class="small">Paste a backup, or the JSON Claude gave you after the yard interview.</p><textarea class="search" id="imp-text" style="min-height:160px"></textarea><p class="small" id="imp-msg"></p>`,
      [{ label: 'Cancel', cls: 'alt', value: null }, { label: 'Restore', value: 'go' }]);
    const go = await p;
    if (go !== 'go') return;
    const text = box.querySelector('#imp-text').value;
    snapshot();
    const res = window.IMPORTER.importText(text);
    if (!res.ok) { Y.dropCheckpoint(); toast(esc(res.message), 'warn'); return; }
    toast(esc(res.message));
    persist(); initialCamera();
  }

  // ---------- welcome ----------
  let interviewPrompt = null;
  async function loadInterviewPrompt() {
    if (interviewPrompt) return interviewPrompt;
    try {
      const md = await (await fetch('GARDEN_INTERVIEW.md')).text();
      const m = md.match(/```text\n([\s\S]*?)\n```/);
      if (m) interviewPrompt = m[1];
    } catch (e) { /* offline */ }
    return interviewPrompt;
  }

  function showWelcome(step) {
    const el = $('welcome');
    el.classList.remove('hidden');
    const logo = `<div class="logo"><img class="mark" src="assets/icons/icon-192.png" alt=""><h1>GardenStar</h1><p>The farm game that grows your real garden.</p></div>`;
    if (step === 'interview') {
      el.innerHTML = `<div class="welcome-box">${logo}
        <h3 style="font-family:var(--pixel);font-size:19px">Describe your yard to Claude</h3>
        <ol class="steps"><li>Copy the interview prompt below.</li><li>Paste it into a new chat at claude.ai and answer its questions about your yard.</li><li>Paste the JSON it gives you back here.</li></ol>
        <button class="btn alt block" id="w-copy">Copy interview prompt</button>
        <textarea class="search" id="w-json" placeholder="Paste Claude's JSON here" style="min-height:120px"></textarea>
        <p class="small" id="w-msg"></p>
        <div class="row"><button class="btn alt" id="w-back">Back</button><button class="btn" id="w-apply">Build my yard</button></div></div>`;
      I.apply(el);
      $('w-copy').onclick = async () => {
        const p = await loadInterviewPrompt();
        if (!p) { $('w-msg').textContent = 'Couldn’t load the prompt. Open GARDEN_INTERVIEW.md in the project instead.'; return; }
        try { await navigator.clipboard.writeText(p); $('w-msg').textContent = 'Copied. Paste it into a new Claude chat.'; }
        catch (e) {
          $('w-json').value = p;
          $('w-msg').textContent = 'Copy blocked here: the prompt is in the box above. Select all, copy it, then clear the box.';
        }
      };
      $('w-back').onclick = () => showWelcome(Y.load() && prefs.welcomed ? 'close' : 'home');
      $('w-apply').onclick = () => {
        const text = $('w-json').value;
        const res = window.IMPORTER.importText(text);
        if (!res.ok) { $('w-msg').textContent = res.message; return; }
        startGame(null, res.message);
      };
      return;
    }
    if (step === 'lot') {
      const cards = Object.entries(Y.LOTS).map(([id, lot]) =>
        `<button class="choice lot" data-lot="${id}">${lotIcon(id)}<span><b>${lot.name}</b><span>${lot.desc}</span></span></button>`).join('');
      el.innerHTML = `<div class="welcome-box">${logo}
        <h3 style="font-family:var(--pixel);font-size:19px">Pick your lot shape</h3>
        <p class="small muted">Street at the bottom. You can trim the edges later with Build &gt; Not mine.</p>
        <div class="lots">${cards}</div>
        <button class="btn alt block" id="w-back">Back</button></div>`;
      I.apply(el);
      el.querySelectorAll('[data-lot]').forEach(b => b.onclick = () => startGame(b.dataset.lot === 'draw' ? 'draw' : 'blank', null, b.dataset.lot));
      $('w-back').onclick = () => showWelcome('home');
      return;
    }
    if (step === 'close') { el.classList.add('hidden'); return; }
    el.innerHTML = `<div class="welcome-box">${logo}
      <button class="choice primary" id="w-demo">${I.html('garden')}<span><b>Start with my demo yard</b><span>The Cliffwood Dr. house in Houston, with a pecan, a live oak and a few natives already growing</span></span></button>
      <button class="choice" id="w-blank">${I.html('build')}<span><b>Build my own yard</b><span>Pick your lot shape, build your house from preset pieces, then paint beds and paths</span></span></button>
      <button class="choice" id="w-chat">${I.html('scroll')}<span><b>Describe my yard to Claude</b><span>Answer a few questions in chat and Claude draws the map</span></span></button>
      <p class="small muted" style="text-align:center">Houston and the Gulf Coast only for now · zone ${window.SITE.usdaZone}</p></div>`;
    I.apply(el);
    $('w-demo').onclick = () => startGame('demo');
    $('w-blank').onclick = () => showWelcome('lot');
    $('w-chat').onclick = () => showWelcome('interview');
  }

  // mini map of a lot preset: lawn, neighbors, street
  function lotIcon(id) {
    const fill = { grass: '#6fae45', offlot: '#3b4a3c', street: '#6b6b74' };
    let rects = '';
    for (let y = 0; y < Y.H; y++) {
      let x0 = 0;
      for (let x = 1; x <= Y.W; x++) {
        const t = Y.lotTerrain(id, x0, y);
        if (x < Y.W && Y.lotTerrain(id, x, y) === t) continue;
        rects += `<rect x="${x0}" y="${y}" width="${x - x0}" height="1" fill="${fill[t]}"/>`;
        x0 = x;
      }
    }
    if (id === 'draw') rects += `<rect x="9" y="4" width="22" height="16" fill="none" stroke="#f2d16b" stroke-width="0.7" stroke-dasharray="1.6 1"/>`;
    return `<svg class="lot-ico" viewBox="0 0 ${Y.W} ${Y.H}" aria-hidden="true">${rects}</svg>`;
  }

  function startGame(mode, message, lot) {
    if (mode === 'demo') Y.buildDefaultLayout();
    if (mode === 'blank' || mode === 'draw') {
      Y.emptyLot();
      Y.applyLot(lot || 'standard');
      if (mode === 'blank') Y.stampHome(Y.defaultPlan('ranch', 'right'));
    }
    // a fresh yard (or a first run) starts a fresh game; re-importing your
    // yard from the More tab keeps your XP and badges
    if (mode || !prefs.welcomed) G.reset();
    Y.clearUndo();
    prefs.welcomed = true; savePrefs();
    $('welcome').classList.add('hidden');
    closeSheet();
    ui.plantId = null; ui.selected = null;
    setTool('look');
    G.checkBadges(null, true);
    G.checkIn();
    persist();
    initialCamera();
    if (message) toast(esc(message));
    if (mode === 'blank') { ui.afterHouse = true; openSheet('house'); } // tips wait until the house is done
    else if (mode === 'draw') startLotDrawing();
    else if (!prefs.tipsSeen) showTips();
  }

  // Draw my own: Build with Lawn in box mode until "Next: my house"
  function startLotDrawing() {
    ui.lotDraw = true;
    setTool('build');
    selectBrush('grass');
    if (!ui.box) $('pal-box').click();
    cam.s = fitScale(); clampCam(); requestDraw();
  }
  function finishLotDrawing() {
    let lawn = 0;
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) if (Y.inLot(x, y)) lawn++;
    if (lawn < 120) { toast('Draw a bigger lot first: drag a box with Lawn. A house needs about 10 × 12 tiles.'); return; }
    ui.lotDraw = false;
    snapshot();
    Y.stampHome(Y.defaultPlan('ranch', 'right'));
    persist();
    ui.afterHouse = true;
    openSheet('house');
    renderModeChip();
  }

  function showTips() {
    prefs.tipsSeen = true; savePrefs();
    dialog(`<h3>How to play</h3><ul class="tips">
      <li>${I.html('look')}<span><b>Tap</b> a plant to see its care card. <b>Pinch</b> to zoom, <b>drag</b> to move.</span></li>
      <li>${I.html('plant')}<span><b>Plant</b> opens the shop. Natives in season earn the most XP.</span></li>
      <li>${I.html('water')}<span>Water for real, then tap the plant with <b>Water</b>. Only thirsty plants earn XP.</span></li>
      <li>${I.html('scroll')}<span><b>Quests</b> are today's real chores, adjusted for the weather.</span></li></ul>`,
      [{ label: "Let's grow", value: true }]);
  }

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') { if (!$('dialog').classList.contains('hidden')) $('dialog').click(); else closeSheet(); }
    else if (e.key === '+' || e.key === '=') $('z-in').click();
    else if (e.key === '-') $('z-out').click();
  });

  // ---------- boot ----------
  I.apply(document);
  syncShadeBtn();
  syncCompass();
  new ResizeObserver(resize).observe(canvas);
  resize();

  const hadGarden = Y.load();
  G.load();
  if (hadGarden) {
    prefs.welcomed = true; savePrefs();
    initialCamera();
    if (G.checkIn()) toast(`Welcome back! ${G.state().streak > 1 ? `${G.state().streak}-day streak. ` : ''}<b>+${G.XP.checkIn} XP</b>`);
    persist();
  } else {
    Y.buildDefaultLayout();
    requestDraw(true);
    initialCamera();
    showWelcome('home');
  }
  refreshHUD();

  window.ART.init(() => {
    Object.keys(swatchCache).forEach(k => delete swatchCache[k]);
    requestDraw(true); refreshSheet(); renderModeChip();
  });

  window.WEATHER.fetchWeather().then(w => {
    ui.weather = w;
    G.syncQuests(w); G.save();
    refreshHUD(); refreshSheet();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* fine without it */ });
  }

  // test hook: lets the e2e suite drive the camera deterministically
  window.__GS = { cam, ui, tileAt, centerOn, zoomAt, initialCamera, openSheet, closeSheet };
})();
