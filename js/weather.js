// Live weather for the property via Open-Meteo (free, keyless, CORS-friendly).
(function () {
  const S = window.SITE;

  const URL = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${S.lat}&longitude=${S.lon}`
    + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max'
    + '&temperature_unit=fahrenheit&precipitation_unit=inch'
    + `&timezone=${encodeURIComponent(S.timezone)}&past_days=7&forecast_days=7`;

  const WMO = {
    0: '☀️ clear', 1: '🌤 mostly clear', 2: '⛅ partly cloudy', 3: '☁️ overcast',
    45: '🌫 fog', 48: '🌫 fog', 51: '🌦 drizzle', 53: '🌦 drizzle', 55: '🌦 drizzle',
    61: '🌧 rain', 63: '🌧 rain', 65: '🌧 heavy rain', 80: '🌦 showers', 81: '🌧 showers',
    82: '⛈ heavy showers', 95: '⛈ thunderstorm', 96: '⛈ thunderstorm', 99: '⛈ thunderstorm',
  };

  // Normalized shape consumed by tasks.js and main.js:
  // { ok, current:{tempF,humidity,desc}, past:[{date,rainIn}...7], forecast:[{date,hiF,loF,rainIn,rainProb}...7] }
  async function fetchWeather() {
    try {
      const res = await fetch(URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();

      const days = j.daily.time.map((date, i) => ({
        date,
        hiF: j.daily.temperature_2m_max[i],
        loF: j.daily.temperature_2m_min[i],
        rainIn: j.daily.precipitation_sum[i] || 0,
        rainProb: j.daily.precipitation_probability_max[i],
      }));

      return {
        ok: true,
        current: {
          tempF: Math.round(j.current.temperature_2m),
          humidity: j.current.relative_humidity_2m,
          desc: WMO[j.current.weather_code] || '—',
        },
        past: days.slice(0, 7),
        forecast: days.slice(7),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  window.WEATHER = { fetchWeather };
})();
