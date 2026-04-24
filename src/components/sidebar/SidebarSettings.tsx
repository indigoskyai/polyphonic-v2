import { useLocation, useNavigate } from 'react-router-dom';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';

interface Entry {
  key: string;
  label: string;
  path: string;
}

const AGENTS_GROUP: Entry[] = [
  { key: 'agents', label: 'Agents', path: '/settings/agents' },
];

const SYSTEM_GROUP: Entry[] = [
  { key: 'skills', label: 'Skills', path: '/settings/skills' },
  { key: 'routines', label: 'Routines', path: '/settings/routines' },
  { key: 'voice', label: 'Voice & security', path: '/settings/voice' },
  { key: 'portability', label: 'Import & export', path: '/settings/portability' },
  { key: 'account', label: 'Account & preferences', path: '/settings/account' },
];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 16px 6px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 'var(--track-folio)',
        color: 'var(--text-ghost)',
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

  return (
    <>
      <SidebarHeader folio="§ 09" title="Settings" />
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '0 8px', scrollbarWidth: 'none' }}
      >
        <GroupLabel>Agents</GroupLabel>
        {AGENTS_GROUP.map((e) => (
          <SidebarRow
            key={e.key}
            label={e.label}
            active={isActive(e.path)}
            onClick={() => navigate(e.path)}
          />
        ))}

        <GroupLabel>System</GroupLabel>
        {SYSTEM_GROUP.map((e) => (
          <SidebarRow
            key={e.key}
            label={e.label}
            active={isActive(e.path)}
            onClick={() => navigate(e.path)}
          />
        ))}
      </div>
    </>
  );
}
