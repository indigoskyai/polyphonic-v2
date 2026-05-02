/**
 * MemoryView — Round 2 Mnemos router.
 *
 * Memories tab → MnemosOverview (digest/overview surface)
 * Engrams / Beliefs / Graph → restyled tabs in shared MnemosStreamShell aesthetic
 * Imports → preserved import-history table
 * Settings → preserved settings panel
 *
 * NOTE: The old in-file MemoriesTab + MemoryDetailPanel were superseded by
 * MnemosOverview + GraphDetailPanel. To browse the full memories table the user
 * can use the Engrams tab (engrams ARE the substrate units of memory in Mnemos).
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useViewTabStore } from '@/stores/viewTabStore';
import GraphTab from '@/components/memory/GraphTab';
import EngramsTab from '@/components/memory/EngramsTab';
import BeliefsTab from '@/components/memory/BeliefsTab';
import ImportsTab from '@/components/memory/ImportsTab';
import MemorySettingsPanel from '@/components/memory/MemorySettingsPanel';
import MnemosOverview from '@/components/memory/MnemosOverview';




export default function MemoryView() {
  const activeTab = useViewTabStore((s) => s.memoryTab);
  const user = useAuthStore((s) => s.user);
  const loadAll = useMemoryStore((s) => s.loadAll);

  useEffect(() => {
    if (user) loadAll(user.id);
  }, [user]);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}
    >
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: activeTab === 'Graph' ? 0 : undefined }}
        >
          {activeTab === 'Memories' && <MnemosOverview />}
          {activeTab === 'Engrams' && <EngramsTab />}
          {activeTab === 'Beliefs' && <BeliefsTab />}
          {activeTab === 'Graph' && <GraphTab />}
          {activeTab === 'Imports' && <ImportsTab />}
          {activeTab === 'Settings' && <MemorySettingsPanel />}
        </div>
        {/* Engram details now open via the global drawer router (memory-detail). */}
      </div>
    </div>
  );
}

