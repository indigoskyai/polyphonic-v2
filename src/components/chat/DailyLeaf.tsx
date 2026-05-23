import React, { useMemo, useState } from 'react';
import { pickLeaf, userLeaf, dateKey } from '@/lib/leaves';

/**
 * DailyLeaf — a quiet daily line on the chat landing.
 *
 * The active agent's contemplation (Phase 1: a curated lineage rotation;
 * Phase 2: per-agent live generation) over a faint leaf number that counts the
 * user's days since they started. Deliberately quiet — the soul of the landing
 * is the agent's shape + name; this is a whisper beneath the composer.
 */
export default function DailyLeaf({
  agentId,
  startedAt,
}: {
  agentId: string;
  startedAt?: string | null;
}) {
  const [now] = useState(() => new Date());
  const day = dateKey(now);
  const leaf = useMemo(() => pickLeaf(day, agentId), [day, agentId]);
  const n = useMemo(() => userLeaf(startedAt, now), [startedAt, now]);

  return (
    <div className="daily-leaf">
      <p className="daily-leaf-line" lang="en">{leaf.text}</p>
      <div className="daily-leaf-no">leaf № {n}</div>
    </div>
  );
}
