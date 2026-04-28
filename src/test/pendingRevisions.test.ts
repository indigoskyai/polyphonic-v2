import { describe, expect, it } from 'vitest';
import { formatPendingRevisionsPrompt } from '../../supabase/functions/_shared/agents/pending-revisions';

describe('pending revision prompt formatting', () => {
  it('stays absent when Luca has nothing to reconsider', () => {
    expect(formatPendingRevisionsPrompt([])).toBe('');
  });

  it('keeps self-corrections concise and optional', () => {
    const prompt = formatPendingRevisionsPrompt([
      {
        id: 'revision-1',
        revision_type: 'reconsideration',
        what_was_said: 'This probably is not worth changing.',
        what_to_say_now: 'I think that was too quick; it is worth one careful pass.',
        rationale: 'The user was asking for judgment, not permission to skip.',
        created_at: '2026-04-28T00:00:00.000Z',
      },
    ]);

    expect(prompt).toContain('Surface them naturally if they are still relevant.');
    expect(prompt).toContain('If they do not fit, do not shoehorn them in.');
    expect(prompt).toContain('Earlier you said: This probably is not worth changing.');
    expect(prompt).toContain('On reflection: I think that was too quick; it is worth one careful pass.');
  });
});
