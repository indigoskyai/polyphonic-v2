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
 * so the toolbar collapses gracefully. When supported and not listening,
 * sits as a quiet icon button. When listening, the button takes on the
 * sage "armed" treatment with a slow pulse — the same brand language used
 * for send-armed and modes-armed, so the composer's whole vocabulary of
 * "this is alive right now" stays consistent.
 *
 * The actual audio listening + ExpressiveField listening state are wired
 * one level up; this component is purely the affordance.
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
      <Mic size={13} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
