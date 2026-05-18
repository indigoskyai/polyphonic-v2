import React, { useEffect, useState } from 'react';

interface Weather {
  tempF: number;
  description: string;
  city?: string;
}

const WMO: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'foggy',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'rain showers',
  81: 'rain showers',
  82: 'heavy showers',
  85: 'snow showers',
  86: 'snow showers',
  95: 'thunderstorms',
  96: 'thunderstorms',
  99: 'thunderstorms',
};

function tempBand(f: number): string {
  if (f < 25) return 'frigid';
  if (f < 40) return 'cold';
  if (f < 55) return 'chilly';
  if (f < 68) return 'mild';
  if (f < 78) return 'comfortable';
  if (f < 88) return 'warm';
  return 'hot';
}

function formatDate(d: Date): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = d.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? 'st'
    : (day % 10 === 2 && day !== 12) ? 'nd'
    : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export default function LocalAmbientChip() {
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cacheRaw = sessionStorage.getItem('local-weather-cache');
        if (cacheRaw) {
          const cached = JSON.parse(cacheRaw);
          if (Date.now() - cached.t < 30 * 60_000) {
            setWeather(cached.w);
            return;
          }
        }
        const geo = await fetch('https://ipapi.co/json/').then(r => r.json());
        const lat = geo.latitude;
        const lon = geo.longitude;
        const city = geo.city;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;
        const wx = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
        ).then(r => r.json());
        const tempF = Math.round(wx?.current?.temperature_2m);
        const code = wx?.current?.weather_code;
        const desc = WMO[code] ?? 'clear';
        const w: Weather = { tempF, description: desc, city };
        if (!cancelled) {
          setWeather(w);
          sessionStorage.setItem('local-weather-cache', JSON.stringify({ t: Date.now(), w }));
        }
      } catch {
        // silent — chip just shows date/time
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: 'auto',
        maxWidth: 'min(540px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        padding: '7px 16px',
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.018)',
        border: '1px solid var(--border-faint)',
        borderRadius: 999,
        color: 'var(--text-tertiary)',
        animation: 'viewFadeIn 0.6s var(--ease-out) 0.3s both',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      <span style={{ color: 'var(--text-soft)' }}>{dateStr}</span>
      <span style={{ opacity: 0.35 }}>·</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{timeStr}</span>
      {weather && (
        <>
          <span style={{ opacity: 0.35 }}>·</span>
          <span style={{ color: 'var(--text-soft)' }}>
            {weather.description}, {tempBand(weather.tempF)}{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>{weather.tempF}°F</span>
          </span>
          {weather.city && (
            <>
              <span style={{ opacity: 0.35 }}>·</span>
              <span style={{ color: 'var(--text-ghost)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>
                {weather.city}
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}
