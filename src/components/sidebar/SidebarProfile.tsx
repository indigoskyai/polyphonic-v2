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

  return (
    <>
      <SidebarHeader folio="§ 04" title="Profile" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <SidebarRow key={t} label={t} active={profileTab === t} onClick={() => setProfileTab(t)} />
        ))}
      </div>
    </>
  );
}
