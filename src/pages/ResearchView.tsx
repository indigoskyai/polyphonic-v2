import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Archive,
  ArrowRight,
  BadgeCheck,
  Clipboard,
  Database,
  ExternalLink,
  FlaskConical,
  Gauge,
  HardDrive,
  MessageSquare,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  THE_WELL_API_URL,
  THE_WELL_BENCHMARKS_URL,
  THE_WELL_CATALOG,
  THE_WELL_DATASET_OVERVIEW_URL,
  THE_WELL_DATA_FORMAT_URL,
  buildDownloadCommand,
  buildStreamingSnippet,
  buildWellResearchPrompt,
  buildWellDatasetUrl,
  createWellTruthCard,
  formatSizeGb,
  getDatasetById,
  getPrimaryAccessName,
  getWellCatalogStats,
  rankWellDatasets,
  type WellDatasetFamily,
} from '@/lib/theWellCatalog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthStore } from '@/stores/authStore';
import { useResearchStore, type ResearchEvidenceCard } from '@/stores/researchStore';
import { useThreadStore } from '@/stores/threadStore';
import { useToast } from '@/hooks/use-toast';
import { stashChatHandoff } from '@/lib/guestChat';
import { useNavigate } from 'react-router-dom';

const EXAMPLE_QUESTIONS = [
  'How does turbulence change when radiation and cooling are included?',
  'Can we test whether a model preserves shock fronts in Euler flow?',
  'Show evidence for active matter self-organization from tensor fields.',
  'What is the smallest dataset Luca can use for a first physics probe?',
];

const PIPELINE = [
  'Claim',
  'Dataset',
  'Sample',
  'Measure',
  'Truth card',
];

export default function ResearchView() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const createThread = useThreadStore((s) => s.createThread);
  const cards = useResearchStore((s) => s.cards);
  const cardsLoading = useResearchStore((s) => s.loading);
  const cardSaving = useResearchStore((s) => s.saving);
  const cardsError = useResearchStore((s) => s.error);
  const loadCards = useResearchStore((s) => s.loadCards);
  const saveWellTruthCard = useResearchStore((s) => s.saveWellTruthCard);
  const archiveCard = useResearchStore((s) => s.archiveCard);
  const stats = useMemo(() => getWellCatalogStats(), []);
  const [query, setQuery] = useState(EXAMPLE_QUESTIONS[0]);
  const [selectedId, setSelectedId] = useState('turbulent_radiative_layer');
  const [copied, setCopied] = useState<'stream' | 'download' | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const rankedDatasets = useMemo(() => rankWellDatasets(query, 7), [query]);
  const selectedDataset = getDatasetById(selectedId) ?? rankedDatasets[0] ?? THE_WELL_CATALOG[0];
  const truthCard = useMemo(() => createWellTruthCard(query, selectedDataset), [query, selectedDataset]);
  const streamingSnippet = useMemo(() => buildStreamingSnippet(selectedDataset), [selectedDataset]);
  const downloadCommand = useMemo(() => buildDownloadCommand(selectedDataset), [selectedDataset]);

  useEffect(() => {
    if (user?.id) void loadCards(user.id);
  }, [user?.id, loadCards]);

  async function copyText(value: string, type: 'stream' | 'download') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  async function handleSaveTruthCard() {
    if (!user?.id) return;
    try {
      await saveWellTruthCard({ userId: user.id, truthCard, dataset: selectedDataset });
      toast({ title: 'Truth card saved', description: `${selectedDataset.label} is now in the Research Lab.` });
    } catch (error) {
      toast({
        title: 'Truth card not saved',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleOpenWithLuca() {
    if (!user?.id || openingChat) return;
    setOpeningChat(true);
    try {
      const prompt = buildWellResearchPrompt(truthCard, selectedDataset);
      stashChatHandoff(prompt);
      const threadId = await createThread(user.id, 'luca', null, { runtimeMode: 'agent' });
      navigate(`/chat/${threadId}`);
    } catch (error) {
      toast({
        title: 'Research chat not opened',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
      setOpeningChat(false);
    }
  }

  async function handleArchiveCard(card: ResearchEvidenceCard) {
    try {
      await archiveCard(card.id);
      toast({ title: 'Evidence card archived' });
    } catch (error) {
      toast({
        title: 'Evidence card not archived',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-y-auto"
      style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}
    >
      <div style={{ width: '100%', maxWidth: 1320, margin: '0 auto', padding: isMobile ? '24px 16px 96px' : '34px 28px 88px' }}>
        <header style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrowStyle}>
              <FlaskConical size={14} strokeWidth={1.7} />
              Research Lab
            </div>
            <h1 style={{ margin: '9px 0 0', color: 'var(--text-primary)', fontSize: isMobile ? 32 : 42, lineHeight: 1.02, letterSpacing: 'var(--track-tight)', fontWeight: 370 }}>
              The Well Registry
            </h1>
            <p style={{ margin: '14px 0 0', maxWidth: 760, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65 }}>
              Luca maps the physics catalog, ranks evidence sources, and keeps raw simulation data out of memory unless a future compute run is explicitly configured.
            </p>
          </div>
          <div style={boundaryStyle}>
            <HardDrive size={16} strokeWidth={1.6} />
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 520 }}>Default ingest: 0 GB raw tensors</div>
              <div style={{ color: 'var(--text-ghost)', fontSize: 11, marginTop: 3 }}>Catalog, metadata, provenance, and access paths are loaded first.</div>
            </div>
          </div>
        </header>

        <section style={metricsGridStyle(isMobile)}>
          <MetricCard icon={<Database size={16} />} label="Mapped data" value={stats.totalSizeLabel} detail="Official collection scale" />
          <MetricCard icon={<FlaskConical size={16} />} label="Families" value={String(stats.familyCount)} detail={`${stats.variantCount} exact access names`} />
          <MetricCard icon={<Gauge size={16} />} label="3D-capable sets" value={String(stats.threeDimensional)} detail="Including spherical and log-spherical grids" />
          <MetricCard icon={<BadgeCheck size={16} />} label="Evidence mode" value="Pointer-first" detail="Stream or cache per task" />
        </section>

        <main style={workspaceGridStyle(isMobile)}>
          <section style={surfaceStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={sectionLabelStyle}>Evidence query</div>
                <h2 style={sectionTitleStyle}>Find the right simulated world</h2>
              </div>
              <Search size={16} strokeWidth={1.7} style={{ color: 'var(--text-tertiary)' }} />
            </div>

            <label style={searchWrapStyle}>
              <Search size={15} strokeWidth={1.7} style={{ color: 'var(--text-ghost)', flexShrink: 0 }} />
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                rows={3}
                spellCheck={false}
                style={queryInputStyle}
                aria-label="Research question"
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {EXAMPLE_QUESTIONS.map((example) => (
                <button
                  type="button"
                  key={example}
                  onClick={() => setQuery(example)}
                  style={chipButtonStyle(query === example)}
                >
                  {example}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={sectionLabelStyle}>Ranked matches</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {rankedDatasets.map((dataset, index) => (
                  <DatasetRow
                    key={dataset.id}
                    dataset={dataset}
                    rank={index + 1}
                    active={selectedDataset.id === dataset.id}
                    onSelect={() => setSelectedId(dataset.id)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section style={surfaceStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={sectionLabelStyle}>Selected source</div>
                <h2 style={sectionTitleStyle}>{selectedDataset.label}</h2>
              </div>
              <a
                href={buildWellDatasetUrl(selectedDataset)}
                target="_blank"
                rel="noreferrer"
                style={iconLinkStyle}
                aria-label="Open dataset documentation"
                title="Open dataset documentation"
              >
                <ExternalLink size={15} />
              </a>
            </div>

            <div style={datasetMetaGridStyle}>
              <Meta label="Domain" value={selectedDataset.domain} />
              <Meta label="Grid" value={`${selectedDataset.coordinateSystem} ${selectedDataset.dimension}`} />
              <Meta label="Resolution" value={selectedDataset.resolution} />
              <Meta label="Steps" value={selectedDataset.nSteps} />
              <Meta label="Trajectories" value={selectedDataset.trajectories} />
              <Meta label="Size" value={formatSizeGb(selectedDataset.sizeGb)} />
            </div>

            <Band title="Fields">
              <PillList items={selectedDataset.fields} />
            </Band>

            <Band title="Phenomena">
              <PillList items={selectedDataset.phenomena} />
            </Band>

            <Band title="Access names">
              <div style={{ display: 'grid', gap: 8 }}>
                {selectedDataset.variants.map((variant) => (
                  <div key={variant.id} style={variantStyle}>
                    <code style={codeInlineStyle}>{variant.id}</code>
                    <span style={{ color: 'var(--text-ghost)', fontSize: 12 }}>{variant.sizeGb ? formatSizeGb(variant.sizeGb) : variant.note ?? variant.label}</span>
                  </div>
                ))}
              </div>
            </Band>

            <div style={recipeGridStyle}>
              <RecipeBlock
                title="Stream probe"
                value={streamingSnippet}
                copied={copied === 'stream'}
                onCopy={() => copyText(streamingSnippet, 'stream')}
              />
              <RecipeBlock
                title="Local cache"
                value={downloadCommand}
                copied={copied === 'download'}
                onCopy={() => copyText(downloadCommand, 'download')}
              />
            </div>
          </section>

          <aside style={surfaceStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={sectionLabelStyle}>Truth card</div>
                <h2 style={sectionTitleStyle}>What Luca would save</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleSaveTruthCard}
                  disabled={!user?.id || cardSaving}
                  style={smallActionButtonStyle}
                  title="Save truth card"
                >
                  <Save size={13} />
                  <span>{cardSaving ? 'Saving' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenWithLuca}
                  disabled={!user?.id || openingChat}
                  style={smallActionButtonStyle}
                  title="Open research chat with Luca"
                >
                  <MessageSquare size={13} />
                  <span>{openingChat ? 'Opening' : 'Ask'}</span>
                </button>
                <Sparkles size={16} strokeWidth={1.7} style={{ color: 'var(--accent-soft)', marginTop: 7 }} />
              </div>
            </div>

            <div style={truthStatementStyle}>
              <div style={sectionLabelStyle}>Question</div>
              <p style={{ margin: '8px 0 0', color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.55 }}>
                {truthCard.question}
              </p>
            </div>

            <Band title="Boundary">
              <p style={bodyTextStyle}>{truthCard.claimBoundary}</p>
            </Band>

            <Band title="Evidence loop">
              <ol style={orderedListStyle}>
                {truthCard.accessPlan.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Band>

            <Band title="Measurements">
              <PillList items={truthCard.measurements} tone="blue" />
            </Band>

            <Band title="Caveats">
              <ul style={unorderedListStyle}>
                {truthCard.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </Band>
          </aside>
        </main>

        <section style={lowerGridStyle(isMobile)}>
          <div style={wideSurfaceStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={sectionLabelStyle}>Luca research loop</div>
                <h2 style={sectionTitleStyle}>From claim to reproducible evidence</h2>
              </div>
            </div>
            <div style={pipelineStyle(isMobile)}>
              {PIPELINE.map((step, index) => (
                <div key={step} style={pipelineNodeStyle}>
                  <span style={pipelineIndexStyle}>{String(index + 1).padStart(2, '0')}</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{step}</span>
                  {index < PIPELINE.length - 1 && !isMobile && <ArrowRight size={14} strokeWidth={1.6} style={{ color: 'var(--text-ghost)', marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <SavedEvidencePanel
              cards={cards}
              loading={cardsLoading}
              error={cardsError}
              onOpen={(card) => {
                setQuery(card.question);
                setSelectedId(card.dataset_id);
              }}
              onArchive={handleArchiveCard}
            />

            <div style={surfaceStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={sectionLabelStyle}>Source docs</div>
                  <h2 style={sectionTitleStyle}>Grounding</h2>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 9 }}>
                <SourceLink href={THE_WELL_DATASET_OVERVIEW_URL} label="Dataset overview" />
                <SourceLink href={THE_WELL_DATA_FORMAT_URL} label="HDF5 data format" />
                <SourceLink href={THE_WELL_API_URL} label="WellDataset API" />
                <SourceLink href={THE_WELL_BENCHMARKS_URL} label="Benchmarks" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, color: 'var(--text-tertiary)' }}>
        <span style={sectionLabelStyle}>{label}</span>
        <span style={{ color: 'var(--accent-soft)' }}>{icon}</span>
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 370, marginTop: 13, letterSpacing: 'var(--track-tight)' }}>{value}</div>
      <div style={{ color: 'var(--text-ghost)', fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}

function DatasetRow({ dataset, rank, active, onSelect }: { dataset: WellDatasetFamily; rank: number; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} style={datasetRowStyle(active)}>
      <span style={rankStyle(active)}>{rank}</span>
      <span style={{ minWidth: 0, display: 'grid', gap: 4, textAlign: 'left' }}>
        <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dataset.label}
        </span>
        <span style={{ color: 'var(--text-ghost)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dataset.domain} · {dataset.resolution} · {formatSizeGb(dataset.sizeGb)}
        </span>
      </span>
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={metaStyle}>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={sectionLabelStyle}>{title}</div>
      <div style={{ marginTop: 9 }}>{children}</div>
    </section>
  );
}

function PillList({ items, tone = 'warm' }: { items: string[]; tone?: 'warm' | 'blue' }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {items.map((item) => (
        <span key={item} style={pillStyle(tone)}>{item}</span>
      ))}
    </div>
  );
}

function RecipeBlock({ title, value, copied, onCopy }: { title: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={recipeStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <div style={sectionLabelStyle}>{title}</div>
        <button type="button" onClick={onCopy} style={copyButtonStyle} aria-label={`Copy ${title}`}>
          <Clipboard size={13} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre style={preStyle}>{value}</pre>
    </div>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={sourceLinkStyle}>
      <span>{label}</span>
      <ExternalLink size={13} />
    </a>
  );
}

function SavedEvidencePanel({
  cards,
  loading,
  error,
  onOpen,
  onArchive,
}: {
  cards: ResearchEvidenceCard[];
  loading: boolean;
  error: string | null;
  onOpen: (card: ResearchEvidenceCard) => void;
  onArchive: (card: ResearchEvidenceCard) => void;
}) {
  const visibleCards = cards.slice(0, 5);

  return (
    <div style={surfaceStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <div style={sectionLabelStyle}>Saved evidence</div>
          <h2 style={sectionTitleStyle}>Truth cards</h2>
        </div>
        <span style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{cards.length}</span>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
        {loading && <p style={emptyTextStyle}>Loading cards...</p>}
        {error && <p style={errorTextStyle}>{error}</p>}
        {!loading && !error && visibleCards.length === 0 && (
          <p style={emptyTextStyle}>Save a truth card to preserve the dataset, access path, measurements, and caveats.</p>
        )}
        {visibleCards.map((card) => (
          <div key={card.id} style={savedCardStyle}>
            <button type="button" onClick={() => onOpen(card)} style={savedCardMainButtonStyle}>
              <span style={{ color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.35 }}>{card.title}</span>
              <span style={{ color: 'var(--text-ghost)', fontSize: 11, marginTop: 4 }}>{card.dataset_label} · {card.evidence_level}</span>
            </button>
            <button
              type="button"
              onClick={() => onArchive(card)}
              style={archiveButtonStyle}
              aria-label={`Archive ${card.title}`}
              title="Archive card"
            >
              <Archive size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 22,
  marginBottom: 22,
  flexWrap: 'wrap',
};

const eyebrowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--accent-soft)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 'var(--track-meta)',
  textTransform: 'uppercase',
};

const boundaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  maxWidth: 360,
  padding: '13px 14px',
  border: '1px solid var(--sage-border-focus)',
  borderRadius: 10,
  background: 'var(--sage-overlay-hover)',
  color: 'var(--accent-soft)',
};

const metricsGridStyle = (isMobile: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
  gap: 10,
  marginBottom: 14,
});

const workspaceGridStyle = (isMobile: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 0.78fr) minmax(380px, 1.08fr) minmax(320px, 0.9fr)',
  gap: 12,
  alignItems: 'start',
});

const lowerGridStyle = (isMobile: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(280px, 0.5fr)',
  gap: 12,
  marginTop: 12,
});

const surfaceStyle: CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 12,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.032), rgba(255,255,255,0.014))',
  boxShadow: 'var(--shadow-inset-highlight)',
  padding: 16,
  minWidth: 0,
};

const wideSurfaceStyle: CSSProperties = {
  ...surfaceStyle,
  padding: 18,
};

const metricCardStyle: CSSProperties = {
  ...surfaceStyle,
  padding: 14,
  minHeight: 118,
};

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 14,
};

const sectionLabelStyle: CSSProperties = {
  color: 'var(--text-ghost)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 'var(--track-meta)',
  textTransform: 'uppercase',
};

const sectionTitleStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--text-primary)',
  fontSize: 17,
  lineHeight: 1.2,
  fontWeight: 420,
  letterSpacing: 'var(--track-body-tight)',
};

const searchWrapStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 16,
  padding: 12,
  border: '1px solid var(--border-faint)',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.16)',
};

const queryInputStyle: CSSProperties = {
  width: '100%',
  resize: 'vertical',
  minHeight: 74,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  lineHeight: 1.55,
};

const chipButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? 'var(--sage-border-focus)' : 'var(--border-faint)'}`,
  borderRadius: 999,
  background: active ? 'var(--sage-overlay-hover)' : 'rgba(255,255,255,0.018)',
  color: active ? 'var(--text-primary)' : 'var(--text-soft)',
  padding: '6px 9px',
  fontSize: 11,
  lineHeight: 1.25,
  cursor: 'pointer',
  textAlign: 'left',
});

const datasetRowStyle = (active: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'center',
  width: '100%',
  minHeight: 54,
  padding: '9px 10px',
  border: `1px solid ${active ? 'var(--sage-border-focus)' : 'var(--border-faint)'}`,
  borderRadius: 9,
  background: active ? 'var(--sage-overlay-active)' : 'rgba(255,255,255,0.018)',
  cursor: 'pointer',
});

const rankStyle = (active: boolean): CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 7,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: active ? 'rgba(96, 165, 250, 0.14)' : 'rgba(255,255,255,0.035)',
  color: active ? 'var(--accent-soft)' : 'var(--text-ghost)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
});

const datasetMetaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
  gap: 8,
  marginTop: 16,
};

const metaStyle: CSSProperties = {
  minWidth: 0,
  padding: 10,
  border: '1px solid var(--border-faint)',
  borderRadius: 9,
  background: 'rgba(0,0,0,0.13)',
};

const pillStyle = (tone: 'warm' | 'blue'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  padding: '4px 8px',
  borderRadius: 999,
  border: `1px solid ${tone === 'blue' ? 'var(--blue-border)' : 'var(--border-faint)'}`,
  background: tone === 'blue' ? 'var(--blue-bg)' : 'rgba(255,255,255,0.022)',
  color: tone === 'blue' ? 'rgba(190,215,245,0.86)' : 'var(--text-secondary)',
  fontSize: 11,
  lineHeight: 1.2,
});

const variantStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
  minWidth: 0,
  padding: '8px 9px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.018)',
};

const codeInlineStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const recipeGridStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  marginTop: 18,
};

const recipeStyle: CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.16)',
  padding: 12,
  minWidth: 0,
};

const copyButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 8px',
  borderRadius: 7,
  border: '1px solid var(--border-faint)',
  background: 'rgba(255,255,255,0.025)',
  color: 'var(--text-tertiary)',
  fontSize: 11,
  cursor: 'pointer',
};

const smallActionButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 30,
  padding: '0 9px',
  borderRadius: 8,
  border: '1px solid var(--border-faint)',
  background: 'rgba(255,255,255,0.026)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
};

const preStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const truthStatementStyle: CSSProperties = {
  marginTop: 16,
  padding: 13,
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.024)',
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: 12,
  lineHeight: 1.58,
};

const orderedListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: 'var(--text-secondary)',
  fontSize: 12,
  lineHeight: 1.65,
};

const unorderedListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 17,
  color: 'var(--text-secondary)',
  fontSize: 12,
  lineHeight: 1.62,
};

const pipelineStyle = (isMobile: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, minmax(0, 1fr))',
  gap: 8,
  marginTop: 14,
});

const pipelineNodeStyle: CSSProperties = {
  minHeight: 54,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 11px',
  border: '1px solid var(--border-faint)',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.018)',
};

const pipelineIndexStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--accent-soft)',
};

const iconLinkStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--border-faint)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-tertiary)',
};

const sourceLinkStyle: CSSProperties = {
  minHeight: 34,
  padding: '0 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.018)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  textDecoration: 'none',
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-ghost)',
  fontSize: 12,
  lineHeight: 1.55,
};

const errorTextStyle: CSSProperties = {
  ...emptyTextStyle,
  color: 'var(--danger)',
};

const savedCardStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 30px',
  gap: 8,
  alignItems: 'stretch',
  minWidth: 0,
};

const savedCardMainButtonStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 50,
  display: 'grid',
  alignContent: 'center',
  textAlign: 'left',
  border: '1px solid var(--border-faint)',
  borderRadius: 9,
  background: 'rgba(255,255,255,0.018)',
  padding: '8px 10px',
  cursor: 'pointer',
};

const archiveButtonStyle: CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 9,
  background: 'rgba(255,255,255,0.018)',
  color: 'var(--text-tertiary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
