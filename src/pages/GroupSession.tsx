import React from 'react';
import Stage from '@/components/group/Stage';
import Transcript from '@/components/group/Transcript';
import ListeningBar from '@/components/group/ListeningBar';
import useMockGroupSession from '@/hooks/useMockGroupSession';

export default function GroupSession() {
  // DEV-only mock driver; no-ops in production
  useMockGroupSession();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <div className="flex-1 overflow-y-auto">
        <Stage />
        <Transcript />
      </div>
      <ListeningBar />
    </div>
  );
}
