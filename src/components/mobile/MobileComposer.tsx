import React, { useState } from 'react';

interface Props { onSend: (text: string) => void }

export default function MobileComposer({ onSend }: Props) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue('');
  };
  return (
    <div className="m-composer-wrap">
      <div className="m-composer">
        <input
          type="text"
          className="m-composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Message…"
          aria-label="Message"
        />
        <button type="button" className="m-send" onClick={submit} aria-label="Send">
          <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 1 L1 5 L4 6 L5.5 9 Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
