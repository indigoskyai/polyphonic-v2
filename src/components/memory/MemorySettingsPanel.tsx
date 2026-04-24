import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import {
  PageHeader,
  SectionTitle,
  SettingRow,
  Toggle,
  SelectInput,
  DangerButton,
  ConfirmDialog,
  GhostButton,
} from '@/components/settings/FormControls';

/**
 * Memory settings panel — surfaces under /memory as the "Settings" sub-view.
 * Mnemos toggle, decay rate, dream frequency, consolidation, and a
 * destructive "clear all memory" action.
 *
 * mnemos/decay/dream/consolidation are local-only for now since the persisted
 * config table for these knobs hasn't been built yet; clear-all is a real
 * write against memory_events / thought_stream / cognitive_state.
 */
export default function MemorySettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const [mnemos, setMnemos] = useState(true);
  const [decayRate, setDecayRate] = useState(50);
  const [dreamFreq, setDreamFreq] = useState('daily');
  const [consolidation, setConsolidation] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Persist these knobs to localStorage so they survive a refresh until a
  // dedicated table exists. Per-user key.
  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(`memory-settings:${user.id}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.mnemos === 'boolean') setMnemos(parsed.mnemos);
        if (typeof parsed.decayRate === 'number') setDecayRate(parsed.decayRate);
        if (typeof parsed.dreamFreq === 'string') setDreamFreq(parsed.dreamFreq);
        if (typeof parsed.consolidation === 'boolean') setConsolidation(parsed.consolidation);
      } catch {
        /* noop */
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(
      `memory-settings:${user.id}`,
      JSON.stringify({ mnemos, decayRate, dreamFreq, consolidation })
    );
  }, [user, mnemos, decayRate, dreamFreq, consolidation]);

  const clearAll = async () => {
    if (!user) return;
    setClearing(true);
    await Promise.allSettled([
      supabase.from('memory_events').delete().eq('user_id', user.id),
      supabase.from('thought_stream').delete().eq('user_id', user.id),
      supabase.from('cognitive_state').delete().eq('user_id', user.id),
    ]);
    setClearing(false);
    setShowClearConfirm(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 02 / SETTINGS"
        title="Memory settings"
        description="How memory is captured, consolidated, and surfaced. Destructive operations live here."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 720 }}>
        <SectionTitle>Import conversations</SectionTitle>
        <div
          style={{
            marginBottom: 8,
            padding: 16,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Upload conversation exports from other AI platforms to build a deep psychological
            profile.
          </div>
          <GhostButton
            label="Import conversations →"
            onClick={() => {
              window.location.href = '/import';
            }}
          />
        </div>

        <SectionTitle>Memory system</SectionTitle>
        <SettingRow label="Enable mnemos memory" description="Persistent memory extraction and recall">
          <Toggle on={mnemos} onChange={() => setMnemos(!mnemos)} />
        </SettingRow>

        <SettingRow label="Memory decay rate" description="How quickly older memories fade">
          <div className="flex items-center gap-3 shrink-0">
            <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Slow</span>
            <input
              type="range"
              min={0}
              max={100}
              value={decayRate}
              onChange={(e) => setDecayRate(parseInt(e.target.value))}
              style={{
                width: 120,
                height: 3,
                borderRadius: 2,
                background: 'var(--bg-surface)',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Fast</span>
          </div>
        </SettingRow>

        <SettingRow label="Dream frequency" description="How often the agent processes memories">
          <SelectInput
            value={dreamFreq}
            onChange={setDreamFreq}
            options={[
              { label: 'Every hour', value: 'hourly' },
              { label: 'Every 6 hours', value: '6h' },
              { label: 'Daily', value: 'daily' },
              { label: 'Weekly', value: 'weekly' },
            ]}
          />
        </SettingRow>

        <SettingRow label="Enable consolidation" description="Merge related memories over time">
          <Toggle on={consolidation} onChange={() => setConsolidation(!consolidation)} />
        </SettingRow>

        <SectionTitle>Danger zone</SectionTitle>
        <DangerButton
          label={clearing ? 'Clearing…' : 'Clear all memory'}
          onClick={() => setShowClearConfirm(true)}
        />

        {showClearConfirm && (
          <ConfirmDialog
            title="Clear all memory"
            message="This will permanently delete all memory events, thoughts, and cognitive state. This cannot be undone."
            onConfirm={clearAll}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
