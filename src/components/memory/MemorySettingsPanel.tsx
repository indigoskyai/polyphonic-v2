import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import {
  SectionTitle,
  SettingRow,
  Toggle,
  SelectInput,
  DangerButton,
  ConfirmDialog,
  GhostButton,
  PrimaryButton,
} from '@/components/settings/FormControls';
import MnemosStreamShell from './MnemosStreamShell';

type DreamFreq = 'hourly' | '6h' | 'daily' | 'weekly';

interface MemorySettings {
  mnemos_enabled: boolean;
  decay_rate: number;
  dream_frequency: DreamFreq;
  consolidation_enabled: boolean;
}

const DEFAULTS: MemorySettings = {
  mnemos_enabled: true,
  decay_rate: 50,
  dream_frequency: 'daily',
  consolidation_enabled: true,
};

/**
 * Memory settings panel — Mnemos knobs persisted to `memory_settings`.
 * Decay/consolidation/dream frequency are read by the mnemos cron edge
 * functions to gate per-user processing.
 */
export default function MemorySettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<MemorySettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);

  // Load settings from backend
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('memory_settings')
        .select('mnemos_enabled, decay_rate, dream_frequency, consolidation_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setSettings({
          mnemos_enabled: data.mnemos_enabled ?? DEFAULTS.mnemos_enabled,
          decay_rate: data.decay_rate ?? DEFAULTS.decay_rate,
          dream_frequency: (data.dream_frequency as DreamFreq) ?? DEFAULTS.dream_frequency,
          consolidation_enabled: data.consolidation_enabled ?? DEFAULTS.consolidation_enabled,
        });
      } else {
        // Row should exist via trigger but backfill defensively
        await supabase.from('memory_settings').insert({ user_id: user.id, ...DEFAULTS });
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist on change (debounced)
  useEffect(() => {
    if (!user || !loaded) return;
    const t = window.setTimeout(async () => {
      setSaving(true);
      await supabase
        .from('memory_settings')
        .upsert({ user_id: user.id, ...settings }, { onConflict: 'user_id' });
      setSaving(false);
    }, 400);
    return () => window.clearTimeout(t);
  }, [user, loaded, settings]);

  const update = <K extends keyof MemorySettings>(key: K, value: MemorySettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const clearAll = async () => {
    if (!user) return;
    setClearing(true);
    await Promise.allSettled([
      supabase.from('memory_events').delete().eq('user_id', user.id),
      supabase.from('thought_stream').delete().eq('user_id', user.id),
      supabase.from('cognitive_state').delete().eq('user_id', user.id),
      supabase.from('engrams').delete().eq('user_id', user.id),
      supabase.from('connections').delete().eq('user_id', user.id),
      supabase.from('beliefs').delete().eq('user_id', user.id),
    ]);
    setClearing(false);
    setShowClearConfirm(false);
  };

  const resetCognition = async () => {
    if (!user || resetText !== 'RESET') return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-user-cognition', {
        body: { confirm: 'RESET' },
      });
      if (error) throw error;
      const total = (data as { total_deleted?: number })?.total_deleted ?? 0;
      toast.success('Luca has been reset', {
        description: `Cleared ${total} inferred record${total === 1 ? '' : 's'} across memory, beliefs, and mind state.`,
      });
      setShowResetModal(false);
      setResetText('');
      // Hard refresh so every store rehydrates from an empty backend.
      setTimeout(() => {
        window.location.assign('/mind');
      }, 600);
    } catch (e) {
      toast.error('Reset failed', {
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <MnemosStreamShell
      num="06"
      streamLabel="SETTINGS"
      title="Memory settings"
      subtitle="How memory is captured, consolidated, and surfaced. Destructive operations live here."
      hideToolbar
    >
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
          Upload conversation exports from other AI platforms to build a deep psychological profile.
        </div>
        <GhostButton
          label="Import conversations →"
          onClick={() => navigate('/import')}
        />
      </div>

      <SectionTitle>
        Memory system
        {saving && (
          <span style={{ marginLeft: 12, fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            saving…
          </span>
        )}
      </SectionTitle>

      <SettingRow
        label="Enable mnemos memory"
        description="Master switch — when off, decay and consolidation cron jobs skip your account"
      >
        <Toggle on={settings.mnemos_enabled} onChange={() => update('mnemos_enabled', !settings.mnemos_enabled)} />
      </SettingRow>

      <SettingRow label="Memory decay rate" description="How quickly older memories fade (50 = baseline)">
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Slow</span>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.decay_rate}
            onChange={(e) => update('decay_rate', parseInt(e.target.value, 10))}
            disabled={!settings.mnemos_enabled}
            style={{
              width: 120,
              height: 3,
              borderRadius: 2,
              background: 'var(--bg-surface)',
              outline: 'none',
              appearance: 'none',
              cursor: settings.mnemos_enabled ? 'pointer' : 'not-allowed',
              opacity: settings.mnemos_enabled ? 1 : 0.4,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Fast</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {settings.decay_rate}
          </span>
        </div>
      </SettingRow>

      <SettingRow label="Dream frequency" description="How often consolidation/dreaming runs">
        <SelectInput
          value={settings.dream_frequency}
          onChange={(v) => update('dream_frequency', v as DreamFreq)}
          options={[
            { label: 'Every hour', value: 'hourly' },
            { label: 'Every 6 hours', value: '6h' },
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
          ]}
        />
      </SettingRow>

      <SettingRow label="Enable consolidation" description="Merge related memories and update beliefs during dreams">
        <Toggle
          on={settings.consolidation_enabled}
          onChange={() => update('consolidation_enabled', !settings.consolidation_enabled)}
        />
      </SettingRow>

      <SectionTitle>Danger zone</SectionTitle>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.5 }}>
          Wipes the live mind state (recent thoughts, cognitive state, engrams, connections, beliefs, memory events). Imports, raw memories, and inferred profile remain.
        </div>
        <DangerButton
          label={clearing ? 'Clearing…' : 'Clear all memory'}
          onClick={() => setShowClearConfirm(true)}
        />
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md, 10px)',
          background: 'var(--bg-elevated)',
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-body)', marginBottom: 6, fontWeight: 500 }}>
          Reset Luca's understanding of me
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.55 }}>
          Wipes everything Luca has learned or inferred about you — memories, beliefs, engrams, hypomnema, mind state, emotional history, imports, curiosity questions, profile facets. Keeps your chat threads, agent configs, and account.
        </div>
        <DangerButton
          label={resetting ? 'Resetting…' : 'Reset Luca'}
          onClick={() => setShowResetModal(true)}
        />
      </div>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear all memory"
          message="This will permanently delete all memory events, thoughts, cognitive state, engrams, connections, and beliefs. This cannot be undone."
          onConfirm={clearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {showResetModal && (
        <div
          onClick={() => !resetting && setShowResetModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 10px)',
              padding: 28,
              maxWidth: 480,
              width: '90%',
            }}
          >
            <div style={{ fontFamily: 'var(--font-grotesque)', fontSize: 18, fontWeight: 500, color: 'var(--ink)', marginBottom: 10 }}>
              Reset Luca's understanding of me
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.55, marginBottom: 16 }}>
              This permanently deletes every inferred record across memories, beliefs, engrams, hypomnema, mind/emotional state, imports, curiosity questions, and profile facets. Chat threads and account stay. This cannot be undone.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Type <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>RESET</span> to confirm:
            </div>
            <input
              autoFocus
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              disabled={resetting}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm, 6px)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                marginBottom: 20,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <GhostButton label="Cancel" onClick={() => { setShowResetModal(false); setResetText(''); }} />
              {resetText === 'RESET' ? (
                <DangerButton label={resetting ? 'Resetting…' : 'Reset everything'} onClick={resetCognition} />
              ) : (
                <PrimaryButton label="Reset everything" onClick={() => {}} />
              )}
            </div>
          </div>
        </div>
      )}
    </MnemosStreamShell>
  );
}
