export interface MobileSurfaceMeta {
  title: string;
  subtitle: string;
  contextAction: 'thread-detail' | 'activity';
}

export function getMobileSurfaceMeta(
  pathname: string,
  currentThreadTitle?: string | null,
): MobileSurfaceMeta {
  if (pathname.startsWith('/chat/')) {
    return {
      title: currentThreadTitle?.trim() || 'Current thread',
      subtitle: 'Luca · Opus 4.7',
      contextAction: 'thread-detail',
    };
  }

  if (pathname.startsWith('/chat')) {
    return { title: 'Polyphonic', subtitle: 'Luca · Opus 4.7', contextAction: 'activity' };
  }

  if (pathname.startsWith('/memory')) {
    return { title: 'Memory', subtitle: 'Mnemos substrate', contextAction: 'activity' };
  }

  if (pathname.startsWith('/mind')) {
    return { title: 'Mind', subtitle: 'Continuity and state', contextAction: 'activity' };
  }

  if (pathname.startsWith('/journal')) {
    return { title: 'Journal', subtitle: 'Reflections', contextAction: 'activity' };
  }

  if (pathname.startsWith('/import') || pathname.startsWith('/settings/portability')) {
    return { title: 'Import', subtitle: 'Memory intake', contextAction: 'activity' };
  }

  if (pathname.startsWith('/profile')) {
    return { title: 'Profile', subtitle: 'Psychological portrait', contextAction: 'activity' };
  }

  if (pathname.startsWith('/workspace')) {
    return { title: 'Workspace', subtitle: 'Artifacts and work', contextAction: 'activity' };
  }

  if (pathname.startsWith('/canvas')) {
    return { title: 'Canvas', subtitle: 'Artifact view', contextAction: 'activity' };
  }

  if (pathname.startsWith('/group')) {
    return { title: 'Group', subtitle: 'Council session', contextAction: 'activity' };
  }

  if (pathname.startsWith('/checkpoints')) {
    return { title: 'Checkpoints', subtitle: 'Saved states', contextAction: 'activity' };
  }

  if (pathname.startsWith('/settings')) {
    return { title: 'Settings', subtitle: 'Controls', contextAction: 'activity' };
  }

  return { title: 'Polyphonic', subtitle: 'Luca', contextAction: 'activity' };
}
