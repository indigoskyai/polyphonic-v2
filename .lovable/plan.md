## Voice for Luca — two modes, one toggle

ElevenLabs is now connected (`ELEVENLABS_API_KEY` lives server-side). We'll build two parallel voice experiences and let the user pick per chat.

### Mode A — Voice-over (your agent, ElevenLabs voice)
Your existing Luca/Guardian/custom agent runs normally (same model, same memory, same tools). ElevenLabs only does ears and mouth.

- **STT**: ElevenLabs Scribe v2 realtime via `@elevenlabs/react`'s `useScribe`. Mic streams → partial + committed transcripts. Committed transcript gets sent to the existing `chat-multi` flow as if typed.
- **TTS**: As Luca's reply streams in, sentence-chunk it and pipe each chunk to ElevenLabs TTS, play sequentially for low time-to-first-audio. Uses the agent's `voices[0]` config if present, otherwise the global default voice.
- Pros: keeps every existing capability (tools, memory, multi-model ensemble, Guardian observer).
- Cons: slightly higher latency than native, no barge-in/interruption.

### Mode B — Native conversational (ElevenLabs Agent)
`@elevenlabs/react`'s `useConversation` runs WebRTC directly to an ElevenLabs agent. End-to-end speech-to-speech, true interruption, VAD, lowest latency.

- Default: one shared "Luca Voice" ElevenLabs agent ID (stored in app config / env).
- Override: each Luca agent in Settings → Agents can paste its own ElevenLabs agent ID to use instead.
- Trade-off: this loop runs in ElevenLabs, so it doesn't go through `chat-multi` — no Mnemos writes, no Guardian, no tool calls. We'll surface this clearly in the UI when the user enters Mode B.
- After the call ends, we save the transcript back into the current conversation so memory continuity isn't lost.

### Toggle
Composer gains a voice button next to mic. Clicking opens a small popover:
- **Text only** (default)
- **Voice-over** (Mode A)
- **Live voice** (Mode B)

The current mode is remembered per-conversation in `conversations.voice_mode`.

### Settings → Voice & security
The placeholder page becomes real:
- **Default voice** picker (curated ElevenLabs voice list with a Test button that hits TTS).
- **Default ElevenLabs agent ID** for live mode (optional text input).
- Connection status pill confirming ElevenLabs is linked.

### Settings → Agents → [agent] → Voice
- Voice override (provider/voiceId/rate/pitch) — already in the data model, just wire UI inputs.
- ElevenLabs agent ID override for live mode.

---

## Technical section

**Backend (edge functions)**

1. `voice-tts` — POST `{ text, voiceId, modelId? }` → streams MP3 from ElevenLabs `/v1/text-to-speech/{voiceId}/stream?output_format=mp3_44100_128`. Validates JWT. Streams response body straight through with `Content-Type: audio/mpeg`.
2. `voice-scribe-token` — POST → mints a single-use realtime Scribe token from `/v1/single-use-token/realtime_scribe`. Returns `{ token }`.
3. `voice-conversation-token` — POST `{ agentId? }` → mints WebRTC token from `/v1/convai/conversation/token?agent_id=...`. Falls back to global default agent ID from `app_config.elevenlabs_default_agent_id`.
4. `voice-save-transcript` — POST `{ conversationId, turns: [{role, text, ts}] }` → writes turns into existing `messages` table so live-mode chats persist into history.

All four use `corsHeaders`, validate the user's JWT via the anon client, and read `ELEVENLABS_API_KEY` from env.

**Database (migration)**

- `conversations.voice_mode text default 'text'` — one of `text | voiceover | live`.
- `agent_configs.elevenlabs_agent_id text null` — per-agent live override.
- `app_config` row: `elevenlabs_default_agent_id` (nullable text).
- `user_settings.default_voice_id text default 'EXAVITQu4vr4xnSDxMaL'` (Sarah) and `default_voice_provider text default 'elevenlabs'`.

**Frontend**

- `bun add @elevenlabs/react`.
- New store `src/stores/voiceStore.ts` — current mode per conversation, current playback queue, mic state, live-call status.
- New `src/lib/voicePlayback.ts` — sentence-chunker + sequential `Audio` queue, fades on stop.
- New components:
  - `src/components/composer/VoiceModeButton.tsx` — toggle + popover.
  - `src/components/voice/LiveCallOverlay.tsx` — full-screen-ish call UI for Mode B (waveform, end-call, transcript overlay).
  - `src/components/voice/VoicePicker.tsx` — voice list + Test button, reused in global + per-agent settings.
- Hook into existing chat send path: when Mode A is active and a message is sent, after the stream finishes (or per sentence flush), call `voice-tts` and enqueue audio.
- Hook into dictation: when Mode A active, replace the existing Web Speech mic with `useScribe`; committed transcript auto-submits.
- `src/pages/settings/VoiceSettings.tsx` — replace `SettingsPlaceholder` for `/settings/voice`. Wire into `SidebarSettings` (already has the entry).
- Extend `AgentDetail` Voice section with ElevenLabs agent ID input + voice picker (already has the slot in `VoiceCardGrid`).

**Mode B transcript persistence**

`useConversation`'s `onMessage` collects `user_transcript` + `agent_response` events. On `endSession`, batch-send to `voice-save-transcript`. Messages saved with a `voice_call` metadata flag so the UI can render them with a small "live call" badge.

**Order of work**

1. Migration (schema additions).
2. Four edge functions + deploy.
3. Settings → Voice page (so user can pick default voice + verify TTS works end-to-end).
4. Composer VoiceModeButton + Mode A (voice-over) — TTS playback of streamed replies, Scribe-based dictation.
5. Mode B (live call) overlay + transcript save-back.
6. Per-agent overrides in AgentDetail.

Verification after each step: TTS plays clean audio, Scribe produces transcripts, live call connects and disconnects cleanly, transcripts land in the conversation, mode persists per conversation across reloads.
