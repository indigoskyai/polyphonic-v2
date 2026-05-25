import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Boxes, ChevronDown, Lock, PocketKnife } from 'lucide-react';

interface ModesDropdownProps {
  agentModeArmed: boolean;
  ensembleArmed: boolean;
  ensembleLocked: boolean;
  onToggleAgentMode: () => void;
  /** Click handler — receives the mouse event so shift-click can lock. */
  onToggleEnsemble: (e: ReactMouseEvent) => void;
  /**
   * Mobile renders a bottom sheet instead of a trigger-anchored popover. The
   * popover uses position:fixed math off the trigger's rect, which iOS Safari
   * mis-resolves while the keyboard is up (visual vs layout viewport), landing
   * the menu off-screen. The sheet is bottom-anchored and keyboard-independent.
   */
  isMobile?: boolean;
}

/**
 * ModesDropdown — minimal trigger that consolidates agent runtime + ensemble.
 *
 * The popover renders through a Portal to document.body so it escapes the
 * composer's `overflow: hidden` clipping context. Position is computed from
 * the trigger's bounding rect at open time, anchored above the trigger.
 *
 * Visually we follow industry-minimal conventions: small list, icon + name,
 * compact switch on the right. Descriptions live in the title attribute so
 * the menu surface stays quiet — it should disappear into the toolbar at
 * rest and read as "just another control" when open.
 */
export default function ModesDropdown({
  agentModeArmed,
  ensembleArmed,
  ensembleLocked,
  onToggleAgentMode,
  onToggleEnsemble,
  isMobile = false,
}: ModesDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);

  // Mobile: dismiss the keyboard before the sheet slides up, so a bottom-
  // anchored sheet isn't occluded by it. (The composer's onMouseDown
  // preventDefault keeps the tap from blurring, so blur explicitly here.)
  const handleTriggerClick = () => {
    if (!open && isMobile && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setOpen((v) => !v);
  };

  const ensembleOn = ensembleArmed || ensembleLocked;
  const anyActive = agentModeArmed || ensembleOn;

  // Trigger label — surfaces active modes by name so configuration is always
  // visible without opening the menu.
  const label = (() => {
    if (agentModeArmed && ensembleOn) return 'Agent · Ensemble';
    if (agentModeArmed) return 'Agent';
    if (ensembleOn) return ensembleLocked ? 'Ensemble · locked' : 'Ensemble';
    return 'Modes';
  })();

  // Position the portal popover relative to the trigger button. Desktop only —
  // mobile uses a bottom-anchored sheet that needs no trigger math.
  useLayoutEffect(() => {
    if (isMobile) return;
    if (!open || !triggerRef.current || !popRef.current) return;
    const place = () => {
      if (!triggerRef.current || !popRef.current) return;
      const tRect = triggerRef.current.getBoundingClientRect();
      const pRect = popRef.current.getBoundingClientRect();
      const top = tRect.top - pRect.height - 8;
      const rawLeft = tRect.left + tRect.width / 2 - pRect.width / 2;
      const clampedLeft = Math.max(
        8,
        Math.min(window.innerWidth - pRect.width - 8, rawLeft),
      );
      setPopPos({ top, left: clampedLeft });
    };
    place();
    // Reposition on resize/scroll so the popover stays anchored if anything moves.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, isMobile]);

  // Close on outside click + Escape. Click-tracking includes both the wrap
  // (trigger) and the portaled popover so menu interactions don't dismiss.
  useEffect(() => {
    if (!open) return;
    const onDocMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(target)) return;
      if (popRef.current && popRef.current.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menuItems = (
    <>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={agentModeArmed}
        className={`modes-item${agentModeArmed ? ' armed' : ''}`}
        onClick={() => onToggleAgentMode()}
        title="Agent runtime — tool-using runtime for research, multi-step planning, and context checks. Luca only."
      >
        <PocketKnife size={13} strokeWidth={1.5} className="modes-item-icon" aria-hidden="true" />
        <span className="modes-item-name">Agent</span>
        <Switch on={agentModeArmed} />
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={ensembleOn}
        className={`modes-item${ensembleOn ? ' armed' : ''}${ensembleLocked ? ' locked' : ''}`}
        onClick={(e) => onToggleEnsemble(e)}
        title="Ensemble — consult multiple models for one answer. Shift-click to lock across messages."
      >
        <Boxes size={13} strokeWidth={1.5} className="modes-item-icon" aria-hidden="true" />
        <span className="modes-item-name">
          Ensemble
          {ensembleLocked && (
            <Lock size={9} strokeWidth={1.8} className="modes-item-lock" aria-label="locked" />
          )}
        </span>
        <Switch on={ensembleOn} />
      </button>
    </>
  );

  return (
    <div ref={wrapRef} className="modes-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`modes-trigger${anyActive ? ' armed' : ''}${open ? ' open' : ''}`}
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={11} strokeWidth={1.6} className="modes-chev" aria-hidden="true" />
      </button>

      {/* Desktop: trigger-anchored popover. */}
      {open && !isMobile && createPortal(
        <div
          ref={popRef}
          className="modes-pop"
          role="menu"
          style={
            popPos
              ? { top: popPos.top, left: popPos.left }
              : { visibility: 'hidden' }
          }
        >
          {menuItems}
        </div>,
        document.body,
      )}

      {/* Mobile: bottom sheet — keyboard-independent, with a dismiss backdrop. */}
      {open && isMobile && createPortal(
        <>
          <div
            className="modes-sheet-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div ref={popRef} className="modes-sheet" role="menu" aria-label="Modes">
            <div className="modes-sheet-title">Modes</div>
            {menuItems}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`modes-switch${on ? ' on' : ''}`} aria-hidden="true">
      <span className="modes-knob" />
    </span>
  );
}
