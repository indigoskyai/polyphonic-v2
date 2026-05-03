/**
 * DailyDigest — user-facing daily review of engrams formed today.
 *
 * Pulls from digestStore. Each row is a DigestEngramCard.
 * Footer offers "Confirm all defaults" + "Done for now".
 */
import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDigestStore } from '@/stores/digestStore';
import DigestEngramCard from './DigestEngramCard';

const TYPE_ORDER = ['episodic', 'semantic', 'procedural', 'belief'] as const;
const TYPE_LABEL: Record<string, string> = {
  episodic: 'Episodic · lived moments',
  semantic: 'Semantic · facts and concepts',
  procedural: 'Procedural · how-to and habit',
  belief: 'Belief · stable convictions',
};

function digestTitle(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning digest';
  if (h < 18) return 'Afternoon digest';
  return 'Evening digest';
}

function fmtClock(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

export default function DailyDigest() {
  const user = useAuthStore((s) => s.user);
  const digest = useDigestStore((s) => s.digest);
  const engrams = useDigestStore((s) => s.engrams);
  const loading = useDigestStore((s) => s.loading);
  const refreshing = useDigestStore((s) => s.refreshing);
  const load = useDigestStore((s) => s.load);
  const subscribe = useDigestStore((s) => s.subscribe);
  const refresh = useDigestStore((s) => s.refresh);
  const confirm = useDigestStore((s) => s.confirm);
  const reject = useDigestStore((s) => s.reject);
  const edit = useDigestStore((s) => s.edit);
  const confirmAll = useDigestStore((s) => s.confirmAll);

  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsub = subscribe(user.id);
    return unsub;
  }, [user, load, subscribe]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof engrams> = {};
    for (const e of engrams) {
      const k = TYPE_ORDER.includes(e.engram_type as 'episodic') ? e.engram_type : 'episodic';
      (g[k] ??= []).push(e);
    }
    return g;
  }, [engrams]);

  const pendingCount = engrams.filter((e) => !e.reviewed_at).length;

  return (
    <div className="mn-digest">
      <div className="mn-digest-head">
        <div className="mn-digest-title-block">
          <div className="mn-digest-eye">Memory · review queue</div>
          <h2 className="mn-digest-title">{digestTitle()}</h2>
          <p className="mn-digest-sub">
            {loading
              ? 'Loading the day…'
              : !digest
              ? 'No digest yet. Mnemos will surface today\u2019s formations once the day has activity.'
              : engrams.length === 0
              ? 'Quiet day. No engrams crossed the salience threshold.'
              : `${engrams.length} engram${engrams.length === 1 ? '' : 's'} formed today. Confirm, modify, or discard each. Unreviewed after 48h auto-finalize as silent acceptance — engrams remain and decay naturally.`}
          </p>
        </div>
        <div className="mn-digest-stamp">
          {digest ? `generated ${fmtClock(digest.generated_at)} · today` : ''}
          {' '}
          <button
            type="button"
            className="mn-action ghost"
            onClick={refresh}
            disabled={refreshing}
            style={{ marginLeft: 10 }}
          >
            {refreshing ? 'refreshing…' : 'refresh'}
          </button>
        </div>
      </div>

      {TYPE_ORDER.map((type) => {
        const rows = grouped[type] ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={type} className="mn-digest-section">
            <div className="mn-digest-section-eye">{TYPE_LABEL[type]}</div>
            {rows.map((e) => (
              <DigestEngramCard
                key={e.id}
                engram={e}
                onConfirm={() => confirm(e.id)}
                onReject={() => reject(e.id)}
                onEdit={(patch) => edit(e.id, patch)}
              />
            ))}
          </div>
        );
      })}

      {engrams.length > 0 && (
        <div className="mn-digest-foot">
          <span className="mn-digest-foot-text">
            {pendingCount} pending · 48h auto-finalize
          </span>
          <button type="button" className="mn-action ghost" onClick={confirmAll} disabled={pendingCount === 0}>
            Confirm all
          </button>
        </div>
      )}
    </div>
  );
}
