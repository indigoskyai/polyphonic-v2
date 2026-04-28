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
        <SidebarRow label="Identity" active={path === '/profile/identity'} onClick={() => navigate('/profile/identity')} />
        {TABS.map((t) => (
          <SidebarRow
            key={t}
            label={t}
            active={path === '/profile' && profileTab === t}
            onClick={() => {
              setProfileTab(t);
              if (path !== '/profile') navigate('/profile');
            }}
          />
        ))}
      </div>
    </>
  );
}
