import { useViewTabStore, MindTab } from '@/stores/viewTabStore';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';

const TABS: MindTab[] = ['Overview', 'Journal', 'Thoughts', 'Dreams', 'Wanderings', 'Insights', 'Reflections'];

export default function SidebarMind() {
  const mindTab = useViewTabStore((s) => s.mindTab);
  const setMindTab = useViewTabStore((s) => s.setMindTab);

  return (
    <>
      <SidebarHeader folio="§ 03" title="Mind" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <SidebarRow key={t} label={t} active={mindTab === t} onClick={() => setMindTab(t)} />
        ))}
      </div>
    </>
  );
}
