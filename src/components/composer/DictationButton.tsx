import { Mic } from 'lucide-react';

interface DictationButtonProps {
  isListening: boolean;
  supported: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * DictationButton — composer mic toggle.
 *
 * Renders nothing if the browser doesn't support SpeechRecognition (Firefox)
 * so the toolbar collapses gracefully. When listening, swaps the lucide Mic
 * for a custom SVG whose stroke is filled with an animated linearGradient —
 * a continuous brighter band sweeps left-to-right across the icon strokes,
 * fading to alpha 0 at both gradient extremes so the cycle restart is
 * invisible (band exits one side, re-enters the other; visible state at
 * the boundary is identical because the band is off-icon at both endpoints).
 *
 * Same vocabulary as the .guardian-label text shimmer (`@keyframes shimmer`)
 * but applied to an SVG via a userSpaceOnUse gradient with `gradientTransform`
 * animateTransform. No directional motion is "felt" because the band itself
 * sweeps; the icon never disappears because the gradient stops never drop
 * below 0.55 alpha.
 */
export default function DictationButton({
  isListening,
  supported,
  disabled,
  onClick,
}: DictationButtonProps) {
  if (!supported) return null;

  return (
    <button
      type="button"
      className={`mic-btn${isListening ? ' listening' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={isListening ? 'Stop dictation' : 'Dictate (Web Speech API)'}
      aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
      aria-pressed={isListening}
    >
      {isListening ? <ShimmerMic /> : <Mic size={13} strokeWidth={1.6} aria-hidden="true" />}
    </button>
  );
}

/**
 * ShimmerMic — Mic icon with an animated linearGradient stroke.
 *
 * The linearGradient lives inline in the SVG (so each instance has its own,
 * preventing collision if multiple ShimmerMics ever mount at once via a
 * predictable but instance-unique id). `userSpaceOnUse` lets the gradient
 * be transformed in icon coordinates (0–24). The animateTransform sweeps
 * the gradient from translate(-24,0) to translate(24,0) over 2.4s — same
 * duration as `.guardian-label`'s shimmer keyframe — looping infinitely.
 *
 * At translate(-24,0) the bright band sits at gradient-coord -12 (off the
 * icon's left). At translate(24,0) it sits at gradient-coord 36 (off the
 * right). Both endpoints leave the icon at the gradient's tail-stop alpha
 * (0.55), so the cycle restart is visually seamless.
 */
function ShimmerMic() {
  // Stable id so the gradient ref resolves correctly. (One mic at a time
  // in the composer; this scope is fine.)
  const gradId = 'mic-shimmer-grad';
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="24"
          y2="0"
        >
          <stop offset="0%" stopColor="rgba(244, 243, 240, 0.55)" />
          <stop offset="35%" stopColor="rgba(244, 243, 240, 0.55)" />
          <stop offset="50%" stopColor="rgba(244, 243, 240, 1)" />
          <stop offset="65%" stopColor="rgba(244, 243, 240, 0.55)" />
          <stop offset="100%" stopColor="rgba(244, 243, 240, 0.55)" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from="-24 0"
            to="24 0"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
      {/* Mic body */}
      <path
        d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
        stroke={`url(#${gradId})`}
      />
      {/* Mic stand arc */}
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke={`url(#${gradId})`} />
      {/* Stand bottom */}
      <line x1="12" x2="12" y1="19" y2="22" stroke={`url(#${gradId})`} />
    </svg>
  );
}
