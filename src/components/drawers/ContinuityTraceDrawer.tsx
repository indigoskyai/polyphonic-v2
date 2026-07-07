import React, { useEffect, useMemo, useState } from 'react';
import {
  DrawerBody,
  DrawerCloseBtn,
  DrawerCrumb,
  DrawerEscChip,
  DrawerHeader,
  DrawerSection,
  DrawerSectionLabel,
  DrawerTitle,
} from '@/components/ui/luca';
import { supabase } from '@/integrations/supabase/client';
import { useDrawerStore } from '@/stores/drawerStore';

type TraceStatus =
  | 'available'
  | 'retrieved'
  | 'written_after_turn'
  | 'queued'
  | 'skipped'
  | 'failed'
  | 'empty';

interface TraceItem {
  id?: string | null;
  status?: TraceStatus;
  excerpt?: string | null;
  score?: number | null;
  confidence?: number | null;
  activation?: number | null;
  timestamp?: string | null;
  agent_id?: string | null;
  thread_id?: string | null;
  source_message_id?: string | null;
  metadata?: Record<string, unknown>;
}

interface TraceLayer {
  key: string;
  label: string;
  status: TraceStatus;
  count: number;
  rendered?: number;
  note?: string | null;
  items: TraceItem[];
}

interface TraceContextSummary {
  schema_version?: number;
  generated_at?: string;
  agent_id?: string;
  thread_id?: string | null;
  focus?: string | null;
  safety_note?: string;
  layers?: TraceLayer[];
  diagnostics?: Array<{
    layer: string;
    status: string;
    count?: number | null;
    rendered?: number | null;
    message?: string | null;
    duration_ms?: number;
  }>;
}

interface TraceWriteOperation {
  name: string;
  status: TraceStatus;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  recorded_at?: string;
}

interface TraceWriteSummary {
  operations?: TraceWriteOperation[];
}

interface TraceRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  user_message_id: string | null;
  assistant_message_id: string | null;
  agent_id: string;
  model: string | null;
  runtime_mode: string | null;
  status: string;
  context_summary: TraceContextSummary | null;
  write_summary: TraceWriteSummary | null;
  created_at: string;
  updated_at: string;
}

const LAYER_ORDER = [
  'thread_history',
  'hypomnema',
  'mnemos_recall',
  'functional_memory',
  'autonomous_context',
  'beliefs',
];

function statusLabel(status: TraceStatus | string | undefined, agentId?: string | null): string {
  const actor = agentId === 'luca' || !agentId ? 'Luca' : 'agent';
  if (status === 'available') return `Available to ${actor}`;
  if (status === 'retrieved') return 'Retrieved';
  if (status === 'written_after_turn') return 'Written after turn';
  if (status === 'queued') return 'Queued';
  if (status === 'skipped') return 'Skipped';
  if (status === 'failed') return 'Failed';
  return 'Empty';
}

function shortId(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…`;
}

function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeAge(value: string | null | undefined): string | null {
  if (!value) return null;
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function metric(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(value >= 10 ? 0 : 2);
}

function metadataTags(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  const tags = metadata.tags || metadata.labels;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 4);
}

function metadataLine(item: TraceItem): string {
  const parts = [
    item.agent_id ? `agent ${item.agent_id}` : null,
    item.thread_id ? `thread ${shortId(item.thread_id)}` : null,
    item.source_message_id ? `message ${shortId(item.source_message_id)}` : null,
    item.timestamp ? `${relativeAge(item.timestamp)} ago` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function orderedLayers(layers: TraceLayer[]): TraceLayer[] {
  return [...layers].sort((a, b) => {
    const ai = LAYER_ORDER.indexOf(a.key);
    const bi = LAYER_ORDER.indexOf(b.key);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

function TraceBadge({ status, agentId }: { status: TraceStatus | string | undefined; agentId?: string | null }) {
  return (
    <span className={`continuity-trace-badge continuity-trace-badge--${status || 'empty'}`}>
      {statusLabel(status, agentId)}
    </span>
  );
}

function TraceItemRow({ item, agentId }: { item: TraceItem; agentId?: string | null }) {
  const tags = metadataTags(item.metadata);
  const values = [
    item.activation != null ? `activation ${metric(item.activation)}` : null,
    item.score != null ? `score ${metric(item.score)}` : null,
    item.confidence != null ? `confidence ${metric(item.confidence)}` : null,
  ].filter(Boolean);

  return (
    <div className="continuity-trace-item">
      <div className="continuity-trace-item-head">
        <TraceBadge status={item.status || 'available'} agentId={agentId} />
        {item.id && <span className="continuity-trace-id">{shortId(item.id)}</span>}
      </div>
      {item.excerpt && <div className="continuity-trace-excerpt">{item.excerpt}</div>}
      <div className="continuity-trace-meta" title={formatTime(item.timestamp) || undefined}>
        {metadataLine(item)}
      </div>
      {(values.length > 0 || tags.length > 0) && (
        <div className="continuity-trace-chips">
          {values.map((value) => <span key={value} className="continuity-trace-chip">{value}</span>)}
          {tags.map((tag) => <span key={tag} className="continuity-trace-chip">{tag}</span>)}
        </div>
      )}
    </div>
  );
}

function TraceLayerSection({ layer, agentId }: { layer: TraceLayer; agentId?: string | null }) {
  const countLabel = layer.rendered != null
    ? `${layer.rendered}/${layer.count}`
    : String(layer.count);

  return (
    <DrawerSection className="continuity-trace-section">
      <div className="continuity-trace-layer-head">
        <div>
          <DrawerSectionLabel>{layer.label}</DrawerSectionLabel>
          {layer.note && <p className="continuity-trace-note">{layer.note}</p>}
        </div>
        <div className="continuity-trace-layer-state">
          <TraceBadge status={layer.status} agentId={agentId} />
          <span className="continuity-trace-count">{countLabel}</span>
        </div>
      </div>
      {layer.items.length > 0 ? (
        <div className="continuity-trace-list">
          {layer.items.map((item, index) => (
            <TraceItemRow key={`${item.id || layer.key}-${index}`} item={item} agentId={agentId} />
          ))}
        </div>
      ) : (
        <div className="continuity-trace-empty">No surfaced items for this layer.</div>
      )}
    </DrawerSection>
  );
}

function WriteOperationRow({ operation, agentId }: { operation: TraceWriteOperation; agentId?: string | null }) {
  const detail = operation.detail || {};
  const detailValues = [
    typeof detail.salience === 'number' ? `salience ${metric(detail.salience)}` : null,
    typeof detail.skip_reason === 'string' ? `skip ${detail.skip_reason}` : null,
    typeof detail.force_reason === 'string' ? detail.force_reason : null,
    Array.isArray(detail.engram_ids) && detail.engram_ids.length > 0 ? `engram ${shortId(String(detail.engram_ids[0]))}` : null,
  ].filter(Boolean);

  return (
    <div className="continuity-trace-item">
      <div className="continuity-trace-item-head">
        <TraceBadge status={operation.status} agentId={agentId} />
        <span className="continuity-trace-id">{operation.name.replace(/_/g, ' ')}</span>
      </div>
      {operation.reason && <div className="continuity-trace-excerpt">{operation.reason}</div>}
      {operation.recorded_at && (
        <div className="continuity-trace-meta">{formatTime(operation.recorded_at)}</div>
      )}
      {detailValues.length > 0 && (
        <div className="continuity-trace-chips">
          {detailValues.map((value) => <span key={value} className="continuity-trace-chip">{value}</span>)}
        </div>
      )}
    </div>
  );
}

function TraceSkeleton() {
  return (
    <DrawerSection>
      <div className="continuity-trace-skeleton" />
      <div className="continuity-trace-skeleton short" />
      <div className="continuity-trace-skeleton" />
    </DrawerSection>
  );
}

export default function ContinuityTraceDrawer() {
  const close = useDrawerStore((s) => s.close);
  const payload = useDrawerStore((s) => s.payload);
  const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null;
  const [trace, setTrace] = useState<TraceRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTrace(null);
    setError(null);
    if (!messageId) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error: traceError } = await supabase
          .from('continuity_turn_traces')
          .select('id,user_id,thread_id,user_message_id,assistant_message_id,agent_id,model,runtime_mode,status,context_summary,write_summary,created_at,updated_at')
          .eq('assistant_message_id', messageId)
          .maybeSingle();
        if (!alive) return;
        if (traceError) {
          setError(traceError.message || 'Trace could not be loaded.');
        } else {
          setTrace((data as TraceRow | null) || null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Trace could not be loaded.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [messageId]);


  const context = trace?.context_summary || null;
  const layers = useMemo(() => orderedLayers(context?.layers || []), [context?.layers]);
  const writes = trace?.write_summary?.operations || [];
  const agentId = trace?.agent_id || context?.agent_id || null;

  return (
    <>
      <DrawerHeader>
        <div className="drawer-header-col">
          <DrawerCrumb label="Continuity" />
          <DrawerTitle>Continuity Trace</DrawerTitle>
        </div>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        <DrawerSection className="continuity-trace-intro">
          <p>
            Shows sanitized continuity context available for this response and memory writes recorded after the turn.
            It does not show private reasoning, raw prompts, hidden instructions, or API keys.
          </p>
          {trace && (
            <div className="continuity-trace-summary-row">
              <span>{agentId || 'agent'}</span>
              {trace.model && <span>{trace.model}</span>}
              {trace.runtime_mode && <span>{trace.runtime_mode}</span>}
              <span>{formatTime(trace.created_at)}</span>
            </div>
          )}
        </DrawerSection>

        {loading && <TraceSkeleton />}

        {!loading && error && (
          <DrawerSection>
            <div className="continuity-trace-empty">Continuity Trace could not load: {error}</div>
          </DrawerSection>
        )}

        {!loading && !error && !trace && (
          <DrawerSection>
            <div className="continuity-trace-empty">
              No Continuity Trace was captured for this message. Older turns and duplicate replays may not have trace rows.
            </div>
          </DrawerSection>
        )}

        {!loading && trace && layers.map((layer) => (
          <TraceLayerSection key={layer.key} layer={layer} agentId={agentId} />
        ))}

        {!loading && trace && (
          <DrawerSection className="continuity-trace-section">
            <div className="continuity-trace-layer-head">
              <div>
                <DrawerSectionLabel>After-Turn Writes</DrawerSectionLabel>
                <p className="continuity-trace-note">
                  Memory jobs queued after the response. Encodes may update after chat has already completed.
                </p>
              </div>
              <span className="continuity-trace-count">{writes.length}</span>
            </div>
            {writes.length > 0 ? (
              <div className="continuity-trace-list">
                {writes.map((operation, index) => (
                  <WriteOperationRow key={`${operation.name}-${operation.recorded_at || index}`} operation={operation} agentId={agentId} />
                ))}
              </div>
            ) : (
              <div className="continuity-trace-empty">No after-turn write results recorded yet.</div>
            )}
          </DrawerSection>
        )}
      </DrawerBody>
    </>
  );
}
