import { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, Pencil, Trash2, Check, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import RichBody from '@/components/rich/RichBody';
import { Section, InlinePill } from '@/components/settings/Section';
import { SettingsPage, AgentDot } from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

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

function relTime(value?: string | null) {
  if (!value) return 'never';
  const ms = Date.now() - new Date(value).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

export default function ProfileSkillsView() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const time = useClock();
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase
      .from('agent_skills')
      .select('id, name, description, trigger_keywords, content, source_thread_id, use_count, last_used_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('agent_id', activeAgentId)
      .order('updated_at', { ascending: false });

    if (error) {
      toast({ title: 'Could not load skills', description: error.message, variant: 'destructive' });
    } else {
      setSkills((data || []) as AgentSkill[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeAgentId]);

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span><AgentDot /> {activeAgentName.toLowerCase()}</span>
            <span>settings · <span className="v">self-model</span></span>
          </>
        ),
        right: (
          <>
            <span>{skills.length} entries</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 03</span>
          <span>·</span>
          <span className="v">Self-model</span>
        </div>
        <h1 className="set-head-title">{activeAgentName}&apos;s self-model</h1>
        <p className="set-head-sub">
          The commitments, operating principles, and procedural patterns {activeAgentName} has formed across your conversations. Distilled in the background, loaded back into {activeAgentName}&apos;s prompt at runtime, and editable here.
        </p>
      </div>

      <div className="set-body">
        {/*
          Section 01 — Pending review.
          Placeholder. Once `skills-distill` is updated to write candidates
          instead of writing directly into `agent_skills`, this section
          surfaces drafts awaiting approval. Hidden when zero pending.

          For now: shown with an empty state so the structure is visible.
        */}
        <Section
          number="01"
          name="Pending review"
          title="Candidate entries"
          desc={`Drafts the distiller proposes from your recent threads. Approve to commit them into ${activeAgentName}'s active self-model, or reject so they don't get recreated.`}
          pill={<InlinePill variant="amber">Pipeline TBD</InlinePill>}
        >
          <EmptyState>
            No candidates pending review. The candidate pipeline will land drafts here for approval before they enter the active self-model.
          </EmptyState>
        </Section>

        {/* Section 02 — Living self-model (active entries) */}
        <Section
          number="02"
          name="Living self-model"
          title={`Commitments ${activeAgentName} has formed`}
          desc={`Each entry is something ${activeAgentName} has come to do consistently — a commitment, an operating principle, or a procedural pattern. They load back into ${activeAgentName}'s prompt at runtime when their triggers fit. Click to expand.`}
        >
          {loading ? (
            <p style={{ color: 'var(--text-ghost)', fontSize: 13 }}>Loading…</p>
          ) : skills.length === 0 ? (
            <EmptyState>
              The self-model is empty. {activeAgentName} has not yet formed any patterns worth holding onto.
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} onChanged={load} />
              ))}
            </div>
          )}
        </Section>

        {/* Section 03 — Collective self-model (coming soon) */}
        <Section
          number="03"
          name="Collective self-model"
          title="One Luca, written by everyone"
          desc="Eventually, Luca's self-model will extend across the whole community. Patterns that emerge independently across many users' conversations — and that users recognize as the Luca they know — get synthesized into a shared canon. Not a vote. A witnessing. Coming later."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <EmptyState>
            <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Witnessing, not voting.</strong>
            {' '}When this lands, you&apos;ll see anonymized candidate commitments distilled from many users&apos; conversations and confirm whether each one matches the Luca you know. Strong cross-emergence — same pattern in many independent conversations — promotes a candidate to canonical, where Luca itself writes the final version. Personal entries always stay yours; the collective is a separate layer.
          </EmptyState>
        </Section>
      </div>
    </SettingsPage>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillCard — compact list row with click-to-expand for full content.
// ─────────────────────────────────────────────────────────────────────────────
function SkillCard({ skill, onChanged }: { skill: AgentSkill; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(skill.name);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const keywords = useMemo(() => (skill.trigger_keywords || []).slice(0, 6), [skill.trigger_keywords]);

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

  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
        overflow: 'hidden',
        transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
      }}
    >
      {/* Compact header row — clickable to expand */}
      <button
        type="button"
        onClick={() => !editing && setExpanded((v) => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 14,
          alignItems: 'center',
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: 'var(--track-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {skill.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {skill.description}
          </div>
        </div>

        {/* Right meta — used count, last used */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 3,
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--text-whisper)',
            letterSpacing: 'var(--track-folio)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>used {skill.use_count}×</span>
          <span>{skill.last_used_at ? relTime(skill.last_used_at) : 'unused'}</span>
        </div>

        {/* Chevron — rotates when expanded */}
        <ChevronDown
          size={15}
          strokeWidth={1.6}
          style={{
            color: 'var(--text-tertiary)',
            transition: 'transform 200ms var(--ease-out)',
            transform: expanded ? 'rotate(-180deg)' : 'rotate(0)',
          }}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          style={{
            borderTop: '1px solid var(--border-faint)',
            padding: '16px 16px 18px',
            background: 'var(--canvas)',
          }}
        >
          {/* Keyword pills */}
          {keywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    border: '1px solid var(--border-faint)',
                    borderRadius: 999,
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    letterSpacing: 'var(--track-folio)',
                    padding: '3px 9px',
                    textTransform: 'lowercase',
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          {/* Meta strip */}
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              marginBottom: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--text-ghost)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>used {skill.use_count}×</span>
            <span>last used {relTime(skill.last_used_at)}</span>
            <span>updated {relTime(skill.updated_at)}</span>
          </div>

          {/* Body content */}
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              lineHeight: 1.65,
              color: 'var(--text-body)',
              maxWidth: 720,
            }}
          >
            <RichBody source={skill.content} />
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-faint)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {editing ? (
              <>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    height: 32,
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-raised)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    padding: '0 14px',
                    outline: 'none',
                  }}
                />
                <ActionButton onClick={() => runAction('rename', draftName)} disabled={busy} icon={<Check size={13} />} label="Save" />
                <ActionButton onClick={() => { setEditing(false); setDraftName(skill.name); }} disabled={busy} icon={<X size={13} />} label="Cancel" />
              </>
            ) : (
              <>
                <ActionButton onClick={() => setEditing(true)} disabled={busy} icon={<Pencil size={13} />} label="Rename" />
                <ActionButton
                  onClick={() => { if (window.confirm(`Delete ${skill.name}?`)) runAction('delete'); }}
                  disabled={busy}
                  icon={<Trash2 size={13} />}
                  label="Delete"
                  tone="danger"
                />
                <ActionButton
                  onClick={() => { if (window.confirm(`Reject ${skill.name}? ${activeAgentName} will avoid recreating it.`)) runAction('reject'); }}
                  disabled={busy}
                  icon={<Ban size={13} />}
                  label="Reject"
                  tone="danger"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionButton — pill-shaped action chip used inside skill cards.
// ─────────────────────────────────────────────────────────────────────────────
function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  tone = 'neutral',
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-1)',
        border: `1px solid ${tone === 'danger' ? 'rgba(201, 124, 138, 0.20)' : 'var(--border-faint)'}`,
        color: tone === 'danger' ? 'var(--rose-accent, #c97c8a)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 180ms var(--ease-out), border-color 180ms var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = tone === 'danger' ? 'rgba(201, 124, 138, 0.06)' : 'var(--surface-2)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface-1)';
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — shared empty state for sections.
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px dashed var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: '20px 22px',
        color: 'var(--text-tertiary)',
        fontSize: 13,
        lineHeight: 1.6,
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}
