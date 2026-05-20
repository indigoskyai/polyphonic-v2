import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <DangerButton
          label={clearing ? 'Clearing…' : 'Clear all memory'}
          onClick={() => setShowClearConfirm(true)}
        />

        {showClearConfirm && (
          <ConfirmDialog
            title="Clear all memory"
            message="This will permanently delete all memory events, thoughts, cognitive state, engrams, connections, and beliefs. This cannot be undone."
            onConfirm={clearAll}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
