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
      const tree = sun.by ? window.PLANT_BY_ID[sun.by.id].name : '';
      if (def.sun === 'full sun' && sun.level === 'part') {
        out.push({ kind: 'sun', text: `Partial shade from your ${tree}: ${def.name} wants full sun, so expect fewer blooms here.` });
      } else if (def.sun === 'full sun' && sun.level === 'shade') {
        out.push({ kind: 'sun', text: `Deep shade under your ${tree}: ${def.name} needs full sun and will struggle here.` });
      } else if (def.sun === 'shade' && sun.level === 'full') {
        out.push({ kind: 'sun', text: `Full sun: ${def.name} prefers shade and will scorch in a Houston summer.` });
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

  function insights() {
    const plants = Y().allPlants();
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

  window.CARE = { MONTHS, monthList, waterStatus, waterInterval, isEstablishing, thirstyPlants, plantingWarnings, insights, thisMonth };
})();
