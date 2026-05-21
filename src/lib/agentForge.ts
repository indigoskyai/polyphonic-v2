import type { Message } from '@/stores/threadStore';

export type ForgeAction = 'create' | 'update';
export type ForgeStatus = 'pending' | 'approved' | 'canceled' | 'failed' | 'committing';
export type ForgeIdentityDocType = 'soul' | 'convictions' | 'user_model' | 'self_model';

export interface ForgeBlueprint {
  name: string;
  role: string;
  model: string;
  avatar_color: string;
  prompt: string;
  voice_description: string;
  summary: string;
  identity_docs: Record<ForgeIdentityDocType, string>;
}

export interface ForgeProposalMetadata {
  forge_kind: 'agent_forge_proposal';
  forge_status: ForgeStatus;
  forge_action: ForgeAction;
  target_agent_id?: string | null;
  created_agent_id?: string | null;
  error?: string | null;
  blueprint: ForgeBlueprint;
}

export const FORGE_DOC_ORDER: Array<{ id: ForgeIdentityDocType; label: string }> = [
  { id: 'soul', label: 'SOUL.md' },
  { id: 'convictions', label: 'Convictions.md' },
  { id: 'user_model', label: 'User-model.md' },
  { id: 'self_model', label: 'Self-model.md' },
];

export function getForgeProposalMetadata(message: Message): ForgeProposalMetadata | null {
  const metadata = (message.metadata || {}) as Partial<ForgeProposalMetadata> & Record<string, unknown>;
  if (metadata.forge_kind !== 'agent_forge_proposal') return null;
  if (!metadata.blueprint || typeof metadata.blueprint !== 'object') return null;
  const blueprint = metadata.blueprint as ForgeBlueprint;
  if (!blueprint.name || !blueprint.identity_docs) return null;
  return {
    forge_kind: 'agent_forge_proposal',
    forge_status: (metadata.forge_status as ForgeStatus) || 'pending',
    forge_action: metadata.forge_action === 'update' ? 'update' : 'create',
    target_agent_id: typeof metadata.target_agent_id === 'string' ? metadata.target_agent_id : null,
    created_agent_id: typeof metadata.created_agent_id === 'string' ? metadata.created_agent_id : null,
    error: typeof metadata.error === 'string' ? metadata.error : null,
    blueprint,
  };
}
