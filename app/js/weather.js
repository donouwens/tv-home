// Current weather from Open-Meteo (no key, CORS-enabled).
import { getJSON } from './net.js';
import { icons } from './icons.js';

export async function loadWeather(loc) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + loc.lat + '&longitude=' + loc.lon
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min'
    + '&timezone=' + encodeURIComponent(loc.timezone) + '&forecast_days=1';
  const d = await getJSON(url);
  return {
    temp: d.current.temperature_2m,
    feels: d.current.apparent_temperature,
    code: d.current.weather_code,
    isDay: d.current.is_day === 1,
    max: d.daily.temperature_2m_max[0],
    min: d.daily.temperature_2m_min[0],
    at: Date.now()
  };
}

// WMO weather codes, in plain words.
export function weatherLabel(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

export function weatherIcon(code, isDay) {
  if (code === 0 || code === 1) return isDay ? icons.sun : icons.moon;
  if (code === 2) return icons.partly;
  if (code === 45 || code === 48) return icons.fog;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return icons.rain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return icons.snow;
  if (code >= 95) return icons.storm;
  return icons.cloud;
}
