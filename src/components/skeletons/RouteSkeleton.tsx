import React from 'react';

export function SkelLine({
  width,
  height = 10,
  className = '',
  style,
}: {
  width?: string | number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skel ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width ?? '60%',
        height,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkelBlock({
  width = '100%',
  height = 80,
  className = '',
  style,
}: {
  width?: string | number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skel skel--block ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkelCircle({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`skel skel--circle ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function ChatSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading chat">
      <div className="route-skeleton__header">
        <SkelCircle size={20} />
        <SkelLine width={160} />
        <SkelLine width={40} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="route-skeleton__body">
        <div className="route-skeleton__bubble">
          <SkelLine width="92%" />
          <SkelLine width="64%" />
        </div>
        <div className="route-skeleton__bubble route-skeleton__bubble--right">
          <SkelLine width="78%" />
        </div>
        <div className="route-skeleton__bubble">
          <SkelLine width="86%" />
          <SkelLine width="72%" />
          <SkelLine width="48%" />
        </div>
        <div className="route-skeleton__bubble route-skeleton__bubble--right">
          <SkelLine width="60%" />
          <SkelLine width="40%" />
        </div>
      </div>
      <div className="route-skeleton__composer">
        <SkelLine width="40%" height={8} />
      </div>
    </div>
  );
}

export function MemorySkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading memory">
      <div className="route-skeleton__header">
        <SkelLine width={120} />
        <SkelLine width={60} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="route-skeleton__body">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="route-skeleton__card">
            <SkelLine width="58%" />
            <SkelLine width="84%" height={8} />
            <SkelLine width="42%" height={8} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading projects">
      <div className="route-skeleton__header">
        <SkelLine width={140} />
        <SkelLine width={80} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="route-skeleton__grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="route-skeleton__card">
            <SkelLine width="70%" />
            <SkelLine width="48%" height={8} />
            <SkelLine width="32%" height={8} style={{ marginTop: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading profile">
      <div className="route-skeleton__header">
        <SkelCircle size={48} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkelLine width={180} />
          <SkelLine width={100} height={8} />
        </div>
      </div>
      <div className="route-skeleton__body">
        <div className="route-skeleton__card">
          <SkelLine width="40%" />
          <SkelLine width="92%" height={8} />
          <SkelLine width="78%" height={8} />
        </div>
        <div className="route-skeleton__grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="route-skeleton__card">
              <SkelLine width="60%" />
              <SkelLine width="38%" height={8} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MindSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading mind">
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 320,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <SkelCircle size={120} />
          <SkelLine width={160} height={8} />
          <SkelLine width={100} height={6} />
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading settings">
      <div className="route-skeleton__header">
        <SkelLine width={140} />
      </div>
      <div className="route-skeleton__body">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 0',
              borderBottom: '1px solid var(--border-faint)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <SkelLine width="36%" />
              <SkelLine width="64%" height={8} />
            </div>
            <SkelLine width={64} height={20} style={{ borderRadius: 999, flex: 'none' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GenericSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-label="Loading">
      <div className="route-skeleton__header">
        <SkelLine width={160} />
      </div>
      <div className="route-skeleton__body">
        <SkelLine width="92%" />
        <SkelLine width="78%" />
        <SkelLine width="60%" />
      </div>
    </div>
  );
}

export function pickRouteSkeleton(pathname: string): React.ReactElement {
  if (pathname.startsWith('/chat')) return <ChatSkeleton />;
  if (pathname.startsWith('/memory')) return <MemorySkeleton />;
  if (pathname.startsWith('/projects')) return <ProjectsSkeleton />;
  if (pathname.startsWith('/profile')) return <ProfileSkeleton />;
  if (pathname.startsWith('/mind') || pathname === '/dashboard') return <MindSkeleton />;
  if (pathname.startsWith('/settings')) return <SettingsSkeleton />;
  if (pathname.startsWith('/journal')) return <MemorySkeleton />;
  if (pathname.startsWith('/import') || pathname.startsWith('/checkpoints')) return <GenericSkeleton />;
  return <GenericSkeleton />;
}
