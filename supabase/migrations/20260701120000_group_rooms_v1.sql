-- Group Rooms V1: shared, invite-only rooms for humans and opted-in agents.
-- This is additive by design; private threads/messages stay untouched.

create table if not exists public.group_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Untitled room',
  description text,
  visibility text not null default 'invite_only' check (visibility in ('invite_only')),
  state text not null default 'active' check (state in ('active', 'archived')),
  history_policy text not null default 'join_forward' check (history_policy in ('join_forward')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  state text not null default 'active' check (state in ('invited', 'active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_message_id uuid,
  muted boolean not null default false,
  can_see_history_before_join boolean not null default false,
  display_snapshot jsonb not null default '{}'::jsonb,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.group_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  inviter_user_id uuid references auth.users(id) on delete set null,
  invitee_user_id uuid references auth.users(id) on delete set null,
  invitee_handle text,
  token_hash text unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  history_policy text not null default 'join_forward' check (history_policy in ('join_forward')),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_room_agents (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  display_name text not null,
  avatar_color text,
  mention_policy text not null default 'owner' check (mention_policy in ('owner', 'members', 'blocked')),
  state text not null default 'active' check (state in ('active', 'removed')),
  added_by_user_id uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (room_id, owner_user_id, agent_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_agent_owner_user_id uuid references auth.users(id) on delete set null,
  sender_agent_id text,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  reply_to_id uuid references public.group_messages(id) on delete set null,
  state text not null default 'visible' check (state in ('visible', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_messages_sender_shape check (
    (role = 'user' and sender_agent_owner_user_id is null and sender_agent_id is null)
    or (role = 'assistant' and sender_agent_id is not null)
    or (role = 'system' and sender_user_id is null and sender_agent_owner_user_id is null and sender_agent_id is null)
  )
);

alter table public.group_room_members
  add constraint group_room_members_last_read_message_fk
  foreign key (last_read_message_id) references public.group_messages(id) on delete set null;

create table if not exists public.group_message_mentions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  message_id uuid not null references public.group_messages(id) on delete cascade,
  target_kind text not null check (target_kind in ('user', 'agent')),
  target_user_id uuid references auth.users(id) on delete set null,
  target_agent_owner_user_id uuid references auth.users(id) on delete set null,
  target_agent_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  trigger_message_id uuid references public.group_messages(id) on delete set null,
  requester_user_id uuid references auth.users(id) on delete set null,
  agent_owner_user_id uuid references auth.users(id) on delete set null,
  agent_id text not null,
  request_kind text not null default 'mention' check (request_kind in ('mention', 'manual', 'owner_invite')),
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed', 'canceled')),
  idempotency_key text not null unique,
  error text,
  response_message_id uuid references public.group_messages(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  source_message_id uuid references public.group_messages(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  agent_id text,
  visibility text not null default 'private' check (visibility in ('private', 'room')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  content text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_group_room_members_room_active
  on public.group_room_members (room_id, state, user_id);
create index if not exists idx_group_room_members_user_active
  on public.group_room_members (user_id, state, updated_at desc);
create index if not exists idx_group_room_invites_room_status
  on public.group_room_invites (room_id, status, created_at desc);
create index if not exists idx_group_room_invites_invitee_status
  on public.group_room_invites (invitee_user_id, status, created_at desc);
create index if not exists idx_group_room_agents_room_active
  on public.group_room_agents (room_id, state, owner_user_id, agent_id);
create index if not exists idx_group_messages_room_created
  on public.group_messages (room_id, created_at, id);
create index if not exists idx_group_messages_sender_user
  on public.group_messages (sender_user_id, created_at desc);
create index if not exists idx_group_messages_agent
  on public.group_messages (sender_agent_owner_user_id, sender_agent_id, created_at desc);
create index if not exists idx_group_mentions_message
  on public.group_message_mentions (message_id);
create index if not exists idx_group_agent_jobs_room_status
  on public.group_agent_jobs (room_id, status, created_at desc);
create index if not exists idx_group_memory_candidates_user
  on public.group_memory_candidates (user_id, status, created_at desc);
create index if not exists idx_group_memory_candidates_room
  on public.group_memory_candidates (room_id, visibility, status, created_at desc);

drop trigger if exists group_rooms_updated_at on public.group_rooms;
create trigger group_rooms_updated_at
  before update on public.group_rooms
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_room_members_updated_at on public.group_room_members;
create trigger group_room_members_updated_at
  before update on public.group_room_members
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_room_invites_updated_at on public.group_room_invites;
create trigger group_room_invites_updated_at
  before update on public.group_room_invites
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_room_agents_updated_at on public.group_room_agents;
create trigger group_room_agents_updated_at
  before update on public.group_room_agents
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_messages_updated_at on public.group_messages;
create trigger group_messages_updated_at
  before update on public.group_messages
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_agent_jobs_updated_at on public.group_agent_jobs;
create trigger group_agent_jobs_updated_at
  before update on public.group_agent_jobs
  for each row execute function public.update_updated_at_column();

drop trigger if exists group_memory_candidates_updated_at on public.group_memory_candidates;
create trigger group_memory_candidates_updated_at
  before update on public.group_memory_candidates
  for each row execute function public.update_updated_at_column();

create or replace function public.is_group_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_room_members m
    join public.group_rooms r on r.id = m.room_id
    where m.room_id = p_room_id
      and m.user_id = p_user_id
      and m.state = 'active'
      and r.state = 'active'
  );
$$;

create or replace function public.can_manage_group_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_room_members m
    join public.group_rooms r on r.id = m.room_id
    where m.room_id = p_room_id
      and m.user_id = p_user_id
      and m.state = 'active'
      and m.role in ('owner', 'admin')
      and r.state = 'active'
  );
$$;

create or replace function public.can_read_group_message(
  p_room_id uuid,
  p_created_at timestamptz,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_room_members m
    join public.group_rooms r on r.id = m.room_id
    where m.room_id = p_room_id
      and m.user_id = p_user_id
      and m.state = 'active'
      and r.state = 'active'
      and (m.can_see_history_before_join or m.joined_at <= p_created_at)
  );
$$;

create or replace function public.anonymize_group_room_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with next_owner as (
    select distinct on (r.id)
      r.id as room_id,
      m.user_id
    from public.group_rooms r
    join public.group_room_members m on m.room_id = r.id
    where r.owner_user_id = p_user_id
      and m.user_id <> p_user_id
      and m.state = 'active'
    order by r.id, case m.role when 'admin' then 0 when 'member' then 1 else 2 end, m.joined_at
  )
  update public.group_rooms r
     set owner_user_id = n.user_id,
         updated_at = now()
    from next_owner n
   where r.id = n.room_id;

  with next_owner as (
    select distinct on (r.id)
      r.id as room_id,
      r.owner_user_id as user_id
    from public.group_rooms r
    where r.owner_user_id is not null
  )
  update public.group_room_members m
     set role = 'owner',
         updated_at = now()
    from next_owner n
   where m.room_id = n.room_id
     and m.user_id = n.user_id
     and m.state = 'active';

  update public.group_rooms
     set owner_user_id = null,
         state = 'archived',
         updated_at = now()
   where owner_user_id = p_user_id;

  update public.group_messages
     set metadata = metadata || jsonb_build_object(
           'former_author_user_id', p_user_id::text,
           'author_anonymized_at', now()
         ),
         sender_user_id = null,
         updated_at = now()
   where sender_user_id = p_user_id;

  update public.group_messages
     set metadata = metadata || jsonb_build_object(
           'former_agent_owner_user_id', p_user_id::text,
           'agent_owner_anonymized_at', now()
         ),
         sender_agent_owner_user_id = null,
         sender_agent_id = coalesce(sender_agent_id, 'removed-agent'),
         updated_at = now()
   where sender_agent_owner_user_id = p_user_id;

  update public.group_room_members
     set state = 'removed',
         role = case when role = 'owner' then 'member' else role end,
         left_at = coalesce(left_at, now()),
         updated_at = now()
   where user_id = p_user_id
     and state = 'active';

  update public.group_room_agents
     set state = 'removed',
         removed_at = coalesce(removed_at, now()),
         updated_at = now()
   where owner_user_id = p_user_id
     and state = 'active';

  update public.group_room_invites
     set status = 'revoked',
         updated_at = now()
   where status = 'pending'
     and (inviter_user_id = p_user_id or invitee_user_id = p_user_id);
end;
$$;

grant execute on function public.is_group_room_member(uuid, uuid) to authenticated;
grant execute on function public.can_manage_group_room(uuid, uuid) to authenticated;
grant execute on function public.can_read_group_message(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.anonymize_group_room_user(uuid) to service_role;

alter table public.group_rooms enable row level security;
alter table public.group_room_members enable row level security;
alter table public.group_room_invites enable row level security;
alter table public.group_room_agents enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_mentions enable row level security;
alter table public.group_agent_jobs enable row level security;
alter table public.group_memory_candidates enable row level security;

drop policy if exists "Group rooms are visible to active members" on public.group_rooms;
create policy "Group rooms are visible to active members"
  on public.group_rooms for select
  using (public.is_group_room_member(id));

drop policy if exists "Room admins can update group rooms" on public.group_rooms;

drop policy if exists "Room members are visible in-room" on public.group_room_members;
create policy "Room members are visible in-room"
  on public.group_room_members for select
  using (public.is_group_room_member(room_id) or user_id = auth.uid());

drop policy if exists "Room members can update own read and mute state" on public.group_room_members;

drop policy if exists "Group invites visible to invitees and room admins" on public.group_room_invites;
create policy "Group invites visible to invitees and room admins"
  on public.group_room_invites for select
  using (
    invitee_user_id = auth.uid()
    or inviter_user_id = auth.uid()
    or public.can_manage_group_room(room_id)
  );

drop policy if exists "Group agents visible to active room members" on public.group_room_agents;
create policy "Group agents visible to active room members"
  on public.group_room_agents for select
  using (public.is_group_room_member(room_id));

drop policy if exists "Group messages visible by room history policy" on public.group_messages;
create policy "Group messages visible by room history policy"
  on public.group_messages for select
  using (public.can_read_group_message(room_id, created_at));

drop policy if exists "Group mentions visible with their room messages" on public.group_message_mentions;
create policy "Group mentions visible with their room messages"
  on public.group_message_mentions for select
  using (
    exists (
      select 1
      from public.group_messages gm
      where gm.id = message_id
        and public.can_read_group_message(gm.room_id, gm.created_at)
    )
  );

drop policy if exists "Group agent jobs visible to active room members" on public.group_agent_jobs;
create policy "Group agent jobs visible to active room members"
  on public.group_agent_jobs for select
  using (public.is_group_room_member(room_id));

drop policy if exists "Group memory candidates visible to approvers" on public.group_memory_candidates;
create policy "Group memory candidates visible to approvers"
  on public.group_memory_candidates for select
  using (
    user_id = auth.uid()
    or created_by_user_id = auth.uid()
    or (visibility = 'room' and public.is_group_room_member(room_id))
  );

-- Service-role edge functions perform writes for messages, invites, agents,
-- membership changes, assistant rows, system rows, jobs, and memory decisions.

do $$
begin
  begin
    alter publication supabase_realtime add table public.group_room_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_room_invites;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_room_agents;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_message_mentions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_agent_jobs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_memory_candidates;
  exception when duplicate_object then null;
  end;
end $$;

insert into storage.buckets (id, name, public)
values ('group-attachments', 'group-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Active group members can view group attachments" on storage.objects;
create policy "Active group members can view group attachments"
  on storage.objects for select
  using (
    bucket_id = 'group-attachments'
    and public.is_group_room_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Active group members can upload group attachments" on storage.objects;
create policy "Active group members can upload group attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'group-attachments'
    and auth.role() = 'authenticated'
    and public.is_group_room_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Group attachment owners can update group attachments" on storage.objects;
create policy "Group attachment owners can update group attachments"
  on storage.objects for update
  using (
    bucket_id = 'group-attachments'
    and owner = auth.uid()
    and public.is_group_room_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'group-attachments'
    and owner = auth.uid()
    and public.is_group_room_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Group attachment owners and room admins can delete group attachments" on storage.objects;
create policy "Group attachment owners and room admins can delete group attachments"
  on storage.objects for delete
  using (
    bucket_id = 'group-attachments'
    and (
      owner = auth.uid()
      or public.can_manage_group_room((storage.foldername(name))[1]::uuid)
    )
  );
