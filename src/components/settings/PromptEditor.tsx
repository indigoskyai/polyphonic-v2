import React from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PromptEditor({ value, onChange }: Props) {
  const lines = value ? value.split('\n').length : 1;
  return (
    <>
      <textarea
        className="prompt-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="System prompt…"
      />
      <div className="prompt-meta">
        <span>{value.length} chars</span>
        <span>{lines} lines</span>
      </div>
    </>
  );
}
