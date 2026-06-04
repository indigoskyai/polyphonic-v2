import { describe, expect, it } from 'vitest';
import { buildLucaSystemPrompt } from '../../supabase/functions/_shared/agents/luca-soul';
import { formatPolyphonicAppContext } from '../../supabase/functions/_shared/agents/polyphonic-app-context';
import {
  classifyPatchStatus,
  type DialecticPatch,
} from '../../supabase/functions/_shared/mnemos/dialectic';

describe('buildLucaSystemPrompt identity layers', () => {
  it('layers living identity docs after the locked soul and before runtime state', () => {
    const prompt = buildLucaSystemPrompt({
      soulMd: '## What I value\nTruth before polish.',
      convictions: "## Care isn't softness.\nthe two are not in tension.",
      userModel: 'Prefers direct, concrete critique.',
      selfModel: 'Sometimes over-compresses too early.',
      appContextBlock: '\n## Polyphonic app context\nPolyphonic is the app Luca lives in.',
      projectContextBlock: '\n## Current project\nProject: Launch polish',
      skillsBlock: '### careful-review\nUse when critique needs a second pass.',
      pendingRevisions: 'Earlier you said: X\nOn reflection: Y',
      hypomnemaBlock: "\n## what i'm sitting with\n\n- (yesterday) i'm carrying the shape of this project.",
      functionalMemoryBlock: '\n## what i reliably remember\n\n- [preference, conf 0.91] Riley wants concrete critique.',
      emotionalBlock: 'Current emotional state: steady.',
      beliefsBlock: 'Beliefs: craft matters.',
      memoryContext: '\n## associations moving underneath\n\n- [semantic, activation 0.80] shipping fast matters here.',
      continuityNote: 'Pick up gently.',
    });

    const soulIndex = prompt.indexOf('You are Luca.');
    const soulMdIndex = prompt.indexOf("## How you've come to think about yourself");
    const convictionsIndex = prompt.indexOf('## Convictions you hold');
    const userModelIndex = prompt.indexOf("## Who you're talking with");
    const selfModelIndex = prompt.indexOf("## How you've been showing up");
    const appContextIndex = prompt.indexOf('## Polyphonic app context');
    const projectContextIndex = prompt.indexOf('## Current project');
    const skillsIndex = prompt.indexOf("## Relevant skills you've developed");
    const policyIndex = prompt.indexOf('## Continuity precedence');
    const revisionsIndex = prompt.indexOf('## Pending revisions');
    const hypomnemaIndex = prompt.indexOf("## what i'm sitting with");
    const functionalIndex = prompt.indexOf("## what i reliably remember");
    const mnemosIndex = prompt.indexOf("## associations moving underneath");
    const stateIndex = prompt.indexOf('Current emotional state: steady.');

    // Layering: locked soul → soul.md → convictions → user-model →
    // self-model → app context → project context → continuity policy →
    // pending revisions → hypomnema →
    // reliable recall → Mnemos substrate → skills → runtime state.
    expect(soulIndex).toBeGreaterThanOrEqual(0);
    expect(soulIndex).toBeLessThan(soulMdIndex);
    expect(soulMdIndex).toBeLessThan(convictionsIndex);
    expect(convictionsIndex).toBeLessThan(userModelIndex);
    expect(userModelIndex).toBeLessThan(selfModelIndex);
    expect(selfModelIndex).toBeLessThan(appContextIndex);
    expect(appContextIndex).toBeLessThan(projectContextIndex);
    expect(projectContextIndex).toBeLessThan(policyIndex);
    expect(policyIndex).toBeLessThan(revisionsIndex);
    expect(revisionsIndex).toBeLessThan(hypomnemaIndex);
    expect(hypomnemaIndex).toBeLessThan(functionalIndex);
    expect(functionalIndex).toBeLessThan(mnemosIndex);
    expect(mnemosIndex).toBeLessThan(skillsIndex);
    expect(skillsIndex).toBeLessThan(stateIndex);

    expect(prompt).toContain('Truth before polish.');
    expect(prompt).toContain('the two are not in tension.');
    expect(prompt).toContain('Prefers direct, concrete critique.');
    expect(prompt).toContain('Sometimes over-compresses too early.');
    expect(prompt).toContain('Polyphonic is the app Luca lives in.');
    expect(prompt).toContain('Project: Launch polish');
    expect(prompt).toContain('careful-review');
    expect(prompt).toContain("i'm carrying the shape of this project.");
    expect(prompt).toContain('Riley wants concrete critique.');
    expect(prompt).toContain('shipping fast matters here.');
    expect(prompt).toContain('corrections and exclusions are control signals');
    expect(prompt).toContain('obey that boundary silently');
  });

  it('omits the convictions header entirely when no convictions are loaded', () => {
    const prompt = buildLucaSystemPrompt({
      soulMd: '## What I value\nTruth before polish.',
      userModel: 'Prefers direct critique.',
    });
    expect(prompt).not.toContain('## Convictions you hold');
  });

  it('adds Polyphonic app awareness without making it Luca soul', () => {
    const appContextBlock = formatPolyphonicAppContext({
      billingTier: 'guest',
      keySource: 'platform',
      model: 'moonshotai/kimi-k2.6',
      clientContext: {
        route: '/chat/thread-1',
        view: 'chat',
        access_tier: 'guest',
        composer_surface: 'landing_handoff',
        sidebar_visible: false,
        observer_alcove_open: true,
      },
    });
    const prompt = buildLucaSystemPrompt({ appContextBlock });

    expect(prompt).toContain('You are Luca.');
    expect(prompt).toContain('## Polyphonic app context');
    expect(prompt).toContain('Luca is not a mascot or generic support bot');
    expect(prompt).toContain('guest: public app-help access through Polyphonic Guide only');
    expect(prompt).toContain('Polyphonic has taken a long time to get here');
    expect(prompt).toContain('route: /chat/thread-1');
    expect(prompt).toContain('observer enclave open: yes');
  });
});

describe('classifyPatchStatus thresholds per doc_type', () => {
  function patch(doc_type: DialecticPatch['doc_type'], confidence: number): DialecticPatch {
    return {
      doc_type,
      section: 'Test',
      operation: 'append',
      patch_content: 'test',
      confidence,
    };
  }

  it('user_model / self_model: ≥0.6 apply, 0.4–0.6 queue, <0.4 reject', () => {
    expect(classifyPatchStatus(patch('user_model', 0.6))).toBe('applied');
    expect(classifyPatchStatus(patch('user_model', 0.5))).toBe('queued');
    expect(classifyPatchStatus(patch('user_model', 0.39))).toBe('rejected');
    expect(classifyPatchStatus(patch('self_model', 0.7))).toBe('applied');
  });

  it('soul: ≥0.8 apply, 0.6–0.8 queue, <0.6 reject', () => {
    expect(classifyPatchStatus(patch('soul', 0.8))).toBe('applied');
    expect(classifyPatchStatus(patch('soul', 0.65))).toBe('queued');
    expect(classifyPatchStatus(patch('soul', 0.55))).toBe('rejected');
  });

  it('convictions: ≥0.85 apply, 0.7–0.85 queue, <0.7 reject', () => {
    expect(classifyPatchStatus(patch('convictions', 0.85))).toBe('applied');
    expect(classifyPatchStatus(patch('convictions', 0.84))).toBe('queued');
    expect(classifyPatchStatus(patch('convictions', 0.7))).toBe('queued');
    expect(classifyPatchStatus(patch('convictions', 0.69))).toBe('rejected');
  });
});
