import React from 'react';
import { useGroupSessionStore } from '@/stores/groupSessionStore';

const MIC_HEIGHTS = [8, 18, 22, 14, 10, 16, 6];
const MIC_DELAYS = ['0s', '0.05s', '0.1s', '0.15s', '0.2s', '0.25s', '0.3s'];

export default function ListeningBar() {
  const micActive = useGroupSessionStore((s) => s.micActive);
  return (
    <div className="listening-bar" data-mic={micActive ? 'true' : 'false'}>
      <span className="listening-label">listening</span>
      <div className="listening-mic-row" aria-hidden="true">
        {MIC_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="mic-bar"
            style={{ height: `${h}px`, animationDelay: MIC_DELAYS[i] }}
          />
        ))}
      </div>
    </div>
  );
}
