import React from 'react';

export type MnemosMode = 'browse' | 'digest';

interface Props {
  mode: MnemosMode;
  onChange: (m: MnemosMode) => void;
  pendingCount?: number;
}

export default function MnemosModeToggle({ mode, onChange, pendingCount = 0 }: Props) {
  return (
    <div className="mnemos-mode-toggle" role="tablist" aria-label="Memory view mode">
      <button
        type="button"
        role="tab"
        className="mnemos-mode-btn"
        data-active={mode === 'browse' ? 'true' : undefined}
        onClick={() => onChange('browse')}
      >
        Browse
      </button>
      <button
        type="button"
        role="tab"
        className="mnemos-mode-btn"
        data-active={mode === 'digest' ? 'true' : undefined}
        onClick={() => onChange('digest')}
      >
        Digest
        {pendingCount > 0 && (
          <span className="mnemos-mode-dot" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
