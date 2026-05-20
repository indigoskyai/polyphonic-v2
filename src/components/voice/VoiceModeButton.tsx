import { useEffect, useRef, useState } from 'react';
import { Phone, Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { isSpeaking, stopSpeaking } from '@/lib/voicePlayback';

interface Props {
  onStartLiveCall: () => void;
  disabled?: boolean;
}

/**
 * Composer voice button — opens a popover with two voice modes:
 *  • Auto-speak replies (voice-over) — toggles a setting; assistant replies
 *    are read aloud using the configured ElevenLabs voice.
 *  • Live voice (true speech-to-speech) — opens the LiveCallOverlay which
 *    streams WebRTC audio to an ElevenLabs Conversational Agent.
 */
export default function VoiceModeButton({ onStartLiveCall, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { voice_autospeak, elevenlabs_agent_id, updateSetting } = useSettingsStore();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleToggleAutospeak = async () => {
    const next = !voice_autospeak;
    await updateSetting('voice_autospeak', next);
    if (!next && isSpeaking()) stopSpeaking();
  };

  const handleStartLive = () => {
    setOpen(false);
    onStartLiveCall();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        className={`mic-btn${voice_autospeak ? ' listening' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Voice options"
        title="Voice options"
        aria-expanded={open}
      >
        <Volume2 size={16} />
      </button>

      {open ? (
        <div
          ref={popoverRef}
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            minWidth: 280,
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 12,
            boxShadow: '0 12px 40px hsl(0 0% 0% / 0.4)',
            padding: 6,
            zIndex: 100,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleToggleAutospeak}
            style={{
              width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 12px', background: 'transparent', border: 'none',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              color: 'hsl(var(--foreground))',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--muted) / 0.4)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Volume2 size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                <span>Auto-speak replies</span>
                <span style={{
                  fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: voice_autospeak ? 'hsl(120 60% 60%)' : 'hsl(var(--muted-foreground))',
                }}>{voice_autospeak ? 'On' : 'Off'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                Your agent stays in charge — ElevenLabs just reads each reply aloud.
              </div>
            </div>
          </button>

          <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 6px' }} />

          <button
            type="button"
            role="menuitem"
            onClick={handleStartLive}
            style={{
              width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 12px', background: 'transparent', border: 'none',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              color: 'hsl(var(--foreground))',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--muted) / 0.4)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Phone size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Start live voice call</div>
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                True speech-to-speech via ElevenLabs Agent. Lowest latency, natural interruption.
                {elevenlabs_agent_id ? null : (
                  <>
                    <br />
                    <span style={{ color: 'hsl(40 90% 65%)' }}>Set your Agent ID in Settings → Voice first.</span>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}
