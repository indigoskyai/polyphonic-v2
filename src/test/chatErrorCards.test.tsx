import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentErroredCard from '@/components/states/AgentErroredCard';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('chat agent error cards', () => {
  it('renders arbitrary agent names and exposes a dismiss action', () => {
    render(
      <AgentErroredCard
        responderLabel="Cortex Worker"
        message="The task failed."
        detail="request_id: req_123"
        occurredAt="2026-06-29T08:00:00.000Z"
        onRetry={vi.fn()}
        onViewLogs={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Cortex Worker: runtime error')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('resolves retried or dismissed cards instead of leaving stale failures in chat', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');

    expect(chatView).toContain("errorStatus === 'dismissed' || errorStatus === 'retried'");
    expect(chatView).toContain("resolveErrorCard('retried')");
    expect(chatView).toContain("resolveErrorCard('dismissed')");
    expect(chatView).toContain("error_resolved_at");
  });
});
