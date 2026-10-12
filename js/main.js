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
    weather: null, sheet: null, shopFilter: 'all', shopQuery: '', gardenTab: 'report', plantMode: 'new',
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

  function renderWorld() {
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) S.drawTerrain(wctx, Y.terrainAt(x, y), x, y);
    S.drawHouses(wctx);
    // fence along the lot line: lawn tiles next to a neighbor or the map edge
    // (the street side stays open)
    const outside = (x, y) => { const t = Y.terrainAt(x, y); return t == null || t === 'offlot'; };
    for (let y = 0; y < Y.H; y++) for (let x = 0; x < Y.W; x++) {
      if (Y.terrainAt(x, y) !== 'grass') continue;
      if (outside(x, y - 1) || outside(x, y + 1)) S.drawFence(wctx, x, y, false);
      else if (outside(x - 1, y) || outside(x + 1, y)) S.drawFence(wctx, x, y, true);
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
    } else if (ui.tool === 'build' && ui.hover) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3 / cam.s;
      ctx.strokeRect(ui.hover.x * T + 1, ui.hover.y * T + 1, T - 2, T - 2);
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
    if (e.type === 'quest') toast(`Quest complete: ${esc(e.quest.title)} <b>+${e.quest.xp} XP</b>`);
  });

  function persist() {
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
    const by = sun.by ? ` from your ${window.PLANT_BY_ID[sun.by.id].name}` : '';
    const hint = Y.isPlantable(t.x, t.y) && Y.inLot(t.x, t.y) ? ' Tap Plant for the best picks for this spot.'
      : terr === 'house' ? ' Garden > More > Your house to change it.' : '';
    toast(`<b>${terrainNames[terr]}</b> · ${sunWords[sun.level]}${esc(by)}.${hint}`);
  }

  function paintAt(t) {
    if (!t || (stroke.last && stroke.last.x === t.x && stroke.last.y === t.y)) return;
    stroke.last = t;
    let changed = false;
    if (ui.terrain === 'dig') {
      if (Y.plantAt(t.x, t.y)) { Y.removePlant(t.x, t.y); changed = true; }
    } else changed = Y.setTerrain(t.x, t.y, ui.terrain);
    if (changed) { stroke.changed = true; requestDraw(true); }
  }
  const stroke = { active: false, last: null, changed: false };
  function startStroke(t) { stroke.active = true; stroke.last = null; stroke.changed = false; snapshot(); paintAt(t); }
  function endStroke() {
    if (!stroke.active) return;
    stroke.active = false;
    if (stroke.changed) persist(); else { Y.dropCheckpoint(); refreshHUD(); }
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
      else if (ui.tool === 'build') { gesture.type = 'paint'; startStroke(tileAt(p.x, p.y)); }
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
    prefs.shade = !prefs.shade; savePrefs(); syncShadeBtn(); requestDraw();
    toast(prefs.shade ? 'Showing tree shade: darker tiles get less sun.' : 'Shade map off');
  };

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
    if (ui.tool === 'plant' && ui.plantId) {
      const def = window.PLANT_BY_ID[ui.plantId];
      const hint = ui.plantMode === 'existing' ? 'Tap where it grows in your yard' : 'Tap a bed or lawn tile to plant';
      html = `${swatchImg(def, 'chip-sw')}<span class="chip-text"><b>${esc(def.name)}</b><br><span class="small muted">${hint}</span></span><button class="btn alt" id="chip-change">Change</button>`;
    } else if (ui.tool === 'water') {
      html = `${I.html('water')}<span class="chip-text"><b>Water</b><br><span class="small muted">After watering for real, tap the plant to log it</span></span>`;
    } else if (ui.tool === 'build') {
      chip.classList.add('above');
      html = `${I.html('build')}<span class="chip-text"><b>Build</b><br><span class="small muted">Drag one finger to paint. Two fingers move the map.</span></span>`;
    }
    chip.innerHTML = html;
    chip.classList.toggle('hidden', !html);
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
  document.querySelectorAll('#palette [data-terrain]').forEach(b => b.onclick = () => {
    ui.terrain = b.dataset.terrain;
    document.querySelectorAll('#palette [data-terrain]').forEach(x => x.classList.toggle('active', x === b));
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
      quests: renderQuests, garden: renderGarden, weather: renderWeather, house: renderHouse,
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
    if (q) list = list.filter(p => (p.name + ' ' + p.botanical + ' ' + p.wildlife.join(' ') + ' ' + C.lifeLabel(p) + ' ' + C.sunLabel(p)).toLowerCase().includes(q));
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

  function renderPlantCard({ x, y }) {
    const rec = Y.plantAt(x, y);
    if (!rec) return null;
    const def = window.PLANT_BY_ID[rec.id];
    const stage = Y.growthStage(rec);
    const age = Y.daysSince(rec.planted);
    const ws = C.waterStatus(rec, ui.weather);
    const sun = Y.sunAt(x, y);
    const sunNote = def.type !== 'tree' && ((def.sun === 'full sun' && sun.level !== 'full') || (def.sun === 'shade' && sun.level === 'full'))
      ? `<div class="warnline">This spot gets ${sunWords[sun.level]}${sun.by ? ' from your ' + esc(window.PLANT_BY_ID[sun.by.id].name) : ''}, but ${esc(def.name)} prefers ${def.sun}.</div>` : '';
    const notes = rec.notes.slice().reverse();
    const buy = MON.amazonTag
      ? `<a class="btn alt" target="_blank" rel="noopener sponsored" href="https://www.amazon.com/s?k=${encodeURIComponent(def.name + (def.type === 'edible' ? ' seeds' : ' plant'))}&tag=${encodeURIComponent(MON.amazonTag)}">Buy</a>` : '';
    return {
      title: def.name,
      html: `${headBlock(def, stage)}
        <div class="stat-line"><span><b>${Y.STAGE_NAMES[stage]}</b></span>
          <span>${age > 3650 ? 'Long-established' : `Planted ${fmtDate(rec.planted)} (${age === 0 ? 'today' : age + ' days ago'})`}</span>
          <span>${cap(sunWords[sun.level])} here</span></div>
        ${sunNote}
        <div class="card status ${ws.state === 'due' ? 'due' : 'good'}">${I.html('water')}<div class="grow"><b>${esc(ws.label)}</b><div class="small muted">Needs ${def.water} water${C.isEstablishing(rec) ? ', more while establishing' : ''}.</div></div>
          <button class="btn" id="pc-water" ${rec.lastWatered === Y.todayStr() ? 'disabled' : ''}>${rec.lastWatered === Y.todayStr() ? 'Logged' : 'Watered it'}</button></div>
        <p>${esc(def.notes)}</p>
        ${def.hostFor ? `<div class="card small"><b>Caterpillar host plant</b> for ${esc(def.hostFor)}. Chewed leaves mean it's working.</div>` : ''}
        <div class="card"><h3>Calendar</h3>${calendar(def)}</div>
        ${facts(def)}
        ${def.harvestable ? `<div class="card status good"><div class="grow"><b>Harvests: ${rec.harvests.length}</b><div class="small muted">${rec.harvests.length ? 'Last ' + fmtDate(rec.harvests[rec.harvests.length - 1]) : 'Nothing picked yet'}</div></div><button class="btn gold" id="pc-harvest">Log harvest</button></div>` : ''}
        <div class="card"><h3>Notes</h3>
          <textarea class="search" id="pc-note" placeholder="What did you notice? New growth, pests, first bloom…" maxlength="500"></textarea>
          <div class="row" style="margin-top:8px"><button class="btn" id="pc-add-note">Add note</button></div>
          <div class="notes" style="margin-top:8px">${notes.map(n => `<div class="note"><time>${fmtDate(n.date)}</time>${esc(n.text)}</div>`).join('') || '<span class="small muted">No notes yet.</span>'}</div></div>
        <div class="row"><button class="btn alt" id="pc-locate">Show on map</button>${buy}<button class="btn danger" id="pc-died">It died</button><button class="btn danger" id="pc-dig">Dig up</button></div>`,
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
  function renderQuests() {
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
    return {
      title: 'Quests',
      html: `<p class="muted small">${doneN} of ${daily.length} done today. Tick a quest after you do it in your real garden.</p>
        <div class="section-title">Today</div>${daily.map(row).join('')}
        ${monthly.length ? `<div class="section-title">This month</div>${monthly.map(row).join('')}` : ''}`,
      bind(body) {
        body.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
          snapshot();
          if (G.completeQuest(b.dataset.done, ui.weather)) persist(); else Y.dropCheckpoint();
        });
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

  // garden: report / badges / journal / more ----------------------------
  function renderGarden() {
    const tabs = [['report', 'Report'], ['badges', 'Badges'], ['journal', 'Journal'], ['more', 'More']];
    const seg = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${ui.gardenTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const part = { report: gardenReport, badges: gardenBadges, journal: gardenJournal, more: gardenMore }[ui.gardenTab]();
    return {
      title: 'Your garden',
      html: seg + part.html,
      bind(body) {
        body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ui.gardenTab = b.dataset.tab; renderSheet(true); });
        if (part.bind) part.bind(body);
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
          <p class="small">${plan ? 'Tap a shape to swap it. Your beds and plants stay put unless the house moves onto them.' : 'Pick a shape to replace the house you painted.'}</p>
          <div class="shapes">${shapes}</div>
          ${plan ? `<div class="section-title" style="margin-top:10px">Garage</div>${seg('garage', [['none', 'None'], ['left', 'Left'], ['right', 'Right']], plan.garage || 'none')}
          <div class="section-title" style="margin-top:10px">Move</div>
          <div class="nudge"><button data-move="-1,0" aria-label="Move left">&larr;</button><button data-move="0,-1" aria-label="Move back">&uarr;</button><button data-move="0,1" aria-label="Move toward the street">&darr;</button><button data-move="1,0" aria-label="Move right">&rarr;</button></div>` : ''}
          <div class="section-title" style="margin-top:10px">Stories</div>${seg('stories', [[1, 'One'], [2, 'Two']], h.stories)}</div>
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
        body.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => change(() => {
          const p = h.plan;
          const next = p ? Y.clampPlan({ shape: b.dataset.shape, garage: p.garage, x: p.x, y: p.y }) : Y.defaultPlan(b.dataset.shape, 'right');
          Y.stampHome(next);
          focusHouse();
        }));
        body.querySelectorAll('[data-home]').forEach(b => b.onclick = () => change(() => {
          const f = b.dataset.home, v = b.dataset.v;
          if (f === 'garage') { const p = h.plan; Y.stampHome(Y.clampPlan({ shape: p.shape, garage: v, x: p.x, y: p.y })); }
          else h[f] = f === 'stories' ? Number(v) : v;
        }));
        body.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => change(() => { h[b.dataset.toggle] = !h[b.dataset.toggle]; }));
        body.querySelectorAll('[data-move]').forEach(b => b.onclick = () => change(() => {
          const [dx, dy] = b.dataset.move.split(',').map(Number), p = h.plan;
          Y.stampHome(Y.clampPlan({ shape: p.shape, garage: p.garage, x: p.x + dx, y: p.y + dy }));
        }));
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
      el.querySelectorAll('[data-lot]').forEach(b => b.onclick = () => startGame('blank', null, b.dataset.lot));
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
    return `<svg class="lot-ico" viewBox="0 0 ${Y.W} ${Y.H}" aria-hidden="true">${rects}</svg>`;
  }

  function startGame(mode, message, lot) {
    if (mode === 'demo') Y.buildDefaultLayout();
    if (mode === 'blank') {
      Y.emptyLot();
      Y.applyLot(lot || 'standard');
      Y.stampHome(Y.defaultPlan('ranch', 'right'));
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
    else if (!prefs.tipsSeen) showTips();
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
