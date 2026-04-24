import React from 'react';

interface Option { agent: string; label: string }

interface Props {
  options: Option[];
  highlighted: number;
  onSelect: (agent: string) => void;
  onHover: (idx: number) => void;
}

export default function MentionAutocomplete({ options, highlighted, onSelect, onHover }: Props) {
  if (options.length === 0) return null;
  return (
    <div className="mention-dropdown" role="listbox" aria-label="Mention agent">
      {options.map((opt, i) => (
        <button
          key={opt.agent}
          type="button"
          role="option"
          aria-selected={i === highlighted}
          className="mention-option"
          data-agent={opt.agent}
          data-highlighted={i === highlighted ? 'true' : undefined}
          onMouseEnter={() => onHover(i)}
          onClick={() => onSelect(opt.agent)}
        >
          <span className="mention-option-dot" aria-hidden="true" />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
