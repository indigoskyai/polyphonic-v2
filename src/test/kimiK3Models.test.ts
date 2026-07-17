import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from '@/lib/chatRuntime';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const K3 = 'moonshotai/kimi-k3';
const K27_CODE = 'moonshotai/kimi-k2.7-code';
const SURFACES = [
  'src/pages/settings/GeneralSettings.tsx',
  'src/pages/settings/AgentDetail.tsx',
  'src/components/settings/CreateAgentModal.tsx',
  'supabase/functions/anima-tool-execute/index.ts',
  'supabase/functions/agent-forge/index.ts',
  'supabase/functions/_shared/agent-runtime/openrouter-agent.ts',
];

describe('Kimi K3 ecosystem registration', () => {
  it('offers canonical K3 and coding-specialist IDs without a duplicate floating alias', () => {
    const ids = CHAT_MODEL_OPTIONS.map((model) => model.id);
    expect(ids).toContain(K3);
    expect(ids).toContain(K27_CODE);
    expect(ids).not.toContain('~moonshotai/kimi-latest');
  });

  it('marks K3 as newly released, reasoning-capable, and multimodal', () => {
    const model = CHAT_MODEL_OPTIONS.find((entry) => entry.id === K3);
    expect(model).toMatchObject({ name: 'Kimi K3', featured: true });
    expect(model?.flags.map((flag) => flag.label)).toEqual(['Just released', 'Reasoning', 'Multimodal']);
  });

  it('keeps K2.6 as the cost-controlled default', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('moonshotai/kimi-k2.6');
  });

  it.each(SURFACES)('registers both models in %s', (path) => {
    const file = source(path);
    expect(file).toContain(K3);
    expect(file).toContain(K27_CODE);
  });

  it('uses the dedicated top-level OpenRouter reasoning protocol for K3', () => {
    const models = source('supabase/functions/_shared/models.ts');
    expect(models).toContain("'moonshotai/kimi-k3': { reasoning: true, paramStyle: 'kimi-k3'");
    expect(models).toContain("return { reasoning_effort: normalizedEffort }");
  });
});
