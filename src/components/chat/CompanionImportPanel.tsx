import { useEffect, useMemo, useState } from 'react';
import { FileUp, FolderInput, HardDrive, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BRIDGE_INSTALL_COMMAND } from '@/lib/companionImport';

type BridgeDevice = {
  id: string;
  name: string;
  platform: string | null;
  status: string | null;
  last_seen_at: string | null;
  bridge_version: string | null;
};

type CompanionImportPanelProps = {
  open: boolean;
  onClose: () => void;
  onAttachFiles: () => void;
  onStartCompanionImport: () => void;
  onStartOpenClawImport: (deviceName?: string | null) => void;
  onOpenBridgeSetup: () => void;
};

function deviceIsOnline(device: BridgeDevice): boolean {
  if (device.status === 'revoked') return false;
  if (!device.last_seen_at) return false;
  return Date.now() - new Date(device.last_seen_at).getTime() < 90_000;
}

function formatLastSeen(value: string | null): string {
  if (!value) return 'not seen yet';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'online now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CompanionImportPanel({
  open,
  onClose,
  onAttachFiles,
  onStartCompanionImport,
  onStartOpenClawImport,
  onOpenBridgeSetup,
}: CompanionImportPanelProps) {
  const [devices, setDevices] = useState<BridgeDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDevices(true);
    supabase
      .from('openclaw_devices')
      .select('id, name, platform, status, last_seen_at, bridge_version')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[CompanionImportPanel] could not load bridge devices', error);
          setDevices([]);
        } else {
          setDevices((data ?? []) as BridgeDevice[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDevices(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const onlineDevices = useMemo(() => devices.filter(deviceIsOnline), [devices]);
  const primaryDevice = onlineDevices[0] ?? devices[0] ?? null;

  if (!open) return null;

  return (
    <div className="companion-import-panel" role="dialog" aria-label="Bring a companion into Polyphonic">
      <div className="companion-import-head">
        <div>
          <div className="companion-import-kicker">bring someone in</div>
          <h3>Import a companion with Luca.</h3>
        </div>
        <button type="button" className="companion-import-close" onClick={onClose} aria-label="Close import panel">
          <X size={14} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>

      <div className="companion-import-grid">
        <button type="button" className="companion-import-option" onClick={onStartCompanionImport}>
          <span className="companion-import-icon"><FolderInput size={17} strokeWidth={1.6} aria-hidden="true" /></span>
          <span>
            <strong>Start a guided migration</strong>
            <small>Luca asks what should be preserved, then helps shape the imported being before anything is saved.</small>
          </span>
        </button>

        <button type="button" className="companion-import-option" onClick={onAttachFiles}>
          <span className="companion-import-icon"><FileUp size={17} strokeWidth={1.6} aria-hidden="true" /></span>
          <span>
            <strong>Attach source files here</strong>
            <small>Prompts, memory docs, voice samples, or smaller exports can be attached directly in this chat.</small>
          </span>
        </button>
      </div>

      <div className="companion-import-bridge">
        <div className="companion-import-bridge-top">
          <span className="companion-import-icon"><HardDrive size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <strong>OpenClaw / local Bridge</strong>
            <small>
              {loadingDevices
                ? 'Checking paired devices...'
                : onlineDevices.length > 0
                  ? `${onlineDevices.length} paired device${onlineDevices.length === 1 ? '' : 's'} online`
                  : devices.length > 0
                    ? 'Bridge is paired, but no device is online right now'
                    : 'Install Bridge to let Luca find local agents with permission'}
            </small>
          </div>
        </div>

        {primaryDevice && (
          <div className="companion-import-device">
            <span className={deviceIsOnline(primaryDevice) ? 'online' : ''} />
            <div>
              <strong>{primaryDevice.name}</strong>
              <small>{primaryDevice.platform || 'local'} · {formatLastSeen(primaryDevice.last_seen_at)}</small>
            </div>
          </div>
        )}

        <div className="companion-import-actions">
          <button type="button" onClick={() => onStartOpenClawImport(primaryDevice?.name ?? null)}>
            Ask Luca about OpenClaw import
          </button>
          <button type="button" onClick={onOpenBridgeSetup}>
            Bridge setup
          </button>
        </div>
        <code>{BRIDGE_INSTALL_COMMAND}</code>
      </div>
    </div>
  );
}
