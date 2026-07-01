import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('group rooms v1 contract', () => {
  const migration = readRepoFile('supabase/migrations/20260701120000_group_rooms_v1.sql');

  it('defines the shared-room tables without retrofitting private chat tables', () => {
    for (const table of [
      'group_rooms',
      'group_room_members',
      'group_room_invites',
      'group_room_agents',
      'group_messages',
      'group_message_mentions',
      'group_agent_jobs',
      'group_memory_candidates',
    ]) {
      expect(migration).toContain(`public.${table}`);
    }

    expect(migration).not.toMatch(/alter table public\.threads/i);
    expect(migration).not.toMatch(/alter table public\.messages/i);
  });

  it('enforces active membership, join-forward visibility, realtime, and attachment storage', () => {
    expect(migration).toContain('public.is_group_room_member');
    expect(migration).toContain('public.can_read_group_message');
    expect(migration).toContain('m.can_see_history_before_join or m.joined_at <= p_created_at');
    expect(migration).toMatch(/alter publication supabase_realtime add table public\.group_messages/i);
    expect(migration).toContain("values ('group-attachments', 'group-attachments', false)");
    expect(migration).toContain("public.is_group_room_member((storage.foldername(name))[1]::uuid)");
  });

  it('keeps assistant/system writes service-owned through edge functions', () => {
    expect(migration).toContain('Service-role edge functions perform writes');
    expect(migration).not.toMatch(/on public\.group_messages\s+for insert/i);
    expect(readRepoFile('supabase/functions/group-message-send/index.ts')).toContain("role: \"user\"");
    expect(readRepoFile('supabase/functions/group-agent-request/index.ts')).toContain("role: \"assistant\"");
    expect(readRepoFile('supabase/functions/_shared/group-rooms.ts')).toContain("role: \"system\"");
  });

  it('covers lifecycle, export, notifications, and real routes', () => {
    expect(migration).toContain('owner_user_id uuid references auth.users(id) on delete set null');
    expect(migration).toContain('set owner_user_id = n.user_id');
    expect(migration).toContain("state = 'archived'");
    expect(migration).toContain('anonymize_group_room_user');
    expect(readRepoFile('supabase/functions/delete-user/index.ts')).toContain('anonymize_group_room_user');
    expect(readRepoFile('supabase/functions/_shared/account-portability/archive.ts')).toContain('group_room_members');
    expect(readRepoFile('src/stores/notificationStore.ts')).toContain("source === 'group-room'");
    expect(readRepoFile('src/App.tsx')).toContain('path="/groups/:roomId"');
    expect(readRepoFile('src/App.tsx')).toContain('path="/group" element={<Navigate to="/groups" replace />}');
  });
});
