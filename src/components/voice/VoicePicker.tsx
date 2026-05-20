import { useState } from 'react';
import { speak } from '@/lib/voicePlayback';

export const ELEVENLABS_VOICES: { id: string; name: string; tone: string }[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', tone: 'Warm, calm, female' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', tone: 'Bright, expressive, female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', tone: 'Soft, narrative, female' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', tone: 'Crisp, articulate, female' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', tone: 'Conversational, female' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', tone: 'Gentle, youthful, female' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', tone: 'Calm, authoritative, male' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', tone: 'Confident, male' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', tone: 'Friendly, casual, male' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', tone: 'Intense, dramatic, male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', tone: 'Articulate, male' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', tone: 'Resonant, male' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', tone: 'Warm, male' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', tone: 'Professional, male' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', tone: 'Deep, male' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', tone: 'Neutral, androgynous' },
];

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function VoicePicker({ value, onChange }: Props) {
  const [testing, setTesting] = useState<string | null>(null);

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await speak('Hello. This is how I sound when speaking your replies aloud.', id);
    } catch (err) {
      console.error('voice test failed', err);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="voice-picker">
      {ELEVENLABS_VOICES.map((v) => {
        const selected = v.id === value;
        return (
          <div
            key={v.id}
            className={`voice-picker-row${selected ? ' selected' : ''}`}
            onClick={() => onChange(v.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange(v.id); }}
          >
            <div className="voice-picker-info">
              <div className="voice-picker-name">{v.name}</div>
              <div className="voice-picker-tone">{v.tone}</div>
            </div>
            <button
              type="button"
              className="voice-picker-test"
              onClick={(e) => { e.stopPropagation(); void handleTest(v.id); }}
              disabled={testing !== null}
            >
              {testing === v.id ? 'Playing…' : 'Test'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
