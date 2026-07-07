import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, ArrowRight, Clipboard, ExternalLink, MessageSquare, Save, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  THE_WELL_API_URL,
  THE_WELL_BENCHMARKS_URL,
  THE_WELL_CATALOG,
  THE_WELL_DATASET_OVERVIEW_URL,
  THE_WELL_DATA_FORMAT_URL,
  buildDownloadCommand,
  buildStreamingSnippet,
  buildWellDatasetUrl,
  buildWellResearchPrompt,
  createWellTruthCard,
  formatSizeGb,
  getDatasetById,
  getWellCatalogStats,
  rankWellDatasets,
  type WellDatasetFamily,
} from '@/lib/theWellCatalog';
import {
  GroundingGlyph,
  canSaveGroundedTruthCard,
  groundingDescription,
  groundingLabel,
  type GroundingEvidenceLevel,
} from '@/components/research/GroundingGlyph';
import { useAuthStore } from '@/stores/authStore';
import { useResearchStore, type ResearchEvidenceCard } from '@/stores/researchStore';
import { useThreadStore } from '@/stores/threadStore';
import { useToast } from '@/hooks/use-toast';
import { stashChatHandoff } from '@/lib/guestChat';
import './ResearchView.css';

const EXAMPLE_QUESTIONS = [
  'How does turbulence change when radiation and cooling are included?',
  'Can we test whether a model preserves shock fronts in Euler flow?',
  'Show evidence for active matter self-organization from tensor fields.',
  'What is the smallest dataset Luca can use for a first physics probe?',
];

const QUESTION_ROUTES: Record<string, string> = {
  'Can we test whether a model preserves shock fronts in Euler flow?': 'euler_multi_quadrants',
  'Show evidence for active matter self-organization from tensor fields.': 'viscoelastic_instability',
  'What is the smallest dataset Luca can use for a first physics probe?': 'viscoelastic_instability',
};

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Claim',
    description: 'A research question stated in plain terms.',
  },
  {
    number: '02',
    title: 'Source',
    description: 'The catalog, paper, query, or computation that can ground it.',
  },
  {
    number: '03',
    title: 'Sample',
    description: 'Only the needed split, source, variant, or timestep window.',
  },
  {
    number: '04',
    title: 'Measure',
    description: 'Metrics, findings, and caveats recorded with the method.',
  },
  {
    number: '05',
    title: 'Truth card',
    description: 'Evidence saved with its boundary and exact recipe.',
  },
];

const GROUNDING_LEVELS: Array<{
  level: GroundingEvidenceLevel;
  label: string;
  description: string;
}> = [
  {
    level: 'measured',
    label: 'measured',
    description: 'Primary artifact Luca ran or pulled; reproducible.',
  },
  {
    level: 'derived',
    label: 'derived',
    description: 'One step removed from a cited finding, related run, or statistic.',
  },
  {
    level: 'referenced',
    label: 'referenced',
    description: 'The source is known and located, but the primary was not pulled.',
  },
  {
    level: 'asserted',
    label: 'asserted',
    description: 'Model reasoning without external grounding; not saveable.',
  },
];

export default function ResearchView() {
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
  const canSaveTruthCard = canSaveGroundedTruthCard(truthCard.evidenceLevel);

  useEffect(() => {
    if (user?.id) void loadCards(user.id);
  }, [user?.id, loadCards]);

  function rankCurrentQuestion() {
    const routed = QUESTION_ROUTES[query.trim()];
    const nextDataset = routed ? getDatasetById(routed) : rankedDatasets[0];
    if (nextDataset) setSelectedId(nextDataset.id);
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      rankCurrentQuestion();
    }
  }

  function handleExampleSelect(example: string) {
    setQuery(example);
    const routed = QUESTION_ROUTES[example];
    if (routed) setSelectedId(routed);
  }

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
    if (!user?.id || !canSaveTruthCard) return;
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
    <div className="research-view">
      <div className="research-shell">
        <header className="research-masthead">
          <div className="research-masthead__copy">
            <div className="research-eyebrow research-masthead__eyebrow">
              <span className="research-eyebrow__dot" aria-hidden="true" />
              <span>Research lab</span>
            </div>
            <h1>The Well Registry</h1>
            <p>
              Luca maps the physics catalog, ranks evidence sources, and fetches raw simulation tensors only when a
              question needs them.
            </p>
          </div>

          <div className="research-readout" aria-label="The Well catalog readout">
            <div className="research-readout__facts">
              <Readout value={stats.totalSizeLabel} label="mapped" />
              <Readout value={String(stats.familyCount)} label="families" />
              <Readout value={String(stats.variantCount)} label="access names" />
              <Readout value={String(stats.threeDimensional)} label="3D-capable" />
              <Readout value="pointer" label="evidence mode" />
            </div>
            <div className="research-readout__principle">
              <span className="research-readout__principle-value">0 GB</span>
              <span>default raw ingest</span>
            </div>
            <p>Catalog, metadata, provenance, and access paths load first. Raw tensors stream or cache only per task.</p>
          </div>
        </header>

        <main className="research-workspace">
          <section className="research-region research-region--inquiry" aria-label="Research inquiry">
            <RegionHeading title="Find the right simulated world" copy="Ask in physics. Luca ranks datasets by fit." />

            <label className="research-query">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                rows={3}
                spellCheck={false}
                aria-label="Research question"
              />
              <span className="research-query__bar">
                <span>Enter to rank</span>
                <button type="button" onClick={rankCurrentQuestion}>
                  <span>Rank evidence</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </span>
            </label>

            <section className="research-group" aria-label="Example research questions">
              <div className="research-eyebrow">Try a question</div>
              <div className="research-examples">
                {EXAMPLE_QUESTIONS.slice(1).map((example) => (
                  <button key={example} type="button" onClick={() => handleExampleSelect(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </section>

            <section className="research-group" aria-label="Ranked matches">
              <div className="research-group__header">
                <div className="research-eyebrow">Ranked matches</div>
                <span>{rankedDatasets.length} of {stats.familyCount} families</span>
              </div>
              <div className="research-match-list">
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
            </section>
          </section>

          <section className="research-region research-region--source" aria-label="Selected source">
            <div className="research-source-head">
              <div className="research-source-head__copy">
                <h2>{selectedDataset.label}</h2>
                <GroundingGlyph level={truthCard.evidenceLevel} label />
              </div>
              <a
                href={buildWellDatasetUrl(selectedDataset)}
                target="_blank"
                rel="noreferrer"
                className="research-icon-button"
                aria-label="Open dataset documentation"
                title="Open dataset documentation"
              >
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="research-specs">
              <Meta label="Domain" value={selectedDataset.domain} />
              <Meta label="Grid" value={selectedDataset.coordinateSystem} />
              <Meta label="Resolution" value={selectedDataset.resolution} exact />
              <Meta label="Steps" value={selectedDataset.nSteps} exact />
              <Meta label="Trajectories" value={selectedDataset.trajectories} exact />
              <Meta label="Size" value={formatSizeGb(selectedDataset.sizeGb)} exact />
            </div>

            <SourceBlock title="Fields">
              <PillList items={selectedDataset.fields} exact />
            </SourceBlock>

            <SourceBlock title="Phenomena">
              <PillList items={selectedDataset.phenomena} />
            </SourceBlock>

            <SourceBlock title="Access names">
              <div className="research-access">
                {selectedDataset.variants.map((variant) => (
                  <div key={variant.id} className="research-access__row">
                    <code>{variant.id}</code>
                    <span>{variant.sizeGb ? formatSizeGb(variant.sizeGb) : variant.note ?? variant.label}</span>
                  </div>
                ))}
              </div>
            </SourceBlock>

            <CodeBlock
              title="Stream probe"
              value={streamingSnippet}
              copied={copied === 'stream'}
              onCopy={() => copyText(streamingSnippet, 'stream')}
            />
            <CodeBlock
              title="Local cache"
              value={downloadCommand}
              copied={copied === 'download'}
              onCopy={() => copyText(downloadCommand, 'download')}
            />
          </section>

          <aside className="research-region research-region--evidence" aria-label="Truth card preview">
            <RegionHeading
              title="What Luca would save"
              copy="A durable truth card: pointers and reproducibility, never raw tensors."
            />

            <article className="research-truth-card">
              <header className="research-truth-card__top">
                <div className="research-eyebrow">Truth card</div>
                <div className="research-truth-card__actions">
                  <button
                    type="button"
                    onClick={handleOpenWithLuca}
                    disabled={!user?.id || openingChat}
                    className="research-button research-button--secondary"
                  >
                    <MessageSquare size={13} aria-hidden="true" />
                    <span>{openingChat ? 'Opening' : 'Ask'}</span>
                  </button>
                  {canSaveTruthCard ? (
                    <button
                      type="button"
                      onClick={handleSaveTruthCard}
                      disabled={!user?.id || cardSaving}
                      className="research-button research-button--primary"
                    >
                      <Save size={13} aria-hidden="true" />
                      <span>{cardSaving ? 'Saving' : 'Save'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenWithLuca}
                      disabled={!user?.id || openingChat}
                      className="research-button research-button--primary"
                    >
                      <Search size={13} aria-hidden="true" />
                      <span>Find sources</span>
                    </button>
                  )}
                </div>
              </header>

              <section className="research-truth-card__grounding">
                <GroundingGlyph level={truthCard.evidenceLevel} label />
                <p>{selectedDataset.variants[0]?.id ?? selectedDataset.id}</p>
              </section>

              <TruthSection title="Question">
                <p className="research-truth-card__question">{truthCard.question}</p>
              </TruthSection>

              <TruthSection title="Boundary">
                <p>{truthCard.claimBoundary}</p>
              </TruthSection>

              <TruthSection title="Evidence loop">
                <ul>
                  {truthCard.accessPlan.map((step) => <li key={step}>{step}</li>)}
                </ul>
              </TruthSection>

              <TruthSection title="Measurements">
                <PillList items={truthCard.measurements} />
              </TruthSection>

              <TruthSection title="Caveats">
                <ul className="research-truth-card__caveats">
                  {truthCard.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                </ul>
              </TruthSection>

              {!canSaveTruthCard && (
                <p className="research-truth-card__nosave">Asserted reasoning cannot be saved as a truth card.</p>
              )}
            </article>
          </aside>
        </main>

        <section className="research-spine" aria-label="Claim to truth card process">
          <div className="research-spine__head">
            <h2>From claim to reproducible evidence</h2>
            <p>how a question becomes a truth card</p>
          </div>
          <div className="research-spine__steps">
            {PROCESS_STEPS.map((step, index) => (
              <article key={step.number} className="research-spine__step" data-terminal={index === PROCESS_STEPS.length - 1}>
                <div className="research-spine__number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="research-footer">
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

          <aside className="research-footer__aside">
            <GroundingPanel />

            <section className="research-docs-panel" aria-label="The Well source documents">
              <div className="research-footer__head">
                <div>
                  <div className="research-eyebrow">Source docs</div>
                  <h2>The Well</h2>
                </div>
                <span>pointer-first</span>
              </div>
              <div className="research-doc-links">
                <SourceLink href={THE_WELL_DATASET_OVERVIEW_URL} label="Dataset overview" />
                <SourceLink href={THE_WELL_DATA_FORMAT_URL} label="HDF5 data format" />
                <SourceLink href={THE_WELL_API_URL} label="WellDataset API" />
                <SourceLink href={THE_WELL_BENCHMARKS_URL} label="Benchmarks" />
              </div>
            </section>
          </aside>
        </footer>
      </div>
    </div>
  );
}

function Readout({ value, label }: { value: string; label: string }) {
  return (
    <div className="research-readout__item">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RegionHeading({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="research-region-head">
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

function DatasetRow({
  dataset,
  rank,
  active,
  onSelect,
}: {
  dataset: WellDatasetFamily;
  rank: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="research-match-row"
      aria-pressed={active}
      data-selected={active}
    >
      <span className="research-match-row__rank">{String(rank).padStart(2, '0')}</span>
      <span className="research-match-row__body">
        <span className="research-match-row__name">{dataset.label}</span>
        <span className="research-match-row__meta">{dataset.domain} - {dataset.resolution} - {formatSizeGb(dataset.sizeGb)}</span>
      </span>
    </button>
  );
}

function Meta({ label, value, exact = false }: { label: string; value: string; exact?: boolean }) {
  return (
    <div className="research-meta">
      <div className="research-eyebrow">{label}</div>
      <div className={exact ? 'research-meta__value research-meta__value--exact' : 'research-meta__value'}>{value}</div>
    </div>
  );
}

function SourceBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="research-source-block">
      <div className="research-eyebrow">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function TruthSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="research-truth-card__section">
      <div className="research-eyebrow">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function PillList({ items, exact = false }: { items: string[]; exact?: boolean }) {
  return (
    <div className="research-pill-list">
      {items.map((item) => (
        <span key={item} className={exact ? 'research-pill research-pill--exact' : 'research-pill'}>
          {item}
        </span>
      ))}
    </div>
  );
}

function CodeBlock({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="research-code">
      <div className="research-code__head">
        <div className="research-eyebrow">{title}</div>
        <button type="button" onClick={onCopy} aria-label={`Copy ${title}`}>
          <Clipboard size={12} aria-hidden="true" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>{value}</pre>
    </section>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="research-doc-link">
      <span>{label}</span>
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

function GroundingPanel() {
  return (
    <section className="research-grounding-panel" aria-label="Grounding ladder">
      <div className="research-footer__head">
        <div>
          <div className="research-eyebrow">Evidence</div>
          <h2>Grounding ladder</h2>
        </div>
        <span>all outputs</span>
      </div>
      <div className="research-grounding-list">
        {GROUNDING_LEVELS.map((item) => (
          <div key={item.label} className="research-grounding-row">
            <GroundingGlyph level={item.level} />
            <span>{item.label}</span>
            <p>{groundingDescription(item.level) || item.description}</p>
          </div>
        ))}
      </div>
    </section>
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
  const visibleCards = cards.slice(0, 4);

  return (
    <section className="research-saved-panel" aria-label="Saved truth cards">
      <div className="research-footer__head">
        <div>
          <div className="research-eyebrow">Saved evidence</div>
          <h2>Truth cards</h2>
        </div>
        <span>{cards.length}</span>
      </div>
      <div className="research-saved-list">
        {loading && <p className="research-empty-text">Loading cards...</p>}
        {error && <p className="research-error-text">{error}</p>}
        {!loading && !error && visibleCards.length === 0 && (
          <div className="research-empty-card">
            <p>Save a truth card to preserve the source, access path, measurements, and caveats.</p>
            <span>Nothing raw is ingested by default.</span>
          </div>
        )}
        {visibleCards.map((card) => (
          <article key={card.id} className="research-saved-row">
            <button type="button" onClick={() => onOpen(card)} className="research-saved-row__main">
              <span className="research-saved-row__title">{card.title}</span>
              <span className="research-saved-row__meta">
                <GroundingGlyph level={card.evidence_level} size={8} />
                <span>{card.dataset_label} - {groundingLabel(card.evidence_level)}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onArchive(card)}
              className="research-saved-row__archive"
              aria-label={`Archive ${card.title}`}
              title="Archive card"
            >
              <Archive size={12} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
