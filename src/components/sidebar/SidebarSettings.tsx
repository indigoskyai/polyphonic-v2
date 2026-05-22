import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';
import { prefetchCoreSettingsRoutes, prefetchRoute } from '@/lib/routePrefetch';

interface Entry {
  key: string;
  label: string;
  path: string;
}

const AGENTS_GROUP: Entry[] = [
  { key: 'agents', label: 'Agents', path: '/settings/agents' },
];

const SYSTEM_GROUP: Entry[] = [
  { key: 'general', label: 'General', path: '/settings/general' },
  { key: 'models', label: 'Models', path: '/settings/models' },
  { key: 'appearance', label: 'Appearance', path: '/settings/appearance' },
  { key: 'skills', label: 'Self-model', path: '/settings/skills' },
  { key: 'routines', label: 'Routines', path: '/settings/routines' },
  { key: 'voice', label: 'Voice & security', path: '/settings/voice' },
  { key: 'local-runtime', label: 'Local runtime', path: '/settings/local-runtime' },
  { key: 'portability', label: 'Import & export', path: '/settings/portability' },
  { key: 'account', label: 'Account & preferences', path: '/settings/account' },
  { key: 'help', label: 'Guide & help', path: '/settings/help' },
];

const OPERATIONS_GROUP: Entry[] = [
  { key: 'cron-health', label: 'Cron health', path: '/settings/cron-health' },
];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 16px 6px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--settings-mono-size)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: 'var(--track-folio)',
        color: 'var(--text-soft)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

export default function SidebarSettings() {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const isActive = (entryPath: string) =>
    path === entryPath || path.startsWith(entryPath + '/');

  useEffect(() => {
    prefetchCoreSettingsRoutes();
  }, []);

  const prime = (entryPath: string) => () => prefetchRoute(entryPath);

  return (
    <>
      <SidebarHeader folio="§ 09" title="Settings" />
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '0 12px 12px' }}
      >
        <GroupLabel>Agents</GroupLabel>
        {AGENTS_GROUP.map((e) => (
          <SidebarRow
            key={e.key}
            label={e.label}
            active={isActive(e.path)}
            onClick={() => navigate(e.path)}
            onFocus={prime(e.path)}
            onPointerDown={prime(e.path)}
            onPointerEnter={prime(e.path)}
          />
        ))}

        <GroupLabel>System</GroupLabel>
        {SYSTEM_GROUP.map((e) => (
          <SidebarRow
            key={e.key}
            label={e.label}
            active={isActive(e.path)}
            onClick={() => navigate(e.path)}
            onFocus={prime(e.path)}
            onPointerDown={prime(e.path)}
            onPointerEnter={prime(e.path)}
          />
        ))}

        <GroupLabel>Operations</GroupLabel>
        {OPERATIONS_GROUP.map((e) => (
          <SidebarRow
            key={e.key}
            label={e.label}
            active={isActive(e.path)}
            onClick={() => navigate(e.path)}
            onFocus={prime(e.path)}
            onPointerDown={prime(e.path)}
            onPointerEnter={prime(e.path)}
          />
        ))}
      </div>
    </>
  );
}
