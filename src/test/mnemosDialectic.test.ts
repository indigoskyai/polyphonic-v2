import { describe, expect, it } from 'vitest';
import {
  applyMarkdownPatch,
  classifyPatchStatus,
  parseDialecticResult,
} from '../../supabase/functions/_shared/mnemos/dialectic';

describe('mnemos dialectic helpers', () => {
  it('parses model JSON and classifies patch thresholds conservatively', () => {
    const result = parseDialecticResult(JSON.stringify({
      patches: [
        {
          doc_type: 'user_model',
          section: 'Communication style',
          operation: 'append',
          patch_content: 'Prefers direct critique with concrete examples.',
          confidence: 0.7,
          category: 'communication-style',
        },
        {
          doc_type: 'soul',
          section: 'What I am working on',
          operation: 'append',
          patch_content: 'Notice when honesty turns too terse.',
          confidence: 0.7,
        },
      ],
      pending_revisions: [],
    }));

    expect(result.patches).toHaveLength(2);
    expect(classifyPatchStatus(result.patches[0])).toBe('applied');
    expect(classifyPatchStatus(result.patches[1])).toBe('queued');
  });

  it('applies append patches under the requested markdown section', () => {
    const updated = applyMarkdownPatch(
      '## Communication style\n\n- Likes brevity.\n\n## Goals\n\n- Ship the thing.',
      {
        doc_type: 'user_model',
        section: 'Communication style',
        operation: 'append',
        patch_content: 'Wants the hard truth without ceremony.',
        confidence: 0.8,
      },
    );

    expect(updated).toContain('## Communication style\n\n- Likes brevity.\n- Wants the hard truth without ceremony.\n## Goals');
  });
});
