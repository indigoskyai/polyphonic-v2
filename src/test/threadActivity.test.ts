import { describe, expect, it } from 'vitest';
import { activityReferencesThread, collectActivityThreadRefs } from '@/lib/threadActivity';

describe('thread activity scoping', () => {
  it('does not treat global activity as thread activity', () => {
    expect(activityReferencesThread({ source: 'autonomous', dream: 'global' }, 'thread-1')).toBe(false);
    expect(activityReferencesThread(null, 'thread-1')).toBe(false);
  });

  it('matches direct and parent thread references', () => {
    expect(activityReferencesThread({ thread_id: 'thread-1' }, 'thread-1')).toBe(true);
    expect(activityReferencesThread({ parent_thread_id: 'thread-1' }, 'thread-1')).toBe(true);
    expect(activityReferencesThread({ thread_id: 'thread-2' }, 'thread-1')).toBe(false);
  });

  it('finds nested and plural thread references', () => {
    const refs = collectActivityThreadRefs({
      source_context: { source_thread_id: 'thread-1' },
      metadata: { thread_ids: ['thread-2', 'thread-3'] },
      runtime: { parentThreadId: 'thread-4', conversationIds: ['thread-5'] },
      unrelated: { message_id: 'message-1' },
    });

    expect(refs).toEqual(['thread-1', 'thread-2', 'thread-3', 'thread-4', 'thread-5']);
    expect(activityReferencesThread({ metadata: { thread_ids: ['thread-2'] } }, 'thread-2')).toBe(true);
    expect(activityReferencesThread({ runtime: { parentThreadId: 'thread-4' } }, 'thread-4')).toBe(true);
  });
});
