// App wiring: canvas rendering, tools, catalog, weather + tasks UI,
// import/export, sharing, and monetization slots.
(function () {
  const Y = window.YARD;
  const S = window.SPRITES;
  const TILE = S.TILE;
  const MON = (window.SITE.monetization || {});

  const canvas = document.getElementById('yard');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ui = {
    tool: 'select',
    selected: null,       // {x,y} for inspect panel
    filter: 'season',
    weather: null,
  };

  // ---------- rendering ----------
  function render() {
    for (let y = 0; y < Y.H; y++)
      for (let x = 0; x < Y.W; x++)
        S.drawTerrain(ctx, Y.terrainAt(x, y), x, y);

    // picket fence around the lot (grass border tiles only, so drives/walks pass through)
    for (let x = 0; x < Y.W; x++) {
      if (Y.terrainAt(x, 0) === 'grass') S.drawFence(ctx, x, 0, false);
      if (Y.terrainAt(x, Y.H - 1) === 'grass') S.drawFence(ctx, x, Y.H - 1, false);
    }
    for (let y = 1; y < Y.H - 1; y++) {
      if (Y.terrainAt(0, y) === 'grass') S.drawFence(ctx, 0, y, true);
      if (Y.terrainAt(Y.W - 1, y) === 'grass') S.drawFence(ctx, Y.W - 1, y, true);
    }

    // plants: non-trees first, then trees (their canopies overlap neighbors)
    const plants = Y.allPlants().sort((a, b) => a.y - b.y);
    for (const p of plants) if (p.def.type !== 'tree') S.drawPlant(ctx, p.def, p.x, p.y, Y.growthStage(p.rec));
    for (const p of plants) if (p.def.type === 'tree') S.drawPlant(ctx, p.def, p.x, p.y, Y.growthStage(p.rec));

    if (ui.selected) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3;
      ctx.strokeRect(ui.selected.x * TILE + 1.5, ui.selected.y * TILE + 1.5, TILE - 3, TILE - 3);
    }
  }

  // ---------- weather UI ----------
  function renderWeatherNow() {
    const el = document.getElementById('weather-now');
    const w = ui.weather;
    if (!w || !w.ok) { el.innerHTML = '<span class="wx-loading">weather unavailable</span>'; return; }
    el.innerHTML =
      `<span class="wx-big">${w.current.tempF}°F</span> ${w.current.desc}<br>` +
      `<span style="color:var(--ink-dim)">humidity ${w.current.humidity}%</span>`;
  }

  function renderForecast() {
    const el = document.getElementById('forecast');
    const w = ui.weather;
    if (!w || !w.ok) { el.innerHTML = '<span class="wx-loading">forecast unavailable</span>'; return; }
    const rain7 = w.past.reduce((s, d) => s + d.rainIn, 0);
    const dayName = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    el.innerHTML =
      `<div class="wx-summary">Rainfall, past 7 days: <b>${rain7.toFixed(2)}"</b>` +
      ` — beds want ~1"/week ${rain7 >= 1 ? '✅' : '⚠️'}</div>` +
      `<div class="wx-days">` +
      w.forecast.map(d =>
        `<div class="wx-day"><div>${dayName(d.date)}</div>` +
        `<div class="d-temp">${Math.round(d.hiF)}°</div>` +
        `<div>${Math.round(d.loF)}°</div>` +
        `<div class="d-rain">${d.rainIn >= 0.05 ? d.rainIn.toFixed(1) + '"' : (d.rainProb || 0) + '%'}</div></div>`
      ).join('') + `</div>`;
  }

  function renderTasks() {
    const list = document.getElementById('task-list');
    const tasks = window.TASKS.buildTasks(ui.weather);
    list.innerHTML = tasks.map(t =>
      `<li class="${t.level === 'ok' ? '' : t.level}">${t.text}` +
      (t.sub ? `<span class="t-sub">${t.sub}</span>` : '') + `</li>`
    ).join('');
  }

  // ---------- catalog ----------
  function catalogPlants() {
    const month = new Date().getMonth() + 1;
    switch (ui.filter) {
      case 'season': return window.PLANTS.filter(p => p.plantMonths.includes(month));
      case 'native': return window.PLANTS.filter(p => p.native);
      case 'edible': return window.PLANTS.filter(p => p.type === 'edible');
      default: return window.PLANTS;
    }
  }

  function renderCatalog() {
    const el = document.getElementById('plant-catalog');
    el.innerHTML = '';
    const month = new Date().getMonth() + 1;
    for (const p of catalogPlants()) {
      const btn = document.createElement('button');
      btn.className = 'plant-item' + (ui.tool === 'plant:' + p.id ? ' active' : '');
      btn.appendChild(S.makeSwatch(p));
      const txt = document.createElement('div');
      const badges =
        (p.native ? '<span class="badge">native</span>' : '') +
        (p.type === 'edible' ? '<span class="badge edible">edible</span>' : '') +
        (p.plantMonths.includes(month) ? '<span class="badge">plant now</span>' : '');
      txt.innerHTML = `<div class="plant-name">${p.name}${badges}</div>` +
        `<div class="plant-meta">${p.sun} · ${p.water} water · ${p.heightFt} ft</div>`;
      btn.appendChild(txt);
      btn.addEventListener('click', () => setTool('plant:' + p.id));
      el.appendChild(btn);
    }
    if (!el.children.length) el.innerHTML = '<p class="muted">Nothing in this filter.</p>';
  }

  // ---------- monetization ----------
  function affiliateLinks(p) {
    let html = '';
    if (MON.amazonTag) {
      const q = encodeURIComponent(p.name + (p.type === 'edible' ? ' seeds' : ' plant live'));
      html += `<a class="mini-btn buy-btn" target="_blank" rel="noopener sponsored"
        href="https://www.amazon.com/s?k=${q}&tag=${encodeURIComponent(MON.amazonTag)}">🛒 Buy ${p.type === 'edible' ? 'seeds' : 'plants'}</a>`;
    }
    html += `<a class="mini-btn" target="_blank" rel="noopener"
      href="https://www.google.com/maps/search/${encodeURIComponent('native plant nursery near ' + window.SITE.address)}">📍 Find a nursery</a>`;
    return `<div class="ti-actions">${html}</div>`;
  }

  function initMonetization() {
    // tip jar
    if (MON.supportUrl) {
      document.getElementById('support-slot').innerHTML =
        `<a class="mini-btn support-btn" target="_blank" rel="noopener" href="${MON.supportUrl}">☕ Support this project</a>`;
    }
    // ad slots
    const side = document.getElementById('ad-side');
    const bottom = document.getElementById('ad-bottom');
    if (MON.adsenseClient) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + MON.adsenseClient;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
      const ins = (slot, style) =>
        `<ins class="adsbygoogle" style="${style}" data-ad-client="${MON.adsenseClient}"` +
        (slot ? ` data-ad-slot="${slot}"` : '') + ` data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      side.innerHTML = ins(MON.adSlotSide, 'display:block;min-height:250px');
      bottom.innerHTML = ins(MON.adSlotBottom, 'display:block;min-height:90px');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); (window.adsbygoogle).push({}); } catch (e) { /* blocked */ }
    } else {
      side.innerHTML = '<span class="ad-placeholder">ad space</span>';
      bottom.innerHTML = '<span class="ad-placeholder">ad space — configure AdSense in js/config.js</span>';
    }
  }

  // ---------- tile info ----------
  function renderTileInfo() {
    const el = document.getElementById('tile-info');
    if (!ui.selected) { el.innerHTML = '<span class="muted">Click a tile with the 🔍 tool.</span>'; return; }
    const { x, y } = ui.selected;
    const terrain = Y.terrainAt(x, y);
    const rec = Y.plantAt(x, y);
    if (!rec) {
      el.innerHTML = `<h3>${{ grass: 'Lawn', soil: 'Garden bed', path: 'Path / patio', driveway: 'Driveway', house: 'House' }[terrain]}</h3>` +
        `<p class="muted">Tile (${x}, ${y}) · ${window.SITE.tileFeet} ft square</p>` +
        (terrain === 'soil' || terrain === 'grass'
          ? '<p style="margin-top:6px">Pick a plant from the catalog, then click here to plant it.</p>'
          : '');
      return;
    }
    const p = window.PLANT_BY_ID[rec.id];
    const age = Y.daysSince(rec.planted);
    const stageNames = ['Sprout', 'Establishing', 'Established', 'Blooming!'];
    const sinceWater = Y.daysSince(rec.lastWatered);
    el.innerHTML =
      `<h3>${p.name}</h3><div class="botanical">${p.botanical}</div>` +
      `<dl>` +
      `<dt>Status</dt><dd>${stageNames[Y.growthStage(rec)]}</dd>` +
      `<dt>Planted</dt><dd>${age > 3650 ? 'long-established' : rec.planted + ` (${age}d ago)`}</dd>` +
      `<dt>Watered</dt><dd>${sinceWater === Infinity ? 'rain-fed' : sinceWater === 0 ? 'today' : sinceWater + 'd ago'}</dd>` +
      `<dt>Needs</dt><dd>${p.sun}, ${p.water} water</dd>` +
      `<dt>Spacing</dt><dd>${p.spacingFt} ft (${Math.max(1, Math.round(p.spacingFt / window.SITE.tileFeet))} tile${p.spacingFt > 4 ? 's' : ''})</dd>` +
      `</dl>` +
      `<p style="margin-top:8px">${p.notes}</p>` +
      `<div class="ti-actions">` +
      `<button class="mini-btn" id="ti-water">🚿 Watered today</button>` +
      `<button class="mini-btn" id="ti-remove">🧤 Dig up</button>` +
      `</div>` +
      affiliateLinks(p);
    document.getElementById('ti-water').onclick = () => { Y.waterPlant(x, y); persistAndRefresh(); };
    document.getElementById('ti-remove').onclick = () => { Y.removePlant(x, y); persistAndRefresh(); };
  }

  // ---------- tools & input ----------
  function setTool(tool) {
    ui.tool = tool;
    document.querySelectorAll('#terrain-tools .tool').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === tool));
    renderCatalog();
  }

  function tileFromEvent(ev) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / r.width * Y.W);
    const y = Math.floor((ev.clientY - r.top) / r.height * Y.H);
    if (x < 0 || y < 0 || x >= Y.W || y >= Y.H) return null;
    return { x, y };
  }

  function applyTool(t) {
    if (!t) return;
    const { x, y } = t;
    if (ui.tool === 'select') {
      ui.selected = t;
    } else if (ui.tool === 'water') {
      Y.waterPlant(x, y);
      ui.selected = Y.plantAt(x, y) ? t : ui.selected;
    } else if (ui.tool === 'remove') {
      Y.removePlant(x, y);
    } else if (ui.tool.startsWith('terrain:')) {
      Y.setTerrain(x, y, ui.tool.slice(8));
    } else if (ui.tool.startsWith('plant:')) {
      const id = ui.tool.slice(6);
      if (Y.canPlantAt(x, y)) { Y.addPlant(x, y, id); ui.selected = t; }
    }
    persistAndRefresh();
  }

  let painting = false;
  canvas.addEventListener('mousedown', ev => { painting = true; applyTool(tileFromEvent(ev)); });
  canvas.addEventListener('mousemove', ev => {
    if (painting && (ui.tool.startsWith('terrain:') || ui.tool === 'remove')) applyTool(tileFromEvent(ev));
  });
  window.addEventListener('mouseup', () => { painting = false; });

  document.querySelectorAll('#terrain-tools .tool').forEach(b =>
    b.addEventListener('click', () => setTool(b.dataset.tool)));

  document.querySelectorAll('#catalog-filters .filter').forEach(b =>
    b.addEventListener('click', () => {
      ui.filter = b.dataset.filter;
      document.querySelectorAll('#catalog-filters .filter').forEach(f =>
        f.classList.toggle('active', f === b));
      renderCatalog();
    }));

  // ---------- share / import / export ----------
  const modal = {
    el: document.getElementById('modal'),
    title: document.getElementById('modal-title'),
    hint: document.getElementById('modal-hint'),
    text: document.getElementById('modal-text'),
    ok: document.getElementById('modal-ok'),
    copy: document.getElementById('modal-copy'),
    result: document.getElementById('modal-result'),
    mode: 'import',
    open(mode) {
      this.mode = mode;
      this.result.textContent = '';
      if (mode === 'import') {
        this.title.textContent = 'Import garden';
        this.hint.innerHTML = 'Paste garden JSON — either an app export, or the layout Claude produced from the <a href="GARDEN_INTERVIEW.md" target="_blank">garden interview</a>.';
        this.text.value = '';
        this.ok.style.display = '';
      } else {
        this.title.textContent = 'Export garden';
        this.hint.textContent = 'Copy this JSON to back up your garden or move it to another browser.';
        this.text.value = window.IMPORTER.exportText();
        this.ok.style.display = 'none';
      }
      this.el.classList.remove('hidden');
    },
    close() { this.el.classList.add('hidden'); },
  };
  document.getElementById('btn-import').addEventListener('click', () => modal.open('import'));
  document.getElementById('btn-export').addEventListener('click', () => modal.open('export'));
  document.getElementById('modal-close').addEventListener('click', () => modal.close());
  document.getElementById('modal-copy').addEventListener('click', () => {
    navigator.clipboard && navigator.clipboard.writeText(modal.text.value)
      .then(() => { modal.result.textContent = 'Copied ✅'; }, () => { modal.result.textContent = 'Copy blocked — select the text manually.'; });
  });
  modal.ok.addEventListener('click', () => {
    const res = window.IMPORTER.importText(modal.text.value);
    modal.result.textContent = res.message;
    if (res.ok) { persistAndRefresh(); setTimeout(() => modal.close(), 900); }
  });

  document.getElementById('btn-share').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'my-yard-cliffwood-farm.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const ok = Y.save();
    document.getElementById('map-status').textContent = ok ? 'Saved ✅' : 'Save failed (storage blocked)';
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('Reset the yard to the starter layout? Your painted map and plantings will be lost.')) {
      Y.buildDefaultLayout();
      persistAndRefresh();
    }
  });

  function persistAndRefresh() {
    Y.save();
    render();
    renderTasks();
    renderTileInfo();
  }

  // ---------- boot ----------
  if (!Y.load()) Y.buildDefaultLayout();
  render();
  renderCatalog();
  renderTasks();
  renderTileInfo();
  initMonetization();
  window.ART.init(() => {
    render(); renderCatalog();
    const credit = window.ART.creditLine();
    if (credit) document.querySelector('.pagefoot').append(' · ' + credit);
  });

  // PWA: installable + offline app shell (no-op on file:// or unsupported browsers)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* fine without it */ });
  }

  window.WEATHER.fetchWeather().then(w => {
    ui.weather = w;
    renderWeatherNow();
    renderForecast();
    renderTasks();
  });
})();
