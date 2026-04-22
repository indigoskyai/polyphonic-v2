create table if not exists public.profile_daily_pulse (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists profile_daily_pulse_user_day_idx
  on public.profile_daily_pulse (user_id, day desc);

alter table public.profile_daily_pulse enable row level security;

create policy "Users can view own daily pulse"
  on public.profile_daily_pulse for select
  using (auth.uid() = user_id);

create policy "Users can insert own daily pulse"
  on public.profile_daily_pulse for insert
  with check (auth.uid() = user_id);

create policy "Users can update own daily pulse"
  on public.profile_daily_pulse for update
  using (auth.uid() = user_id);

create policy "Users can delete own daily pulse"
  on public.profile_daily_pulse for delete
  using (auth.uid() = user_id);

create policy "Service role full access profile_daily_pulse"
  on public.profile_daily_pulse for all
  using (auth.role() = 'service_role');