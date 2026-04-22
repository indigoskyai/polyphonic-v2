import { useState } from 'react';
import { STARTER_PROMPTS } from './widgetLibrary';
import { useDashboardStore } from './dashboardStore';

interface Props {
  onSubmit: (prompt: string) => Promise<void>;
  generating: boolean;
  empty: boolean;
}

export default function Studio({ onSubmit, generating, empty }: Props) {
  const [draft, setDraft] = useState('');
  const { preferredModel, useOpenRouter, setPreferredModel, setUseOpenRouter } = useDashboardStore();
  const [showLibrary, setShowLibrary] = useState(empty);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const submit = async () => {
    const text = draft.trim();
    if (!text || generating) return;
    setDraft('');
    await onSubmit(text);
  };

  const MODELS = [
    { id: 'openai/gpt-5', label: 'GPT-5' },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  ];

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}>
      {/* Starter library */}
      {showLibrary && (
        <div style={{ padding: '14px 28px 0' }}>
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>Starter library</span>
            <button onClick={() => setShowLibrary(false)} style={{ fontSize: 10, color: 'var(--text-ghost)', background: 'transparent', border: 'none', cursor: 'pointer' }}>hide</button>
          </div>
          {(['Inner Mind','Behavioral Patterns','Cognitive Genome'] as const).map((pillar) => (
            <div key={pillar} className="mb-3">
              <div style={{ fontSize: 10, color: 'var(--text-soft)', marginBottom: 6, letterSpacing: '0.04em' }}>{pillar}</div>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PROMPTS.filter((p) => p.pillar === pillar).map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onSubmit(p.prompt)}
                    disabled={generating}
                    className="text-[11px] px-2.5 py-1 rounded"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      cursor: generating ? 'wait' : 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prompt bar */}
      <div className="flex items-center gap-2" style={{ padding: '14px 28px' }}>
        {!showLibrary && (
          <button
            onClick={() => setShowLibrary(true)}
            className="text-[11px] px-2 py-1.5 rounded shrink-0"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)', cursor: 'pointer' }}
            title="Show starter library"
          >
            ✦
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Describe a widget — e.g. show me when I'm most self-critical…"
          disabled={generating}
          style={{
            flex: 1,
            fontSize: 13,
            padding: '10px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
          }}
        />
        <div className="relative shrink-0">
          <button
            onClick={() => setShowModelMenu((v) => !v)}
            className="text-[10px] px-2 py-1.5 rounded"
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            title="Choose AI model"
          >
            {MODELS.find((m) => m.id === preferredModel)?.label ?? preferredModel}
          </button>
          {showModelMenu && (
            <div className="absolute right-0 bottom-full mb-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', minWidth: 200, padding: 6, zIndex: 50 }}>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setPreferredModel(m.id); setShowModelMenu(false); }}
                  className="block w-full text-left text-[11px] px-2 py-1.5 rounded"
                  style={{
                    background: m.id === preferredModel ? 'var(--bg-surface)' : 'transparent',
                    color: m.id === preferredModel ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, paddingTop: 4 }}>
                <label className="flex items-center gap-2 px-2 py-1" style={{ fontSize: 10, color: 'var(--text-ghost)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={useOpenRouter} onChange={(e) => setUseOpenRouter(e.target.checked)} />
                  Route via OpenRouter (uses your key)
                </label>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={generating || !draft.trim()}
          className="text-[11px] px-3 py-1.5 rounded shrink-0"
          style={{
            background: generating || !draft.trim() ? 'var(--bg-surface)' : 'var(--luca)',
            color: generating || !draft.trim() ? 'var(--text-ghost)' : 'var(--bg-deep)',
            border: 'none', cursor: generating ? 'wait' : 'pointer', fontWeight: 500,
          }}
        >
          {generating ? 'designing…' : 'generate'}
        </button>
      </div>
    </div>
  );
}
