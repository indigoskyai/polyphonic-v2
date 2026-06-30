import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, Database, ExternalLink, FlaskConical, Maximize2, Save, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Artifact } from '@/stores/artifactStore';
import { useAuthStore } from '@/stores/authStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useResearchStore } from '@/stores/researchStore';
import { useToast } from '@/hooks/use-toast';
import {
  parseSimulationArtifactContent,
  type SimulationArtifactPayload,
  type SimulationPreset,
} from '@/lib/simulationArtifacts';

interface SimulationCardProps {
  artifact: Artifact;
  compact?: boolean;
  fill?: boolean;
  streaming?: boolean;
  inCanvas?: boolean;
}

export default function SimulationCard({
  artifact,
  compact = false,
  fill = false,
  streaming = false,
  inCanvas = false,
}: SimulationCardProps) {
  const parsed = useMemo(() => parseSimulationArtifactContent(artifact.content), [artifact.content]);

  if (!parsed.ok) {
    return streaming
      ? <SimulationBuildingCard compact={compact} />
      : <SimulationErrorCard error={parsed.error} details={parsed.details || []} content={artifact.content} />;
  }

  return (
    <SimulationInstrument
      artifact={artifact}
      payload={parsed.payload}
      compact={compact}
      fill={fill}
      streaming={streaming}
      inCanvas={inCanvas}
    />
  );
}

function SimulationInstrument({
  artifact,
  payload,
  compact,
  fill,
  streaming,
  inCanvas,
}: {
  artifact: Artifact;
  payload: SimulationArtifactPayload;
  compact: boolean;
  fill: boolean;
  streaming: boolean;
  inCanvas: boolean;
}) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const user = useAuthStore((s) => s.user);
  const openCanvas = useCanvasStore((s) => s.open);
  const saveSimulationTruthCard = useResearchStore((s) => s.saveSimulationTruthCard);
  const saving = useResearchStore((s) => s.saving);
  const { toast } = useToast();
  const [timestep, setTimestep] = useState(38);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!compact || fill || inCanvas);
  const [enabledFields, setEnabledFields] = useState<Set<string>>(() => new Set(payload.preview.fields));
  const [parameters, setParameters] = useState<Record<string, number>>(payload.preview.parameters);

  useEffect(() => {
    setEnabledFields(new Set(payload.preview.fields));
    setParameters(payload.preview.parameters);
    setTimestep(Math.round((payload.preview.initial_state.timestep ?? 0.38) * 100));
  }, [payload]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let raf = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(280, Math.floor(rect.width));
      const height = Math.max(220, Math.floor(rect.height));
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSimulation(context, width, height, payload.preview.preset, timestep / 100, enabledFields, parameters, performance.now() / 1000);
      raf = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(raf);
  }, [payload.preview.preset, timestep, enabledFields, parameters]);

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function saveTruthCard() {
    if (!user?.id) {
      toast({ title: 'Sign in required', description: 'Simulation truth cards save to your Research Lab.' });
      return;
    }
    try {
      await saveSimulationTruthCard({
        userId: user.id,
        payload,
        artifactId: artifact.id.startsWith('stream-') || artifact.id.startsWith('local-') ? null : artifact.id,
        threadId: artifact.thread_id,
        sourceMessageId: artifact.source_message_id,
      });
      setSaved(true);
      toast({ title: 'Truth card saved', description: `${payload.dataset.label} is now in the Research Lab.` });
    } catch (error) {
      toast({
        title: 'Truth card not saved',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  const compactSurface = compact && !fill;
  const visibleParameters = Object.entries(parameters).slice(0, compactSurface && !detailsOpen ? 2 : 4);
  const height = fill ? '100%' : undefined;
  const minHeight = fill ? 0 : undefined;
  const datasetName = compactDatasetName(payload);
  const evidenceLevel = payload.evidence.evidence_level.replace(/-/g, ' ');
  const primaryCaveat = payload.evidence.caveats[0] || 'Preview is qualitative until a separate raw-data analysis pipeline is configured.';
  const rawIngest = payload.access.raw_ingest_default ? 'raw ingest on' : 'metadata first';

  return (
    <section
      className="simulation-card"
      data-testid="simulation-card"
      style={{
        ...cardStyle,
        width: fill ? '100%' : cardStyle.width,
        height,
        minHeight,
        overflow: fill ? 'auto' : cardStyle.overflow,
        marginTop: fill ? 0 : 14,
      }}
    >
      <div style={headerStyle}>
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <div style={metaRowStyle}>
            <div style={eyebrowStyle}>
              <FlaskConical size={13} strokeWidth={1.7} />
              Inline simulation
              {streaming && <span style={liveDotStyle} />}
            </div>
            <span style={evidencePillStyle}>{evidenceLevel}</span>
          </div>
          <h3 style={titleStyle}>{payload.title}</h3>
          <p style={questionStyle}>{payload.question}</p>
        </div>
        <a
          href={payload.dataset.docs_url}
          target="_blank"
          rel="noopener noreferrer"
          style={datasetPillStyle}
          title={`${payload.dataset.label} · ${payload.dataset.access_name}`}
        >
          <Database size={13} />
          <span>{datasetName}</span>
        </a>
      </div>

      <div style={fill ? viewportFillStyle : viewportStyle}>
        <canvas ref={canvasRef} data-testid="simulation-canvas" style={fill ? canvasFillStyle : canvasStyle} />
        <div style={viewportOverlayStyle}>
          <span>{payload.preview.preset}</span>
          <span>t {String(timestep).padStart(3, '0')}</span>
        </div>
      </div>

      <div style={controlsStyle}>
        <div style={controlClusterStyle}>
          <div style={labelStyle}>Fields</div>
          <div style={chipWrapStyle}>
            {payload.preview.fields.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => {
                  setEnabledFields((current) => {
                    const next = new Set(current);
                    if (next.has(field) && next.size > 1) next.delete(field);
                    else next.add(field);
                    return next;
                  });
                }}
                style={fieldChipStyle(enabledFields.has(field))}
              >
                {field}
              </button>
            ))}
          </div>
        </div>

        <label style={controlGroupStyle}>
          <span style={sliderHeaderStyle}>
            <span style={labelStyle}>Timestep</span>
            <span style={valueStyle}>{(timestep / 100).toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={timestep}
            onChange={(event) => setTimestep(Number(event.target.value))}
            style={rangeStyle}
          />
        </label>

        {visibleParameters.length > 0 && (
          <div style={parametersStyle}>
            <div style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <SlidersHorizontal size={12} />
              Parameters
            </div>
            <div style={parameterGridStyle}>
              {visibleParameters.map(([key, value]) => {
                const max = Math.max(1, Math.abs(value) * 2, 2);
                return (
                  <label key={key} style={paramStyle}>
                    <span style={sliderHeaderStyle}>
                      <span>{key}</span>
                      <span style={valueStyle}>{Number(value).toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={0.01}
                      value={value}
                      onChange={(event) => setParameters((current) => ({ ...current, [key]: Number(event.target.value) }))}
                      style={rangeStyle}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={summaryStripStyle}>
        <div style={summaryCellStyle}>
          <span style={labelStyle}>Dataset</span>
          <strong style={summaryValueStyle}>{datasetName}</strong>
        </div>
        <div style={summaryCellStyle}>
          <span style={labelStyle}>Evidence</span>
          <strong style={summaryValueStyle}>{evidenceLevel}</strong>
        </div>
        <div style={summaryCellStyle}>
          <span style={labelStyle}>Access</span>
          <strong style={summaryValueStyle}>{rawIngest}</strong>
        </div>
      </div>

      <div style={evidencePanelStyle}>
        <button type="button" style={detailsToggleStyle} onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>
          <span>
            <span style={labelStyle}>Evidence boundary</span>
            <span style={detailsPreviewStyle}>{detailsOpen ? 'Dataset facts, caveats, and access plan' : payload.evidence.claim_boundary}</span>
          </span>
          <ChevronDown size={14} style={{ transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms var(--ease-out)' }} />
        </button>

        {detailsOpen && (
          <div style={detailsGridStyle(compactSurface)}>
            <section style={detailBlockStyle}>
              <div style={labelStyle}>Boundary</div>
              <p style={boundaryTextStyle}>{payload.evidence.claim_boundary}</p>
            </section>
            <section style={detailBlockStyle}>
              <div style={labelStyle}>Measurements</div>
              <div style={chipWrapStyle}>
                {payload.evidence.measurements.slice(0, 5).map((measurement) => (
                  <span key={measurement} style={measurementChipStyle}>{measurement}</span>
                ))}
              </div>
            </section>
            <section style={detailBlockStyle}>
              <div style={labelStyle}>Caveat</div>
              <p style={boundaryTextStyle}>{primaryCaveat}</p>
            </section>
            <section style={detailBlockStyle}>
              <div style={labelStyle}>Access</div>
              <p style={monoTextStyle}>{payload.access.download_command}</p>
            </section>
          </div>
        )}
      </div>

      <div style={actionRowStyle}>
        <button type="button" style={primaryActionButtonStyle} onClick={saveTruthCard} disabled={saving || streaming || saved}>
          {saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? 'Saved' : saving ? 'Saving' : 'Save truth card'}
        </button>
        {!inCanvas && !streaming && (
          <button type="button" style={actionButtonStyle} onClick={() => openCanvas(artifact.id)}>
            <Maximize2 size={13} />
            Open canvas
          </button>
        )}
        <button type="button" style={actionButtonStyle} onClick={() => navigate('/research')}>
          <ExternalLink size={13} />
          Research Lab
        </button>
        <button type="button" style={actionButtonStyle} onClick={copyConfig}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy config'}
        </button>
      </div>
    </section>
  );
}

function compactDatasetName(payload: SimulationArtifactPayload): string {
  const access = payload.dataset.access_name
    .replace(/^the_well\./, '')
    .replace(/^hf:\/\/datasets\/polymathic-ai\//, '')
    .replace(/\/v\d+\/(train|valid|test)$/, '');
  return access || payload.dataset.family_id || payload.dataset.label;
}

function SimulationBuildingCard({ compact }: { compact: boolean }) {
  return (
    <section className="simulation-card" data-testid="simulation-card-building" style={{ ...cardStyle, height: compact ? 260 : 340, marginTop: 14 }}>
      <div style={eyebrowStyle}>
        <FlaskConical size={13} />
        Building simulation
        <span style={liveDotStyle} />
      </div>
      <div style={{ ...viewportStyle, marginTop: 14, minHeight: 190 }}>
        <div style={buildingGridStyle} />
      </div>
      <p style={boundaryTextStyle}>Luca is assembling a deterministic preview and evidence boundary.</p>
    </section>
  );
}

function SimulationErrorCard({ error, details, content }: { error: string; details: string[]; content: string }) {
  return (
    <section className="simulation-card" data-testid="simulation-card-error" style={{ ...cardStyle, marginTop: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
        <AlertTriangle size={16} />
        <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>Simulation could not render</span>
      </div>
      <p style={boundaryTextStyle}>{error}</p>
      {details.length > 0 && <pre style={errorPreStyle}>{details.join('\n')}</pre>}
      <pre style={errorPreStyle}>{content.slice(0, 800)}</pre>
    </section>
  );
}

function drawSimulation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: SimulationPreset,
  timestep: number,
  fields: Set<string>,
  parameters: Record<string, number>,
  clock: number,
) {
  ctx.clearRect(0, 0, width, height);
  const t = timestep * Math.PI * 2 + clock * 0.22;
  drawBase(ctx, width, height);
  if (preset === 'wave-scattering') drawWave(ctx, width, height, t, fields, parameters);
  else if (preset === 'reaction-diffusion') drawReaction(ctx, width, height, t, fields, parameters);
  else if (preset === 'field-lines') drawFieldLines(ctx, width, height, t, fields, parameters);
  else if (preset === 'particle-shell') drawParticleShell(ctx, width, height, t, fields, parameters);
  else drawFluid(ctx, width, height, t, fields, parameters);
}

function drawBase(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101216');
  gradient.addColorStop(0.55, '#07080a');
  gradient.addColorStop(1, '#13100d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawFluid(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, fields: Set<string>, parameters: Record<string, number>) {
  const contrast = parameters.contrast ?? parameters.cooling ?? 1;
  const cols = 58;
  const rows = 34;
  const cw = width / cols;
  const rh = height / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i / cols;
      const y = j / rows;
      const v = Math.sin((x * 9 + t) * 1.8) + Math.cos((y * 13 - t) * 1.2) + Math.sin((x + y) * 18 + t * 0.7);
      const a = Math.max(0, Math.min(1, 0.45 + v * 0.13 * contrast));
      ctx.fillStyle = fields.has('pressure') ? `rgba(122,170,210,${a * 0.42})` : `rgba(210,168,116,${a * 0.48})`;
      ctx.fillRect(i * cw, j * rh, cw + 0.5, rh + 0.5);
    }
  }
  if (fields.has('velocity')) drawVectors(ctx, width, height, t);
}

function drawWave(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, fields: Set<string>, parameters: Record<string, number>) {
  const cx = width * 0.36;
  const cy = height * 0.52;
  const speed = parameters.speed ?? 1;
  ctx.strokeStyle = 'rgba(108,169,213,0.72)';
  ctx.lineWidth = 1.4;
  for (let r = 22; r < width; r += 31) {
    ctx.beginPath();
    ctx.arc(cx, cy, (r + t * 18 * speed) % (width * 0.82), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,185,116,0.75)';
  for (let i = 0; i < 9; i++) {
    const x = width * (0.55 + 0.25 * Math.sin(i * 1.7));
    const y = height * (0.22 + i * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, 9 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (fields.has('pressure')) drawGlow(ctx, width * 0.68, height * 0.52, width * 0.22, 'rgba(115,165,210,0.23)');
}

function drawReaction(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, _fields: Set<string>, parameters: Record<string, number>) {
  const rate = parameters.feed ?? parameters.rate ?? 1;
  for (let i = 0; i < 85; i++) {
    const a = i * 2.399;
    const r = Math.sqrt(i / 85) * Math.min(width, height) * 0.46;
    const x = width / 2 + Math.cos(a + t * 0.15) * r;
    const y = height / 2 + Math.sin(a - t * 0.11) * r;
    const pulse = 0.5 + 0.5 * Math.sin(t * rate + i);
    ctx.fillStyle = `rgba(${90 + pulse * 120}, ${132 + pulse * 76}, ${156 + pulse * 40}, ${0.16 + pulse * 0.34})`;
    ctx.beginPath();
    ctx.arc(x, y, 5 + pulse * 13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFieldLines(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, fields: Set<string>, parameters: Record<string, number>) {
  const strength = parameters.field_strength ?? 1;
  for (let line = 0; line < 22; line++) {
    ctx.beginPath();
    for (let step = 0; step < 120; step++) {
      const x = (step / 119) * width;
      const y = height * (line + 0.8) / 23 + Math.sin(step * 0.08 + line * 0.6 + t) * 22 * strength;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = fields.has('magnetic field') ? 'rgba(116,178,218,0.62)' : 'rgba(218,178,116,0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  drawGlow(ctx, width * 0.5, height * 0.5, Math.min(width, height) * 0.23, 'rgba(116,178,218,0.16)');
}

function drawParticleShell(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, _fields: Set<string>, parameters: Record<string, number>) {
  const expansion = parameters.expansion ?? 1;
  const cx = width / 2;
  const cy = height / 2;
  for (let i = 0; i < 180; i++) {
    const a = i * 2.39996;
    const shell = 0.34 + 0.2 * Math.sin(i * 0.17 + t) + 0.18 * expansion;
    const r = Math.min(width, height) * shell;
    const x = cx + Math.cos(a) * r * (0.9 + 0.12 * Math.sin(t + i));
    const y = cy + Math.sin(a) * r * (0.72 + 0.12 * Math.cos(t * 0.8 + i));
    ctx.fillStyle = i % 5 === 0 ? 'rgba(112,170,218,0.74)' : 'rgba(225,178,116,0.44)';
    ctx.fillRect(x, y, 1.8, 1.8);
  }
  drawGlow(ctx, cx, cy, Math.min(width, height) * 0.14, 'rgba(225,178,116,0.22)');
}

function drawVectors(ctx: CanvasRenderingContext2D, width: number, height: number, t: number) {
  ctx.strokeStyle = 'rgba(235,235,232,0.34)';
  ctx.lineWidth = 1;
  for (let x = 24; x < width; x += 42) {
    for (let y = 24; y < height; y += 42) {
      const a = Math.sin(x * 0.015 + y * 0.012 + t) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      ctx.stroke();
    }
  }
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  width: 'min(100%, 760px)',
  border: '1px solid var(--border-faint)',
  borderRadius: 14,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))',
  boxShadow: 'var(--shadow-inset-highlight), 0 22px 80px -64px rgba(0,0,0,0.85)',
  overflow: 'hidden',
  padding: 16,
};

const headerStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexShrink: 0, flexWrap: 'wrap' };
const metaRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' };
const eyebrowStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, color: 'rgba(96,165,250,0.88)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase' };
const evidencePillStyle: CSSProperties = { border: '1px solid rgba(96,165,250,0.22)', borderRadius: 999, background: 'rgba(96,165,250,0.065)', color: 'rgba(96,165,250,0.82)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', padding: '3px 7px', textTransform: 'uppercase' };
const titleStyle: CSSProperties = { margin: '8px 0 0', color: 'var(--text-primary)', fontSize: 19, lineHeight: 1.12, fontWeight: 430, letterSpacing: 0 };
const questionStyle: CSSProperties = { margin: '7px 0 0', color: 'var(--text-tertiary)', fontSize: 12.5, lineHeight: 1.45, maxWidth: 580 };
const datasetPillStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 'min(100%, 238px)', padding: '7px 9px', border: '1px solid var(--border-faint)', borderRadius: 10, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.14)', fontFamily: 'var(--font-mono)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 1 };
const viewportStyle: CSSProperties = { position: 'relative', minHeight: 238, aspectRatio: '2.06 / 1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', background: 'var(--floor)', minWidth: 0, boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' };
const canvasStyle: CSSProperties = { width: '100%', height: '100%', minHeight: 238, display: 'block' };
const viewportFillStyle: CSSProperties = { ...viewportStyle, height: 'clamp(320px, 45vh, 520px)', minHeight: 320, aspectRatio: undefined, flexShrink: 0 };
const canvasFillStyle: CSSProperties = { ...canvasStyle, minHeight: 0 };
const viewportOverlayStyle: CSSProperties = { position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', justifyContent: 'space-between', color: 'rgba(235,235,232,0.62)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase', pointerEvents: 'none' };
const controlsStyle: CSSProperties = { display: 'grid', alignContent: 'start', gap: 14, minWidth: 0 };
const controlClusterStyle: CSSProperties = { display: 'grid', gap: 8 };
const labelStyle: CSSProperties = { color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase' };
const chipWrapStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const fieldChipStyle = (active: boolean): CSSProperties => ({ border: `1px solid ${active ? 'rgba(96,165,250,0.48)' : 'var(--border-faint)'}`, borderRadius: 999, background: active ? 'rgba(96,165,250,0.105)' : 'rgba(255,255,255,0.025)', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 11.5, lineHeight: 1, padding: '7px 10px', cursor: 'pointer' });
const controlGroupStyle: CSSProperties = { display: 'grid', gap: 8 };
const sliderHeaderStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 };
const valueStyle: CSSProperties = { color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10.5 };
const rangeStyle: CSSProperties = { width: '100%', accentColor: 'rgb(96,165,250)' };
const parametersStyle: CSSProperties = { display: 'grid', gap: 10 };
const parameterGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 14px' };
const paramStyle: CSSProperties = { display: 'grid', gap: 6, color: 'var(--text-tertiary)', fontSize: 11.5, minWidth: 0 };
const summaryStripStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1.18fr 0.91fr 0.91fr', gap: 8, flexShrink: 0 };
const summaryCellStyle: CSSProperties = { minWidth: 0, border: '1px solid var(--border-faint)', borderRadius: 10, background: 'rgba(255,255,255,0.022)', padding: '9px 10px', display: 'grid', gap: 5 };
const summaryValueStyle: CSSProperties = { minWidth: 0, color: 'var(--text-secondary)', fontWeight: 420, fontSize: 12, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const evidencePanelStyle: CSSProperties = { border: '1px solid var(--border-faint)', borderRadius: 12, background: 'rgba(0,0,0,0.10)', overflow: 'hidden' };
const detailsToggleStyle: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 0, background: 'transparent', color: 'var(--text-secondary)', textAlign: 'left', padding: '11px 12px', cursor: 'pointer' };
const detailsPreviewStyle: CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginTop: 4, color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.45, overflow: 'hidden' };
const detailsGridStyle = (stacked: boolean): CSSProperties => ({ display: 'grid', gridTemplateColumns: stacked ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 0, borderTop: '1px solid var(--border-faint)' });
const detailBlockStyle: CSSProperties = { minWidth: 0, padding: 12, borderRight: '1px solid rgba(255,255,255,0.045)', borderBottom: '1px solid rgba(255,255,255,0.045)' };
const boundaryTextStyle: CSSProperties = { margin: '7px 0 0', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.55 };
const monoTextStyle: CSSProperties = { margin: '7px 0 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, overflowWrap: 'anywhere' };
const measurementChipStyle: CSSProperties = { border: '1px solid rgba(110,160,210,0.32)', borderRadius: 999, color: 'rgb(164,198,228)', background: 'rgba(78,135,190,0.10)', fontSize: 11, padding: '5px 8px' };
const actionRowStyle: CSSProperties = { display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0 };
const actionButtonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-faint)', borderRadius: 9, background: 'rgba(255,255,255,0.035)', color: 'var(--text-tertiary)', fontSize: 11.5, padding: '8px 10px', cursor: 'pointer' };
const primaryActionButtonStyle: CSSProperties = { ...actionButtonStyle, color: 'var(--text-secondary)', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.26)' };
const liveDotStyle: CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-soft)', boxShadow: '0 0 12px rgba(96,165,250,0.6)' };
const buildingGridStyle: CSSProperties = { width: '100%', height: '100%', background: 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(96,165,250,0.11), rgba(255,255,255,0.03))', backgroundSize: '220% 100%', animation: 'artifactDots 1.6s ease-in-out infinite' };
const errorPreStyle: CSSProperties = { margin: '10px 0 0', padding: 10, border: '1px solid var(--border-faint)', borderRadius: 8, background: 'var(--surface-muted)', color: 'var(--text-tertiary)', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
