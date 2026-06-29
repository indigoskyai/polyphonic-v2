import { useState, useRef, useEffect } from 'react';
import {
  Boxes,
  Eye,
  Globe,
  Image as ImageIcon,
  Mic,
  Paperclip,
  PocketKnife,
  Plus,
  ChevronDown,
} from 'lucide-react';

/**
 * Composer Gallery — three composer layout philosophies side by side at
 * /_mockups/composer. Pick one (or remix), then we wire it into the real
 * ChatView composer.
 *
 * All three have the same set of controls:
 *  - Attach files
 *  - Agent mode toggle
 *  - Ensemble mode toggle
 *  - Observer toggle
 *  - Voice / dictation
 *  - Thinking effort
 *  - Model picker (implicit — agent dropdown handles it for now)
 *  - Send
 *
 * They differ in WHERE controls live and how visible each one is.
 */
export default function ComposerGallery() {
  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--floor)',
        color: 'var(--text-primary)',
        padding: '56px 64px 120px',
        overflowY: 'auto',
        overflowX: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <Header />
      <Variant
        letter="A"
        name="Single-Menu (ChatGPT style)"
        description="One [+] button opens a vertical menu with everything except voice and send. Most minimal — composer stays uncluttered, everything is one tap away. Best for users who only use 1-2 tools regularly."
        rec
      >
        <SingleMenuComposer />
      </Variant>
      <Variant
        letter="B"
        name="Inline Toolbar (current evolved)"
        description="All buttons stay visible below the composer in one row, just moved OUT of the composer's interior. Equal access to everything, no menu friction. Cost: the row gets dense at 6+ items."
      >
        <InlineToolbarComposer />
      </Variant>
      <Variant
        letter="C"
        name="Hybrid (Codex/Claude style)"
        description="Primary actions inline (Attach, Voice, Send). Secondary tools in a [+] menu (Agent, Ensemble, Observer). State indicators (current agent, mode) shown as chips next to + button. Most informative — you see your active mode at a glance."
      >
        <HybridComposer />
      </Variant>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{ marginBottom: 56, maxWidth: 720 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 'var(--track-folio)',
          color: 'var(--text-soft)',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Composer Layouts · Mockup
      </div>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-grotesque)',
          fontSize: 44,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
          color: 'var(--ink)',
        }}
      >
        Composer gallery
      </h1>
      <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        Three layouts, same controls. Walk through, hover the menus, click to see how each one feels.
        Tell me which to ship.
      </p>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
function Variant({
  letter,
  name,
  description,
  rec,
  children,
}: {
  letter: string;
  name: string;
  description: string;
  rec?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 80, maxWidth: 760 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: rec ? 'var(--luca-full, #60a5fa)' : 'var(--text-ghost)',
          marginBottom: 8,
        }}
      >
        {letter} · {name} {rec && <span style={{ marginLeft: 8 }}>· Recommended</span>}
      </div>
      <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-tertiary)', maxWidth: 640 }}>
        {description}
      </p>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPOSER FRAME
// ─────────────────────────────────────────────────────────────────────────────
function ComposerFrame({ children, armed }: { children: React.ReactNode; armed?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 14,
        padding: 0,
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 220ms var(--ease-out)',
        ...(armed && { borderColor: 'rgba(96, 165, 250, 0.25)' }),
      }}
    >
      {children}
    </div>
  );
}

function ComposerInput({ value, onChange, placeholder = 'Message Luca…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        resize: 'none',
        padding: '16px 18px 8px',
        fontFamily: 'var(--font-sans)',
        fontSize: 17,
        lineHeight: 1.5,
        color: 'var(--text-body)',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT A — Single Menu (ChatGPT style)
// ─────────────────────────────────────────────────────────────────────────────
function SingleMenuComposer() {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [agent, setAgent] = useState(false);
  const [ensemble, setEnsemble] = useState(false);
  const [observer, setObserver] = useState(false);
  const [thinking, setThinking] = useState<'low' | 'medium' | 'high'>('medium');
  const armed = text.trim().length > 0;

  return (
    <ComposerFrame armed={armed}>
      <ComposerInput value={text} onChange={setText} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px 10px',
          gap: 6,
        }}
      >
        <PlusMenu open={menuOpen} onToggle={() => setMenuOpen((v) => !v)}>
          <MenuItem icon={<Paperclip size={15} />} label="Attach files" />
          <MenuItem icon={<ImageIcon size={15} />} label="Add image" />
          <MenuDivider />
          <MenuItem icon={<PocketKnife size={15} />} label="Agent mode" toggle={agent} onClick={() => setAgent((v) => !v)} />
          <MenuItem icon={<Boxes size={15} />} label="Ensemble" toggle={ensemble} onClick={() => setEnsemble((v) => !v)} />
          <MenuItem icon={<Eye size={15} />} label="Observer" toggle={observer} onClick={() => setObserver((v) => !v)} />
          <MenuDivider />
          <MenuItem icon={<Globe size={15} />} label="Web search" hint="Coming soon" disabled />
        </PlusMenu>

        <div style={{ flex: 1 }} />

        <ThinkingPill value={thinking} onChange={setThinking} />
        <IconButton icon={<Mic size={16} />} label="Voice / dictate" />
        <SendButton armed={armed} />
      </div>
    </ComposerFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT B — Inline Toolbar (current evolved)
// ─────────────────────────────────────────────────────────────────────────────
function InlineToolbarComposer() {
  const [text, setText] = useState('');
  const [agent, setAgent] = useState(false);
  const [ensemble, setEnsemble] = useState(false);
  const [observer, setObserver] = useState(false);
  const [thinking, setThinking] = useState<'low' | 'medium' | 'high'>('medium');
  const armed = text.trim().length > 0;

  return (
    <ComposerFrame armed={armed}>
      <ComposerInput value={text} onChange={setText} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px 10px',
          gap: 6,
        }}
      >
        <IconButton icon={<Paperclip size={16} />} label="Attach" />
        <PillButton
          icon={<PocketKnife size={14} />}
          label="agent"
          active={agent}
          onClick={() => setAgent((v) => !v)}
        />
        <PillButton
          icon={<Boxes size={14} />}
          label="ensemble"
          active={ensemble}
          onClick={() => setEnsemble((v) => !v)}
        />
        <PillButton
          icon={<Eye size={14} />}
          label="observer"
          active={observer}
          onClick={() => setObserver((v) => !v)}
        />

        <div style={{ flex: 1 }} />

        <ThinkingPill value={thinking} onChange={setThinking} />
        <IconButton icon={<Mic size={16} />} label="Voice" />
        <SendButton armed={armed} />
      </div>
    </ComposerFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT C — Hybrid (Codex/Claude style)
// ─────────────────────────────────────────────────────────────────────────────
function HybridComposer() {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [agent, setAgent] = useState(true); // demo: agent on by default
  const [ensemble, setEnsemble] = useState(false);
  const [observer, setObserver] = useState(true); // demo: observer on by default
  const [thinking, setThinking] = useState<'low' | 'medium' | 'high'>('medium');
  const armed = text.trim().length > 0;

  // Build active-mode chip text
  const modeChips: string[] = [];
  if (agent) modeChips.push('agent');
  if (ensemble) modeChips.push('ensemble');
  if (observer) modeChips.push('observer');

  return (
    <ComposerFrame armed={armed}>
      <ComposerInput value={text} onChange={setText} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px 10px',
          gap: 8,
        }}
      >
        <PlusMenu open={menuOpen} onToggle={() => setMenuOpen((v) => !v)}>
          <MenuItem icon={<Paperclip size={15} />} label="Attach files" />
          <MenuItem icon={<ImageIcon size={15} />} label="Add image" />
          <MenuDivider />
          <MenuItem icon={<PocketKnife size={15} />} label="Agent mode" toggle={agent} onClick={() => setAgent((v) => !v)} />
          <MenuItem icon={<Boxes size={15} />} label="Ensemble" toggle={ensemble} onClick={() => setEnsemble((v) => !v)} />
          <MenuItem icon={<Eye size={15} />} label="Observer" toggle={observer} onClick={() => setObserver((v) => !v)} />
        </PlusMenu>

        {/* Active-mode chips show what's enabled */}
        {modeChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {modeChips.map((m) => (
              <span
                key={m}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 'var(--track-folio)',
                  textTransform: 'uppercase',
                  color: 'var(--luca-full, #60a5fa)',
                  background: 'rgba(96, 165, 250, 0.06)',
                  border: '1px solid rgba(96, 165, 250, 0.18)',
                  borderRadius: 999,
                  padding: '2px 9px',
                }}
              >
                {m}
              </span>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <ThinkingPill value={thinking} onChange={setThinking} />
        <IconButton icon={<Mic size={16} />} label="Voice" />
        <SendButton armed={armed} />
      </div>
    </ComposerFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
function PlusMenu({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, onToggle]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open tools menu"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: open ? 'var(--sage-overlay-active)' : 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--sage-overlay-hover)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={17} strokeWidth={1.6} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            minWidth: 220,
            padding: 4,
            background: 'var(--canvas)',
            border: '1px solid var(--border-faint)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.04)',
            animation: 'viewFadeIn 0.16s var(--ease-out)',
            zIndex: 10,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  toggle,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  toggle?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        color: disabled ? 'var(--text-ghost)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--sage-overlay-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'inline-flex', width: 18, justifyContent: 'center', color: toggle ? 'var(--luca-full, #60a5fa)' : 'inherit' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {toggle !== undefined && (
        <span
          style={{
            width: 24,
            height: 13,
            borderRadius: 999,
            background: toggle ? 'var(--luca-full, #60a5fa)' : 'rgba(255,255,255,0.10)',
            position: 'relative',
            transition: 'background 180ms var(--ease-out)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: toggle ? 13 : 2,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: toggle ? 'var(--ink)' : 'rgba(255,255,255,0.45)',
              transition: 'left 180ms var(--ease-out), background 180ms var(--ease-out)',
            }}
          />
        </span>
      )}
      {hint && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: 'var(--track-folio)',
            textTransform: 'uppercase',
            color: 'var(--text-whisper)',
          }}
        >
          {hint}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--border-faint)', margin: '4px 6px' }} />;
}

function IconButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: 'transparent',
        border: 'none',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-overlay-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </button>
  );
}

function PillButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        background: active ? 'rgba(96, 165, 250, 0.10)' : 'transparent',
        border: `1px solid ${active ? 'rgba(96, 165, 250, 0.28)' : 'var(--border-faint)'}`,
        color: active ? 'var(--luca-full, #60a5fa)' : 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        transition: 'background 180ms var(--ease-out), border-color 180ms var(--ease-out), color 180ms var(--ease-out)',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ThinkingPill({ value, onChange }: { value: 'low' | 'medium' | 'high'; onChange: (v: 'low' | 'medium' | 'high') => void }) {
  const labels = { low: 'Light', medium: 'Medium', high: 'Deep' };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 10px',
          borderRadius: 999,
          background: 'transparent',
          border: '1px solid var(--border-faint)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {labels[value]}
        <ChevronDown size={12} strokeWidth={1.6} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 6,
            minWidth: 120,
            padding: 4,
            background: 'var(--canvas)',
            border: '1px solid var(--border-faint)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            zIndex: 10,
          }}
        >
          {(['low', 'medium', 'high'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: opt === value ? 'var(--sage-overlay-active)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: 'var(--text-body)',
                fontFamily: 'var(--font-sans)',
                fontSize: 12.5,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (opt !== value) e.currentTarget.style.background = 'var(--sage-overlay-hover)'; }}
              onMouseLeave={(e) => { if (opt !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {labels[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SendButton({ armed }: { armed: boolean }) {
  return (
    <button
      type="button"
      aria-label="Send message"
      disabled={!armed}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: armed
          ? 'linear-gradient(180deg, rgba(96, 165, 250, 0.18) 0%, rgba(96, 165, 250, 0.10) 100%)'
          : 'transparent',
        border: 'none',
        color: armed ? 'var(--ink)' : 'var(--text-ghost)',
        boxShadow: armed
          ? '0 0 0 1px rgba(96, 165, 250, 0.30), 0 0 12px rgba(96, 165, 250, 0.18)'
          : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: armed ? 'pointer' : 'default',
        opacity: armed ? 1 : 0.5,
        transition: 'all 180ms var(--ease-out)',
      }}
    >
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
        <path d="M12.5 1.5 L1.5 6.3 L5.6 8 L7.4 12.3 Z" />
        <path d="M12.5 1.5 L5.6 8" />
      </svg>
    </button>
  );
}
