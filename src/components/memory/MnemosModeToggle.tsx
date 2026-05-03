import { useViewTabStore, type MnemosMode } from '@/stores/viewTabStore';
import { useDigestStore } from '@/stores/digestStore';

export default function MnemosModeToggle() {
  const mode = useViewTabStore((s) => s.mnemosMode);
  const setMode = useViewTabStore((s) => s.setMnemosMode);
  const pending = useDigestStore((s) => s.engrams.filter((e) => !e.reviewed_at).length);

  const opts: MnemosMode[] = ['browse', 'digest'];
  return (
    <div className="mn-mode" role="tablist" aria-label="Memory view mode">
      {opts.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={`mn-mode-btn${mode === m ? ' active' : ''}`}
          onClick={() => setMode(m)}
        >
          {m}
          {m === 'digest' && pending > 0 && (
            <span className="mn-mode-dot" aria-hidden="true" style={{ marginLeft: 6 }}>{pending}</span>
          )}
        </button>
      ))}
    </div>
  );
}
