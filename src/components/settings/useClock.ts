import { useEffect, useState } from 'react';

export function useClock() {
  const [time, setTime] = useState(() => formatNow());

  useEffect(() => {
    const id = setInterval(() => setTime(formatNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

function formatNow() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
