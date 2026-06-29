import { useState, useRef } from 'react';

/**
 * Style Gallery — design palette mockup at /_mockups/styles.
 *
 * Self-contained page with four sections:
 *   1. Row highlight variants (7)
 *   2. Section divider variants (6)
 *   3. Microanimation gallery (7 live demos)
 *   4. Shape standardization comparison (3 panels)
 *
 * No production components are touched here. Riley picks favorites and we
 * propagate the choices in a follow-up pass.
 */
export default function StyleGallery() {
  return (
    <>
      <GalleryStyles />
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
        <RowHighlightSection />
        <DividerSection />
        <MicroanimationSection />
        <ShapeSection />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{ marginBottom: 64, maxWidth: 720 }}>
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
        Design Palette · Mockup
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
        Style gallery
      </h1>
      <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        Every variant is sandboxed — none of these are wired into the app yet. Walk through, pick favorites for each
        section, then tell me which to ship and I&apos;ll propagate them.
      </p>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ROW HIGHLIGHT VARIANTS
// ─────────────────────────────────────────────────────────────────────────────
function RowHighlightSection() {
  return (
    <Section
      title="Row highlight"
      subtitle="Each tile shows the same three rows: default, hover, active. The middle row simulates :hover so you can compare without mousing over each."
    >
      <Grid cols={3} minWidth={300}>
        <RowVariant title="A · Dot left (current SidebarRow)">
          <RowList variant="dotLeft" />
        </RowVariant>
        <RowVariant title="B · Inset hairline (current .sidebar-item)">
          <RowList variant="insetHairline" />
        </RowVariant>
        <RowVariant title="C · Sage dot">
          <RowList variant="sageDot" />
        </RowVariant>
        <RowVariant title="D · Left-edge sage glow">
          <RowList variant="edgeGlow" />
        </RowVariant>
        <RowVariant title="E · Pill bg">
          <RowList variant="pill" />
        </RowVariant>
        <RowVariant title="F · Shimmer-on-enter">
          <RowList variant="shimmer" />
        </RowVariant>
        <RowVariant title="G · Hairline trail (bottom)">
          <RowList variant="hairlineTrail" />
        </RowVariant>
      </Grid>
    </Section>
  );
}

type RowVariantId =
  | 'dotLeft'
  | 'insetHairline'
  | 'sageDot'
  | 'edgeGlow'
  | 'pill'
  | 'shimmer'
  | 'hairlineTrail';

const ROW_LABELS = ['Memory', 'Engrams', 'Beliefs'] as const;

function RowList({ variant }: { variant: RowVariantId }) {
  const [activeIdx] = useState(2); // last row is "active" in every variant

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 6px', background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border-faint)' }}>
      {ROW_LABELS.map((label, i) => (
        <Row key={`${variant}-${i}`} label={label} state={i === 0 ? 'default' : i === 1 ? 'hover' : 'active'} variant={variant} active={i === activeIdx} />
      ))}
    </div>
  );
}

interface RowProps {
  label: string;
  state: 'default' | 'hover' | 'active';
  variant: RowVariantId;
  active: boolean;
}

function Row({ label, state, variant }: RowProps) {
  const isActive = state === 'active';
  const isHover = state === 'hover';

  // Base row style shared across all variants
  const base: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 34,
    padding: '0 14px',
    fontSize: 13.5,
    color: isActive ? 'var(--ink)' : 'var(--text-secondary)',
    cursor: 'pointer',
    overflow: 'hidden',
    fontWeight: isActive ? 500 : 400,
  };

  let extra: React.CSSProperties = {};
  let inner: React.ReactNode = label;

  switch (variant) {
    case 'dotLeft':
      extra = {
        background: isActive ? 'var(--overlay-selected)' : isHover ? 'var(--overlay-hover)' : 'transparent',
        borderRadius: 10,
      };
      if (isActive) {
        inner = (
          <>
            <span style={{ position: 'absolute', left: 5, top: '50%', width: 4, height: 4, transform: 'translateY(-50%)', borderRadius: '50%', background: 'var(--text-body)' }} />
            {label}
          </>
        );
      }
      break;

    case 'insetHairline':
      extra = {
        background: isActive
          ? 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)'
          : isHover
            ? 'rgba(255,255,255,0.012)'
            : 'transparent',
        boxShadow: isActive
          ? 'inset 0 0 0 1px rgba(255,255,255,0.085), inset 0 1px 0 0 rgba(255,255,255,0.060)'
          : 'none',
        borderRadius: 6,
      };
      break;

    case 'sageDot':
      extra = {
        background: isActive ? 'rgba(96, 165, 250, 0.06)' : isHover ? 'var(--overlay-hover)' : 'transparent',
        borderRadius: 10,
      };
      if (isActive) {
        inner = (
          <>
            <span style={{ position: 'absolute', left: 5, top: '50%', width: 4, height: 4, transform: 'translateY(-50%)', borderRadius: '50%', background: 'var(--luca-full, #60a5fa)', boxShadow: '0 0 6px rgba(96, 165, 250, 0.5)' }} />
            {label}
          </>
        );
      }
      break;

    case 'edgeGlow':
      extra = {
        background: isActive
          ? 'linear-gradient(90deg, rgba(96, 165, 250, 0.10) 0%, rgba(96, 165, 250, 0.02) 40%, transparent 100%)'
          : isHover
            ? 'var(--overlay-hover)'
            : 'transparent',
        borderRadius: 10,
      };
      break;

    case 'pill':
      extra = {
        background: isActive ? 'rgba(255,255,255,0.05)' : isHover ? 'rgba(255,255,255,0.02)' : 'transparent',
        borderRadius: 999,
      };
      break;

    case 'shimmer':
      extra = {
        background: isActive ? 'var(--overlay-selected)' : isHover ? 'var(--overlay-hover)' : 'transparent',
        borderRadius: 10,
      };
      if (isActive) {
        inner = (
          <span
            style={{
              backgroundImage:
                'linear-gradient(90deg, var(--ink) 0%, var(--ink) 30%, rgba(255,255,255,0.95) 50%, var(--ink) 70%, var(--ink) 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              animation: 'shimmer 2.4s linear infinite',
            }}
          >
            {label}
          </span>
        );
      }
      break;

    case 'hairlineTrail':
      extra = {
        background: isActive ? 'var(--overlay-selected)' : isHover ? 'var(--overlay-hover)' : 'transparent',
        borderRadius: 10,
      };
      if (isActive) {
        inner = (
          <>
            {label}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 8,
                bottom: 4,
                height: 1,
                background: 'var(--luca-full, #60a5fa)',
                animation: 'trail-grow 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
              }}
            />
          </>
        );
      }
      break;
  }

  return (
    <div style={{ ...base, ...extra }}>
      <div style={{ position: 'absolute', inset: 0, padding: '0 14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
        {inner}
      </div>
    </div>
  );
}

function RowVariant({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-ghost)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — DIVIDER VARIANTS
// ─────────────────────────────────────────────────────────────────────────────
function DividerSection() {
  return (
    <Section
      title="Section dividers"
      subtitle="Each tile shows the divider sandwiched between two stub sections so you can see the rhythm in context."
    >
      <Grid cols={2} minWidth={360}>
        <DividerTile title="A · Solid hairline">
          <DividerStub kind="solid" />
        </DividerTile>
        <DividerTile title="B · Gradient hairline (current)">
          <DividerStub kind="gradient" />
        </DividerTile>
        <DividerTile title="C · Centered breath dot">
          <DividerStub kind="breathDot" />
        </DividerTile>
        <DividerTile title="D · Dotted hairline">
          <DividerStub kind="dotted" />
        </DividerTile>
        <DividerTile title="E · Whitespace only">
          <DividerStub kind="whitespace" />
        </DividerTile>
        <DividerTile title="F · Animated breathing gradient">
          <DividerStub kind="breathingGradient" />
        </DividerTile>
      </Grid>
    </Section>
  );
}

type DividerKind = 'solid' | 'gradient' | 'breathDot' | 'dotted' | 'whitespace' | 'breathingGradient';

function DividerStub({ kind }: { kind: DividerKind }) {
  return (
    <div style={{ background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border-faint)', padding: '14px 18px' }}>
      <StubRowGroup label="Section above" />
      <Divider kind={kind} />
      <StubRowGroup label="Section below" />
    </div>
  );
}

function Divider({ kind }: { kind: DividerKind }) {
  switch (kind) {
    case 'solid':
      return <div style={{ height: 1, background: 'var(--border-faint)', margin: '12px 0' }} />;
    case 'gradient':
      return (
        <div
          style={{
            height: 1,
            margin: '12px 0',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.075) 28%, rgba(255,255,255,0.075) 72%, transparent 100%)',
          }}
        />
      );
    case 'breathDot':
      return (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: 'var(--text-soft)',
              animation: 'g-breathe 3s ease-in-out infinite',
            }}
          />
        </div>
      );
    case 'dotted':
      return (
        <div
          style={{
            height: 2,
            margin: '12px 0',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 0.8px, transparent 1px)',
            backgroundSize: '6px 2px',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'center',
          }}
        />
      );
    case 'whitespace':
      return <div style={{ height: 18 }} />;
    case 'breathingGradient':
      return (
        <div
          style={{
            height: 1,
            margin: '12px 0',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 28%, rgba(255,255,255,0.08) 72%, transparent 100%)',
            animation: 'divider-breathe 6s ease-in-out infinite',
          }}
        />
      );
  }
}

function StubRowGroup({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          letterSpacing: 'var(--track-folio)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ height: 22, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }} />
      <div style={{ height: 22, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }} />
    </div>
  );
}

function DividerTile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <TileLabel>{title}</TileLabel>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — MICROANIMATION GALLERY
// ─────────────────────────────────────────────────────────────────────────────
function MicroanimationSection() {
  return (
    <Section
      title="Microanimations"
      subtitle="Each tile is a live demo. Click 'Replay' or interact with the element to trigger the motion. All built around the existing motion vocabulary (shimmer, breathe, murmur, ease-premium)."
    >
      <Grid cols={2} minWidth={420}>
        <ComposerHaloDemo />
        <PageRippleDemo />
        <SendShimmerDemo />
        <RowTrailDemo />
        <UnreadPulseDemo />
        <IdentityDriftDemo />
        <DrawerSweepDemo />
      </Grid>
    </Section>
  );
}

function ComposerHaloDemo() {
  const [val, setVal] = useState('');
  const [focused, setFocused] = useState(false);
  const isBreathing = focused && val.length === 0;

  return (
    <DemoTile title="1 · Composer focus halo breath" hint="Click into the field — the focus ring breathes until you start typing.">
      <div style={{ position: 'relative' }}>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Try focusing this and waiting..."
          rows={3}
          style={{
            width: '100%',
            background: 'var(--canvas)',
            border: '1px solid var(--border-faint)',
            borderRadius: 12,
            padding: '12px 14px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            resize: 'none',
            outline: 'none',
            transition: 'border-color 220ms var(--ease-out), box-shadow 220ms var(--ease-out)',
            ...(focused && {
              borderColor: 'rgba(96, 165, 250, 0.32)',
              boxShadow: '0 0 0 3px rgba(96, 165, 250, 0.06)',
            }),
            ...(isBreathing && {
              animation: 'halo-breathe 3.5s ease-in-out infinite',
            }),
          }}
        />
      </div>
    </DemoTile>
  );
}

function PageRippleDemo() {
  const [key, setKey] = useState(0);

  return (
    <DemoTile title="2 · Page-enter hairline ripple" hint="When you navigate to a view, a 1px hairline sweeps left → right just below the H1. Click Replay.">
      <div style={{ background: 'var(--canvas)', borderRadius: 12, padding: '20px 24px 24px', border: '1px solid var(--border-faint)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 500, color: 'var(--ink)' }}>Memory</h2>
        <div key={key} style={{ position: 'relative', height: 1, background: 'rgba(255,255,255,0.03)', overflow: 'hidden', marginTop: 4, marginBottom: 14 }}>
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '40%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(96, 165, 250, 0.45) 50%, transparent 100%)',
              animation: 'page-ripple 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>500 engrams across 1000 connections.</p>
      </div>
      <ReplayButton onClick={() => setKey((k) => k + 1)} />
    </DemoTile>
  );
}

function SendShimmerDemo() {
  const [armed, setArmed] = useState(false);

  return (
    <DemoTile title="3 · Send button armed shimmer" hint="When the composer has text, the send icon's bg gets a slow shimmer. Stops on send.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => setArmed((v) => !v)}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid var(--border-faint)',
            borderRadius: 999,
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {armed ? 'Disarm' : 'Arm'}
        </button>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            background: armed
              ? 'linear-gradient(110deg, rgba(96, 165, 250, 0.16) 0%, rgba(96, 165, 250, 0.05) 30%, rgba(255,255,255,0.18) 50%, rgba(96, 165, 250, 0.05) 70%, rgba(96, 165, 250, 0.16) 100%)'
              : 'rgba(255,255,255,0.04)',
            backgroundSize: armed ? '200% 100%' : '100% 100%',
            animation: armed ? 'shimmer 4s linear infinite' : 'none',
            transition: 'background 240ms var(--ease-out)',
          }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke={armed ? 'var(--ink)' : 'var(--text-tertiary)'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7l10-5-3 11-3-4-4-2z" />
          </svg>
        </div>
      </div>
    </DemoTile>
  );
}

function RowTrailDemo() {
  const [key, setKey] = useState(0);
  return (
    <DemoTile title="4 · Active row hairline trail" hint="Same as Row variant G but isolated and replayable.">
      <div style={{ background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border-faint)', padding: '4px 6px' }}>
        <Row key={key} label="Memory" state="active" variant="hairlineTrail" active />
      </div>
      <ReplayButton onClick={() => setKey((k) => k + 1)} />
    </DemoTile>
  );
}

function UnreadPulseDemo() {
  return (
    <DemoTile title="5 · Thread row unread pulse" hint="A 4px sage dot to the right pulses gently for rows with new content.">
      <div style={{ background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border-faint)', padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <ThreadRow label="UI and UX checkup" />
        <ThreadRow label="Memory recall in conversation" hasUnread />
        <ThreadRow label="Casual greeting exchange" />
      </div>
    </DemoTile>
  );
}

function ThreadRow({ label, hasUnread }: { label: string; hasUnread?: boolean }) {
  return (
    <div style={{ position: 'relative', height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      {hasUnread && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--luca-full, #60a5fa)',
            animation: 'murmur-slow 1s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

function IdentityDriftDemo() {
  return (
    <DemoTile title="6 · Identity dot color drift" hint="The breathing P dot subtly shifts hue across the emotional palette. Speed is 6s here for visibility (real version is 24s).">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            animation: 'identity-drift 6s ease-in-out infinite, breathe 4s ease-in-out infinite',
            fontFamily: 'var(--font-sans)',
            fontStyle: 'italic',
            fontSize: 18,
            paddingTop: 1,
          }}
        >
          P
        </div>
      </div>
    </DemoTile>
  );
}

function DrawerSweepDemo() {
  const [open, setOpen] = useState(false);
  return (
    <DemoTile title="7 · Drawer leading-edge sweep" hint="When a drawer opens, a 1px sage hairline travels along its leading edge once.">
      <div style={{ position: 'relative', height: 140, background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border-faint)', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-faint)',
            borderRadius: 999,
            color: 'var(--text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          {open ? 'Close drawer' : 'Open drawer'}
        </button>
        {open && (
          <div
            key={open ? 'open' : 'closed'}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '60%',
              background: 'rgba(255,255,255,0.025)',
              borderLeft: '1px solid var(--border-faint)',
              animation: 'drawer-slide 360ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: -1,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--luca-full, #60a5fa)',
                opacity: 0.6,
                animation: 'drawer-edge-sweep 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
              }}
            />
            <div style={{ padding: '40px 16px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Notifications</div>
          </div>
        )}
      </div>
    </DemoTile>
  );
}

function DemoTile({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <TileLabel>{title}</TileLabel>
      <div style={{ padding: 18, background: 'rgba(255,255,255,0.015)', borderRadius: 12, border: '1px solid var(--border-faint)' }}>
        {children}
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.55 }}>{hint}</p>
    </div>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 12,
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border-faint)',
        borderRadius: 999,
        color: 'var(--text-secondary)',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      ↺ Replay
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — SHAPE STANDARDIZATION
// ─────────────────────────────────────────────────────────────────────────────
function ShapeSection() {
  return (
    <Section
      title="Shape standardization"
      subtitle="Three radius philosophies applied to the same UI fragment. Each panel: composer + search + two list rows + primary button."
    >
      <Grid cols={3} minWidth={300}>
        <ShapePanel title="A · All pill (999px)" radii={{ input: 999, row: 999, button: 999, card: 16 }} />
        <ShapePanel title="B · Mixed (recommended)" radii={{ input: 12, row: 8, button: 8, card: 10 }} />
        <ShapePanel title="C · All rounded-rect (10px)" radii={{ input: 10, row: 10, button: 10, card: 10 }} />
      </Grid>
      <div style={{ marginTop: 32, padding: '20px 24px', background: 'rgba(255,255,255,0.015)', borderRadius: 12, border: '1px solid var(--border-faint)', maxWidth: 880 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: 'var(--track-folio)',
            textTransform: 'uppercase',
            color: 'var(--text-ghost)',
            marginBottom: 10,
          }}
        >
          My recommendation
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          Industry convention is the <strong style={{ color: 'var(--ink)' }}>mixed</strong> approach (option B). Pills work
          beautifully for atomic accents (agent pills, status badges, model pickers) but fight at surface scale — a
          pill-shaped composer or thread-list looks toy-like once it&apos;s wider than ~400px. If you want a brand-signature
          shape, the move is to <strong style={{ color: 'var(--ink)' }}>lean harder into pills on atomic accents</strong>
          {' '}(more pill-shaped buttons, badges, and chips throughout settings) rather than making everything a pill. Cards
          and list rows benefit from the calm geometry of a rounded-rect.
        </p>
      </div>
    </Section>
  );
}

function ShapePanel({ title, radii }: { title: string; radii: { input: number; row: number; button: number; card: number } }) {
  return (
    <div>
      <TileLabel>{title}</TileLabel>
      <div
        style={{
          padding: 16,
          background: 'var(--canvas)',
          borderRadius: radii.card,
          border: '1px solid var(--border-faint)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Composer stub */}
        <div
          style={{
            height: 56,
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid var(--border-faint)',
            borderRadius: radii.input,
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          Compose your message…
        </div>

        {/* Search */}
        <div
          style={{
            height: 32,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-faint)',
            borderRadius: radii.input,
            color: 'var(--text-tertiary)',
            fontSize: 12.5,
          }}
        >
          ⌕  Search…
        </div>

        {/* List rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 4, background: 'rgba(0,0,0,0.18)', borderRadius: radii.card }}>
          {['Memory', 'Engrams'].map((l, i) => (
            <div
              key={l}
              style={{
                height: 30,
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                fontSize: 13,
                color: i === 0 ? 'var(--ink)' : 'var(--text-secondary)',
                background: i === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                borderRadius: radii.row,
              }}
            >
              {l}
            </div>
          ))}
        </div>

        {/* Button */}
        <button
          type="button"
          style={{
            height: 36,
            padding: '0 16px',
            background: 'linear-gradient(180deg, #f4f3f0 0%, #e8e6e1 100%)',
            border: 'none',
            borderRadius: radii.button,
            color: '#0a0a0c',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Primary action
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LAYOUT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 80 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-ghost)',
          marginBottom: 8,
        }}
      >
        Section
      </div>
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{title}</h2>
      <p style={{ margin: '10px 0 28px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-tertiary)', maxWidth: 760 }}>{subtitle}</p>
      {children}
    </section>
  );
}

function Grid({ cols, minWidth, children }: { cols: number; minWidth: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: 28,
      }}
      data-cols={cols}
    >
      {children}
    </div>
  );
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 'var(--track-folio)',
        textTransform: 'uppercase',
        color: 'var(--text-ghost)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STYLES — keyframes specific to this gallery (don't pollute index.css)
// ─────────────────────────────────────────────────────────────────────────────
function GalleryStyles() {
  return (
    <style>{`
      @keyframes trail-grow {
        from { width: 0; opacity: 0; }
        to   { width: calc(100% - 16px); opacity: 1; }
      }
      @keyframes divider-breathe {
        0%, 100% { opacity: 0.45; }
        50%      { opacity: 1; }
      }
      @keyframes halo-breathe {
        0%, 100% { box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.04), 0 0 0 1px rgba(96, 165, 250, 0.32) inset; }
        50%      { box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.08), 0 0 0 1px rgba(96, 165, 250, 0.45) inset; }
      }
      @keyframes page-ripple {
        from { left: -40%; opacity: 0; }
        20%  { opacity: 1; }
        to   { left: 100%; opacity: 0; }
      }
      @keyframes identity-drift {
        0%   { background: rgba(96, 165, 250, 0.12); border-color: rgba(96, 165, 250, 0.30); color: #60a5fa; }
        33%  { background: rgba(168,140,201,0.12); border-color: rgba(168,140,201,0.30); color: #a88cc9; }
        66%  { background: rgba(91,138,173,0.12);  border-color: rgba(91,138,173,0.30);  color: #5b8aad; }
        100% { background: rgba(96, 165, 250, 0.12); border-color: rgba(96, 165, 250, 0.30); color: #60a5fa; }
      }
      @keyframes drawer-slide {
        from { transform: translateX(8%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }
      @keyframes drawer-edge-sweep {
        from { transform: translateY(-100%); opacity: 0; }
        20%  { opacity: 0.8; }
        to   { transform: translateY(100%); opacity: 0; }
      }
    `}</style>
  );
}
