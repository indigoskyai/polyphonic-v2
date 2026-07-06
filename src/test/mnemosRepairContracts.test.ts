import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nCREATE OR REPLACE FUNCTION', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe('Polyphonic Mnemos repair contracts', () => {
  const migration = () => readRepoFile('supabase/migrations/20260704120000_mnemos_repair_contracts.sql');
  const followup = () => readRepoFile('supabase/migrations/20260705130000_mnemos_e2e_repair_followup.sql');
  const rescue = () => readRepoFile('supabase/migrations/20260705140000_mnemos_missing_review_tables.sql');

  it('adds explicit full cognition consent with a default-off contract', () => {
    const source = migration();
    const cohort = functionBody(source, 'public.mnemos_cohort()');

    expect(source).toMatch(/full_cognition_enabled boolean NOT NULL DEFAULT false/i);
    expect(cohort).toContain('JOIN public.memory_settings ms');
    expect(cohort).toContain('ms.full_cognition_enabled IS true');
    expect(cohort).toContain('FROM public.user_api_keys k');
    expect(source).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('keeps rehearsal distinct from access and retrieval reconsolidation atomic', () => {
    const source = migration();
    const rehearsal = functionBody(source, 'public.mnemos_rehearse_scope(');
    const retrieval = readRepoFile('supabase/functions/_shared/mnemos/retrieval.ts');

    expect(source).toContain('last_rehearsed_at timestamptz');
    expect(rehearsal).toContain('last_rehearsed_at = v_now');
    expect(rehearsal).not.toContain('last_accessed_at = v_now');
    expect(rehearsal).not.toContain('accessibility =');
    expect(source).toContain('CREATE OR REPLACE FUNCTION public.mnemos_reconsolidate');
    expect(retrieval).toContain('supabase.rpc("mnemos_reconsolidate"');
  });

  it('represents heuristic graph edges as co-occurrence until classified', () => {
    const source = migration();
    const encoding = readRepoFile('supabase/functions/_shared/mnemos/encoding.ts');
    const consolidation = readRepoFile('supabase/functions/_shared/mnemos/consolidation.ts');
    const retrieval = readRepoFile('supabase/functions/_shared/mnemos/retrieval.ts');

    expect(source).toContain("'co_occurs'");
    expect(source).toContain('formed_by text');
    expect(encoding).toContain('connectionType: "co_occurs"');
    expect(encoding).toContain('formedBy: "heuristic"');
    expect(consolidation).toContain('CONNECTION_CLASSIFIER_BATCH = 24');
    expect(consolidation).toContain('connectionType: inferConnectionType');
    expect(consolidation).toContain('return "co_occurs"');
    expect(consolidation).toContain('formed_by: "classifier"');
    expect(retrieval).toContain('co_occurs: 0.4');
  });

  it('makes digest review attribution and Luca preview suggestions separate fields', () => {
    const source = migration();
    const digestAction = readRepoFile('supabase/functions/mnemos-digest-action/index.ts');
    const digestSuggest = readRepoFile('supabase/functions/mnemos-digest-suggest/index.ts');

    expect(source).toContain('reviewed_by text');
    expect(source).toContain('digest_suggestion_action text');
    expect(digestAction).toContain('reviewed_by: "user"');
    expect(digestSuggest).toContain('digest_suggestion_action');
    expect(digestSuggest).not.toContain('review_decision:');
  });

  it('adds dry-run softening proposals and continuity ledger events', () => {
    const source = migration();
    const exposure = followup();
    const rescueSource = rescue();
    const soften = readRepoFile('supabase/functions/mnemos-soften/index.ts');
    const softening = readRepoFile('supabase/functions/_shared/mnemos/softening.ts');

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.mnemos_softening_proposals');
    expect(source).toContain('softening_dry_run boolean NOT NULL DEFAULT true');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.continuity_events');
    expect(rescueSource).toContain('CREATE TABLE IF NOT EXISTS public.mnemos_softening_proposals');
    expect(rescueSource).toContain('CREATE TABLE IF NOT EXISTS public.continuity_events');
    expect(exposure).toContain('GRANT SELECT ON TABLE public.mnemos_softening_proposals TO authenticated');
    expect(exposure).toContain('GRANT SELECT ON TABLE public.continuity_events TO authenticated');
    expect(soften).toContain('softening_dry_run');
    expect(softening).toContain('validateSofteningProposal');
    expect(softening).toContain('status: dryRun ? "proposed" : "applied"');
  });

  it('keeps mnemos-verify bounded, observable, and cleanup-safe by default', () => {
    const source = followup();
    const verify = readRepoFile('supabase/functions/mnemos-verify/index.ts');
    const encoding = readRepoFile('supabase/functions/_shared/mnemos/encoding.ts');

    expect(source).toContain("ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(encoding).toContain('source_context: state.source_context ?? sourceContext');
    expect(verify).toContain('const runDecayCycle = body.run_decay_cycle === true');
    expect(verify).toContain('const runConsolidation = body.run_consolidation === true');
    expect(verify).toContain('source_context: { type: "mnemos_verify", run_id: runId, label: beat.label, agent_id: agentId }');
    expect(verify).toContain('surprise_score: beat.surprise_score');
    expect(verify).toContain('cleanupVerifierArtifacts');
    expect(verify).toContain('.contains("source_context", { type: "mnemos_verify", run_id: runId })');
    expect(verify).toContain('for (const column of ["source_id", "target_id"])');
    expect(verify).toContain('.in(column, engramIds)');
    expect(verify).toContain('run_consolidation must be true');
  });

  it('keeps digest suggestion model formatting failures non-fatal', () => {
    const digestSuggest = readRepoFile('supabase/functions/mnemos-digest-suggest/index.ts');
    expect(digestSuggest).toContain('normalizeDigestSuggestions(raw)');
    expect(digestSuggest).toContain('mnemos-digest-suggest parse failed');
    expect(digestSuggest).toContain('return []');
  });

  it('surfaces belief synthesis health without changing clamp bounds', () => {
    const source = migration();
    const verify = readRepoFile('supabase/functions/mnemos-verify/index.ts');
    const constants = readRepoFile('supabase/functions/_shared/mnemos/constants.ts');
    const consolidation = readRepoFile('supabase/functions/_shared/mnemos/consolidation.ts');

    expect(source).toContain('beliefs_active_total');
    expect(source).toContain('beliefs_formed_7d');
    expect(source).toContain('beliefs_revised_7d');
    expect(verify).toContain('BELIEF_LLM_SYNTHESIS_ENABLED');
    expect(constants).toContain('BELIEF_CONFIDENCE_FLOOR = 0.05');
    expect(constants).toContain('BELIEF_CONFIDENCE_CEILING = 0.95');
    expect(consolidation).toContain('clamp(conf, BELIEF_CONFIDENCE_FLOOR, BELIEF_CONFIDENCE_CEILING)');
  });
});
