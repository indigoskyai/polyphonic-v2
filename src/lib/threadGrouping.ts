import type { Thread } from '@/stores/threadStore';

export interface ThreadGroup {
  key: string;
  label: string;
  threads: Thread[];
}

const MS_DAY = 86400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Group threads into industry-standard date buckets:
 * Today, Yesterday, Previous 7 Days, Previous 30 Days,
 * then by month (current year), then by year (older).
 *
 * Pinned and starred are excluded — they live in their own sections.
 * Threads are expected to already be filtered by archived/search.
 */
export function groupThreadsByDate(threads: Thread[]): ThreadGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - MS_DAY;
  const sevenDaysAgo = today - 7 * MS_DAY;
  const thirtyDaysAgo = today - 30 * MS_DAY;
  const currentYear = now.getFullYear();

  const buckets = new Map<string, ThreadGroup>();
  const order: string[] = [];

  const ensure = (key: string, label: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, threads: [] });
      order.push(key);
    }
    return buckets.get(key)!;
  };

  // Pre-create well-known buckets in canonical order
  // (only if they end up populated, we'll filter at the end)
  const canonical = ['today', 'yesterday', 'prev7', 'prev30'];

  const sorted = [...threads].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  for (const thread of sorted) {
    const ts = new Date(thread.updated_at).getTime();
    const dayStart = startOfDay(new Date(ts));

    if (dayStart === today) {
      ensure('today', 'Today').threads.push(thread);
    } else if (dayStart === yesterday) {
      ensure('yesterday', 'Yesterday').threads.push(thread);
    } else if (dayStart > sevenDaysAgo) {
      ensure('prev7', 'Previous 7 Days').threads.push(thread);
    } else if (dayStart > thirtyDaysAgo) {
      ensure('prev30', 'Previous 30 Days').threads.push(thread);
    } else {
      const d = new Date(ts);
      const year = d.getFullYear();
      if (year === currentYear) {
        const key = `m-${year}-${d.getMonth()}`;
        const label = d.toLocaleDateString(undefined, { month: 'long' });
        ensure(key, label).threads.push(thread);
      } else {
        const key = `y-${year}`;
        ensure(key, String(year)).threads.push(thread);
      }
    }
  }

  // Reorder so canonical buckets come first in fixed order, then the rest in insertion order.
  const result: ThreadGroup[] = [];
  for (const k of canonical) {
    if (buckets.has(k)) result.push(buckets.get(k)!);
  }
  for (const k of order) {
    if (canonical.includes(k)) continue;
    result.push(buckets.get(k)!);
  }
  return result;
}
