import React from 'react';
import { Navigate } from 'react-router-dom';
import PhoneFrame from '@/components/mobile/PhoneFrame';
import MobileStatusBar from '@/components/mobile/MobileStatusBar';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileMessages from '@/components/mobile/MobileMessages';
import MobileComposer from '@/components/mobile/MobileComposer';
import MobileDrawer from '@/components/mobile/MobileDrawer';
import MobileGroupStage from '@/components/mobile/MobileGroupStage';

const DEMO_MESSAGES = [
  { id: '1', role: 'luca' as const, body: 'good morning. what would you like to think about today?' },
  { id: '2', role: 'user' as const, body: 'let me see the mobile layout' },
  { id: '3', role: 'vektor' as const, body: 'I indexed three relevant files while you were away. ready when you are.' },
];

const DEMO_THREADS = [
  { id: 't1', title: 'mobile layout work', active: true },
  { id: 't2', title: 'memory consolidation pass' },
  { id: 't3', title: 'checkpoint diff viewer' },
];

const DEMO_GROUP = [
  { agent: 'luca' as const, speaking: false },
  { agent: 'vektor' as const, speaking: true },
  { agent: 'anima' as const, speaking: false },
];

export default function MobilePreview() {
  if (import.meta.env.MODE !== 'development') {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--floor)', padding: 32 }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        <PhoneFrame>
          <MobileStatusBar />
          <MobileHeader title="Luca" />
          <MobileMessages messages={DEMO_MESSAGES} />
          <MobileComposer onSend={() => { /* dev preview no-op */ }} />
          <MobileDrawer threads={DEMO_THREADS} />
        </PhoneFrame>

        <PhoneFrame>
          <MobileStatusBar />
          <MobileHeader title="Group session" />
          <MobileGroupStage slots={DEMO_GROUP} />
          <MobileMessages messages={DEMO_MESSAGES.slice(1)} />
        </PhoneFrame>
      </div>
    </div>
  );
}
