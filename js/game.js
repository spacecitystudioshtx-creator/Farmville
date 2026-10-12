// Game layer: XP, levels, daily streak, badges, and quests. Every reward is
// tied to a real gardening action; nothing is earned for bad practice
// (watering a plant that isn't thirsty, planting out of season).
(function () {
  const KEY = 'gardenstar-game-v1';
  const Y = () => window.YARD;
  const C = () => window.CARE;

  const LEVELS = [
    [0, 'Seedling'], [40, 'Sprout'], [100, 'Weed Puller'], [180, 'Gardener'], [290, 'Green Thumb'],
    [430, 'Pollinator Pal'], [600, 'Native Champion'], [800, 'Prairie Keeper'], [1050, 'Master Gardener'], [1350, 'GardenStar'],
  ];

  const XP = { checkIn: 5, plantNative: 30, plantInSeason: 20, water: 5, harvest: 15, note: 5, badge: 25 };

  let g = fresh();
  const listeners = [];

  function fresh() {
    return {
      xp: 0, streak: 0, bestStreak: 0, lastCheckIn: null,
      badges: {},                 // id -> date unlocked
      rewarded: {},               // scope ('YYYY-MM-DD' | 'YYYY-MM') -> { questId: true }
      day: { date: null, notes: 0, dueWatered: 0, nativePlanted: 0 },
      totals: { notes: 0, harvests: 0, rainDays: 0, planted: 0 },
    };
  }

  function emit(e) { for (const fn of listeners) fn(e); }

  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    return i + 1;
  }

  function levelInfo() {
    const lv = levelFor(g.xp);
    const [floor, title] = LEVELS[lv - 1];
    const next = LEVELS[lv] ? LEVELS[lv][0] : null;
    return { level: lv, title, xp: g.xp, floor, next, progress: next ? (g.xp - floor) / (next - floor) : 1 };
  }

  function rollDay() {
    const today = Y().todayStr();
    if (g.day.date !== today) g.day = { date: today, notes: 0, dueWatered: 0, nativePlanted: 0 };
  }

  function award(amount, reason, at) {
    if (amount <= 0) return;
    const before = levelFor(g.xp);
    g.xp += amount;
    emit({ type: 'xp', amount, reason, at });
    const after = levelFor(g.xp);
    if (after > before) emit({ type: 'level', level: after, title: LEVELS[after - 1][1] });
  }

  // ---------- badges ----------
  const BADGES = [
    { id: 'first_sprout', name: 'First Sprout', desc: 'Plant your first plant', icon: 'icon:plant', test: c => g.totals.planted >= 1 },
    { id: 'tree_planter', name: 'Tree Planter', desc: 'Plant a tree', icon: 'plant:liveoak', test: c => c.plantedTree },
    { id: 'native_5', name: 'Native Five', desc: 'Grow 5 native plants', icon: 'plant:gcmuhly', test: c => c.ins.natives >= 5 },
    { id: 'pollinators', name: 'Pollinator Party', desc: 'Grow 5 plants for bees, butterflies or hummingbirds', icon: 'plant:mistflower', test: c => c.pollinatorPlants >= 5 },
    { id: 'hummingbirds', name: 'Hummingbird Haven', desc: 'Grow 3 hummingbird plants', icon: 'plant:flameacanthus', test: c => c.ins.wildlifeTypes.hummingbirds >= 3 },
    { id: 'monarchs', name: 'Monarch Waystation', desc: 'Grow milkweed for monarch caterpillars', icon: 'plant:aquaticmilkweed', test: c => c.ins.hosts.some(d => d.id === 'aquaticmilkweed') },
    { id: 'bloom_9', name: 'Blooms All Year', desc: 'Something in bloom 9 months of the year', icon: 'plant:coneflower', test: c => c.ins.monthsInBloom >= 9 },
    { id: 'streak_7', name: 'Week Streak', desc: 'Check in 7 days in a row', icon: 'icon:flame', test: c => g.streak >= 7 },
    { id: 'rain_saver', name: 'Rain Saver', desc: 'Let the rain do the watering', icon: 'icon:rain', test: c => g.totals.rainDays >= 1 },
    { id: 'harvest', name: 'Harvest Home', desc: 'Log your first harvest', icon: 'plant:falltomato', test: c => g.totals.harvests >= 1 },
    { id: 'journal_5', name: 'Garden Diarist', desc: 'Write 5 garden notes', icon: 'icon:scroll', test: c => g.totals.notes >= 5 },
    { id: 'level_5', name: 'Green Thumb', desc: 'Reach level 5', icon: 'icon:star', test: c => levelFor(g.xp) >= 5 },
  ];

  // silent: unlock without XP or celebration (what the starting yard already
  // satisfies isn't something the player did)
  function checkBadges(extra, silent) {
    const ins = C().insights(true);
    const ctx = {
      ins,
      pollinatorPlants: Y().allPlants().filter(p => !p.rec.offSeason && p.def.wildlife.some(t => t !== 'birds')).length,
      plantedTree: Y().state.journal.some(j => j.type === 'planted' && window.PLANT_BY_ID[j.plantId] && window.PLANT_BY_ID[j.plantId].type === 'tree'),
      ...(extra || {}),
    };
    for (const b of BADGES) {
      if (g.badges[b.id] || !b.test(ctx)) continue;
      g.badges[b.id] = Y().todayStr();
      if (silent) continue;
      emit({ type: 'badge', badge: b });
      award(XP.badge, b.name);
    }
  }

  // ---------- quests ----------
  const MONTHLY_CHORES = {
    1: ['Plant onion transplants and bare-root fruit trees', 'Prune dormant perennials (not spring bloomers)'],
    2: ['Start tomato transplants under cover', 'Cut back ornamental grasses before new growth'],
    3: ['Plant spring vegetables and warm-season natives', 'Refresh mulch to 2–3" before the heat arrives'],
    4: ['Check new growth for aphids; blast with water first', 'Direct-sow beans, squash and cucumbers'],
    5: ['Deep-mulch everything before summer', 'Deadhead spring bloomers to extend the show'],
    6: ['Water deeply and less often', 'Skip fertilizer during the heat'],
    7: ['Order fall vegetable seed', 'Solarize any bed you plan to reclaim from weeds'],
    8: ['Set out fall tomato and pepper transplants', 'Work 2–3" of compost into beds for fall'],
    9: ['Set out fall vegetable transplants', 'Divide crowded perennials once nights cool'],
    10: ['Plant natives, shrubs and trees: the best month of the year', 'Sow wildflower seed on bare, sunny soil'],
    11: ['Keep planting trees and shrubs while winter rain helps', 'Compost fallen leaves instead of bagging them'],
    12: ['Mulch tender perennials before hard freezes', "Plan next year's beds"],
  };

  function dayName(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Quest list for today. kind: 'auto' completes from real actions; 'manual'
  // is ticked by the player after doing it in the real garden.
  function quests(w) {
    rollDay();
    const today = g.day.date, month = today.slice(0, 7);
    const doneD = g.rewarded[today] || {}, doneM = g.rewarded[month] || {};
    const list = [];

    list.push({ id: 'checkin', scope: today, kind: 'auto', icon: 'sun', title: 'Daily check-in', sub: 'Open GardenStar today', xp: XP.checkIn, complete: g.lastCheckIn === today, rewarded: true });

    const thirsty = C().thirstyPlants(w);
    const rain7 = window.WEATHER.rainLast7(w);
    if (thirsty.length || g.day.dueWatered) {
      const total = thirsty.length + g.day.dueWatered;
      const names = [...new Set(thirsty.map(p => p.def.name))].slice(0, 3).join(', ');
      list.push({
        id: 'water', scope: today, kind: 'auto', icon: 'water', xp: 10,
        title: `Water ${total} thirsty plant${total === 1 ? '' : 's'}`,
        sub: thirsty.length ? `Still thirsty: ${names}${thirsty.length > 3 ? '…' : ''}. Use the Water tool after watering for real.` : 'All watered. Nice work.',
        progress: { done: g.day.dueWatered, total }, complete: thirsty.length === 0, plants: thirsty.map(p => p.key),
      });
    } else if ((rain7 !== null && rain7 >= 1) || window.WEATHER.rainNext2(w) >= 0.5) {
      list.push({ id: 'rainday', scope: today, kind: 'manual', icon: 'icon:rain', xp: 5, title: 'Let the rain do the watering', sub: 'Rain has your established plants covered. Leave the hose off today.' });
    }

    const frost = w && w.forecast ? w.forecast.slice(0, 3).find(d => d.loF <= 36) : null;
    if (frost) list.push({ id: 'frost', scope: today, kind: 'manual', icon: 'cloud', xp: 15, title: `Protect tender plants before ${dayName(frost.date)}`, sub: `Low of ${Math.round(frost.loF)}°F. Cover tomatoes, peppers and basil, or harvest them first.` });
    const heat = w && w.forecast ? w.forecast.slice(0, 3).find(d => d.hiF >= 98) : null;
    if (heat) list.push({ id: 'heat', scope: today, kind: 'manual', icon: 'sun', xp: 10, title: `Deep-water before ${dayName(heat.date)}'s heat`, sub: `High of ${Math.round(heat.hiF)}°F. Water the evening before; new plants may need it twice.` });

    const m = C().thisMonth();
    const inSeasonNatives = window.PLANTS.filter(d => d.native && d.plantMonths.includes(m));
    if (inSeasonNatives.length) {
      list.push({ id: 'plantnative', scope: today, kind: 'auto', icon: 'icon:plant', xp: 15, title: 'Plant a native that is in season', sub: `${inSeasonNatives.length} natives are in their planting window this month. Open the Plant shop.`, complete: g.day.nativePlanted > 0 });
    }
    list.push({ id: 'note', scope: today, kind: 'auto', icon: 'scroll', xp: 10, title: 'Walk the garden and jot a note', sub: 'Open any plant and add what you noticed: new growth, pests, blooms.', complete: g.day.notes > 0 });

    (MONTHLY_CHORES[m] || []).forEach((t, i) => {
      list.push({ id: 'chore' + i, scope: month, kind: 'manual', icon: 'scroll', xp: 15, title: t, sub: 'This month', monthly: true });
    });

    for (const q of list) {
      const done = q.scope === month ? doneM : doneD;
      if (q.kind === 'manual') q.complete = !!done[q.id];
      if (q.id !== 'checkin') q.rewarded = !!done[q.id];
    }
    return list;
  }

  // Grant rewards for auto quests that became complete.
  function syncQuests(w) {
    for (const q of quests(w)) {
      if (q.kind !== 'auto' || !q.complete || q.rewarded) continue;
      (g.rewarded[q.scope] = g.rewarded[q.scope] || {})[q.id] = true;
      emit({ type: 'quest', quest: q });
      award(q.xp, q.title);
    }
  }

  function completeQuest(id, w) {
    const q = quests(w).find(x => x.id === id);
    if (!q || q.kind !== 'manual' || q.complete) return false;
    (g.rewarded[q.scope] = g.rewarded[q.scope] || {})[q.id] = true;
    if (id === 'rainday') g.totals.rainDays++;
    emit({ type: 'quest', quest: q });
    award(q.xp, q.title);
    checkBadges();
    return true;
  }

  // ---------- action hooks (called by the UI after a real action) ----------
  const api = {
    LEVELS, BADGES, XP,
    on(fn) { listeners.push(fn); },
    state: () => g,
    levelInfo,
    quests,
    syncQuests,
    completeQuest,
    checkBadges,
    serialize() { return JSON.stringify(g); },
    restore(json) { if (json) g = Object.assign(fresh(), JSON.parse(json)); },
    save() { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { /* storage blocked */ } },
    load() {
      try { const raw = localStorage.getItem(KEY); if (raw) g = Object.assign(fresh(), JSON.parse(raw)); } catch (e) { g = fresh(); }
      rollDay();
    },
    reset() { g = fresh(); rollDay(); },

    checkIn() {
      rollDay();
      const today = g.day.date;
      if (g.lastCheckIn === today) return false;
      g.streak = g.lastCheckIn === Y().todayStr(-1) ? g.streak + 1 : 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      g.lastCheckIn = today;
      award(XP.checkIn, 'Daily check-in');
      checkBadges();
      return true;
    },

    // -> { xp, reason }
    planted(def, at) {
      rollDay();
      const inSeason = def.plantMonths.includes(C().thisMonth());
      if (inSeason) g.totals.planted++; // First Sprout pays only for an in-season planting
      let xp = 0, reason;
      if (!inSeason) reason = 'Out of season: no XP';
      else if (def.native) { xp = XP.plantNative; reason = 'Planted a native in season'; g.day.nativePlanted++; }
      else { xp = XP.plantInSeason; reason = 'Planted in season'; }
      award(xp, reason, at);
      checkBadges();
      return { xp, reason };
    },

    // status = CARE.waterStatus BEFORE the log
    watered(status, at) {
      rollDay();
      if (status.state === 'due') {
        g.day.dueWatered++;
        award(XP.water, 'Watered a thirsty plant', at);
        return { xp: XP.water, reason: 'Watered a thirsty plant' };
      }
      const why = {
        ok: 'Logged. It wasn\'t thirsty yet, so no XP: overwatering is the #1 way natives die.',
        rain: 'Logged. Rain already covered it this week, so no XP.',
        rainsoon: 'Logged. Rain is on the way, so no XP this time.',
        rainfed: 'Logged. Established plants here live on rain, so no XP.',
      }[status.state];
      return { xp: 0, reason: why };
    },

    harvested(at) { rollDay(); g.totals.harvests++; award(XP.harvest, 'Harvest logged', at); checkBadges(); },

    noted(at) {
      rollDay();
      g.totals.notes++;
      g.day.notes++;
      const xp = g.day.notes <= 3 ? XP.note : 0;
      award(xp, 'Garden note', at);
      checkBadges();
      return xp;
    },
  };

  window.GAME = api;
})();
