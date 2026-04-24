/** Compact relative time — "now", "12m", "3h", "5d". */
export function timeAgo(date: string | Date): string {
  const t = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** Mockup-style stream date — "Apr 23, 2026". */
export function formatStreamDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Detail-panel timestamp — "2d ago · 14:32". */
export function formatDetailTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const ago = timeAgo(d);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${ago} ago · ${time}`;
}
