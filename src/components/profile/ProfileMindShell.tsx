/**
 * ProfileMindShell — folio + hero wrapper for every Mind-language profile tab.
 * Keeps every tab visually consistent: m-folio · m-hero · m-grid body.
 */
import { ReactNode } from 'react';

interface Props {
  num: string;
  eyebrow: string;
  title: string;
  sub: ReactNode;
  version?: number;
  updatedAt?: string;
  children: ReactNode;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

export function timeAgoShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export default function ProfileMindShell({ num, eyebrow, title, sub, version, updatedAt, children }: Props) {
  return (
    <main className="m-main">
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> luca</span>
          <span>view · <span className="v">profile</span></span>
          {version !== undefined && <span>{eyebrow.toLowerCase()} · v{version}</span>}
        </div>
        <div className="r2-folio-right">
          <span>synced · <span className="v">{timeAgoShort(updatedAt)}</span></span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      <div className="m-hero">
        <div className="m-hero-eye">
          <span className="num"># {num}</span>
          <span>·</span>
          <span className="v">{eyebrow}</span>
          {version !== undefined && <><span>·</span><span>v{version}</span></>}
        </div>
        <h1 className="m-hero-title">{title}</h1>
        <p className="m-hero-sub">{sub}</p>
      </div>

      <div className="m-grid">{children}</div>
    </main>
  );
}
