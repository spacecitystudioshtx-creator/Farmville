// Care engine: watering status, planting warnings, and garden insights.
// Pure functions over YARD state + weather; no DOM.
(function () {
  const Y = () => window.YARD;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const thisMonth = () => new Date().getMonth() + 1;

  function monthList(ms) {
    if (!ms.length) return 'none';
    // collapse runs, wrapping Dec -> Jan: [9,10,11,1,2] -> "Sep–Feb"
    const set = new Set(ms);
    const runs = [];
    for (let m = 1; m <= 12; m++) {
      if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;
      let end = m;
      while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== m) end = end === 12 ? 1 : end + 1;
      runs.push(m === end ? MONTHS[m - 1] : MONTHS[m - 1] + '–' + MONTHS[end - 1]);
    }
    if (!runs.length) return 'all year';
    return runs.join(', ');
  }

  function isEstablishing(rec) {
    const def = window.PLANT_BY_ID[rec.id];
    return Y().daysSince(rec.planted) < def.establishDays;
  }

  function waterInterval(rec) {
    const def = window.PLANT_BY_ID[rec.id];
    return isEstablishing(rec) ? 2 : { low: 10, medium: 7, high: 4 }[def.water];
  }

  // -> { state: 'rainfed'|'rain'|'rainsoon'|'due'|'ok', label, daysUntil }
  function waterStatus(rec, w) {
    const establishing = isEstablishing(rec);
    if (!establishing && rec.lastWatered === null) {
      return { state: 'rainfed', label: 'Rain-fed: established, no hand watering needed' };
    }
    const rain7 = window.WEATHER.rainLast7(w);
    if (rain7 !== null && rain7 >= 1 && !establishing) {
      return { state: 'rain', label: `Covered by ${rain7.toFixed(1)}" of rain this week` };
    }
    if (window.WEATHER.rainNext2(w) >= 0.5) {
      return { state: 'rainsoon', label: 'Rain is on the way: hold off' };
    }
    const since = Y().daysSince(rec.lastWatered);
    const interval = waterInterval(rec);
    if (since >= interval) {
      return {
        state: 'due',
        label: rec.lastWatered === null ? 'Thirsty: no watering logged yet' : `Thirsty: last watered ${since} days ago`,
      };
    }
    const left = interval - since;
    return { state: 'ok', daysUntil: left, label: since === 0 ? `Watered today · next check in ${left} days` : `Next check in ${left} day${left === 1 ? '' : 's'}` };
  }

  function thirstyPlants(w) {
    return Y().allPlants().filter(p => waterStatus(p.rec, w).state === 'due');
  }

  // Warnings shown before planting. Planting is always allowed; these just
  // make the real-world tradeoff visible.
  function plantingWarnings(def, x, y) {
    const out = [];
    if (!def.plantMonths.includes(thisMonth())) {
      out.push({ kind: 'season', text: `Out of season: ${def.name} goes in the ground ${monthList(def.plantMonths)}. Planting now needs extra care, and earns no XP.` });
    }
    if (def.type !== 'tree') {
      const sun = Y().sunAt(x, y);
      const from = shadeFrom(sun.by), hrs = sun.hours != null ? ` (about ${Math.round(sun.hours)} hours of sun)` : '';
      if (!def.sunRange.includes(sun.level)) {
        if (sun.level === 'part') out.push({ kind: 'sun', text: `Part shade${from ? ' from ' + from : ''}${hrs}: ${def.name} needs full sun, so expect fewer blooms here.` });
        else if (sun.level === 'shade') out.push({ kind: 'sun', text: `Deep shade${from ? ' from ' + from : ''}${hrs}: ${def.name} needs ${LIGHT[def.sunRange[0]]} and will struggle here.` });
        else out.push({ kind: 'sun', text: `Full sun: ${def.name} wants shade and will scorch in a Houston summer.` });
      }
    }
    // crowding: closest neighbor closer than ~60% of the combined half-spreads
    let worst = null;
    for (const p of Y().allPlants()) {
      if (p.x === x && p.y === y) continue;
      const aTree = def.type === 'tree', bTree = p.def.type === 'tree';
      if (aTree !== bTree) continue; // understory under a tree is fine; shade covers it
      const distFt = Math.hypot(p.x - x, p.y - y) * window.SITE.tileFeet;
      const needFt = (def.spacingFt + p.def.spacingFt) / 2;
      if (distFt < needFt * 0.6 && (!worst || distFt < worst.distFt)) worst = { p, distFt, needFt };
    }
    if (worst) {
      out.push({ kind: 'crowd', text: `Crowded: your ${worst.p.def.name} is ${Math.round(worst.distFt)} ft away, and these need about ${Math.round(worst.needFt)} ft between them.` });
    }
    if (def.type === 'tree' && def.heightFt >= 30) {
      const near = Y().houseTiles().some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 5);
      if (near) out.push({ kind: 'house', text: `Close to the house: a ${def.name} needs about 15 ft from the foundation for its roots and limbs.` });
    }
    return out;
  }

  // ---------- planning ahead: the watering calendar and trips ----------
  const INTERVAL = { low: 10, medium: 7, high: 4 };
  function isoIn(n) { return Y().todayStr(n); }
  function dayIndex(iso) { return -Y().daysSince(iso); } // 0 = today, 1 = tomorrow
  function rainOn(w, iso) {
    const f = w && !w.fallback && w.forecast ? w.forecast.find(d => d.date === iso) : null;
    return f && f.rainIn >= 0.5 ? f.rainIn : 0;
  }
  // Day-by-day watering for the next `days` days. Each plant on a schedule is
  // due when its interval since the last soak (by hand, or 0.5"+ of forecast
  // rain) runs out, and is assumed watered when due. Established plants that
  // live on rain never show up. soakOn: a date everything gets a deep soak
  // (the day before a trip).
  function waterSchedule(w, days, soakOn) {
    const byDate = {}, rain = {};
    let rainFed = 0, scheduled = 0;
    for (let d = 0; d < days; d++) { const r = rainOn(w, isoIn(d)); if (r) rain[isoIn(d)] = r; }
    for (const p of Y().allPlants()) {
      if (!isEstablishing(p.rec) && p.rec.lastWatered === null) { rainFed++; continue; }
      scheduled++;
      const age = Y().daysSince(p.rec.planted);
      let last = p.rec.lastWatered ? -Y().daysSince(p.rec.lastWatered) : -999;
      for (let d = 0; d < days; d++) {
        const iso = isoIn(d);
        if (iso === soakOn || rain[iso]) { last = d; continue; }
        const interval = age + d < p.def.establishDays ? 2 : INTERVAL[p.def.water];
        const due = d === 0 ? waterStatus(p.rec, w).state === 'due' : d - last >= interval;
        if (!due) continue;
        (byDate[iso] = byDate[iso] || []).push({ key: p.key, name: p.def.name, establishing: age + d < p.def.establishDays });
        last = d;
      }
    }
    return { byDate, rain, rainFed, scheduled };
  }

  // A trip from `start` to `end` (ISO dates, inclusive): soak everything the
  // day before, then list the days someone has to water while you're gone.
  function tripPlan(w, start, end) {
    const s = dayIndex(start), e = dayIndex(end);
    if (e < s || e < 0) return null;
    const soakOn = s >= 1 ? isoIn(s - 1) : null;
    const plan = waterSchedule(w, e + 1, soakOn);
    const helper = [];
    for (let d = Math.max(0, s); d <= e; d++) {
      const iso = isoIn(d);
      if (plan.byDate[iso]) helper.push({ date: iso, plants: plan.byDate[iso] });
    }
    const rainDays = Object.keys(plan.rain).filter(iso => iso >= start && iso <= end);
    return { soakOn, helper, rainDays, scheduled: plan.scheduled, rainFed: plan.rainFed, days: e - Math.max(0, s) + 1 };
  }

  // ---------- per-plant agenda: what each plant needs next, and when ----------
  // Seasonal care, conservative Houston timing. m = months it applies.
  const TYPE_CARE = {
    perennial: [{ m: [2], text: 'Cut back last year’s dead stems', why: 'Late February, before new growth. Left up over winter they shelter insects and birds.' }],
    grass: [{ m: [2], text: 'Cut back to about 6 inches', why: 'Before the new green blades come up.' }],
    shrub: [{ m: [2], text: 'Shape lightly, only if it needs it', why: 'Late winter, before spring growth. Most natives look best unpruned.' }],
    vine: [{ m: [2, 3], text: 'Trim back and tie to its support', why: 'Before the spring flush of growth.' }],
    tree: [{ m: [12, 1], text: 'Check for dead or crossing branches', why: 'Easiest to see with the leaves down. Call an arborist for anything above your head.' }],
    groundcover: [],
    edible: [],
  };
  const DEADHEAD = { m: null, text: 'Snip off spent flowers', why: 'Keeps new blooms coming.' };
  const PLANT_CARE = {
    liveoak: { replace: true, tasks: [{ m: [7, 8, 9, 10, 11, 12, 1], text: 'Prune only now, if it needs it (never Feb–June)', why: 'Oak wilt spreads through fresh cuts in spring. Paint every cut.' }] },
    crapemyrtle: { replace: true, tasks: [{ m: [1, 2], text: 'Remove suckers and small twigs only; never top it', why: 'Topping ("crape murder") weakens it and ruins the shape.' }] },
    knockoutrose: { replace: true, tasks: [{ m: [2], text: 'Cut back by about a third', why: 'Mid-February, for fresh blooming growth.' },
      { m: [4, 5, 6, 7, 8, 9, 10], text: 'Check new growth for rose rosette', why: 'Bunched, red, very thorny new shoots: remove the whole plant.' }] },
    firebush: { replace: true, tasks: [{ m: [3], text: 'Cut frozen stems back once new growth shows', why: 'It regrows from the base after a freeze.' }] },
    esperanza: { replace: true, tasks: [{ m: [3], text: 'Cut frozen stems back once new growth shows', why: 'It regrows from the base after a freeze.' }] },
    plumbago: { replace: true, tasks: [{ m: [3], text: 'Cut frozen stems back once new growth shows', why: 'It regrows from the base after a freeze.' }] },
    caladium: { replace: true, tasks: [{ m: [10, 11], text: 'Let it go dormant, or dig and store the tubers', why: 'The leaves fade in fall. Replant in warm soil next April.' }] },
    basil: { tasks: [{ m: [6, 7, 8, 9], text: 'Pinch off flower spikes', why: 'Keeps the leaves coming.' }] },
    coneflower: { tasks: [{ m: [9, 10, 11], text: 'Leave the seed heads standing', why: 'Goldfinches eat the seed in fall.' }] },
    blackeyedsusan: { tasks: [{ m: [9, 10], text: 'Let a few heads drop seed', why: 'It reseeds itself for next year.' }] },
    sunflower: { tasks: [{ m: [9, 10, 11], text: 'Leave the heads for the birds', why: 'Goldfinches and cardinals eat the seed.' }] },
  };
  const DEADHEADS = ['autumnsage', 'mealysage', 'scarletsage', 'blackandblue', 'pentas', 'zinnia', 'knockoutrose'];
  const ALL_CARE = [{ m: [4, 5], text: 'Mulch 2–3 inches deep', why: 'Holds moisture through summer and keeps roots cool. Keep it off the stems.' }];

  const ANNUAL_CARE = [{ m: [12, 1], text: 'Pull and compost it after a hard freeze', why: 'It’s an annual here. Replant in spring.' }];
  function careTasks(def) {
    const own = PLANT_CARE[def.id];
    const base = def.life === 'annual' || def.life === 'reseeds' ? (def.type === 'edible' ? [] : ANNUAL_CARE) : TYPE_CARE[def.type] || [];
    const tasks = (own && own.replace ? [] : base).concat(own ? own.tasks : []);
    if (DEADHEADS.includes(def.id)) tasks.push(Object.assign({}, DEADHEAD, { m: def.bloomMonths }));
    return def.type === 'tree' ? tasks : tasks.concat(ALL_CARE);
  }

  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function plusDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
  // today if this month is listed, else the 1st of the next listed month
  function nextInMonths(months) {
    const now = new Date(), m = now.getMonth() + 1;
    if (months.includes(m)) return Y().todayStr();
    for (let i = 1; i <= 12; i++) {
      if (months.includes(((m - 1 + i) % 12) + 1)) return isoOf(new Date(now.getFullYear(), now.getMonth() + i, 1, 12));
    }
    return null;
  }

  // [{ date (ISO or null), kind, text, why, month (a this-month task), urgent }]
  // soonest first. sched: a waterSchedule() to read the next watering from.
  function plantAgenda(p, w, sched) {
    const { rec, def } = p, today = Y().todayStr(), out = [];
    // water
    const ws = waterStatus(rec, w), establishing = isEstablishing(rec);
    if (ws.state === 'due') out.push({ date: today, kind: 'water', text: 'Water it', why: ws.label + '.', urgent: true });
    else if (ws.state === 'rainfed') out.push({ date: null, kind: 'water', text: 'No hand watering', why: 'Established, so it lives on rain. Water only in a long dry spell.' });
    else {
      sched = sched || waterSchedule(w, 31);
      const next = Object.keys(sched.byDate).sort().find(d => sched.byDate[d].some(x => x.key === p.key));
      const every = establishing ? 2 : INTERVAL[def.water];
      if (next) out.push({ date: next, kind: 'water', text: 'Water it', why: `${ws.state === 'rain' || ws.state === 'rainsoon' ? ws.label + '. ' : ''}About every ${every} days${establishing ? ' until its roots establish' : ''}.` });
    }
    // freeze
    if (def.tender) {
      const f = w && !w.fallback && w.forecast ? w.forecast.find(d => d.loF <= 32) : null;
      if (f) out.push({ date: f.date, kind: 'freeze', text: 'Cover it the night before the freeze', why: `Low of ${Math.round(f.loF)}°F forecast. Frost cloth or a sheet, off again in the morning.`, urgent: dayIndex(f.date) <= 1 });
      else { const d = nextInMonths([12, 1, 2]); if (d) out.push({ date: d, kind: 'freeze', text: 'Cover it when a freeze is forecast', why: 'A hard freeze damages it. Watch the forecast December through February.', month: true }); }
    }
    // growth
    if (establishing) out.push({ date: plusDays(rec.planted, def.establishDays), kind: 'grow', text: 'Roots established', why: 'After this it needs far less water.' });
    if (def.harvestDays) {
      const ready = plusDays(rec.planted, def.harvestDays);
      if (ready > today) out.push({ date: ready, kind: 'harvest', text: 'First harvest, about now', why: `About ${def.harvestDays} days from planting.` });
      else out.push({ date: today, kind: 'harvest', text: 'Pick what’s ready', why: 'Picking often keeps it producing. Log it for XP.', month: true });
    }
    // seasonal care
    for (const t of careTasks(def)) {
      const d = nextInMonths(t.m);
      if (d) out.push({ date: d, kind: 'care', text: t.text, why: t.why, month: true });
    }
    // site: wrong light for this plant
    const sun = Y().sunAt(p.x, p.y);
    if (def.type !== 'tree' && !def.sunRange.includes(sun.level)) {
      const more = def.sunRange.includes('full') ? 'sun' : 'shade';
      out.push({ date: nextInMonths([10, 11, 12, 1, 2]), kind: 'site', text: `Move it somewhere with more ${more}`,
        why: `This spot gets about ${Math.round(sun.hours || 0)} hours of sun; it needs ${def.sunRange.map(l => LIGHT[l]).join(' or ')}. Fall and winter are the gentlest time to transplant.` });
    }
    // urgent, then anything dated this week, then this month's chores, then later
    const rank = a => {
      if (!a.date) return 9;
      const i = dayIndex(a.date);
      if (a.urgent) return i / 100;
      if (!a.month && i <= 6) return 1 + i / 10;
      if (a.month && i <= 0) return 2;
      return 3 + i / 1000;
    };
    return out.sort((a, b) => rank(a) - rank(b));
  }

  // when label: Today, Tomorrow, Thu, Oct 22, This month, Feb
  function whenLabel(a) {
    if (!a.date) return '';
    const i = dayIndex(a.date);
    if (a.month) return i <= 0 ? 'This month' : new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' });
    if (i <= 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    const d = new Date(a.date + 'T12:00:00');
    return i < 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Every plant with its agenda, grouped: needs you today / this week / later
  function gardenDashboard(w) {
    const sched = waterSchedule(w, 31);
    const rows = Y().allPlants().map(p => {
      const agenda = plantAgenda(p, w, sched);
      const next = agenda.find(a => a.date) || agenda[0] || null;
      const i = next && next.date ? dayIndex(next.date) : 99;
      const group = !next || !next.date ? 'later'
        : next.urgent || (i <= 0 && !next.month) ? 'today'
          : !next.month && i <= 6 ? 'week' : next.month && i <= 0 ? 'month' : 'later';
      return { p, agenda, next, group, days: i };
    });
    const order = { today: 0, week: 1, month: 2, later: 3 };
    rows.sort((a, b) => order[a.group] - order[b.group] || a.days - b.days || a.p.def.name.localeCompare(b.p.def.name));
    return rows;
  }

  // 'the house' | 'a fence' | 'your Live Oak' | ''
  function shadeFrom(by) {
    if (!by) return '';
    if (by === 'house') return 'the house';
    if (by === 'fence') return 'a fence';
    return `your ${window.PLANT_BY_ID[by.id].name}`;
  }

  // ---------- labels ----------
  const LIGHT = { full: 'full sun', part: 'part shade', shade: 'shade' };
  // 'Full sun' | 'Sun or part shade' | 'Sun to shade' | 'Part shade to shade' ...
  function sunLabel(def) {
    const r = def.sunRange;
    if (r.length === 3) return 'Sun to shade';
    if (r.length === 1) return LIGHT[r[0]].charAt(0).toUpperCase() + LIGHT[r[0]].slice(1);
    return r[0] === 'full' ? 'Sun or part shade' : 'Part shade to shade';
  }
  const BUY_LABEL = { bigbox: 'Big-box store', seed: 'Seed packet', nursery: 'Native nursery' };
  const BUY_TEXT = {
    bigbox: 'Usually stocked at Home Depot and Lowe’s garden centers in season',
    seed: 'Seed racks at big-box stores and online (Amazon and seed companies)',
    nursery: 'Independent and native-plant nurseries, and plant sales',
  };
  function lifeLabel(def) {
    if (def.life === 'woody') return { tree: 'Tree', vine: 'Vine' }[def.type] || 'Shrub';
    return { perennial: 'Perennial', annual: 'Annual', reseeds: 'Reseeding annual' }[def.life];
  }

  // ---------- what to plant: ranking ----------
  // Mirrors how a gardener decides (see PLANT_PICKING.md): right time, right
  // light, room for it, what the garden is missing, how easy it is, variety.
  // Every plant in the catalog already survives Houston, so climate is a given.
  // spot: optional {x, y} the player tapped; ranks for that exact tile.
  function gardenContext(spot) {
    const yard = Y(), plants = yard.allPlants();
    const open = { full: 0, part: 0, shade: 0 };
    const house = yard.houseTiles();
    const trees = plants.filter(p => p.def.type === 'tree');
    const far = (list, x, y, d) => list.every(([ax, ay]) => Math.hypot(ax - x, ay - y) >= d);
    const treeXY = trees.map(p => [p.x, p.y]);
    let treeRoom = false; // a spot 15 ft from the house and other trees, for a big shade tree
    for (let y = 0; y < yard.H; y++) for (let x = 0; x < yard.W; x++) {
      if (!yard.canPlantAt(x, y) || !yard.inLot(x, y)) continue;
      open[yard.sunAt(x, y).level]++;
      if (!treeRoom && far(house, x, y, 5) && far(treeXY, x, y, 5)) treeRoom = true;
    }
    const edibles = plants.filter(p => p.def.type === 'edible').length;
    const bloom = Array(12).fill(0), wild = { butterflies: 0, hummingbirds: 0, bees: 0, birds: 0 }, have = {};
    for (const p of plants) {
      for (const m of p.def.bloomMonths) bloom[m - 1]++;
      for (const w of p.def.wildlife) wild[w]++;
      have[p.def.id] = (have[p.def.id] || 0) + 1;
    }
    let s = null;
    if (spot && yard.canPlantAt(spot.x, spot.y) && yard.inLot(spot.x, spot.y)) {
      s = { x: spot.x, y: spot.y, level: yard.sunAt(spot.x, spot.y).level, terrain: yard.terrainAt(spot.x, spot.y),
        houseDist: house.reduce((d, [hx, hy]) => Math.min(d, Math.hypot(hx - spot.x, hy - spot.y)), Infinity),
        underTree: !far(treeXY, spot.x, spot.y, 4) };
    }
    return { open, totalOpen: open.full + open.part + open.shade, treeRoom, trees: trees.length, bloom, wild, have,
      total: plants.length, edibleShare: plants.length ? edibles / plants.length : 0, spot: s };
  }

  function monthsUntil(def, m) {
    for (let i = 0; i < 12; i++) if (def.plantMonths.includes(((m - 1 + i) % 12) + 1)) return i;
    return 12;
  }

  // -> { score, reasons: [text] (best first), blocker: text|null }
  function scorePlant(def, ctx, m) {
    let score = 0;
    const pros = [], cons = [];
    const add = (w, text) => { score += w; if (text) (w >= 0 ? pros : cons).push({ w, text }); };

    // 1. timing: in the ground at the right time of year
    const wait = monthsUntil(def, m);
    if (wait === 0) add(40, def.plantMonths.includes((m % 12) + 1) ? 'Plant now' : 'Last month to plant');
    else if (wait === 1) add(15, 'Plant next month');
    else if (wait === 2) add(5, null);
    if (wait > 0) cons.push({ w: -30, text: `Plant ${monthList(def.plantMonths)}` }); // shown, not scored

    // 2. light: a spot it will thrive in
    if (ctx.spot) {
      if (def.sunRange.includes(ctx.spot.level)) add(def.sunPref === ctx.spot.level ? 33 : 25, `Suits this spot's ${LIGHT[ctx.spot.level]}`);
      else add(-60, `Needs ${def.sunRange.map(l => LIGHT[l]).join(' or ')}; this spot is ${LIGHT[ctx.spot.level]}`);
    } else if (ctx.totalOpen) {
      const fit = def.sunRange.reduce((n, l) => n + ctx.open[l], 0);
      if (!fit) add(-50, `No open spot with ${def.sunRange.map(l => LIGHT[l]).join(' or ')}`);
      else {
        const share = fit / ctx.totalOpen;
        const shady = ctx.open.part + ctx.open.shade;
        add(Math.round(20 * share), def.sunRange.includes('shade') && ctx.open.shade >= 3 ? 'Grows in your shady spots'
          : def.sunRange.includes('part') && shady >= 6 && def.sunPref !== 'full' ? 'Fits your part-shade spots' : null);
      }
    }

    // 3. room: big shade trees need ~15 ft from the house and other trees;
    // small understory trees (redbud, plum, possumhaw) ~9 ft from the house
    if (def.type === 'tree') {
      const big = def.heightFt >= 30;
      if (ctx.spot && ctx.spot.houseDist < (big ? 5 : 3)) add(-40, 'Too close to the house for a tree');
      else if (ctx.spot && big && ctx.spot.underTree) add(-35, 'Under another tree’s canopy');
      else if (!ctx.spot && big && !ctx.treeRoom) add(-35, 'No room left for another big tree');
      else if (ctx.trees >= 4) add(-10, null);
    }

    // 4. can you buy it? A pick you can't find this weekend isn't a pick
    if (def.buy.includes('bigbox')) add(18, 'Sold at Home Depot and Lowe’s');
    else if (def.buy.includes('seed')) add(10, 'Easy to buy as seed');
    else add(-10, 'Native nurseries only');

    // 5. goals: natives, wildlife (host plants most of all), food
    if (def.native) add(12, null);
    if (def.hostFor) add(10, `Caterpillar host for ${def.hostFor}`);
    for (const w of def.wildlife) {
      if (!ctx.wild[w]) add(6, `Your first plant for ${w}`);
      else add(2, null);
    }
    // food: more so if you already grow some (that's a goal you've shown)
    if (def.type === 'edible' && wait === 0) add(8 + Math.round(12 * ctx.edibleShare), 'Fresh food from this season');

    // 6. what's missing: blooms in months the garden has none
    const gap = def.bloomMonths.filter(mm => !ctx.bloom[mm - 1]);
    if (gap.length && def.type !== 'edible') add(Math.min(15, gap.length * 3), `Blooms when your garden doesn't (${monthList(gap)})`);

    // 7. ease: Houston summers favor low-water plants once established
    if (def.water === 'low') add(6, 'Low water once established');
    else if (def.water === 'high') add(-4, null);

    // 8. variety: each one you already have counts against another
    const n = ctx.have[def.id] || 0;
    if (n) add(-Math.min(20, n * 5), `You have ${n} already`);

    pros.sort((a, b) => b.w - a.w);
    cons.sort((a, b) => a.w - b.w);
    return { score, reasons: pros.map(p => p.text), blocker: cons[0] ? cons[0].text : null };
  }

  // [{ def, score, reasons, blocker }] best first
  function rankPlants(list, spot) {
    const ctx = gardenContext(spot), m = thisMonth();
    return {
      ctx,
      ranked: (list || window.PLANTS)
        .map(def => Object.assign({ def }, scorePlant(def, ctx, m)))
        .sort((a, b) => b.score - a.score || a.def.name.localeCompare(b.def.name)),
    };
  }

  // forRewards: leave out plants put in out of season, so badges can't pay for them
  function insights(forRewards) {
    const plants = Y().allPlants().filter(p => !(forRewards && p.rec.offSeason));
    const total = plants.length;
    const natives = plants.filter(p => p.def.native).length;
    const wildlifeTypes = { butterflies: 0, hummingbirds: 0, bees: 0, birds: 0 };
    let wildlifePlants = 0;
    for (const p of plants) {
      if (p.def.wildlife.length) wildlifePlants++;
      for (const t of p.def.wildlife) wildlifeTypes[t]++;
    }
    const bloomByMonth = Array(12).fill(0);
    for (const p of plants) for (const m of p.def.bloomMonths) bloomByMonth[m - 1]++;
    const monthsInBloom = bloomByMonth.filter(n => n > 0).length;
    const gaps = bloomByMonth.map((n, i) => (n ? null : i + 1)).filter(Boolean);
    const have = new Set(plants.map(p => p.def.id));
    const gapFillers = gaps.length
      ? window.PLANTS
          .filter(d => d.native && !have.has(d.id) && d.bloomMonths.some(m => gaps.includes(m)))
          .sort((a, b) => b.bloomMonths.filter(m => gaps.includes(m)).length - a.bloomMonths.filter(m => gaps.includes(m)).length)
          .slice(0, 3)
      : [];
    const hosts = plants.filter(p => p.def.hostFor).map(p => p.def);
    return {
      total, natives, nativeShare: total ? natives / total : 0,
      wildlifePlants, wildlifeTypes, bloomByMonth, monthsInBloom, gaps, gapFillers,
      trees: plants.filter(p => p.def.type === 'tree').length,
      edibles: plants.filter(p => p.def.type === 'edible').length,
      hosts,
    };
  }

  window.CARE = {
    MONTHS, LIGHT, monthList, waterStatus, waterInterval, isEstablishing, thirstyPlants, plantingWarnings, insights, thisMonth,
    sunLabel, lifeLabel, shadeFrom, waterSchedule, tripPlan, plantAgenda, whenLabel, gardenDashboard, BUY_LABEL, BUY_TEXT, gardenContext, scorePlant, rankPlants,
  };
})();
