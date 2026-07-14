import {
  AutonomousGenerationError,
  assertCompleteAutonomousContent,
  normalizeAutonomousContent,
} from './autonomous-generation.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectReason(value: string, reason: string) {
  try {
    assertCompleteAutonomousContent(value);
    throw new Error(`Expected ${reason}`);
  } catch (error) {
    assert(error instanceof AutonomousGenerationError, 'Expected AutonomousGenerationError');
    assert(error.reason === reason, `Expected ${reason}, received ${error.reason}`);
  }
}

Deno.test('normalizes whitespace without shortening content', () => {
  assert(normalizeAutonomousContent('  one  \n\n\n two.  ') === 'one\n\n two.', 'Unexpected normalization');
});

Deno.test('accepts complete terminal punctuation', () => {
  assert(assertCompleteAutonomousContent('This is a complete autonomous entry.') === 'This is a complete autonomous entry.', 'Complete content was rejected');
  assert(assertCompleteAutonomousContent('Is this complete?') === 'Is this complete?', 'Question was rejected');
});

Deno.test('rejects partial output, placeholders, and prompt leakage', () => {
  expectReason('This entry stops in the middle', 'incomplete_content');
  expectReason('A complete-looking [text] placeholder.', 'placeholder');
  expectReason('[text] * SALIENCE: 0.5 * TAGS: [tags].', 'prompt_leak');
});
