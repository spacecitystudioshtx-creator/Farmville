// Live weather for the property via Open-Meteo (free, keyless, CORS-friendly),
// with a Houston monthly-averages fallback when the network or host blocks it.
(function () {
  const S = window.SITE;

  const URL = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${S.lat}&longitude=${S.lon}`
    + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code'
    + '&temperature_unit=fahrenheit&precipitation_unit=inch'
    + `&timezone=${encodeURIComponent(S.timezone)}&past_days=7&forecast_days=7`;

  // WMO weather code -> [label, icon key]
  function describe(code) {
    if (code === 0 || code === 1) return ['Clear', 'sun'];
    if (code === 2) return ['Partly cloudy', 'partsun'];
    if (code === 3) return ['Overcast', 'cloud'];
    if (code === 45 || code === 48) return ['Fog', 'cloud'];
    if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
    if (code >= 61 && code <= 67) return ['Rain', 'rain'];
    if (code >= 80 && code <= 82) return ['Showers', 'rain'];
    if (code >= 95) return ['Thunderstorms', 'storm'];
    if (code >= 71 && code <= 77) return ['Snow', 'cloud'];
    return ['—', 'cloud'];
  }

  // Approximate Houston 1991–2020 normals: [avg high °F, avg low °F, rain in/month]
  const NORMALS = [
    [63, 45, 3.4], [67, 48, 3.0], [74, 55, 3.4], [80, 61, 3.5], [87, 68, 5.0], [92, 74, 5.9],
    [94, 76, 3.8], [95, 76, 4.4], [90, 71, 4.3], [83, 62, 5.0], [73, 52, 4.1], [65, 46, 3.7],
  ];

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fallback(reason) {
    const now = new Date();
    const forecast = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const [hi, lo] = NORMALS[d.getMonth()];
      forecast.push({ date: iso(d), hiF: hi, loF: lo, rainIn: 0, rainProb: null, icon: 'partsun' });
    }
    const [hi] = NORMALS[now.getMonth()];
    return {
      ok: true,
      fallback: true,
      reason: String(reason || ''),
      current: { tempF: hi, humidity: null, desc: 'Typical for ' + now.toLocaleDateString('en-US', { month: 'long' }), icon: 'partsun' },
      past: null,          // unknown rainfall: watering advice falls back to the log
      forecast,
      monthRainIn: NORMALS[now.getMonth()][2],
    };
  }

  // Normalized shape consumed by care.js, game.js and main.js:
  // { ok, fallback, current:{tempF,humidity,desc,icon}, past:[{date,rainIn}]|null,
  //   forecast:[{date,hiF,loF,rainIn,rainProb,icon}] }
  async function fetchWeather() {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
      const res = await fetch(URL, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const days = j.daily.time.map((date, i) => ({
        date,
        hiF: j.daily.temperature_2m_max[i],
        loF: j.daily.temperature_2m_min[i],
        rainIn: j.daily.precipitation_sum[i] || 0,
        rainProb: j.daily.precipitation_probability_max[i],
        icon: describe(j.daily.weather_code[i])[1],
      }));
      const [desc, icon] = describe(j.current.weather_code);
      return {
        ok: true,
        fallback: false,
        current: { tempF: Math.round(j.current.temperature_2m), humidity: j.current.relative_humidity_2m, desc, icon },
        past: days.slice(0, 7),
        forecast: days.slice(7),
      };
    } catch (e) {
      return fallback(e);
    }
  }

  function rainLast7(w) {
    return w && w.past ? w.past.reduce((s, d) => s + d.rainIn, 0) : null;
  }
  function rainNext2(w) {
    return w && w.forecast ? w.forecast.slice(0, 2).reduce((s, d) => s + (d.rainIn || 0), 0) : 0;
  }

  window.WEATHER = { fetchWeather, fallback, rainLast7, rainNext2, NORMALS };
})();
