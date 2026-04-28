import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';
import { PageHeader, SectionTitle } from '@/components/settings/FormControls';

interface Device {
  id: string;
  name: string;
  platform: string | null;
  status: 'online' | 'offline' | 'revoked';
  last_seen_at: string | null;
  bridge_version: string | null;
  is_default: boolean;
  connected?: boolean;
}

const INSTALL_CMD = 'curl -fsSL https://get.polyphonic.dev/bridge | sh';

function fmtSeen(ts: string | null) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LocalRuntimeSettings() {
  const user = useAuthStore((s) => s.user);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairExpiresAt, setPairExpiresAt] = useState<number | null>(null);
  const [issuingCode, setIssuingCode] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadDevices = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('openclaw-bridge', {
      body: { action: 'list_devices' },
    });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    setDevices((data?.devices ?? []) as Device[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDevices();
    const t = setInterval(loadDevices, 8000);
    return () => clearInterval(t);
  }, [user, loadDevices]);

  // Tick for code countdown
  useEffect(() => {
    if (!pairExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairExpiresAt]);

  // Auto-clear expired code
  useEffect(() => {
    if (pairExpiresAt && now > pairExpiresAt) {
      setPairCode(null);
      setPairExpiresAt(null);
    }
  }, [now, pairExpiresAt]);

  const issuePairingCode = async () => {
    setIssuingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('openclaw-pair', {
        body: { action: 'issue' },
      });
      if (error) throw error;
      setPairCode(data.code);
      setPairExpiresAt(new Date(data.expires_at).getTime());
      toast({ title: 'Pairing code ready', description: 'Enter it in Polyphonic Bridge within 10 minutes.' });
    } catch (e: any) {
      toast({ title: 'Could not issue code', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setIssuingCode(false);
    }
  };

  const copyInstall = () => {
    navigator.clipboard.writeText(INSTALL_CMD);
    toast({ title: 'Copied install command' });
  };

  const copyCode = () => {
    if (pairCode) {
      navigator.clipboard.writeText(pairCode);
      toast({ title: 'Copied pairing code' });
    }
  };

  const remainingSec = pairExpiresAt ? Math.max(0, Math.floor((pairExpiresAt - now) / 1000)) : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 09 / LOCAL RUNTIME"
        title="Local runtime"
        description="Run your Polyphonic agents on your own machine via Polyphonic Bridge. Conversations stream live to the app; transcripts sync to your account so you can read them anywhere."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 720 }}>
        <SectionTitle>Install Polyphonic Bridge</SectionTitle>
        <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6, marginBottom: 14 }}>
          Run this once on the machine that should host your agents. The bridge supervises a local
          OpenClaw runtime and dials Polyphonic over an outbound secure connection — no inbound port required.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            border: '1px solid var(--border-faint)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-deep)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {INSTALL_CMD}
          </span>
          <button
            onClick={copyInstall}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-meta)',
              textTransform: 'uppercase',
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--border-faint)',
              background: 'transparent',
              color: 'var(--text-body)',
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-ghost)', lineHeight: 1.5 }}>
          A native desktop app is on the roadmap. The CLI bridge today uses the same protocol the desktop app will.
        </p>

        <SectionTitle>Pair this device</SectionTitle>
        {!pairCode ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6, marginBottom: 14 }}>
              Generate a 6-digit code, then run <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>polyphonic-bridge pair</code> on
              your machine and paste the code when prompted.
            </p>
            <button
              onClick={issuePairingCode}
              disabled={issuingCode}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 'var(--track-meta)',
                textTransform: 'uppercase',
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid var(--border-faint)',
                background: 'var(--text-primary)',
                color: 'var(--bg-deep)',
                cursor: issuingCode ? 'wait' : 'pointer',
                opacity: issuingCode ? 0.6 : 1,
              }}
            >
              {issuingCode ? 'Generating…' : 'Generate pairing code'}
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              border: '1px solid var(--border-faint)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-deep)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 'var(--track-folio)',
                color: 'var(--text-ghost)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Pairing code · expires in {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
            </div>
            <div
              onClick={copyCode}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 36,
                letterSpacing: '0.4em',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'all',
                marginBottom: 8,
              }}
            >
              {pairCode}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
              Click the code to copy. The list below will populate automatically once your bridge connects.
            </p>
          </div>
        )}

        <SectionTitle>Devices</SectionTitle>
        {loading ? (
          <p style={{ fontSize: 12, color: 'var(--text-ghost)' }}>Loading…</p>
        ) : devices.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-ghost)', lineHeight: 1.6 }}>
            No devices paired yet. Generate a code above, then run the bridge on your machine.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border-faint)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {devices.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '14px 16px',
                  background: 'var(--canvas)',
                  borderBottom: '1px solid var(--border-faint)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: d.connected || d.status === 'online' ? '#7BC97B' : 'var(--text-ghost)',
                    boxShadow: d.connected || d.status === 'online' ? '0 0 8px #7BC97B' : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {d.name}
                    {d.is_default && (
                      <span
                        style={{
                          marginLeft: 10,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: 'var(--track-meta)',
                          textTransform: 'uppercase',
                          color: 'var(--text-ghost)',
                          padding: '2px 8px',
                          border: '1px solid var(--border-faint)',
                          borderRadius: 999,
                        }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: 'var(--track-meta)',
                      color: 'var(--text-ghost)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {d.platform || 'unknown'} · {d.bridge_version || 'unversioned'} · seen {fmtSeen(d.last_seen_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
