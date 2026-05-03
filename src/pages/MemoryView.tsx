/**
 * MemoryView — Round 2 Mnemos router with Browse / Digest mode.
 *
 * Browse → existing tabs (Memories / Engrams / Beliefs / Graph / Imports / Settings).
 * Digest → DailyDigest, the user-facing daily review of today's engram formations.
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
import MnemosModeToggle from '@/components/memory/MnemosModeToggle';
import DailyDigest from '@/components/memory/DailyDigest';

export default function MemoryView() {
  const activeTab = useViewTabStore((s) => s.memoryTab);
  const mode = useViewTabStore((s) => s.mnemosMode);
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
      {/* Mode toggle bar — anchored top-right */}
      <div className="mn-mode-bar">
        <MnemosModeToggle />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: mode === 'browse' && activeTab === 'Graph' ? 0 : undefined }}
        >
          {mode === 'digest' ? (
            <DailyDigest />
          ) : (
            <>
              {activeTab === 'Memories' && <MnemosOverview />}
              {activeTab === 'Engrams' && <EngramsTab />}
              {activeTab === 'Beliefs' && <BeliefsTab />}
              {activeTab === 'Graph' && <GraphTab />}
              {activeTab === 'Imports' && <ImportsTab />}
              {activeTab === 'Settings' && <MemorySettingsPanel />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
