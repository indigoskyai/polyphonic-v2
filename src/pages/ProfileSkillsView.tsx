import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Pencil, Trash2, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import RichBody from '@/components/rich/RichBody';

type AgentSkill = {
  id: string;
  name: string;
  description: string;
  trigger_keywords: string[] | null;
  content: string;
  source_thread_id: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

function formatTime(value?: string | null) {
  if (!value) return 'Never used';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function IconButton({
  label,
  onClick,
  children,
  tone = 'neutral',
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: '1px solid var(--border-faint)',
        background: disabled ? 'var(--surface-muted)' : 'var(--surface-raised)',
        color: tone === 'danger' ? 'var(--danger)' : 'var(--text-tertiary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function SkillRow({
  skill,
  onChanged,
}: {
  skill: AgentSkill;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(skill.name);
  const [busy, setBusy] = useState(false);

  async function runAction(action: 'rename' | 'delete' | 'reject', name?: string) {
    setBusy(true);
    const { error } = await supabase.functions.invoke('skills-manage', {
      body: { action, skill_id: skill.id, name },
    });
    setBusy(false);

    if (error) {
      toast({ title: 'Skill update failed', description: error.message, variant: 'destructive' });
      return;
    }

    setEditing(false);
    onChanged();
    toast({
      title: action === 'rename' ? 'Skill renamed' : action === 'reject' ? 'Skill rejected' : 'Skill deleted',
    });
  }

  const keywords = useMemo(() => (skill.trigger_keywords || []).slice(0, 8), [skill.trigger_keywords]);

  return (
    <section
      style={{
        borderTop: '1px solid var(--border-faint)',
        padding: '28px 0 32px',
      }}
    >
      <div className="profile-skill-head flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="profile-skill-edit-row flex items-center gap-2" style={{ marginBottom: 10 }}>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                disabled={busy}
                style={{
                  width: 'min(420px, 100%)',
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  padding: '0 10px',
                  outline: 'none',
                }}
              />
              <IconButton label="Save name" onClick={() => runAction('rename', draftName)} disabled={busy}>
                <Check size={16} />
              </IconButton>
              <IconButton label="Cancel rename" onClick={() => { setEditing(false); setDraftName(skill.name); }} disabled={busy}>
                <X size={16} />
              </IconButton>
            </div>
          ) : (
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 28,
                lineHeight: 1.1,
                color: 'var(--text-primary)',
                margin: '0 0 10px',
                overflowWrap: 'anywhere',
              }}
            >
              {skill.name}
            </h2>
          )}
          <p style={{ margin: 0, color: 'var(--text-body)', fontSize: 14, lineHeight: 1.7, maxWidth: 720 }}>
            {skill.description}
          </p>
        </div>
        <div className="profile-skill-actions flex items-center gap-2">
          <IconButton label="Rename skill" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil size={15} />
          </IconButton>
          <IconButton
            label="Delete skill"
            onClick={() => {
              if (window.confirm(`Delete ${skill.name}?`)) runAction('delete');
            }}
            tone="danger"
            disabled={busy}
          >
            <Trash2 size={15} />
          </IconButton>
          <IconButton
            label="Reject skill"
            onClick={() => {
              if (window.confirm(`Reject ${skill.name}? Luca will avoid recreating it.`)) runAction('reject');
            }}
            tone="danger"
            disabled={busy}
          >
            <Ban size={15} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
        {keywords.map((keyword) => (
          <span
            key={keyword}
            style={{
              border: '1px solid var(--border-faint)',
              borderRadius: 999,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-mono)',
              padding: '5px 8px',
            }}
          >
            {keyword}
          </span>
        ))}
      </div>

      <div
        className="profile-skill-meta grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, max-content))',
          marginTop: 18,
          color: 'var(--text-ghost)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 'var(--track-mono)',
          textTransform: 'uppercase',
        }}
      >
        <span>Used {skill.use_count} times</span>
        <span>{formatTime(skill.last_used_at)}</span>
        <span>Updated {formatTime(skill.updated_at)}</span>
      </div>

      <div style={{ marginTop: 22 }}>
        <RichBody source={skill.content} />
      </div>
    </section>
  );
}

export default function ProfileSkillsView() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('agent_skills')
      .select('id, name, description, trigger_keywords, content, source_thread_id, use_count, last_used_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('agent_id', 'luca')
      .order('updated_at', { ascending: false });

    if (error) {
      toast({ title: 'Could not load skills', description: error.message, variant: 'destructive' });
    } else {
      setSkills((data || []) as AgentSkill[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setLoading(true);
    supabase
      .from('agent_skills')
      .select('id, name, description, trigger_keywords, content, source_thread_id, use_count, last_used_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('agent_id', 'luca')
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({ title: 'Could not load skills', description: error.message, variant: 'destructive' });
        } else {
          setSkills((data || []) as AgentSkill[]);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="profile-page-frame" style={{ padding: '44px 48px 80px', maxWidth: 980 }}>
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            § L5 / skills
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 42,
              lineHeight: 1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Luca's skills
          </h1>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading skills...</p>
        ) : skills.length === 0 ? (
          <section style={{ borderTop: '1px solid var(--border-faint)', padding: '28px 0' }}>
            <p style={{ color: 'var(--text-ghost)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              No skills yet. Luca has not found a repeatable move worth keeping.
            </p>
          </section>
        ) : (
          skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onChanged={load} />
          ))
        )}
      </div>
    </div>
  );
}
