import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Pill } from '@/components/ui/luca';
import { TextInput, TextArea } from '@/components/settings/FormControls';
import { useAgentSettingsStore, type AvatarColor } from '@/stores/agentSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { AVATAR_COLOR_OPTIONS, resolveAgentColor } from '@/lib/agentColors';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MODELS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'openai/gpt-5', label: 'GPT-5' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

const ROLE_HINTS = ['custom', 'analyst', 'researcher', 'writer', 'coach', 'planner'];

export default function CreateAgentModal({ open, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const createAgent = useAgentSettingsStore((s) => s.createAgent);

  const [name, setName] = useState('');
  const [role, setRole] = useState('custom');
  const [color, setColor] = useState<AvatarColor>('cream');
  const [model, setModel] = useState(MODELS[0].value);
  const [prompt, setPrompt] = useState('');
  const [voiceDescription, setVoiceDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setRole('custom');
    setColor('cream');
    setModel(MODELS[0].value);
    setPrompt('');
    setVoiceDescription('');
  };

  const handleSubmit = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name required', description: 'Give your agent a name.', variant: 'destructive' });
      return;
    }
    if (trimmed.length > 40) {
      toast({ title: 'Name too long', description: 'Keep it under 40 characters.', variant: 'destructive' });
      return;
    }
    if (prompt.length > 8000) {
      toast({ title: 'Prompt too long', description: 'Keep the system prompt under 8000 characters.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const res = await createAgent(user.id, {
      name: trimmed,
      role: role.trim() || 'custom',
      avatar_color: color,
      model,
      prompt,
      personality: { voice_description: voiceDescription },
    });
    setSubmitting(false);

    if (!res.ok || !res.id) {
      toast({ title: 'Could not create agent', description: res.error ?? 'Unknown error', variant: 'destructive' });
      return;
    }

    toast({ title: 'Agent created', description: `${trimmed} is ready.` });
    reset();
    onClose();
    navigate(`/settings/agents/${res.id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="New agent" width={560}>
      <div className="flex flex-col gap-5">
        {/* Name */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            Name
          </div>
          <TextInput value={name} onChange={setName} placeholder="e.g. Atlas, Compass, Mira…" />
        </div>

        {/* Role + color */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              Role
            </div>
            <input
              list="role-hints"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                height: 40,
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 12px',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
              }}
            />
            <datalist id="role-hints">
              {ROLE_HINTS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              Color
            </div>
            <div className="flex gap-2 items-center" style={{ height: 40 }}>
              {AVATAR_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColor(opt.value)}
                  aria-label={opt.label}
                  aria-pressed={color === opt.value}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: resolveAgentColor(opt.value),
                    border: color === opt.value ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'transform var(--dur-fast) var(--ease-out)',
                    transform: color === opt.value ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Model */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            Model
          </div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              height: 40,
              width: '100%',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 12px',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* System prompt */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            System prompt
          </div>
          <TextArea
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe how this agent thinks and responds. This becomes the system message at the top of every turn."
            rows={6}
          />
        </div>

        {/* Voice description (personality) */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            Voice
          </div>
          <TextArea
            value={voiceDescription}
            onChange={setVoiceDescription}
            placeholder="Optional — describe tone, cadence, vocabulary."
            rows={3}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
          <Pill variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Pill>
          <Pill variant="primary" size="sm" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create agent'}
          </Pill>
        </div>
      </div>
    </Modal>
  );
}
