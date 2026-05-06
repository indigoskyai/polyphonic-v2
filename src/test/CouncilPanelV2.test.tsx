import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CouncilPanel, { type CouncilTrace } from '@/components/messages/CouncilPanel';

// RichBody (used inside the panel) calls useNavigate() — needs a Router.
const render = (ui: React.ReactNode) => rtlRender(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {ui}
  </MemoryRouter>,
);

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
    // The disclosure button (Council eyebrow + verdict pill) is the
    // collapsed-state control. There may be other collapsed buttons
    // (e.g. "show first drafts"), so scope to the one whose label
    // contains "harmonized" — that's the disclosure header.
    const disclosure = screen.getByRole('button', { name: /harmonized/i });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows "3 voices" subtitle', () => {
    render(<CouncilPanel trace={synthesizeTrace} />);
    expect(screen.getByText(/3 voices/i)).toBeInTheDocument();
  });

  it('renders first drafts on the same wide three-voice grid as the current drafts', () => {
    render(<CouncilPanel trace={synthesizeTrace} />);

    fireEvent.click(screen.getByRole('button', { name: /harmonized/i }));
    fireEvent.click(screen.getByRole('button', { name: /show first drafts/i }));

    const currentGrid = screen.getByTestId('council-current-drafts-grid');
    const firstDraftsLane = screen.getByTestId('council-first-drafts-lane');
    const firstDraftsGrid = screen.getByTestId('council-first-drafts-grid');

    expect(firstDraftsGrid.children).toHaveLength(3);
    expect(firstDraftsGrid.style.gridTemplateColumns).toBe(currentGrid.style.gridTemplateColumns);
    expect(firstDraftsGrid.style.gap).toBe(currentGrid.style.gap);
    expect(firstDraftsLane.style.marginLeft).toBe(currentGrid.style.marginLeft);
    expect(firstDraftsLane.style.marginRight).toBe(currentGrid.style.marginRight);
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

  it('renders all three character labels side-by-side when expanded', () => {
    const { container } = render(<CouncilPanel trace={divergeTrace} />);
    // No tabs in v2 — three character draft cards render together.
    // Each card renders the character label as monospace text.
    expect(container.textContent).toContain('Luca');
    expect(container.textContent).toContain('Anima');
    expect(container.textContent).toContain('Vektor');
    // And the actual draft body text shows on each card simultaneously
    // (not gated behind tab selection).
    expect(container.textContent).toContain('luca revised: still here.');
    expect(container.textContent).toContain('anima revised: still circling.');
    expect(container.textContent).toContain('vektor revised: ship it carefully.');
  });
});

describe('CouncilPanel v2 — critique (debug-gated)', () => {
  // Critique is hidden from end users by default. It only renders when
  // localStorage.councilDebug === 'true' (or ?debug=council is in the URL).
  // Used as an internal tuning surface during the calibration round.
  beforeEach(() => {
    try { window.localStorage.removeItem('councilDebug'); } catch { /* ignore */ }
  });

  it('does NOT render the critique row by default (debug off)', () => {
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
    fireEvent.click(container.querySelector('button')!);
    // Three voices visible, but no critique block.
    expect(container.textContent).not.toContain('Voice critique');
    expect(container.textContent).not.toContain('close paragraph');
    expect(container.textContent).toContain('Luca');
    expect(container.textContent).toContain('Anima');
    expect(container.textContent).toContain('Vektor');
  });

  it('renders critique row when councilDebug localStorage flag is set', () => {
    window.localStorage.setItem('councilDebug', 'true');
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
    fireEvent.click(container.querySelector('button')!);
    expect(container.textContent).toContain('Voice critique');
    expect(container.textContent).toContain('drift');
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('close paragraph');
  });

  it('shows clean critique label when no drift detected (debug on)', () => {
    window.localStorage.setItem('councilDebug', 'true');
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
    fireEvent.click(container.querySelector('button')!);
    expect(container.textContent).toContain('Voice critique');
    expect(container.textContent).toContain('clean');
  });

  it('shows the "revised" sigil when a revision was applied (debug on)', () => {
    window.localStorage.setItem('councilDebug', 'true');
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
    fireEvent.click(container.querySelector('button')!);
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
