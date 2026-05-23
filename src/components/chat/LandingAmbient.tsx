import React, { useEffect, useMemo, useState } from 'react';
import { pickQuote, dateKey } from '@/lib/quotes';

/**
 * LandingAmbient — the quiet footer of the chat landing.
 *
 * A daily wisdom quote (rotating per day + agent, with its author) on one line,
 * above the local ambient readout (date · time · weather · city). Both are kept
 * subtle — the landing's hero is the agent's shape + name; this is a whisper
 * beneath the composer.
 */

interface Weather {
  tempF: number;
  description: string;
  city?: string;
}

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'rain showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'snow showers', 95: 'thunderstorms', 96: 'thunderstorms', 99: 'thunderstorms',
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
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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

export default function LandingAmbient({ agentId }: { agentId: string }) {
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
        const geo = await fetch('https://ipapi.co/json/').then((r) => r.json());
        const lat = geo.latitude;
        const lon = geo.longitude;
        const city = geo.city;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;
        const wx = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
        ).then((r) => r.json());
        const tempF = Math.round(wx?.current?.temperature_2m);
        const code = wx?.current?.weather_code;
        const desc = WMO[code] ?? 'clear';
        const w: Weather = { tempF, description: desc, city };
        if (!cancelled) {
          setWeather(w);
          sessionStorage.setItem('local-weather-cache', JSON.stringify({ t: Date.now(), w }));
        }
      } catch {
        // silent — the row still shows the quote + date/time
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const day = dateKey(now);
  const quote = useMemo(() => pickQuote(day, agentId), [day, agentId]);
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  return (
    <div className="landing-ambient">
      <p className="landing-ambient-quote" lang="en">
        {quote.text} <span className="landing-ambient-author">— {quote.author}</span>
      </p>
      <div className="landing-ambient-meta">
        <span className="la-soft">{dateStr}</span>
        <span className="la-sep">·</span>
        <span>{timeStr}</span>
        {weather && (
          <>
            <span className="la-sep">·</span>
            <span className="la-soft">
              {weather.description}, {tempBand(weather.tempF)} <span className="la-dim">{weather.tempF}°F</span>
            </span>
            {weather.city && (
              <>
                <span className="la-sep">·</span>
                <span className="la-city">{weather.city}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
