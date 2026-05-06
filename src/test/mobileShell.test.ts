import { describe, expect, it } from 'vitest';
import { getMobileSurfaceMeta } from '@/lib/mobileShell';

describe('mobile shell surface metadata', () => {
  it('uses thread context for chat thread routes', () => {
    expect(getMobileSurfaceMeta('/chat/abc', 'Ember bridge')).toEqual({
      title: 'Ember bridge',
      subtitle: 'Luca · Opus 4.7',
      contextAction: 'thread-detail',
    });
  });

  it('falls back cleanly for a new chat route', () => {
    expect(getMobileSurfaceMeta('/chat')).toEqual({
      title: 'Polyphonic',
      subtitle: 'Luca · Opus 4.7',
      contextAction: 'activity',
    });
  });

  it('labels core app surfaces with activity context', () => {
    expect(getMobileSurfaceMeta('/memory').title).toBe('Memory');
    expect(getMobileSurfaceMeta('/profile/identity').subtitle).toBe('Psychological portrait');
    expect(getMobileSurfaceMeta('/settings/models').contextAction).toBe('activity');
  });
});
