import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useDictation — minimal Web Speech API wrapper.
 *
 * Why not Whisper edge: in-browser SpeechRecognition is instant, free,
 * and works offline once the speech model is loaded. It's right for
 * "fill the textarea while I talk" UX. Whisper edge is reserved for
 * post-hoc accuracy passes (audio attachments, voice-mode replies)
 * if/when we add them.
 *
 * Browser support: Chrome, Edge, Safari (iOS 14.5+), most Chromium.
 * Firefox does NOT support it. We hide the button when unsupported.
 *
 * The hook is "fire-and-collect": calling start() begins listening;
 * each final segment is delivered via onResult(text, isFinal=true) so
 * the caller can append to its own input state. Interim segments
 * (still being parsed) come through with isFinal=false — the caller
 * can ignore them or render a ghost preview.
 *
 * stop() ends recognition cleanly. Component unmount calls abort()
 * so a stale recognition session can never linger.
 */

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((e: Event) => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((e: Event) => void) | null;
};

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface UseDictationOptions {
  /** Called once per recognised segment. isFinal=false for interim parses. */
  onResult?: (text: string, isFinal: boolean) => void;
  /** Language hint, BCP-47. Default 'en-US'. */
  lang?: string;
}

interface UseDictationReturn {
  /** True from start() until stop()/error/onend. */
  isListening: boolean;
  /** Latest interim transcript (mid-sentence). Empty string when not parsing. */
  interimTranscript: string;
  /** Last error message, if any. */
  error: string | null;
  /** Whether the browser exposes a SpeechRecognition implementation. */
  supported: boolean;
  /** Begin a recognition session. No-op if already listening. */
  start: () => void;
  /** End the current session. No-op if not listening. */
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useDictation(opts: UseDictationOptions = {}): UseDictationReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const Ctor = getSpeechRecognitionCtor();
  const supported = !!Ctor;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(opts.onResult);
  const langRef = useRef(opts.lang ?? 'en-US');

  // Keep callback ref fresh without re-creating start/stop.
  useEffect(() => {
    onResultRef.current = opts.onResult;
    langRef.current = opts.lang ?? 'en-US';
  }, [opts.onResult, opts.lang]);

  const start = useCallback(() => {
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser');
      return;
    }
    if (recognitionRef.current) {
      // Already listening; treat as no-op rather than re-starting (which
      // would throw InvalidStateError in some browsers).
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = langRef.current;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            onResultRef.current?.(text, true);
          } else {
            interim += text;
          }
        }
        setInterimTranscript(interim);
        if (interim) onResultRef.current?.(interim, false);
      };

      recognition.onerror = (event) => {
        setError(event.error || 'recognition error');
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [Ctor]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* ignore — onend will reset state */
    }
  }, []);

  // Abort on unmount so a stale recognition session can't outlive us.
  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      if (!r) return;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  return { isListening, interimTranscript, error, supported, start, stop };
}
