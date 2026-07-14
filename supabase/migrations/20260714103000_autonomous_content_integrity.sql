create table if not exists public.autonomous_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text,
  writer text not null,
  status text not null check (status in ('failed', 'rejected')),
  reason text not null,
  attempts integer not null default 1,
  model text,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.autonomous_generation_events enable row level security;
drop policy if exists "Users can view own autonomous generation events" on public.autonomous_generation_events;
create policy "Users can view own autonomous generation events" on public.autonomous_generation_events
  for select using (auth.uid() = user_id);

do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'thought_stream',
    'journal_entries',
    'curiosity_questions',
    'memory_candidates',
    'observer_logs',
    'beliefs',
    'thought_initiations',
    'engrams',
    'memories',
    'entity_activity_log'
  ] loop
    execute format('alter table public.%I add column if not exists content_integrity_status text not null default ''valid''', table_name);
    execute format('alter table public.%I add column if not exists content_integrity_reason text', table_name);
    execute format('alter table public.%I add column if not exists content_hidden_at timestamptz', table_name);
    constraint_name := table_name || '_content_integrity_status_check';
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (content_integrity_status in (''valid'', ''suspect'', ''rejected''))',
        table_name,
        constraint_name
      );
    end if;
  end loop;
end $$;

-- Exact prompt-template leakage is preserved for exports/audits but hidden from
-- normal product views. These signatures intentionally target definite leaks,
-- not ordinary discussion about prompts or formatting.
update public.thought_stream
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.journal_entries
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.curiosity_questions
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where question ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.memory_candidates
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.beliefs
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.thought_initiations
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where message ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.engrams
set content_integrity_status = 'rejected', content_integrity_reason = 'legacy_prompt_template_leak', content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.memories
set content_integrity_status = 'rejected', content_integrity_reason = 'legacy_prompt_template_leak', content_hidden_at = now()
where content ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.entity_activity_log
set content_integrity_status = 'rejected', content_integrity_reason = 'legacy_prompt_template_leak', content_hidden_at = now()
where coalesce(summary, '') ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))'
   or coalesce(title, '') ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

update public.observer_logs
set content_integrity_status = 'rejected',
    content_integrity_reason = 'legacy_prompt_template_leak',
    content_hidden_at = now()
where coalesce(observations::text, '') ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))'
   or coalesce(synthesis, '') ~* '(\[text\].*SALIENCE\s*:|SALIENCE\s*:\s*\[0(\.0)?\s*-\s*1(\.0)?\]|TAGS\s*:\s*\[(tags?|comma-separated))';

-- Heuristic mid-sentence rows remain visible and exportable, but detail views
-- can label them for review. New writes never reach this state because the
-- shared generation gate rejects them before persistence.
update public.thought_stream
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.journal_entries
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.curiosity_questions
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(question) >= 20 and question !~ '\?["''’”)*\]]*$';

update public.memory_candidates
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.beliefs
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.thought_initiations
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(message) >= 40 and message !~ '[.!?…]["''’”)*\]]*$';

update public.engrams
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.memories
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(content) >= 40 and content !~ '[.!?…]["''’”)*\]]*$';

update public.entity_activity_log
set content_integrity_status = 'suspect', content_integrity_reason = 'legacy_possible_truncation'
where content_integrity_status = 'valid' and length(coalesce(summary, '')) >= 40 and summary !~ '[.!?…]["''’”)*\]]*$';

create index if not exists thought_stream_integrity_idx on public.thought_stream(user_id, content_integrity_status, created_at desc);
create index if not exists journal_entries_integrity_idx on public.journal_entries(user_id, content_integrity_status, created_at desc);
