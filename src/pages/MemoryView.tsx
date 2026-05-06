/**
 * MemoryView — Round 2 Mnemos router with Browse / Digest mode.
 *
 * Browse → existing tabs (Memories / Engrams / Beliefs / Graph / Imports / Settings).
 * Digest → DailyDigest, the user-facing daily review of today's engram formations.
 */
import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
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
import Pill from '@/components/ui/luca/Pill';

export default function MemoryView() {
  const activeTab = useViewTabStore((s) => s.memoryTab);
  const mode = useViewTabStore((s) => s.mnemosMode);
  const user = useAuthStore((s) => s.user);
  const loadAll = useMemoryStore((s) => s.loadAll);
  const loadErrors = useMemoryStore((s) => s.loadErrors);
  const loadErrorEntries = Object.entries(loadErrors);

  useEffect(() => {
    if (user) loadAll(user.id);
  }, [user, loadAll]);

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
          {loadErrorEntries.length > 0 && (
            <div
              role="status"
              style={{
                margin: '16px 24px 0',
                padding: '12px 14px',
                border: '1px solid var(--border-faint)',
                borderRadius: 8,
                background: 'var(--surface-raised)',
                color: 'var(--text-soft)',
                fontSize: 12,
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>
                Memory layer load issue: {loadErrorEntries.map(([layer]) => layer).join(', ')}.
              </span>
              <Pill
                icon={<RotateCcw size={12} strokeWidth={1.8} />}
                onClick={() => { if (user) void loadAll(user.id); }}
                aria-label="Retry loading memory"
              >
                retry
              </Pill>
            </div>
          )}
          <div key={`${mode}:${activeTab}`} className="tab-transition-panel">
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
    </div>
  );
}
