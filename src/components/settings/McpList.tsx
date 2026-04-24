import React from 'react';
import { EmptyState } from '@/components/ui/luca';
import type { McpServer } from '@/stores/agentSettingsStore';

interface Props {
  servers: McpServer[];
}

export default function McpList({ servers }: Props) {
  if (servers.length === 0) {
    return <EmptyState text="No MCP servers" hint="Configure MCP servers to extend this agent's capabilities." />;
  }
  return (
    <div className="mcp-list">
      {servers.map((s) => (
        <div key={s.id} className="mcp-item">
          <span className={`mcp-dot${s.status === 'off' ? ' off' : ''}`} aria-hidden="true" />
          <span className="mcp-name">{s.name}</span>
          <span className="mcp-url">{s.url}</span>
          {s.meta && <span className="mcp-meta">{s.meta}</span>}
        </div>
      ))}
    </div>
  );
}
