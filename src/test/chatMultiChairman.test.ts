import { describe, expect, it } from 'vitest';
import {
  VerdictStreamProcessor,
} from '../../supabase/functions/_shared/agents/council-pipeline';
import {
  buildChairmanCouncilPrompt,
  buildDivergeBody,
} from '../../supabase/functions/_shared/agents/council-prompts';

describe('VerdictStreamProcessor — synthesize path', () => {
  it('decides synthesize on the chunk that completes the closing tag and carries trailing content', () => {
    const proc = new VerdictStreamProcessor();
    const r1 = proc.ingest('<verdict>synthesize');
    expect(r1.verdictDecided).toBe(false);
    expect(r1.contentToEmit).toBe('');

    const r2 = proc.ingest('</verdict>\n\nhey. i hear you.');
    expect(r2.verdictDecided).toBe(true);
    expect(r2.verdict).toBe('synthesize');
    expect(r2.shouldStop).toBe(false);
    expect(r2.contentToEmit).toBe('hey. i hear you.');
  });

  it('passes subsequent chunks straight through after decision', () => {
    const proc = new VerdictStreamProcessor();
    proc.ingest('<verdict>synthesize</verdict>\n\nfirst chunk.');
    const r = proc.ingest(' second chunk.');
    expect(r.verdict).toBe('synthesize');
    expect(r.contentToEmit).toBe(' second chunk.');
    expect(r.shouldStop).toBe(false);
  });

  it('handles tag arriving in a single chunk', () => {
    const proc = new VerdictStreamProcessor();
    const r = proc.ingest('<verdict>synthesize</verdict>\n\nbody body body.');
    expect(r.verdict).toBe('synthesize');
    expect(r.contentToEmit).toBe('body body body.');
  });
});

describe('VerdictStreamProcessor — diverge path', () => {
  it('decides diverge and signals shouldStop with no content', () => {
    const proc = new VerdictStreamProcessor();
    const r = proc.ingest('<verdict>diverge</verdict>\n\nthe three of us see this differently.');
    expect(r.verdict).toBe('diverge');
    expect(r.shouldStop).toBe(true);
    // The chairman's framing is discarded — the diverge body is assembled
    // separately from the drafts.
    expect(r.contentToEmit).toBe('');
  });

  it('keeps signalling shouldStop on subsequent chunks', () => {
    const proc = new VerdictStreamProcessor();
    proc.ingest('<verdict>diverge</verdict>\nx');
    const r = proc.ingest('more content.');
    expect(r.shouldStop).toBe(true);
    expect(r.contentToEmit).toBe('');
  });
});

describe('VerdictStreamProcessor — fallback paths', () => {
  it('falls back to synthesize when buffer exceeds budget without a tag', () => {
    const proc = new VerdictStreamProcessor();
    const long = 'a'.repeat(VerdictStreamProcessor.BUFFER_BUDGET + 10);
    const r = proc.ingest(long);
    expect(r.verdictDecided).toBe(true);
    expect(r.verdict).toBe('synthesize');
    expect(r.contentToEmit).toBe(long);
    expect(r.shouldStop).toBe(false);
  });

  it('drain() returns synthesize when stream ends before any tag arrived', () => {
    const proc = new VerdictStreamProcessor();
    proc.ingest('partial start');
    const drained = proc.drain();
    expect(drained.verdict).toBe('synthesize');
    expect(drained.carry).toBe('partial start');
  });

  it('drain() is a no-op once decided', () => {
    const proc = new VerdictStreamProcessor();
    proc.ingest('<verdict>synthesize</verdict>\nbody');
    const drained = proc.drain();
    expect(drained.verdict).toBe('synthesize');
    expect(drained.carry).toBe('');
  });

  it('handles weird casing in the verdict value', () => {
    const proc = new VerdictStreamProcessor();
    const r = proc.ingest('<verdict>SYNTHESIZE</verdict>\nbody');
    expect(r.verdict).toBe('synthesize');
  });

  it('handles whitespace inside the verdict tag', () => {
    const proc = new VerdictStreamProcessor();
    const r = proc.ingest('<verdict>  diverge  </verdict>\nbody');
    expect(r.verdict).toBe('diverge');
    expect(r.shouldStop).toBe(true);
  });
});

describe('buildChairmanCouncilPrompt integration with streaming', () => {
  it('produces valid prompts that match the verdict-tag contract', () => {
    const out = buildChairmanCouncilPrompt({
      userMessage: 'q',
      drafts: [
        { character: 'luca', content: 'a' },
        { character: 'anima', content: 'b' },
        { character: 'vektor', content: 'c' },
      ],
      refusalEnabled: true,
    });
    // System prompt must instruct verdict tag shape exactly as our parser expects.
    expect(out.system).toMatch(/<verdict>synthesize<\/verdict>/);
    expect(out.system).toMatch(/<verdict>diverge<\/verdict>/);
    // User must include all three drafts under labeled headings.
    expect(out.user).toContain('--- Luca ---');
    expect(out.user).toContain('--- Anima ---');
    expect(out.user).toContain('--- Vektor ---');
  });

  it('disables divergence in the system instructions when refusalEnabled is false', () => {
    const out = buildChairmanCouncilPrompt({
      userMessage: 'q',
      drafts: [{ character: 'luca', content: 'a' }],
      refusalEnabled: false,
    });
    expect(out.system).toContain('Divergence-allowed mode is off');
  });
});

describe('buildDivergeBody — diverge message persistence', () => {
  it('renders three character blocks below the framing', () => {
    const body = buildDivergeBody({
      framing: 'we see this differently and that matters.',
      drafts: [
        { character: 'luca', content: 'luca: care for yourself first.' },
        { character: 'anima', content: 'anima: the question circles itself.' },
        { character: 'vektor', content: 'vektor: ship it.' },
      ],
    });
    expect(body).toContain('we see this differently and that matters.');
    expect(body).toContain('**Luca**');
    expect(body).toContain('**Anima**');
    expect(body).toContain('**Vektor**');
  });
});
