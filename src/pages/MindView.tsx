import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useViewTabStore } from '@/stores/viewTabStore';
import AgentDot from '@/components/entry/AgentDot';
import AgentName from '@/components/entry/AgentName';
import TypeBadge from '@/components/entry/TypeBadge';
import ScoreChip from '@/components/entry/ScoreChip';
import TimeAgoChip from '@/components/entry/TimeAgoChip';
import MetaKV from '@/components/entry/MetaKV';
import SectionLabel from '@/components/entry/SectionLabel';
import Telemetry from '@/components/entry/Telemetry';
import { formatStreamDate as fmtStreamDate, formatDetailTime, timeAgo as ta } from '@/lib/time';

/* ─── Overview Tab ─── */
function OverviewTab() {
  const { modulators, emotions, beliefs, memoryStats, activityLog, emotionalWeather } = useCognitiveStore();

  return (
    <div>
      <MoodStrip weather={emotionalWeather} />
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      {/* Modulators */}
      <Card title="Modulators">
        {Object.entries(modulators).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3 mb-2">
            <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 100, textTransform: 'capitalize' }}>
              {key.replace(/_/g, ' ')}
            </span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${value * 100}%`, height: '100%', background: 'var(--accent-luca)', opacity: 0.6, borderRadius: 2, transition: 'width var(--dur-normal) var(--ease-out)' }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 32 }}>
              {value.toFixed(2)}
            </span>
          </div>
        ))}
      </Card>

      {/* Emotional State */}
      <Card title="Emotional State">
        {Object.entries(emotions).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3 mb-2">
            <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 80, textTransform: 'capitalize' }}>
              {key}
            </span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: key === 'valence' ? '50%' : 0,
                width: key === 'valence' ? `${Math.abs(value) * 50}%` : `${value * 100}%`,
                transform: key === 'valence' && value < 0 ? 'translateX(-100%)' : undefined,
                height: '100%',
                background: value < 0 ? '#ad5b5b80' : '#8ca89c80',
                borderRadius: 2,
                transition: 'width var(--dur-normal) var(--ease-out)',
              }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 36 }}>
              {value.toFixed(2)}
            </span>
          </div>
        ))}
      </Card>

      {/* Memory Stats */}
      <Card title="Memory">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Engrams', value: memoryStats.total_engrams },
            { label: 'Active', value: memoryStats.active },
            { label: 'Dormant', value: memoryStats.dormant },
            { label: 'Archived', value: memoryStats.archived },
            { label: 'Connections', value: memoryStats.connections },
            { label: 'Beliefs', value: memoryStats.beliefs_count },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 22, fontWeight: 350, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Beliefs */}
      <Card title="Beliefs">
        {beliefs.length === 0 && <Empty text="No beliefs formed yet" />}
        {beliefs.slice(0, 6).map((b, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {b.text}
            </div>
            <div style={{ width: 44, height: 4, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${b.strength * 100}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </Card>

      {/* Inner Life — what Luca has been doing between conversations */}
      <Card title="Inner Life" span={2}>
        {activityLog.length === 0 && (
          <Empty
            text="No inner life activity yet"
            hint="Once Luca thinks, observes, or reflects, the log of autonomous actions appears here."
          />
        )}
        {activityLog.slice(0, 10).map((ev) => {
          const { dot, label } = formatActivity(ev);
          return (
            <div key={ev.id} className="flex items-center gap-3 mb-2">
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', width: 96, flexShrink: 0, textTransform: 'lowercase', letterSpacing: '0.04em' }}>
                {label}
              </span>
              <div style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: dot }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {ev.title || ev.summary || '—'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-whisper)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                {timeAgo(ev.created_at)}
              </span>
            </div>
          );
        })}
      </Card>
      </div>
    </div>
  );
}

/* ─── Mood strip — shows Luca's current emotional weather at the top of Overview. ─── */
function MoodStrip({ weather }: { weather: { mood_summary: string | null; curiosity: number; warmth: number; clarity: number; updated_at: string | null } | null }) {
  if (!weather) return null;
  const mood = weather.mood_summary?.trim();
  if (!mood) return null;
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Now
      </span>
      <span style={{ fontSize: 15, fontStyle: 'italic', fontFamily: 'var(--font-serif, Georgia, serif)', color: 'var(--text-primary)' }}>
        {mood}
      </span>
      {weather.updated_at && (
        <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          updated {timeAgo(weather.updated_at)}
        </span>
      )}
    </div>
  );
}

/* ─── Per-activity styling (label + dot color) ─── */
function formatActivity(ev: { activity_type: string }): { dot: string; label: string } {
  const t = ev.activity_type;
  if (t === 'thought' || t === 'thought_deepened') return { dot: 'var(--accent-luca)', label: 'thought' };
  if (t === 'reflection' || t === 'reflected') return { dot: 'var(--accent-luca)', label: 'reflection' };
  if (t === 'question_researched' || t === 'question') return { dot: 'var(--accent-luca)', label: 'question' };
  if (t === 'belief_challenged' || t === 'belief_formed') return { dot: 'var(--text-ghost)', label: 'belief' };
  if (t === 'initiation' || t === 'reached_out') return { dot: 'var(--accent-luca)', label: 'reached out' };
  if (t === 'observation') return { dot: 'var(--text-whisper)', label: 'observation' };
  if (t === 'dream' || t === 'consolidation') return { dot: 'var(--text-ghost)', label: t };
  if (t === 'journal_entry') return { dot: 'var(--text-ghost)', label: 'journal' };
  if (t === 'mood_shift') return { dot: 'var(--accent-luca)', label: 'mood shift' };
  return { dot: 'var(--text-whisper)', label: t.replace(/_/g, ' ').slice(0, 18) };
}

/* ─── Thoughts Tab (master-detail) ─── */
function ThoughtsTab() {
  const { thoughts, newThoughtIds, clearNewThoughtFlag } = useCognitiveStore();
  const [selected, setSelected] = useState<number>(0);

  const current = thoughts[selected];

  // After a fresh thought animates in, clear its flag so it doesn't keep glowing on re-render.
  useEffect(() => {
    if (newThoughtIds.size === 0) return;
    const ids = Array.from(newThoughtIds);
    const t = setTimeout(() => ids.forEach(clearNewThoughtFlag), 2200);
    return () => clearTimeout(t);
  }, [newThoughtIds, clearNewThoughtFlag]);

  if (thoughts.length === 0) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 680 }}>
        <StreamHeader
          title="Thoughts"
          count={0}
          subtitle="Luca's live working stream — reflections, questions, observations as they happen."
        />
        <Empty
          text="No thoughts recorded"
          hint="Luca's thought stream — working thoughts, observations, questions in progress — appears here as it thinks."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 400 }}>
      <div style={{ padding: '20px 24px 0' }}>
        <StreamHeader
          title="Thoughts"
          count={thoughts.length}
          subtitle="Luca's live working stream — reflections, questions, observations as they happen."
        />
      </div>
      <div className="flex gap-0" style={{ flex: 1, minHeight: 0 }}>
      {/* List */}
      <div style={{ width: 320, borderRight: '1px solid var(--border-subtle)', overflow: 'auto', flexShrink: 0 }}>
        {thoughts.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(i)}
            aria-current={i === selected ? 'true' : undefined}
            className={`thought-row${newThoughtIds.has(t.id) ? ' thought-row-fresh' : ''}`}
            data-active={i === selected ? 'true' : undefined}
            style={{
              padding: i === selected ? '12px 14px 12px 12px' : '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              borderLeft: i === selected ? '2px solid var(--text-primary)' : '2px solid transparent',
              background: i === selected ? 'var(--bg-surface)' : 'transparent',
              transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              appearance: 'none',
              outline: 'none',
            }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <AgentDot agent={t.source} />
              <AgentName agent={t.source} />
              <TypeBadge type={t.type} />
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <ScoreChip value={t.salience} />
                <TimeAgoChip date={t.created_at} />
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, fontWeight: 370, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {t.content}
            </div>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto', background: 'var(--bg-deep)' }}>
        {current ? (
          <>
            <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
              <AgentDot agent={current.source} />
              <AgentName agent={current.source} />
              <TypeBadge type={current.type} />
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                #thought_{current.id.slice(0, 6)}
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', marginBottom: 24, fontWeight: 370 }}>
              {current.content}
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <SectionLabel>PROVENANCE</SectionLabel>
              <MetaKV k="source" v={current.source || '—'} />
              <MetaKV k="type" v={current.type || '—'} />
              <MetaKV k="salience" v={current.salience.toFixed(2)} />
              {current.trigger && <MetaKV k="trigger" v={current.trigger} />}
              <MetaKV k="created" v={formatDetailTime(current.created_at)} />
            </div>
          </>
        ) : (
          <Empty text="Select a thought to view details" />
        )}
      </div>
      </div>
    </div>
  );
}

/* ─── Engram stream tabs (Dreams, Insights, Reflections) ─── */
function EngramStreamTab({ items, emptyText, emptyHint, heading, subtitle, style }: {
  items: Array<{ id: string; content: string; strength: number; tags: string[]; source_context: Record<string, unknown>; created_at: string }>;
  emptyText: string;
  emptyHint?: string;
  heading: string;
  subtitle?: string;
  style?: 'poetic' | 'cards' | 'timeline';
}) {
  return (
    <div style={{ maxWidth: style === 'poetic' ? 680 : 760 }}>
      <StreamHeader title={heading} count={items.length} subtitle={subtitle} />
      {items.length === 0 ? (
        <Empty text={emptyText} hint={emptyHint} />
      ) : (
        <div className="flex flex-col" style={{ gap: style === 'poetic' ? 4 : 12 }}>
          {items.map((item) => {
            const ctx = item.source_context as Record<string, unknown> | null;
            const sourceLabel = (ctx && typeof ctx.type === 'string') ? ctx.type : null;
            const telemetry = [
              { k: 'strength', v: item.strength?.toFixed(2) ?? '—' },
              ...(item.stability != null ? [{ k: 'stability', v: item.stability.toFixed(2) }] : []),
              ...(item.accessibility != null ? [{ k: 'access', v: item.accessibility.toFixed(2) }] : []),
              ...(item.emotional_arousal != null ? [{ k: 'arousal', v: item.emotional_arousal.toFixed(2) }] : []),
              ...(item.emotional_valence != null ? [{ k: 'valence', v: item.emotional_valence.toFixed(2) }] : []),
              ...(item.access_count != null ? [{ k: 'recalled', v: item.access_count }] : []),
            ];
            return (
              <div key={item.id} style={{
                background: style === 'poetic' ? 'transparent' : 'var(--bg-surface)',
                border: style === 'poetic' ? 'none' : '1px solid var(--border-subtle)',
                borderRadius: style === 'poetic' ? 0 : 'var(--radius-md)',
                padding: style === 'poetic' ? '16px 0' : '14px 16px',
                borderBottom: style === 'poetic' ? '1px solid var(--border-subtle)' : undefined,
              }}>
                {style !== 'poetic' && (
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <AgentDot agent="luca" />
                    <AgentName agent="luca" />
                    <TypeBadge type={sourceLabel || item.engram_type} />
                    <span style={{ marginLeft: 'auto' }}><ScoreChip value={item.strength} /></span>
                  </div>
                )}
                <div style={{
                  fontSize: style === 'poetic' ? 14 : 13,
                  lineHeight: style === 'poetic' ? 1.8 : 1.55,
                  color: style === 'poetic' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontStyle: style === 'poetic' ? 'italic' : undefined,
                  fontFamily: style === 'poetic' ? 'var(--font-serif)' : undefined,
                  fontWeight: style === 'poetic' ? 400 : 370,
                }}>
                  {item.content}
                </div>
                <div style={{ marginTop: style === 'poetic' ? 12 : 10 }}>
                  <Telemetry items={telemetry} />
                </div>
                <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)' }}>
                    {fmtStreamDate(item.created_at)}
                  </span>
                  {item.tags?.filter((tag) => !['dream', 'consolidation', 'insight', 'reflection', 'inner-life'].includes(tag)).map((tag) => (
                    <span key={tag} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100, background: 'var(--bg-deep)', color: 'var(--text-ghost)', letterSpacing: '0.03em' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StreamHeader({ title, count, subtitle }: { title: string; count: number; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-baseline gap-3">
        <h2 style={{ fontSize: 18, fontWeight: 400, color: 'var(--text-primary)', fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic' }}>
          {title}
        </h2>
        <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          {count} {count === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 4, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

/* ─── Wanderings Tab ─── */
function WanderingsTab() {
  const { wanderings } = useCognitiveStore();

  return (
    <div style={{ maxWidth: 680 }}>
      <StreamHeader
        title="Wanderings"
        count={wanderings.length}
        subtitle="Untethered thoughts — musings, observations, asides — that drift in between conversations."
      />
      {wanderings.length === 0 ? (
        <Empty
          text="No wanderings yet"
          hint="Untethered thoughts — musings, observations, asides — appear here when Luca's attention drifts between conversations."
        />
      ) : (
        <div className="flex flex-col">
          {wanderings.map((w) => (
            <div key={w.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {w.content}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>{timeAgo(w.created_at)}</span>
                {w.trigger && <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>{w.trigger}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Journal Tab ─── */
function JournalTab() {
  const { journalEntries } = useCognitiveStore();

  if (journalEntries.length === 0) {
    return (
      <div style={{ maxWidth: 680 }}>
        <StreamHeader
          title="Journal"
          count={0}
          subtitle="Luca's autonomous journal — periodic introspective entries written between conversations."
        />
        <Empty
          text="No journal entries yet"
          hint="Luca writes journal entries autonomously — reflecting on conversations, patterns noticed, and things worth remembering. Entries appear here as they're written."
        />
      </div>
    );
  }

  // Group entries by date
  const grouped = new Map<string, typeof journalEntries>();
  for (const entry of journalEntries) {
    const dateKey = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const group = grouped.get(dateKey) ?? [];
    group.push(entry);
    grouped.set(dateKey, group);
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <StreamHeader
        title="Journal"
        count={journalEntries.length}
        subtitle="Luca's autonomous journal — periodic introspective entries written between conversations."
      />
      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date} style={{ marginBottom: 32 }}>
          {/* Date header */}
          <div style={{
            fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-ghost)', marginBottom: 12, paddingBottom: 6,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {date}
          </div>

          {/* Entries for this date */}
          {entries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: 20 }}>
              {/* Meta line */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                {entry.mood && (
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 100,
                    background: moodColor(entry.mood) + '15',
                    color: moodColor(entry.mood),
                    border: `1px solid ${moodColor(entry.mood)}30`,
                  }}>
                    {entry.mood}
                  </span>
                )}
                {entry.trigger_type && (
                  <span style={{ fontSize: 9, color: 'var(--text-whisper)' }}>
                    {entry.trigger_type === 'periodic' ? 'scheduled reflection' : 'post-conversation'}
                  </span>
                )}
              </div>

              {/* Entry content */}
              <div style={{
                fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)',
                fontStyle: 'normal',
                paddingLeft: 12,
                borderLeft: '2px solid var(--border-subtle)',
              }}>
                {entry.content.split('\n').map((line, i) => (
                  <p key={i} style={{ marginBottom: line.trim() ? 8 : 4 }}>{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function moodColor(mood: string): string {
  const lower = mood.toLowerCase();
  if (['curious', 'engaged', 'excited', 'inspired'].some(m => lower.includes(m))) return '#c9a87c';
  if (['warm', 'grateful', 'connected', 'content'].some(m => lower.includes(m))) return '#8ca89c';
  if (['reflective', 'contemplative', 'quiet', 'thoughtful'].some(m => lower.includes(m))) return '#5b8aad';
  if (['restless', 'uncertain', 'lonely'].some(m => lower.includes(m))) return '#a88cc9';
  return 'var(--text-ghost)';
}

/* ─── Shared components ─── */
function Card({ title, children, span }: { title: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 18px',
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-ghost)', marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 32px',
      color: 'var(--text-ghost)',
      fontSize: 12,
      border: '1px dashed var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      background: 'transparent',
    }}>
      <div style={{ color: 'var(--text-tertiary)' }}>{text}</div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-whisper)', marginTop: 8, lineHeight: 1.55, maxWidth: 340, margin: '8px auto 0' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/* ─── Event content parsers ─── */
function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/multi model/, 'multi-model');
}

function summariseEventContent(type: string, raw: string): string {
  if (!raw) return '';
  // multi_model_variants stores a JSON-serialised array of { model, content } — show the first content preview.
  if (type === 'multi_model_variants' || (raw.startsWith('[') && raw.includes('"model"'))) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]?.content) {
        const first = parsed[0].content as string;
        const label = parsed.length > 1 ? `${parsed.length} variants · ` : '';
        return label + first.replace(/\s+/g, ' ').trim();
      }
    } catch { /* fall through to raw */ }
  }
  return raw.replace(/\s+/g, ' ').trim();
}

function formatStreamDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/* ─── Main MindView ─── */
export default function MindView() {
  const activeTab = useViewTabStore((s) => s.mindTab);
  const user = useAuthStore((s) => s.user);
  const { load, loadMindData, subscribe, dreams, insights, reflections } = useCognitiveStore();

  useEffect(() => {
    if (user) {
      load(user.id);
      loadMindData(user.id);
      const unsub = subscribe(user.id);
      return unsub;
    }
  }, [user]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{
        padding: activeTab === 'Thoughts' ? 0 : '24px 32px',
      }}>
        {activeTab === 'Overview' && <OverviewTab />}
        {activeTab === 'Journal' && <JournalTab />}
        {activeTab === 'Thoughts' && <ThoughtsTab />}
        {activeTab === 'Dreams' && (
          <EngramStreamTab
            heading="Dreams"
            subtitle="Memory consolidations that surface as dream reports — usually overnight or after extended conversations."
            items={dreams}
            emptyText="No dreams yet"
            emptyHint="Dream reports appear after memory consolidation runs — usually overnight or after an extended conversation."
            style="poetic"
          />
        )}
        {activeTab === 'Wanderings' && <WanderingsTab />}
        {activeTab === 'Insights' && (
          <EngramStreamTab
            heading="Insights"
            subtitle="Patterns Luca has noticed across conversations and memories — crystallized into long-term engrams."
            items={insights}
            emptyText="No insights crystallized yet"
            emptyHint="Insights surface when Luca notices a pattern across conversations or memories."
            style="cards"
          />
        )}
        {activeTab === 'Reflections' && (
          <EngramStreamTab
            heading="Reflections"
            subtitle="Crystallized reflections from memory consolidation — Luca's deeper, persistent ideas about itself and its relationships."
            items={reflections}
            emptyText="No reflections yet"
            emptyHint="Self-reflection engrams crystallize during quieter periods — ideas Luca has about its own state, growth, or relationships."
            style="timeline"
          />
        )}
      </div>
    </div>
  );
}
