import { useLocation, useNavigate } from 'react-router-dom';
import { useViewTabStore, MindTab } from '@/stores/viewTabStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';
import AgentScopeSelect from './AgentScopeSelect';

interface StreamItem { name: MindTab; meta: string; }

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

export default function SidebarMind() {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const mindTab = useViewTabStore((s) => s.mindTab);
  const setMindTab = useViewTabStore((s) => s.setMindTab);
  const { thoughts, dreams, wanderings, insights, reflections, activityLog, memoryStats } = useCognitiveStore();

  const streams: StreamItem[] = [
    { name: 'Overview',    meta: 'live' },
    { name: 'Thoughts',    meta: String(thoughts.length) },
    { name: 'Dreams',      meta: String(dreams.length) },
    { name: 'Wanderings',  meta: String(wanderings.length) },
    { name: 'Insights',    meta: String(insights.length) },
    { name: 'Reflections', meta: String(reflections.length) },
    { name: 'Beliefs',     meta: String(memoryStats.beliefs_count) },
    { name: 'Activity',    meta: String(activityLog.length) },
  ];

  const onMind = path === '/mind' || path.startsWith('/mind/');

  return (
    <>
      <SidebarHeader folio="§ 05" title="Mind" />
      <AgentScopeSelect />
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        <GroupLabel>Self</GroupLabel>
        <SidebarRow
          label="Identity"
          active={path.startsWith('/profile/identity')}
          onClick={() => navigate('/profile/identity')}
        />
        <SidebarRow
          label="Revisions"
          active={path.startsWith('/profile/revisions')}
          onClick={() => navigate('/profile/revisions')}
        />

        <GroupLabel>Streams</GroupLabel>
        {streams.map((it) => (
          <SidebarRow
            key={it.name}
            label={it.name}
            active={onMind && mindTab === it.name}
            onClick={() => {
              setMindTab(it.name);
              if (!onMind) navigate('/mind');
            }}
          />
        ))}
      </div>
    </>
  );
}
