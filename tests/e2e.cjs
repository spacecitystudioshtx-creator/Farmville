// End-to-end test flight: drives the real app in Chromium on a phone and a
// desktop viewport. Run:  npm test
//   CHROMIUM_PATH=/path/to/chromium   (optional, else Playwright's own)
//   SHOTS=dir                         (optional, saves screenshots there)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.md': 'text/markdown', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`);
  if (!cond) failures++;
}

// screen point (page coords) of a tile's center, after centering the camera on it
async function tilePoint(page, x, y) {
  return page.evaluate(([x, y]) => {
    window.__GS.closeSheet();
    window.__GS.centerOn(x, y, 2);
    const r = document.getElementById('yard').getBoundingClientRect(), c = window.__GS.cam, T = window.SPRITES.TILE;
    return { x: r.left + c.x + (x + 0.5) * T * c.s, y: r.top + c.y + (y + 0.5) * T * c.s };
  }, [x, y]);
}
async function tap(page, mobile, pt) {
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(200);
}
const xp = page => page.evaluate(() => window.GAME.state().xp);
const plantAt = (page, x, y) => page.evaluate(([x, y]) => { const r = window.YARD.plantAt(x, y); return r ? r.id : null; }, [x, y]);
async function pickPlant(page, id) {
  await page.evaluate(() => window.__GS.openSheet('shop'));
  await page.click('.chips [data-f="all"]');
  await page.click(`[data-pick="${id}"]`);
  await page.waitForTimeout(150);
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

async function run(browser, label, contextOpts, mobile) {
  console.log(`\n== ${label} ==`);
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/ERR_|Failed to load resource|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  const base = `http://localhost:${server.address().port}/index.html`;
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  check('welcome shows on first run', await page.isVisible('#welcome'));
  await shot(page, label + '-1-welcome');
  await page.click('#w-demo');
  await page.waitForTimeout(300);
  check('how-to-play tips appear', await page.isVisible('#dialog'));
  await page.click('#dialog-box .btn');
  await page.waitForTimeout(300);
  check('welcome closed after choosing demo', !(await page.isVisible('#welcome')));
  const g0 = await page.evaluate(() => ({ xp: window.GAME.state().xp, streak: window.GAME.state().streak }));
  check('daily check-in gives XP and starts a streak', g0.xp >= 5 && g0.streak === 1, g0);
  await page.waitForTimeout(5500); // let first-run banners finish
  await shot(page, label + '-2-map');

  // plant an in-season, full-sun native on an open bed tile
  const month = new Date().getMonth() + 1;
  const ids = await page.evaluate(m => ({
    good: window.PLANTS.find(p => p.native && p.type !== 'tree' && p.sun === 'full sun' && p.plantMonths.includes(m) && p.spacingFt <= 3).id,
    off: window.PLANTS.find(p => p.type !== 'tree' && !p.plantMonths.includes(m) && p.spacingFt <= 2).id,
  }), month);
  await page.evaluate(() => document.querySelector('.toolbar [data-tool="plant"]').click());
  await page.waitForTimeout(250);
  check('Plant opens the shop', (await page.textContent('#sheet-title')) === 'Plant shop');
  check('shop lists in-season plants', (await page.$$('.item[data-pick]')).length > 0);
  await shot(page, label + '-3-shop');
  await page.click(`[data-pick="${ids.good}"]`);
  await page.waitForTimeout(150);
  let before = await xp(page);
  await tap(page, mobile, await tilePoint(page, 10, 16));
  check(`tap plants ${ids.good} on the bed`, (await plantAt(page, 10, 16)) === ids.good);
  check('in-season native earns 30+ XP', (await xp(page)) - before >= 30, (await xp(page)) - before);

  // shade warning next to the live oak
  await tap(page, mobile, await tilePoint(page, 33, 20));
  const shadeDialog = (await page.isVisible('#dialog')) ? await page.textContent('#dialog-box') : '';
  check('full-sun plant under the live oak warns about shade', /shade/i.test(shadeDialog), shadeDialog.slice(0, 80));
  await shot(page, label + '-4-warning');
  await page.click('#dialog-box .btn.alt');
  await page.waitForTimeout(150);
  check('cancel leaves the tile empty', (await plantAt(page, 33, 20)) === null);

  // out-of-season: allowed, warned, no XP
  await pickPlant(page, ids.off);
  before = await xp(page);
  await tap(page, mobile, await tilePoint(page, 12, 22));
  const offDialog = (await page.isVisible('#dialog')) ? await page.textContent('#dialog-box') : '';
  check('out-of-season planting warns', /Out of season/.test(offDialog), offDialog.slice(0, 80));
  await page.click('#dialog-box .btn:not(.alt)');
  await page.waitForTimeout(200);
  check('plant anyway plants it', (await plantAt(page, 12, 22)) === ids.off);
  check('out-of-season planting earns no XP', (await xp(page)) === before, (await xp(page)) - before);

  // trees have their own filter; mapping an existing tree is full-grown and earns no XP
  await page.evaluate(() => window.__GS.openSheet('shop'));
  await page.click('[data-mode="existing"]');
  await page.click('.chips [data-f="tree"]');
  await page.waitForTimeout(150);
  const treeIds = await page.$$eval('.item[data-pick]', els => els.map(e => e.dataset.pick));
  check('Trees filter lists only trees', treeIds.length > 0 && await page.evaluate(ids =>
    ids.every(id => { const p = window.PLANT_BY_ID[id]; return p.type === 'tree' || p.type === 'shrub'; }), treeIds), treeIds);
  const spot = await page.evaluate(() => {
    for (let y = 2; y < 24; y++) for (let x = 2; x < 38; x++)
      if (window.YARD.isPlantable(x, y) && !window.YARD.plantAt(x, y)) return { x, y };
  });
  await page.click(`[data-pick="${treeIds[0]}"]`);
  await page.waitForTimeout(150);
  before = await xp(page);
  await tap(page, mobile, await tilePoint(page, spot.x, spot.y));
  check('existing tree maps without a warning', !(await page.isVisible('#dialog')) && (await plantAt(page, spot.x, spot.y)) === treeIds[0]);
  check('existing tree earns no XP', (await xp(page)) === before, (await xp(page)) - before);
  check('existing tree goes in full-grown', await page.evaluate(([x, y]) => {
    const r = window.YARD.plantAt(x, y);
    return (Date.now() - new Date(r.planted + 'T12:00:00')) / 864e5 > window.PLANT_BY_ID[r.id].establishDays;
  }, [spot.x, spot.y]));
  await page.evaluate(() => window.__GS.openSheet('shop'));
  await page.click('[data-mode="new"]');
  await page.evaluate(() => window.__GS.closeSheet());
  await page.waitForTimeout(300);

  // watering: thirsty plant earns XP, a just-watered plant does not
  await page.evaluate(() => { window.YARD.plantAt(12, 22).lastWatered = window.YARD.todayStr(-5); });
  await page.evaluate(() => document.querySelector('.toolbar [data-tool="water"]').click());
  before = await xp(page);
  await tap(page, mobile, await tilePoint(page, 12, 22));
  check('watering a thirsty plant logs it', await page.evaluate(() => window.YARD.plantAt(12, 22).lastWatered === window.YARD.todayStr()));
  check('watering a thirsty plant earns XP (plus the water quest)', (await xp(page)) - before >= 5, (await xp(page)) - before);

  // plant card + note
  await page.evaluate(() => document.querySelector('.toolbar [data-tool="look"]').click());
  await tap(page, mobile, await tilePoint(page, 8, 16));
  check("tapping a plant opens its card", (await page.textContent('#sheet-title')) === "Turk's Cap");
  check('card shows the bloom calendar', (await page.$$('.cal div')).length === 12);
  await shot(page, label + '-5-card');
  before = await xp(page);
  await page.fill('#pc-note', 'New growth at the base after the rain.');
  await page.click('#pc-add-note');
  await page.waitForTimeout(150);
  check('note saved to the plant', await page.evaluate(() => window.YARD.plantAt(8, 16).notes.length === 1));
  check('note earns XP (plus the note quest)', (await xp(page)) - before >= 5, (await xp(page)) - before);

  // quests
  await page.evaluate(() => window.__GS.openSheet('quests'));
  await page.waitForTimeout(150);
  check('quests panel lists quests', (await page.$$('.quest')).length >= 3);
  check('note quest auto-completed', await page.evaluate(() => window.GAME.quests(null).find(q => q.id === 'note').complete));
  before = await xp(page);
  await page.click('[data-done="chore0"]');
  await page.waitForTimeout(150);
  check('ticking a monthly chore pays its XP', (await xp(page)) - before >= 15, (await xp(page)) - before);
  await shot(page, label + '-6-quests');

  // build: paint a bed stroke, then undo it
  await page.evaluate(() => { window.__GS.closeSheet(); document.querySelector('.toolbar [data-tool="build"]').click(); });
  await page.click('#palette [data-terrain="soil"]');
  const a = await tilePoint(page, 4, 22), b = await page.evaluate(() => { const c = window.__GS.cam, T = window.SPRITES.TILE, r = document.getElementById('yard').getBoundingClientRect(); return { x: r.left + c.x + 8.5 * T * c.s, y: r.top + c.y + 22.5 * T * c.s }; });
  await page.evaluate(([a, b]) => {
    const cv = document.getElementById('yard');
    const ev = (type, p) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true }));
    ev('pointerdown', a);
    for (let i = 1; i <= 8; i++) ev('pointermove', { x: a.x + (b.x - a.x) * i / 8, y: a.y });
    ev('pointerup', b);
  }, [a, b]);
  const painted = await page.evaluate(() => [4, 5, 6, 7, 8].filter(x => window.YARD.terrainAt(x, 22) === 'soil').length);
  check('one-finger drag paints a bed', painted === 5, painted);
  await page.click('#undo');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => [4, 5, 6, 7, 8].filter(x => window.YARD.terrainAt(x, 22) === 'soil').length);
  check('undo removes the painted bed', after === 0, after);

  // pinch zoom
  const s0 = await page.evaluate(() => window.__GS.cam.s);
  await page.evaluate(() => {
    const cv = document.getElementById('yard'), r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true }));
    window.__GS.closeSheet();
    document.querySelector('.toolbar [data-tool="look"]').click();
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let i = 1; i <= 6; i++) { ev('pointermove', 11, cx - 30 - i * 12); ev('pointermove', 12, cx + 30 + i * 12); }
    ev('pointerup', 11, cx - 102); ev('pointerup', 12, cx + 102);
  });
  const s1 = await page.evaluate(() => window.__GS.cam.s);
  check('pinch out zooms in', s1 > s0 * 1.4, { s0, s1 });

  // garden report + badges
  await page.evaluate(() => window.__GS.openSheet('garden'));
  await page.waitForTimeout(150);
  check('garden report shows stats', (await page.$$('.tile')).length === 4);
  await shot(page, label + '-7-report');
  await page.click('[data-tab="badges"]');
  const unlocked = await page.$$eval('.badge:not(.locked)', els => els.length);
  check('badges unlocked from real actions', unlocked >= 2, unlocked);

  // persistence
  const plantsBefore = await page.evaluate(() => window.YARD.allPlants().length);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  check('reload skips the welcome screen', !(await page.isVisible('#welcome')));
  check('reload keeps every plant', (await page.evaluate(() => window.YARD.allPlants().length)) === plantsBefore);
  check('reload keeps XP and streak (no double check-in)', await page.evaluate(() => window.GAME.state().streak === 1));

  check('no JavaScript errors', errors.length === 0, errors);
  await ctx.close();
}

// Build my own yard: lot shape, preset house, styles, moving it, undo
async function runBuilder(browser, label, contextOpts, mobile) {
  console.log(`\n== ${label}: build my own yard ==`);
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/ERR_|Failed to load resource|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('#w-blank');
  await page.waitForTimeout(200);
  check('lot shapes offered', (await page.$$('[data-lot]')).length >= 5);
  await shot(page, label + '-b1-lots');
  await page.click('[data-lot="culdesac"]');
  await page.waitForTimeout(500);
  const lot = await page.evaluate(() => {
    const t = window.YARD.state.terrain, flat = t.flat();
    return { street: t[window.YARD.H - 1].every(v => v === 'street'), offlot: flat.filter(v => v === 'offlot').length,
      house: flat.filter(v => v === 'house').length, drive: flat.filter(v => v === 'driveway').length, path: flat.filter(v => v === 'path').length };
  });
  check('cul-de-sac lot has a street and neighbors', lot.street && lot.offlot > 50, lot);
  check('a starter house, driveway and front walk are built', lot.house > 50 && lot.drive > 0 && lot.path > 0, lot);
  check('house builder opens', (await page.textContent('#sheet-title')) === 'Your house');
  await shot(page, label + '-b2-house');

  await page.click('[data-shape="lshape"]');
  await page.click('[data-home="garage"][data-v="left"]');
  await page.click('[data-home="stories"][data-v="2"]');
  await page.click('[data-home="wall"][data-v="sage"]');
  await page.click('[data-home="boxes"][data-v="red"]');
  await page.click('[data-toggle="chimney"]');
  const x0 = await page.evaluate(() => window.YARD.state.home.plan.x);
  await page.click('[data-move="1,0"]');
  await page.waitForTimeout(200);
  const home = await page.evaluate(() => window.YARD.state.home);
  check('shape, garage and style applied', home.plan.shape === 'lshape' && home.plan.garage === 'left' && home.stories === 2
    && home.wall === 'sage' && home.boxes === 'red' && home.chimney, home);
  check('arrows move the house', home.plan.x === x0 + 1, { x0, x: home.plan.x });
  check('moving leaves no stray house tiles', await page.evaluate(() => {
    const p = window.YARD.state.home.plan;
    return window.YARD.houseTiles().every(([x, y]) => p.tiles[x + ',' + y] && p.tiles[x + ',' + y][1] === 'house');
  }));
  await page.click('#undo');
  await page.waitForTimeout(150);
  check('undo moves it back', (await page.evaluate(() => window.YARD.state.home.plan.x)) === x0);
  await shot(page, label + '-b3-styled');
  await page.click('#house-done');
  await page.waitForTimeout(300);
  if (await page.isVisible('#dialog')) await page.click('#dialog-box .btn');
  check('done switches to Build', await page.evaluate(() => window.__GS.ui.tool === 'build'));

  // the neighbors' land can't be planted
  const off = await page.evaluate(() => {
    for (let y = 0; y < window.YARD.H; y++) for (let x = 0; x < window.YARD.W; x++) if (window.YARD.terrainAt(x, y) === 'offlot') return { x, y };
  });
  await page.evaluate(() => document.querySelector('.toolbar [data-tool="look"]').click());
  await pickPlant(page, 'gcmuhly');
  await tap(page, mobile, await tilePoint(page, off.x, off.y));
  check('planting outside the lot is refused', (await plantAt(page, off.x, off.y)) === null);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  check('house style survives a reload', await page.evaluate(() => window.YARD.state.home.wall === 'sage' && window.YARD.state.home.plan.shape === 'lshape'));
  check('no JavaScript errors', errors.length === 0, errors);
  await ctx.close();
}

let server;
(async () => {
  server = await serve();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await run(browser, 'phone', { ...devices['iPhone 13'] }, true);
    await run(browser, 'desktop', { viewport: { width: 1440, height: 900 } }, false);
    await runBuilder(browser, 'phone', { ...devices['iPhone 13'] }, true);
    await runBuilder(browser, 'desktop', { viewport: { width: 1440, height: 900 } }, false);
  } catch (e) {
    console.log('FAIL  crashed: ' + (e.stack || e));
    failures++;
  }
  await browser.close();
  server.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
