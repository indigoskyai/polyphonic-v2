import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KIMI_K3_MODEL_ID,
  MODEL_CAPABILITIES,
  getInputTokenBudget,
  resolveReasoningEffortForCapabilities,
} from '../../shared/modelCapabilities';
import {
  buildReasoningParams,
  getModelDefaultMaxOutputTokens,
  normalizeReasoningEffort,
} from '../../supabase/functions/_shared/models';
import { buildCapabilityAwareModelHistory } from '../../supabase/functions/_shared/model-conversation';
import { getChatAttachmentAccept, isChatAttachmentSupported } from '../lib/chatAttachments';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Kimi K3 capability contract', () => {
  it('exposes the complete OpenRouter K3 fallback', () => {
    expect(MODEL_CAPABILITIES[KIMI_K3_MODEL_ID]).toMatchObject({
      contextWindow: 1_048_576,
      defaultMaxOutputTokens: 131_072,
      inputModalities: ['text', 'image'],
      supportedReasoningEfforts: ['max'],
      reasoningMandatory: true,
      parameterStyle: 'kimi-k3',
      streaming: true,
      tools: true,
      toolChoice: true,
      structuredOutput: true,
      reasoningPreservation: true,
    });
    expect(getInputTokenBudget(KIMI_K3_MODEL_ID)).toBe(851_968);
    expect(getModelDefaultMaxOutputTokens(KIMI_K3_MODEL_ID)).toBe(131_072);
  });

  it('normalizes stale effort requests to a top-level max parameter', () => {
    expect(normalizeReasoningEffort(KIMI_K3_MODEL_ID, 'low')).toBe('max');
    expect(normalizeReasoningEffort(KIMI_K3_MODEL_ID, 'high')).toBe('max');
    const params = buildReasoningParams(KIMI_K3_MODEL_ID, 'low');
    expect(params).toEqual({ reasoning_effort: 'max' });
    expect(params).not.toHaveProperty('reasoning');
    expect(params).not.toHaveProperty('thinking');
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('n');
    expect(params).not.toHaveProperty('presence_penalty');
    expect(params).not.toHaveProperty('frequency_penalty');
  });

  it('advertises only the K3 route modalities while keeping PDF parsing available', () => {
    const modalities = MODEL_CAPABILITIES[KIMI_K3_MODEL_ID].inputModalities;
    const accept = getChatAttachmentAccept(modalities);
    expect(accept).toContain('image/png');
    expect(accept).toContain('application/pdf');
    expect(accept).not.toContain('audio/*');
    expect(accept).not.toContain('video/');
    expect(isChatAttachmentSupported({ type: 'image/png' }, modalities)).toBe(true);
    expect(isChatAttachmentSupported({ type: 'application/pdf' }, modalities)).toBe(true);
    expect(isChatAttachmentSupported({ type: 'video/mp4' }, modalities)).toBe(false);
  });

  it('accepts future capability-driven effort sets without K3 UI branching', () => {
    const futureEfforts = ['low', 'medium', 'high', 'max'] as const;
    expect(resolveReasoningEffortForCapabilities(futureEfforts, 'medium')).toBe('medium');
    expect(resolveReasoningEffortForCapabilities(futureEfforts, 'max')).toBe('max');
    const runtime = readRepoFile('src/lib/chatRuntime.ts');
    expect(runtime).toContain('getSupportedReasoningEfforts(normalizeChatModelId(modelId))');
  });

  it('round-trips structured reasoning and complete tool boundaries', () => {
    const history = buildCapabilityAwareModelHistory([
      { role: 'user', content: 'Look up the source.' },
      {
        role: 'assistant',
        content: 'The source confirms it.',
        thinking_content: 'fallback thought',
        metadata: {
          reasoning_details: [{ type: 'reasoning.summary', content: 'Need a source.' }],
          tool_state: [
            {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"source"}' } }],
            },
            { role: 'tool', tool_call_id: 'call_1', name: 'web_search', content: '{"url":"https://example.com"}' },
          ],
        },
      },
    ], KIMI_K3_MODEL_ID);

    expect(history).toHaveLength(4);
    expect(history[1].tool_calls?.[0]).toMatchObject({ id: 'call_1' });
    expect(history[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(history[3].reasoning_details).toEqual([
      { type: 'reasoning.summary', content: 'Need a source.' },
    ]);
    expect(history[3]).not.toHaveProperty('reasoning_content');
  });

  it('keeps historical K3 image turns as real multimodal content arrays', () => {
    const providerContent = [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.test/signed-image' } },
    ];
    const history = buildCapabilityAwareModelHistory([
      {
        role: 'user',
        content: 'What is in this image?',
        attachment_ids: ['attachment-1'],
        provider_content: providerContent,
      },
      { role: 'assistant', content: 'A quiet observatory.' },
    ], KIMI_K3_MODEL_ID);

    expect(history[0].content).toEqual(providerContent);
    expect(history[1].content).toBe('A quiet observatory.');
  });

  it('uses token-budgeted history beyond the old 60-message ceiling', () => {
    const rows = Array.from({ length: 80 }, (_, index) => [
      { role: 'user', content: `question ${index}` },
      { role: 'assistant', content: `answer ${index}` },
    ]).flat();
    const history = buildCapabilityAwareModelHistory(rows, KIMI_K3_MODEL_ID);
    expect(history).toHaveLength(160);
    expect(history.at(-1)?.content).toBe('answer 79');

    const kernel = readRepoFile('supabase/functions/_shared/continuity/kernel.ts');
    expect(kernel).toContain('.order("created_at", { ascending: false })');
    expect(kernel).toContain('].reverse()).filter');
  });

  it('pins retries to the stored target and attributes classic errors to the model', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    expect(chatView).toContain('retry_target: retryTarget');
    expect(chatView).toContain('target: retryTarget');
    expect(chatView).toContain("typeof md.target_label === 'string'");
    expect(chatView).toContain('responderLabel={responderLabel}');
  });

  it('lets K3 itself choose from the existing allowlisted tool surface', () => {
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');
    const toolRuntime = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    expect(chatMulti).toContain('classicK3ToolsEnabled ? selectedClassicModel : null');
    expect(toolRuntime).toContain('planner_model === "moonshotai/kimi-k3"');
    expect(toolRuntime).toContain('body.reasoning_effort = "max"');
    expect(toolRuntime).toContain('body.tool_choice = "auto"');
    expect(toolRuntime).toContain('? { reasoning_details: choice.reasoning_details }');
  });

  it('surfaces malformed and mid-stream provider failures with request attribution', () => {
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');
    expect(chatMulti).toContain('malformedProviderEvents += 1');
    expect(chatMulti).toContain('if (providerStreamError)');
    expect(chatMulti).toContain('request_id: requestId');
    expect(chatMulti).toContain('partial: Boolean(fullContent || fullThinking)');
  });
});
