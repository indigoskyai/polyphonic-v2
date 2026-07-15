-- Private, durable attachments shared by direct chats and group rooms.
do $$ begin
  create type public.chat_attachment_status as enum (
    'uploading', 'quarantined', 'scanning', 'extracting', 'ready', 'failed', 'rejected', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_batch_id uuid not null default gen_random_uuid(),
  thread_id uuid references public.threads(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  room_id uuid references public.group_rooms(id) on delete cascade,
  group_message_id uuid references public.group_messages(id) on delete cascade,
  bucket text not null default 'chat-attachments' check (bucket in ('chat-attachments', 'group-attachments')),
  storage_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  declared_mime_type text not null default 'application/octet-stream',
  verified_mime_type text,
  kind text not null check (kind in ('image','document','spreadsheet','presentation','code','text','audio','video','archive','file')),
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  duplicate_of uuid references public.chat_attachments(id) on delete set null,
  status public.chat_attachment_status not null default 'uploading',
  extracted_text text,
  derivatives jsonb not null default '[]'::jsonb check (jsonb_typeof(derivatives) = 'array'),
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  processing_error text,
  page_count integer,
  duration_seconds numeric,
  width integer,
  height integer,
  scanned_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path),
  check (not (thread_id is not null and room_id is not null)),
  check (message_id is null or thread_id is not null),
  check (group_message_id is null or room_id is not null)
);

create index if not exists chat_attachments_user_created_idx on public.chat_attachments(user_id, created_at desc);
create index if not exists chat_attachments_batch_idx on public.chat_attachments(user_id, upload_batch_id);
create index if not exists chat_attachments_thread_idx on public.chat_attachments(thread_id, created_at) where thread_id is not null;
create index if not exists chat_attachments_room_idx on public.chat_attachments(room_id, created_at) where room_id is not null;
create index if not exists chat_attachments_message_idx on public.chat_attachments(message_id) where message_id is not null;
create index if not exists chat_attachments_group_message_idx on public.chat_attachments(group_message_id) where group_message_id is not null;
create index if not exists chat_attachments_checksum_idx on public.chat_attachments(user_id, sha256) where sha256 is not null;
create index if not exists chat_attachments_processing_idx on public.chat_attachments(status, created_at)
  where status in ('quarantined', 'scanning', 'extracting', 'failed');

create table if not exists public.chat_attachment_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quota_bytes bigint not null check (quota_bytes between 104857600 and 107374182400),
  updated_at timestamptz not null default now()
);

alter table public.chat_attachment_quotas enable row level security;
revoke all on public.chat_attachment_quotas from anon, authenticated;

create or replace function public.enforce_chat_attachment_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  batch_count integer;
  usage_bytes bigint;
  quota_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*) into batch_count
  from public.chat_attachments
  where user_id = new.user_id
    and upload_batch_id = new.upload_batch_id
    and status not in ('cancelled', 'rejected');
  if batch_count >= 10 then
    raise exception 'A turn can include at most 10 files';
  end if;

  select coalesce(sum(size_bytes), 0)::bigint into usage_bytes
  from public.chat_attachments
  where user_id = new.user_id and status not in ('cancelled', 'rejected');
  select coalesce(
    (select configured.quota_bytes from public.chat_attachment_quotas configured where configured.user_id = new.user_id),
    2147483648
  ) into quota_bytes;
  if usage_bytes + new.size_bytes > quota_bytes then
    raise exception 'Attachment storage quota exceeded';
  end if;
  return new;
end;
$$;

alter table public.chat_attachments enable row level security;

drop policy if exists "Attachment owners can read" on public.chat_attachments;
create policy "Attachment owners can read" on public.chat_attachments for select using (auth.uid() = user_id);

drop policy if exists "Active room members can read attachments" on public.chat_attachments;
create policy "Active room members can read attachments" on public.chat_attachments for select using (
  room_id is not null and exists (
    select 1 from public.group_room_members member
    where member.room_id = chat_attachments.room_id
      and member.user_id = auth.uid()
      and member.state = 'active'
  )
);

drop policy if exists "Attachment owners can delete drafts" on public.chat_attachments;
create policy "Attachment owners can delete drafts" on public.chat_attachments for delete using (
  auth.uid() = user_id and message_id is null and group_message_id is null
);

revoke insert, update on public.chat_attachments from anon, authenticated;

alter table public.messages add column if not exists attachment_ids uuid[] not null default '{}';
alter table public.group_messages add column if not exists attachment_ids uuid[] not null default '{}';
alter table public.subagent_tasks add column if not exists attachment_ids uuid[] not null default '{}';

create or replace function public.bind_direct_message_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing_count integer;
  bound_count integer;
begin
  if cardinality(new.attachment_ids) = 0 then return new; end if;
  select count(*) into existing_count
  from public.chat_attachments attachment
  where attachment.id = any(new.attachment_ids);
  if existing_count = 0 then return new; end if;
  if existing_count <> cardinality(new.attachment_ids) then
    raise exception 'One or more attachments do not exist';
  end if;
  update public.chat_attachments attachment
  set thread_id = new.thread_id, message_id = new.id, updated_at = now()
  where attachment.id = any(new.attachment_ids)
    and attachment.user_id = new.user_id
    and attachment.status = 'ready'
    and attachment.room_id is null
    and attachment.group_message_id is null
    and (attachment.thread_id is null or attachment.thread_id = new.thread_id)
    and attachment.message_id is null;
  get diagnostics bound_count = row_count;
  if bound_count <> cardinality(new.attachment_ids) then
    raise exception 'One or more attachments cannot be bound to this message';
  end if;
  return new;
end;
$$;

drop trigger if exists bind_direct_message_attachments_after_insert on public.messages;
create trigger bind_direct_message_attachments_after_insert
after insert on public.messages for each row execute function public.bind_direct_message_attachments();

create or replace function public.bind_group_message_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
declare bound_count integer;
begin
  if cardinality(new.attachment_ids) = 0 then return new; end if;
  if new.sender_user_id is null then
    raise exception 'Only a human sender can bind uploaded attachments';
  end if;
  update public.chat_attachments attachment
  set room_id = new.room_id, group_message_id = new.id, updated_at = now()
  where attachment.id = any(new.attachment_ids)
    and attachment.user_id = new.sender_user_id
    and attachment.status = 'ready'
    and attachment.thread_id is null
    and attachment.message_id is null
    and (attachment.room_id is null or attachment.room_id = new.room_id)
    and attachment.group_message_id is null;
  get diagnostics bound_count = row_count;
  if bound_count <> cardinality(new.attachment_ids) then
    raise exception 'One or more attachments cannot be bound to this group message';
  end if;
  return new;
end;
$$;

drop trigger if exists bind_group_message_attachments_after_insert on public.group_messages;
create trigger bind_group_message_attachments_after_insert
after insert on public.group_messages for each row execute function public.bind_group_message_attachments();

create table if not exists public.attachment_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null unique references public.chat_attachments(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','complete','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 12),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attachment_processing_jobs_queue_idx
  on public.attachment_processing_jobs(status, available_at, created_at)
  where status = 'queued';

alter table public.attachment_processing_jobs enable row level security;
revoke all on public.attachment_processing_jobs from anon, authenticated;

create or replace function public.chat_attachment_usage_bytes(p_user_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(size_bytes), 0)::bigint
  from public.chat_attachments
  where user_id = p_user_id and status not in ('rejected', 'cancelled');
$$;
revoke all on function public.chat_attachment_usage_bytes(uuid) from public, anon, authenticated;
grant execute on function public.chat_attachment_usage_bytes(uuid) to service_role;

create or replace function public.lease_attachment_processing_job(p_worker_id text, p_lease_seconds integer default 300)
returns setof public.attachment_processing_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidate as (
    select id
    from public.attachment_processing_jobs
    where (
      status = 'queued' and available_at <= now()
    ) or (
      status = 'processing' and locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds))
    )
    order by available_at, created_at
    for update skip locked
    limit 1
  )
  update public.attachment_processing_jobs job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      locked_by = left(p_worker_id, 200),
      updated_at = now()
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$$;
revoke all on function public.lease_attachment_processing_job(text, integer) from public, anon, authenticated;
grant execute on function public.lease_attachment_processing_job(text, integer) to service_role;

with legacy as (
  select message.id message_id, message.thread_id, message.user_id, item.value attachment, item.ordinality,
    item.value->'meta'->>'path' storage_path,
    coalesce(item.value->'meta'->>'name', 'attachment') original_name,
    coalesce(item.value->'meta'->>'mime', 'application/octet-stream') mime,
    case when item.value->'meta'->>'size' ~ '^[0-9]+$' then (item.value->'meta'->>'size')::bigint else 1 end size_bytes,
    (substr(md5(message.id::text || ':' || item.ordinality::text),1,8) || '-' || substr(md5(message.id::text || ':' || item.ordinality::text),9,4) || '-4' || substr(md5(message.id::text || ':' || item.ordinality::text),14,3) || '-a' || substr(md5(message.id::text || ':' || item.ordinality::text),18,3) || '-' || substr(md5(message.id::text || ':' || item.ordinality::text),21,12))::uuid canonical_id
  from public.messages message
  cross join lateral jsonb_array_elements(coalesce(message.attachments, '[]'::jsonb)) with ordinality item(value, ordinality)
  where item.value->'meta'->>'bucket' = 'chat-attachments'
    and nullif(item.value->'meta'->>'path', '') is not null
)
insert into public.chat_attachments (
  id, user_id, upload_batch_id, thread_id, message_id, bucket, storage_path, original_name,
  declared_mime_type, verified_mime_type, kind, size_bytes, status, capabilities, ready_at
)
select canonical_id, user_id, message_id, thread_id, message_id, 'chat-attachments', storage_path,
  left(original_name, 255), mime, mime,
  case when mime like 'image/%' then 'image' when attachment->>'type' = 'code' then 'code' else 'file' end,
  greatest(1, least(size_bytes, 104857600)), 'ready',
  jsonb_build_object('download', true, 'vision', mime like 'image/%', 'text', attachment->>'type' = 'code'), now()
from legacy
on conflict (bucket, storage_path) do nothing;

with legacy_group as (
  select message.id group_message_id, message.room_id, message.sender_user_id user_id, item.value attachment, item.ordinality,
    item.value->>'path' storage_path,
    coalesce(item.value->>'name', 'attachment') original_name,
    coalesce(item.value->>'content_type', 'application/octet-stream') mime,
    case when item.value->>'size' ~ '^[0-9]+$' then (item.value->>'size')::bigint else 1 end size_bytes,
    (substr(md5(message.id::text || ':group:' || item.ordinality::text),1,8) || '-' || substr(md5(message.id::text || ':group:' || item.ordinality::text),9,4) || '-4' || substr(md5(message.id::text || ':group:' || item.ordinality::text),14,3) || '-a' || substr(md5(message.id::text || ':group:' || item.ordinality::text),18,3) || '-' || substr(md5(message.id::text || ':group:' || item.ordinality::text),21,12))::uuid canonical_id
  from public.group_messages message
  cross join lateral jsonb_array_elements(coalesce(message.attachments, '[]'::jsonb)) with ordinality item(value, ordinality)
  where message.sender_user_id is not null
    and item.value->>'bucket' = 'group-attachments'
    and nullif(item.value->>'path', '') is not null
)
insert into public.chat_attachments (
  id, user_id, upload_batch_id, room_id, group_message_id, bucket, storage_path, original_name,
  declared_mime_type, verified_mime_type, kind, size_bytes, status, capabilities, ready_at
)
select canonical_id, user_id, group_message_id, room_id, group_message_id, 'group-attachments', storage_path,
  left(original_name, 255), mime, mime,
  case when mime like 'image/%' then 'image' else 'file' end,
  greatest(1, least(size_bytes, 104857600)), 'ready',
  jsonb_build_object('download', true, 'vision', mime like 'image/%'), now()
from legacy_group
on conflict (bucket, storage_path) do nothing;

update public.messages message set attachment_ids = attachment_ids.value
from (
  select message_id, array_agg(id order by created_at, id) value
  from public.chat_attachments where message_id is not null group by message_id
) attachment_ids
where message.id = attachment_ids.message_id and cardinality(message.attachment_ids) = 0;

update public.group_messages message set attachment_ids = attachment_ids.value
from (
  select group_message_id, array_agg(id order by created_at, id) value
  from public.chat_attachments where group_message_id is not null group by group_message_id
) attachment_ids
where message.id = attachment_ids.group_message_id and cardinality(message.attachment_ids) = 0;

drop trigger if exists enforce_chat_attachment_quota_before_insert on public.chat_attachments;
create trigger enforce_chat_attachment_quota_before_insert
before insert on public.chat_attachments for each row execute function public.enforce_chat_attachment_quota();

drop policy if exists "Users can upload validated chat attachments" on storage.objects;
drop policy if exists "Users can upload their own chat attachments" on storage.objects;
drop policy if exists "Users can upload canonical chat attachments" on storage.objects;
create policy "Users can upload canonical chat attachments" on storage.objects for insert with check (
  bucket_id = 'chat-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
  and octet_length(name) < 500
);

drop policy if exists "Users can view own chat attachments" on storage.objects;

create or replace function public.delete_chat_attachment_objects()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare derivative jsonb;
begin
  delete from storage.objects where bucket_id = old.bucket and name = old.storage_path;
  for derivative in select * from jsonb_array_elements(coalesce(old.derivatives, '[]'::jsonb)) loop
    if coalesce(derivative->>'storage_path', derivative->>'storagePath') is not null then
      delete from storage.objects
      where bucket_id = old.bucket
        and name = coalesce(derivative->>'storage_path', derivative->>'storagePath');
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists delete_chat_attachment_objects_after_row on public.chat_attachments;
create trigger delete_chat_attachment_objects_after_row
after delete on public.chat_attachments for each row execute function public.delete_chat_attachment_objects();

drop trigger if exists set_chat_attachments_updated_at on public.chat_attachments;
create trigger set_chat_attachments_updated_at before update on public.chat_attachments
for each row execute function public.update_updated_at_column();

drop trigger if exists set_attachment_processing_jobs_updated_at on public.attachment_processing_jobs;
create trigger set_attachment_processing_jobs_updated_at before update on public.attachment_processing_jobs
for each row execute function public.update_updated_at_column();

alter publication supabase_realtime add table public.chat_attachments;