import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';
import { Section } from '@/components/settings/Section';
import { CodeBlock, PairCodeDisplay } from '@/components/settings/CodeBlock';
import { DeviceRow } from '@/components/settings/DeviceRow';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';

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

interface PairingCodeResponse {
  code: string;
  expires_at: string;
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

  const time = useClock();

  const loadDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from('openclaw_devices')
      .select(
        'id, name, platform, status, last_seen_at, bridge_version, is_default',
      )
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Device[];
    const withConnected = rows.map((d) => ({
      ...d,
      connected:
        d.status === 'online' &&
        !!d.last_seen_at &&
        Date.now() - new Date(d.last_seen_at).getTime() < 90_000,
    }));
    setDevices(withConnected);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDevices();
    const t = setInterval(loadDevices, 8000);
    return () => clearInterval(t);
  }, [user, loadDevices]);

  useEffect(() => {
    if (!pairExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairExpiresAt]);

  useEffect(() => {
    if (pairExpiresAt && now > pairExpiresAt) {
      setPairCode(null);
      setPairExpiresAt(null);
    }
  }, [now, pairExpiresAt]);

  const issuePairingCode = async () => {
    setIssuingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke<PairingCodeResponse>(
        'openclaw-pair',
        { body: { action: 'issue' } },
      );
      if (error) throw error;
      if (!data) throw new Error('Pairing response was empty.');
      setPairCode(data.code);
      setPairExpiresAt(new Date(data.expires_at).getTime());
      toast({
        title: 'Pairing code ready',
        description: 'Enter it in Polyphonic Bridge within 10 minutes.',
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Could not issue code',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIssuingCode(false);
    }
  };

  const onlineCount = devices.filter((d) => d.connected).length;

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              settings · <span className="v">local runtime</span>
            </span>
            <span>
              {devices.length} device{devices.length === 1 ? '' : 's'}
            </span>
          </>
        ),
        right: (
          <>
            <span>{onlineCount} online</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 07</span>
          <span>·</span>
          <span className="v">OpenClaw bridge</span>
        </div>
        <h1 className="set-head-title">Local runtime</h1>
        <p className="set-head-sub">
          Run agents on your own machine. Install the Polyphonic Bridge, pair
          this device, and see all connected runtimes at a glance.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Install"
          title="Polyphonic Bridge"
          desc="One command installs the bridge daemon on macOS, Linux, and WSL. The bridge runs in the background and connects this workspace to your local models and tools."
        >
          <CodeBlock code={INSTALL_CMD} prompt="$" />
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              letterSpacing: 'var(--track-body-tight)',
              lineHeight: 1.5,
            }}
          >
            Once installed, return here and use the pairing code below to
            authorize this workspace.
          </p>
        </Section>

        <Section
          number="02"
          name="Pair"
          title="Pair this device"
          desc="Enter this code in your bridge terminal to authorize. Codes expire in ten minutes for security."
        >
          <PairCodeDisplay
            code={pairCode}
            expiresAt={pairExpiresAt}
            now={now}
            issuing={issuingCode}
            onIssue={issuePairingCode}
          />
        </Section>

        <Section
          number="03"
          name={`Devices · ${devices.length} paired`}
          title="Connected runtimes"
          desc="All devices currently authorized to run agents on your behalf. Revoke at any time to immediately invalidate."
        >
          {loading && devices.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
              }}
            >
              Loading devices…
            </div>
          ) : devices.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                letterSpacing: 'var(--track-body-tight)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-faint)',
                borderRadius: 'var(--radius-md, 10px)',
              }}
            >
              No devices paired yet. Install the bridge above and pair your
              first device.
            </div>
          ) : (
            <div style={{ margin: '0 -16px' }}>
              {devices.map((d) => (
                <DeviceRow
                  key={d.id}
                  name={d.name}
                  platform={d.platform}
                  lastSeen={fmtSeen(d.last_seen_at)}
                  status={d.connected ? 'online' : d.status}
                  version={d.bridge_version}
                  isDefault={d.is_default}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </SettingsPage>
  );
}
