/**
 * Voice playback utilities — small sequential queue around ElevenLabs TTS.
 *
 * `speak()` fetches MP3 bytes from the `voice-tts` edge function and plays
 * them through a single shared HTMLAudio element. New utterances queue
 * behind in-flight ones; `stop()` clears the queue and stops playback.
 */
import { supabase } from '@/integrations/supabase/client';

type QueueItem = { text: string; voiceId: string; resolve: () => void; reject: (e: unknown) => void };

let audioEl: HTMLAudioElement | null = null;
let queue: QueueItem[] = [];
let playing = false;
let currentUrl: string | null = null;

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

async function fetchTts(text: string, voiceId: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-tts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TTS failed [${res.status}]: ${detail.slice(0, 200)}`);
  }
  return res.blob();
}

async function pump() {
  if (playing) return;
  const item = queue.shift();
  if (!item) return;
  playing = true;
  try {
    const blob = await fetchTts(item.text, item.voiceId);
    const url = URL.createObjectURL(blob);
    currentUrl = url;
    const a = ensureAudio();
    a.src = url;
    await new Promise<void>((resolve, reject) => {
      const onEnd = () => { cleanup(); resolve(); };
      const onErr = () => { cleanup(); reject(new Error('audio playback failed')); };
      const cleanup = () => {
        a.removeEventListener('ended', onEnd);
        a.removeEventListener('error', onErr);
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      };
      a.addEventListener('ended', onEnd);
      a.addEventListener('error', onErr);
      a.play().catch(onErr);
    });
    item.resolve();
  } catch (err) {
    item.reject(err);
  } finally {
    playing = false;
    if (queue.length) void pump();
  }
}

export function speak(text: string, voiceId: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    queue.push({ text: clean, voiceId, resolve, reject });
    void pump();
  });
}

export function stopSpeaking() {
  queue = [];
  if (audioEl) {
    try { audioEl.pause(); } catch { /* noop */ }
    audioEl.src = '';
  }
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  playing = false;
}

export function isSpeaking() {
  return playing || queue.length > 0;
}
