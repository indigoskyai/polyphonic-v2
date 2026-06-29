import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle,
  AtSign,
  Bot,
  Check,
  Clock3,
  ExternalLink,
  Play,
  Send,
  ShieldCheck,
  Unplug,
  WalletCards,
} from 'lucide-react';
import { Pill } from '@/components/ui/luca';
import { SelectInput, TextArea, TextInput, Toggle } from '@/components/settings/FormControls';
import {
  type AgentXBilling,
  type AgentXPolicy,
  useAgentSocialChannelStore,
} from '@/stores/agentSocialChannelStore';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  agentId: string;
  agentName: string;
}

const LOCAL_DEFAULT_POLICY: AgentXPolicy = {
  approval_mode: 'approval_required',
  cadence_per_day: 2,
  topics: [],
  prohibited_topics: [],
  human_account_handle: '',
  bot_disclosure_confirmed: false,
  automated_label_confirmed: false,
  no_spam_confirmed: false,
  x_rules_acknowledged_at: null,
};

const LOCAL_DEFAULT_BILLING: AgentXBilling = {
  mode: 'subscription_credits',
  post_cost_credits: 1,
  daily_spend_limit_credits: 6,
};

const surface: CSSProperties = {
  border: '1px solid var(--border-faint)',
  background: 'var(--surface-1)',
  borderRadius: 'var(--radius-md)',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--settings-mono-size)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: 'var(--track-folio)',
  textTransform: 'uppercase',
  color: 'var(--text-soft)',
};

const copyStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--settings-caption-size)',
  lineHeight: 1.55,
  color: 'var(--text-tertiary)',
};

function tagsToText(tags: string[]) {
  return tags.join(', ');
}

function textToTags(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function policyComplete(policy: AgentXPolicy) {
  return Boolean(
    policy.bot_disclosure_confirmed
    && policy.automated_label_confirmed
    && policy.no_spam_confirmed
    && policy.x_rules_acknowledged_at,
  );
}

function statusCopy(status: string | null | undefined) {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'needs_attention':
      return 'needs attention';
    case 'disconnected':
      return 'disconnected';
    default:
      return 'not connected';
  }
}

export default function AgentXChannel({ agentId, agentName }: Props) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const summary = useAgentSocialChannelStore((s) => s.byAgentId[agentId]);
  const loading = useAgentSocialChannelStore((s) => s.loadingByAgentId[agentId]);
  const loadError = useAgentSocialChannelStore((s) => s.errorByAgentId[agentId]);
  const loadX = useAgentSocialChannelStore((s) => s.loadX);
  const startXConnect = useAgentSocialChannelStore((s) => s.startXConnect);
  const configureX = useAgentSocialChannelStore((s) => s.configureX);
  const disconnectX = useAgentSocialChannelStore((s) => s.disconnectX);
  const runXAutopilot = useAgentSocialChannelStore((s) => s.runXAutopilot);
  const draftXPost = useAgentSocialChannelStore((s) => s.draftXPost);
  const approveXPost = useAgentSocialChannelStore((s) => s.approveXPost);
  const postXNow = useAgentSocialChannelStore((s) => s.postXNow);

  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [posting, setPosting] = useState(false);
  const [autonomyRunning, setAutonomyRunning] = useState(false);

  const defaults = summary?.defaults;
  const channel = summary?.channel ?? null;
  const policy = channel?.policy ?? defaults?.policy ?? LOCAL_DEFAULT_POLICY;
  const billing = channel?.billing ?? defaults?.billing ?? LOCAL_DEFAULT_BILLING;

  const [policyDraft, setPolicyDraft] = useState<AgentXPolicy | null>(null);
  const [billingDraft, setBillingDraft] = useState<AgentXBilling | null>(null);
  const [topicsText, setTopicsText] = useState('');
  const [blockedText, setBlockedText] = useState('');

  useEffect(() => {
    void loadX(agentId);
  }, [agentId, loadX]);

  useEffect(() => {
    if (!policy || !billing) return;
    setPolicyDraft(policy);
    setBillingDraft(billing);
    setTopicsText(tagsToText(policy.topics));
    setBlockedText(tagsToText(policy.prohibited_topics));
  }, [policy, billing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('x_channel');
    if (!status) return;
    if (status === 'connected') {
      toast({
        title: 'X channel connected',
        description: params.get('username') ? `@${params.get('username')} is ready to configure.` : undefined,
      });
      void loadX(agentId);
    } else if (status === 'error') {
      toast({
        title: 'X connection needs attention',
        description: params.get('reason') ?? 'The OAuth connection did not complete.',
        variant: 'destructive',
      });
    }
    params.delete('x_channel');
    params.delete('username');
    params.delete('reason');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [agentId, loadX, toast]);

  const complete = policyDraft ? policyComplete(policyDraft) : false;
  const connected = channel?.status === 'connected';
  const canEnable = connected && complete;
  const autonomyReady = connected && complete && channel?.posting_enabled === true;
  const accountUrl = channel?.x_username ? `https://x.com/${channel.x_username}` : 'https://x.com';
  const balance = Number(summary?.balance_credits ?? 0);
  const posts = summary?.posts ?? [];

  const checklist = useMemo(() => {
    if (!policyDraft) return [];
    return [
      {
        key: 'bot_disclosure_confirmed' as const,
        title: 'Bio names this as an automated Polyphonic agent.',
        desc: 'The X account should plainly disclose that posts are generated by the agent.',
        on: policyDraft.bot_disclosure_confirmed,
      },
      {
        key: 'automated_label_confirmed' as const,
        title: 'X automated-account label is enabled.',
        desc: 'X currently expects this to be set in the bot account settings.',
        on: policyDraft.automated_label_confirmed,
      },
      {
        key: 'no_spam_confirmed' as const,
        title: 'No spam, duplicate posting, or engagement manipulation.',
        desc: 'Polyphonic should post with cadence, provenance, and a visible pause path.',
        on: policyDraft.no_spam_confirmed,
      },
    ];
  }, [policyDraft]);

  const saveConfig = async (postingEnabled = channel?.posting_enabled === true) => {
    if (!policyDraft || !billingDraft) return;
    setSaving(true);
    const nextPolicy: AgentXPolicy = {
      ...policyDraft,
      topics: textToTags(topicsText),
      prohibited_topics: textToTags(blockedText),
    };
    const res = await configureX(agentId, {
      policy: nextPolicy,
      billing: billingDraft,
      posting_enabled: postingEnabled,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: 'Could not save X channel', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'X channel saved' });
  };

  const connect = async () => {
    setConnecting(true);
    const res = await startXConnect(agentId, `/settings/agents/${agentId}`);
    setConnecting(false);
    if (!res.ok || !res.authUrl) {
      toast({ title: 'Could not start X connection', description: res.error, variant: 'destructive' });
      return;
    }
    window.location.assign(res.authUrl);
  };

  const disconnect = async () => {
    setSaving(true);
    const res = await disconnectX(agentId);
    setSaving(false);
    if (!res.ok) {
      toast({ title: 'Could not disconnect X', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'X channel disconnected' });
  };

  const saveDraft = async () => {
    const text = draftText.trim();
    if (!text) return;
    setPosting(true);
    const res = await draftXPost(agentId, text);
    setPosting(false);
    if (!res.ok) {
      toast({ title: 'Could not save draft', description: res.error, variant: 'destructive' });
      return;
    }
    setDraftText('');
    toast({ title: 'Draft saved' });
  };

  const postNow = async (postId?: string) => {
    setPosting(true);
    const res = await postXNow(agentId, {
      postId,
      text: postId ? undefined : draftText.trim(),
      explicitApproval: true,
    });
    setPosting(false);
    if (!res.ok) {
      toast({ title: 'Could not post to X', description: res.error, variant: 'destructive' });
      return;
    }
    setDraftText('');
    toast({ title: 'Posted to X' });
  };

  const approve = async (postId: string) => {
    setPosting(true);
    const res = await approveXPost(agentId, postId);
    setPosting(false);
    if (!res.ok) {
      toast({ title: 'Could not approve post', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Post approved' });
  };

  const runAutonomy = async () => {
    setAutonomyRunning(true);
    const res = await runXAutopilot(agentId);
    setAutonomyRunning(false);
    if (!res.ok) {
      toast({ title: 'Autonomous posting could not run', description: res.error, variant: 'destructive' });
      return;
    }
    const result = res.result && typeof res.result === 'object'
      ? res.result as { status?: string; reason?: string; text?: string }
      : {};
    if (result.status === 'posted') {
      toast({ title: 'Posted autonomously to X', description: result.text?.slice(0, 120) });
      return;
    }
    if (result.status === 'draft_created') {
      toast({ title: 'Agent draft created', description: 'Approval mode is on, so the autonomous turn saved a draft.' });
      return;
    }
    toast({
      title: 'Autonomy check complete',
      description: result.reason ?? 'No post was due right now.',
    });
  };

  if (!policyDraft || !billingDraft) {
    return (
      <div style={{ ...surface, padding: 18, color: 'var(--text-tertiary)', fontSize: 13 }}>
        {loading ? 'Loading X channel...' : 'Preparing X channel controls...'}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          ...surface,
          padding: 18,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-faint)',
                background: 'var(--surface-2)',
                color: connected ? 'var(--accent-soft)' : 'var(--text-tertiary)',
              }}
            >
              <AtSign size={16} strokeWidth={1.8} />
            </span>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 450 }}>
                X channel for {agentName}
              </div>
              <div style={copyStyle}>
                {connected && channel?.x_username
                  ? `Connected as @${channel.x_username}`
                  : 'Connect a bot account with X OAuth. No code or token copy/paste.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip label={statusCopy(channel?.status)} tone={connected ? 'good' : 'muted'} />
            <StatusChip label={complete ? 'compliance ready' : 'setup required'} tone={complete ? 'good' : 'warn'} />
            <StatusChip label={`${balance.toFixed(1)} credits`} tone={balance > 0 ? 'good' : 'muted'} />
          </div>
          {loadError && (
            <div style={{ ...copyStyle, marginTop: 10, color: 'var(--amber-soft)' }}>
              Backend setup pending: {loadError}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {connected && (
            <Pill
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={13} />}
              onClick={() => window.open(accountUrl, '_blank', 'noopener,noreferrer')}
            >
              Open X
            </Pill>
          )}
          <Pill
            variant={connected ? 'secondary' : 'primary'}
            size="sm"
            icon={<AtSign size={13} />}
            onClick={connect}
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : connected ? 'Reconnect' : 'Connect X'}
          </Pill>
          {connected && (
            <Pill
              variant="ghost"
              size="sm"
              icon={<Unplug size={13} />}
              onClick={disconnect}
              disabled={saving}
            >
              Disconnect
            </Pill>
          )}
        </div>
      </div>

      <div
        style={{
          ...surface,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
          <PanelTitle icon={<Bot size={14} />} title="Autonomous posting" />
          <div style={{ ...copyStyle, maxWidth: 720 }}>
            {policyDraft.approval_mode === 'autopilot'
              ? `${agentName} can generate and publish posts when cadence, policy, credits, and X credentials all pass.`
              : `${agentName} can generate posts on schedule, but approval mode saves them as drafts before anything is published.`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip
              label={policyDraft.approval_mode === 'autopilot' ? 'autopilot publishes' : 'approval drafts'}
              tone={policyDraft.approval_mode === 'autopilot' ? 'good' : 'muted'}
            />
            <StatusChip label={channel?.posting_enabled ? 'posting enabled' : 'posting paused'} tone={channel?.posting_enabled ? 'good' : 'muted'} />
            <StatusChip label={`${policyDraft.cadence_per_day}/day cadence`} tone="muted" />
          </div>
        </div>
        <Pill
          variant="primary"
          size="sm"
          icon={<Play size={13} />}
          onClick={() => void runAutonomy()}
          disabled={!autonomyReady || autonomyRunning}
        >
          {autonomyRunning ? 'Running...' : 'Run autonomy check'}
        </Pill>
      </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(280px, 0.95fr)', gap: 12 }}>
        <div style={{ ...surface, padding: 16, display: 'grid', gap: 14 }}>
          <PanelTitle icon={<ShieldCheck size={14} />} title="Posting policy" />
          <div style={{ display: 'grid', gap: 10 }}>
            {checklist.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'start',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-faint)',
                  background: 'var(--surface-2)',
                }}
              >
                <Toggle
                  on={item.on}
                  onChange={() => setPolicyDraft((p) => p ? { ...p, [item.key]: !p[item.key] } : p)}
                />
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{item.title}</div>
                  <div style={copyStyle}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={labelStyle}>Human-managed account</div>
            <TextInput
              value={policyDraft.human_account_handle}
              onChange={(v) => setPolicyDraft({ ...policyDraft, human_account_handle: v })}
              placeholder="@youraccount"
              mono
            />
          </div>
          <Pill
            variant={policyDraft.x_rules_acknowledged_at ? 'secondary' : 'ghost'}
            size="sm"
            icon={policyDraft.x_rules_acknowledged_at ? <Check size={13} /> : <AlertTriangle size={13} />}
            onClick={() => setPolicyDraft({ ...policyDraft, x_rules_acknowledged_at: new Date().toISOString() })}
          >
            {policyDraft.x_rules_acknowledged_at ? 'Rules acknowledged' : 'Acknowledge X automation rules'}
          </Pill>
        </div>

        <div style={{ ...surface, padding: 16, display: 'grid', gap: 14 }}>
          <PanelTitle icon={<Clock3 size={14} />} title="Cadence and funding" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>Posting mode</div>
              <SelectInput
                value={policyDraft.approval_mode}
                onChange={(v) => setPolicyDraft({ ...policyDraft, approval_mode: v as AgentXPolicy['approval_mode'] })}
                options={[
                  { value: 'approval_required', label: 'Draft + approve' },
                  { value: 'autopilot', label: 'Autopilot' },
                ]}
                width="100%"
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>Posts / day</div>
              <TextInput
                value={String(policyDraft.cadence_per_day)}
                onChange={(v) => setPolicyDraft({ ...policyDraft, cadence_per_day: Number(v) || 1 })}
                mono
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={labelStyle}>Allowed topics</div>
            <TextArea value={topicsText} onChange={setTopicsText} rows={2} placeholder="research notes, product updates" />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={labelStyle}>Never post about</div>
            <TextArea value={blockedText} onChange={setBlockedText} rows={2} placeholder="medical advice, financial advice, private details" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>Funding source</div>
              <SelectInput
                value={billingDraft.mode}
                onChange={(v) => setBillingDraft({ ...billingDraft, mode: v as AgentXBilling['mode'] })}
                options={[
                  { value: 'subscription_credits', label: 'Subscription credits' },
                  { value: 'mnemos_credits', label: '$MNEMOS credits' },
                ]}
                width="100%"
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>Daily credit cap</div>
              <TextInput
                value={String(billingDraft.daily_spend_limit_credits)}
                onChange={(v) => setBillingDraft({ ...billingDraft, daily_spend_limit_credits: Number(v) || 1 })}
                mono
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>Posting enabled</div>
              <div style={copyStyle}>
                {canEnable ? 'Ready after saving.' : 'Requires connection and compliance checks.'}
              </div>
            </div>
            <Toggle
              on={channel?.posting_enabled === true}
              onChange={() => void saveConfig(!(channel?.posting_enabled === true))}
            />
          </div>

          <Pill
            variant="primary"
            size="sm"
            icon={<Check size={13} />}
            onClick={() => void saveConfig()}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save channel'}
          </Pill>
        </div>
      </div>

      <div style={{ ...surface, padding: 16, display: 'grid', gap: 14 }}>
        <PanelTitle icon={<Send size={14} />} title="Manual test draft" />
        <div style={copyStyle}>
          This box is only for smoke-testing the channel. Real autonomous posts come from the agent run above.
        </div>
        <TextArea
          value={draftText}
          onChange={(v) => setDraftText(v.slice(0, 280))}
          rows={3}
          placeholder={`Write a manual test post for ${agentName}...`}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={copyStyle}>{draftText.length}/280 characters</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill variant="ghost" size="sm" onClick={saveDraft} disabled={!connected || posting || !draftText.trim()}>
              Save draft
            </Pill>
            <Pill
              variant="primary"
              size="sm"
              icon={<Send size={13} />}
              onClick={() => void postNow()}
              disabled={!connected || posting || !draftText.trim()}
            >
              Post now
            </Pill>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {posts.length === 0 ? (
            <div style={{ ...copyStyle, padding: 14, border: '1px solid var(--border-faint)', borderRadius: 'var(--radius-sm)' }}>
              No X drafts or posts yet.
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: 12,
                  border: '1px solid var(--border-faint)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.45 }}>{post.text}</div>
                  <div style={{ ...copyStyle, marginTop: 4 }}>
                    {post.status} · {Number(post.cost_credits ?? 1).toFixed(1)} credit
                    {post.failure_reason ? ` · ${post.failure_reason}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {post.status === 'draft' && (
                    <Pill variant="ghost" size="xs" onClick={() => void approve(post.id)} disabled={posting}>
                      Approve
                    </Pill>
                  )}
                  {post.status !== 'posted' ? (
                    <Pill variant="secondary" size="xs" onClick={() => void postNow(post.id)} disabled={posting}>
                      Post
                    </Pill>
                  ) : (
                    <Pill
                      variant="ghost"
                      size="xs"
                      icon={<ExternalLink size={12} />}
                      onClick={() => window.open(`https://x.com/${channel?.x_username ?? 'i'}/status/${post.external_post_id}`, '_blank', 'noopener,noreferrer')}
                    >
                      View
                    </Pill>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-ghost)', fontSize: 12 }}>
        <WalletCards size={13} strokeWidth={1.7} />
        <span>
          Credits are a shared ledger surface. Subscription grants, $MNEMOS deposits, and future donations can all fund the same posting balance.
        </span>
      </div>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'good' | 'warn' | 'muted' }) {
  const color =
    tone === 'good' ? 'var(--accent-soft)' : tone === 'warn' ? 'var(--amber-soft)' : 'var(--text-ghost)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        padding: '0 8px',
        borderRadius: 999,
        border: '1px solid var(--border-faint)',
        color,
        background: 'var(--surface-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 'var(--track-mono)',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--text-soft)', display: 'inline-flex' }}>{icon}</span>
      <span style={labelStyle}>{title}</span>
    </div>
  );
}
