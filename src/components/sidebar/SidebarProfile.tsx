import { startTransition } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useViewTabStore, ProfileTab } from '@/stores/viewTabStore';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';

const TABS: ProfileTab[] = [
  'Portrait',
  'Personality',
  'Communication',
  'Emotions',
  'Values',
  'Relationships',
  'Cognition',
  'Growth',
  'Shadow',
];

export default function SidebarProfile() {
  const profileTab = useViewTabStore((s) => s.profileTab);
  const setProfileTab = useViewTabStore((s) => s.setProfileTab);
  const navigate = useNavigate();
  const path = useLocation().pathname;

  return (
    <>
      <SidebarHeader folio="§ 04" title="Profile" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        <SidebarRow
          label="Public profile"
          active={path === '/settings/public-profile'}
          onClick={() => navigate('/settings/public-profile')}
        />
        <div style={{ height: 1, background: 'var(--border-faint)', margin: '8px 8px' }} />
        {TABS.map((t) => (
          <SidebarRow
            key={t}
            label={t}
            active={path === '/profile' && profileTab === t}
            onClick={() => {
              setProfileTab(t);
              if (path !== '/profile') {
                startTransition(() => navigate('/profile'));
              }
            }}
          />
        ))}
      </div>
    </>
  );
}
