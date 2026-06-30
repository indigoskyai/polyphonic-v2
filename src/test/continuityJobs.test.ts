import { describe, expect, it } from 'vitest';
import { claimContinuityJob, finishContinuityJob } from '../../supabase/functions/_shared/continuity/jobs';

function makeSupabase(options: { insertError?: { code?: string; message?: string } } = {}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  return {
    inserts,
    updates,
    client: {
      from(table: string) {
        return {
          insert(row: unknown) {
            inserts.push({ table, row });
            return {
              select() {
                return {
                  single: async () => options.insertError
                    ? { data: null, error: options.insertError }
                    : { data: { id: 'job-1' }, error: null },
                };
              },
            };
          },
          update(row: unknown) {
            updates.push({ table, row });
            return {
              eq: async () => ({ data: null, error: null }),
            };
          },
        };
      },
    },
  };
}

describe('continuity job idempotency', () => {
  it('claims and finishes a source-message scoped job', async () => {
    const sb = makeSupabase();

    const claim = await claimContinuityJob(sb.client, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      sourceMessageId: 'm1',
      jobName: 'skills-distill',
    });

    expect(claim).toEqual({ claimed: true, id: 'job-1' });
    expect(sb.inserts[0]).toMatchObject({
      table: 'continuity_turn_jobs',
      row: {
        user_id: 'u1',
        agent_id: 'luca',
        thread_id: 't1',
        source_message_id: 'm1',
        job_name: 'skills-distill',
        status: 'running',
      },
    });

    await finishContinuityJob(sb.client, 'job-1', 'completed');
    expect(sb.updates[0]).toMatchObject({
      table: 'continuity_turn_jobs',
      row: {
        status: 'completed',
      },
    });
  });

  it('skips an already claimed job on unique constraint replay', async () => {
    const sb = makeSupabase({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });

    const claim = await claimContinuityJob(sb.client, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      sourceMessageId: 'm1',
      jobName: 'mnemos-dialectic',
    });

    expect(claim).toEqual({ claimed: false, reason: 'already_claimed' });
  });
});
