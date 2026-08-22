// Task engine: turns (month, weather, planted garden) into a to-do list.
(function () {
  // Houston-specific seasonal chores, keyed by month.
  const MONTHLY_CHORES = {
    1: ['Plant onion transplants and bare-root fruit trees', 'Prune dormant perennials and roses (not spring bloomers)'],
    2: ['Last average freeze is early Feb — start tomato transplants under cover', 'Cut back ornamental grasses before new growth'],
    3: ['Plant spring vegetables and warm-season natives', 'Refresh mulch to 2–3" before the heat arrives'],
    4: ['Watch for aphids on new growth — blast with water before spraying anything', 'Sow direct-seed crops (beans, squash, cucumber)'],
    5: ['Deep-mulch everything before summer', 'Deadhead spring bloomers to extend the show'],
    6: ['Water deeply and less often — shallow daily watering trains weak roots', 'No fertilizing in the heat'],
    7: ['Order fall vegetable seed now', 'Solarize any bed you plan to reclaim from weeds'],
    8: ['Plant fall tomatoes & peppers NOW — the window closes at month\'s end', 'Work 2–3" of compost into beds for fall planting', 'Water in the early morning; skip the lawn if it rained ≥1" this week'],
    9: ['Set out fall vegetable transplants (broccoli, kale, lettuce)', 'Divide crowded perennials once nights cool', 'Late Sep: broadcast wildflower seed (Indian blanket, bluebonnet)'],
    10: ['THE best month in Houston to plant natives, shrubs, and trees', 'Plant garlic cloves', 'Sow wildflower seed on bare, sunny soil'],
    11: ['Keep planting trees and shrubs — winter rain establishes them free', 'Compost fallen leaves; never bag them', 'First frost usually mid-Nov–Dec: know where your frost cloth is'],
    12: ['Mulch tender perennials before hard freezes', 'Plan next year\'s beds while the garden sleeps'],
  };

  function fmt(n, digits) { return Number(n).toFixed(digits == null ? 1 : digits); }

  // Returns [{text, sub, level: 'ok'|'warn'|'danger'}]
  function buildTasks(weather) {
    const tasks = [];
    const month = new Date().getMonth() + 1;
    const plants = window.YARD.allPlants();

    // --- weather alerts ---
    let rain7 = null;
    if (weather && weather.ok) {
      rain7 = weather.past.reduce((s, d) => s + d.rainIn, 0);
      const frost = weather.forecast.find(d => d.loF <= 36);
      if (frost) {
        tasks.push({
          level: 'danger',
          text: `❄️ Frost risk ${frost.date} (low ${Math.round(frost.loF)}°F)`,
          sub: 'Cover tender plants (tomatoes, peppers, basil) with frost cloth or harvest ahead of it.',
        });
      }
      const scorcher = weather.forecast.slice(0, 3).find(d => d.hiF >= 98);
      if (scorcher) {
        tasks.push({
          level: 'warn',
          text: `🔥 Extreme heat ahead (${Math.round(scorcher.hiF)}°F ${scorcher.date})`,
          sub: 'Water deeply the evening before; new transplants may need morning AND evening water.',
        });
      }
      const bigRain = weather.forecast.slice(0, 2).reduce((s, d) => s + d.rainIn, 0);
      if (bigRain >= 0.5) {
        tasks.push({
          level: 'ok',
          text: `🌧 ${fmt(bigRain)}" of rain expected in the next 2 days`,
          sub: 'Skip scheduled watering and let the sky do the work.',
        });
      }
      tasks.push({
        level: rain7 >= 1 ? 'ok' : 'warn',
        text: `Past 7 days rainfall: ${fmt(rain7)}"`,
        sub: rain7 >= 1
          ? 'Established beds are fine — only baby plants need attention.'
          : 'Below the ~1"/week mark: established beds want one deep soak this week.',
      });
    } else {
      tasks.push({ level: 'warn', text: 'Weather unavailable (offline?)', sub: 'Watering advice is degraded until the forecast loads.' });
    }

    // --- per-plant watering (real management, not vibes) ---
    const rainForecastSoon = weather && weather.ok
      && weather.forecast.slice(0, 2).reduce((s, d) => s + d.rainIn, 0) >= 0.5;
    const thirsty = [];
    for (const { x, y, rec, def } of plants) {
      const age = window.YARD.daysSince(rec.planted);
      const sinceWater = window.YARD.daysSince(rec.lastWatered);
      const establishing = age < def.establishDays;
      // Established plants with no watering log are rain-fed (mature trees,
      // tough natives) — they don't need hand-watering reminders.
      if (!establishing && rec.lastWatered === null) continue;
      const interval = establishing ? 2 : { low: 10, medium: 7, high: 4 }[def.water];
      const rainedEnough = rain7 !== null && rain7 >= 1 && !establishing;
      if (sinceWater >= interval && !rainedEnough && !rainForecastSoon) {
        thirsty.push({ def, x, y, establishing, sinceWater });
      }
    }
    if (thirsty.length) {
      const names = [...new Set(thirsty.map(t => t.def.name))].slice(0, 4).join(', ');
      const extra = thirsty.length > 4 ? ` +${thirsty.length - 4} more` : '';
      tasks.push({
        level: 'warn',
        text: `🚿 ${thirsty.length} planting${thirsty.length > 1 ? 's' : ''} need water: ${names}${extra}`,
        sub: 'Use the Water tool on each tile after you water it for real. Establishing plants (first season) need it every 2–3 days.',
      });
    } else if (plants.length) {
      tasks.push({ level: 'ok', text: '🚿 Nothing needs watering right now', sub: 'Rain and your watering log have everything covered.' });
    }

    // --- what to plant this month ---
    const inSeason = window.PLANTS.filter(p => p.plantMonths.includes(month));
    const natives = inSeason.filter(p => p.native).length;
    const edibles = inSeason.filter(p => p.type === 'edible').length;
    tasks.push({
      level: 'ok',
      text: `🌱 ${inSeason.length} plants in their planting window this month`,
      sub: `${natives} natives, ${edibles} edibles — see the “In season” tab in the catalog and click a bed tile to plant.`,
    });

    // --- monthly chores ---
    for (const chore of MONTHLY_CHORES[month] || []) {
      tasks.push({ level: 'ok', text: '📋 ' + chore, sub: null });
    }

    return tasks;
  }

  window.TASKS = { buildTasks };
})();
