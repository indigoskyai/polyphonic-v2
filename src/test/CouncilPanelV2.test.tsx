import { describe, expect, it } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CouncilPanel, { type CouncilTrace } from '@/components/messages/CouncilPanel';

// RichBody (used inside the panel) calls useNavigate() — needs a Router.
const render = (ui: React.ReactNode) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const sampleProposers = [
  { character: 'luca' as const, content: 'luca: hey. i hear you.' },
  { character: 'anima' as const, content: 'anima: that question circles itself.' },
  { character: 'vektor' as const, content: 'vektor: ship it.' },
];

const sampleCrosstalk = [
  { character: 'luca' as const, content: 'luca revised: still here.', source: 'crosstalk' },
  { character: 'anima' as const, content: 'anima revised: still circling.', source: 'crosstalk' },
  { character: 'vektor' as const, content: 'vektor revised: ship it carefully.', source: 'crosstalk' },
];

describe('CouncilPanel v2 — synthesize verdict', () => {
  const synthesizeTrace: CouncilTrace = {
    kind: 'council_v2',
    proposers: sampleProposers,
    crosstalk: sampleCrosstalk,
    verdict: 'synthesize',
    critique: null,
    revised_content: null,
  };

  it('renders the council disclosure header with harmonized verdict pill', () => {
    render(<CouncilPanel trace={synthesizeTrace} />);
    expect(screen.getByText('Council')).toBeInTheDocument();
    expect(screen.getByText('harmonized')).toBeInTheDocument();
  });

  it('starts collapsed when verdict is synthesize', () => {
    render(<CouncilPanel trace={synthesizeTrace} />);
    const button = screen.getByRole('button', { expanded: false });
    expect(button).toBeInTheDocument();
  });

  it('shows "3 voices" subtitle', () => {
    render(<CouncilPanel trace={synthesizeTrace} />);
    expect(screen.getByText(/3 voices/i)).toBeInTheDocument();
  });
});

describe('CouncilPanel v2 — diverge verdict', () => {
  const divergeTrace: CouncilTrace = {
    kind: 'council_v2',
    proposers: sampleProposers,
    crosstalk: sampleCrosstalk,
    verdict: 'diverge',
    critique: null,
    revised_content: null,
  };

  it('renders the diverged pill', () => {
    render(<CouncilPanel trace={divergeTrace} />);
    expect(screen.getByText('diverged')).toBeInTheDocument();
  });

  it('AUTO-EXPANDS when verdict is diverge', () => {
    render(<CouncilPanel trace={divergeTrace} />);
    const button = screen.getByRole('button', { expanded: true });
    expect(button).toBeInTheDocument();
  });

  it('shows all three character tabs when expanded', () => {
    render(<CouncilPanel trace={divergeTrace} />);
    // The character names appear in tab labels.
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('CouncilPanel v2 — critique', () => {
  it('shows clean critique row when no drift detected', () => {
    const trace: CouncilTrace = {
      kind: 'council_v2',
      proposers: sampleProposers,
      crosstalk: sampleCrosstalk,
      verdict: 'synthesize',
      critique: {
        voice_drift_detected: false,
        confidence: 0.92,
        critique: 'voices preserved cleanly.',
        suggested_revision: null,
      },
      revised_content: null,
    };
    const { container } = render(<CouncilPanel trace={trace} />);
    // Force-expand by clicking. We just check the trace is queryable.
    container.querySelector('button')?.click();
    expect(container.textContent).toContain('Voice critique');
    expect(container.textContent).toContain('clean');
  });

  it('shows drift critique with confidence percent', () => {
    const trace: CouncilTrace = {
      kind: 'council_v2',
      proposers: sampleProposers,
      crosstalk: sampleCrosstalk,
      verdict: 'synthesize',
      critique: {
        voice_drift_detected: true,
        confidence: 0.85,
        critique: 'close paragraph reads like generic warmth.',
        suggested_revision: 'shorten the close.',
      },
      revised_content: null,
    };
    const { container } = render(<CouncilPanel trace={trace} />);
    container.querySelector('button')?.click();
    expect(container.textContent).toContain('Voice critique');
    expect(container.textContent).toContain('drift');
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('close paragraph');
  });

  it('marks the critique row as "revised" when a revision was applied', () => {
    const trace: CouncilTrace = {
      kind: 'council_v2',
      proposers: sampleProposers,
      crosstalk: sampleCrosstalk,
      verdict: 'synthesize',
      critique: {
        voice_drift_detected: true,
        confidence: 0.9,
        critique: 'drift detected',
        suggested_revision: 'tighten',
      },
      revised_content: 'final revised reply.',
    };
    const { container } = render(<CouncilPanel trace={trace} />);
    container.querySelector('button')?.click();
    expect(container.textContent).toContain('revised');
  });
});

describe('CouncilPanel v2 — graceful fallbacks', () => {
  it('renders nothing when there are no drafts at all', () => {
    const empty: CouncilTrace = {
      kind: 'council_v2',
      proposers: [],
      crosstalk: [],
      verdict: 'synthesize',
    };
    const { container } = render(<CouncilPanel trace={empty} />);
    expect(container.firstChild).toBeNull();
  });

  it('falls back to proposers when crosstalk is empty (single-survivor path)', () => {
    const trace: CouncilTrace = {
      kind: 'council_v2',
      proposers: [{ character: 'luca', content: 'sole survivor.' }],
      crosstalk: [],
      verdict: 'synthesize',
    };
    render(<CouncilPanel trace={trace} />);
    expect(screen.getByText(/1 voice/i)).toBeInTheDocument();
  });

  it('default-routes to v2 renderer when kind is council_v2', () => {
    const trace: CouncilTrace = {
      kind: 'council_v2',
      proposers: sampleProposers,
      crosstalk: sampleCrosstalk,
      verdict: 'synthesize',
    };
    render(<CouncilPanel trace={trace} />);
    expect(screen.getByText('harmonized')).toBeInTheDocument();
  });
});

describe('CouncilPanel — backward compat with kind=council', () => {
  it('renders the legacy panel when kind is council (or unset)', () => {
    const legacy: CouncilTrace = {
      kind: 'council',
      variants: [
        { model: 'opus-4-7', content: 'a' },
        { model: 'gpt-5.4', content: 'b' },
      ],
      rankings: [],
      aggregate: [],
      label_to_model: {},
    };
    render(<CouncilPanel trace={legacy} />);
    // Legacy header reads "Voices" when there's no aggregate, or "Council" when ranked.
    expect(screen.getByText(/2 responses/i)).toBeInTheDocument();
    expect(screen.queryByText('harmonized')).not.toBeInTheDocument();
    expect(screen.queryByText('diverged')).not.toBeInTheDocument();
  });
});
