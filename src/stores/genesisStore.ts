import { create } from 'zustand';
import type { ShapeIndex } from '@/lib/genesisShapes';

/**
 * genesisStore — drives the agent-creation ceremony overlay.
 *
 * The forge card calls celebrate() on a successful create, handing over the
 * agent's shape, name, and the card's on-screen rect. AgentCreationShimmer
 * (mounted at app root) plays: whole-screen particle wash → swirl inward and
 * coalesce into the agent's shape at the card's center → hold. It calls
 * onFormed() when the shape has settled (so the card can reveal "say hello"),
 * and stays up until dismiss().
 */

export interface CelebrateArgs {
  agentId: string;
  agentName: string;
  shapeIndex: ShapeIndex;
  /** Card center + size in viewport px, so particles converge onto the card. */
  cardCx: number;
  cardCy: number;
  cardSize: number;
}

interface GenesisState {
  active: boolean;
  runId: number;
  args: CelebrateArgs | null;
  /** flips true once the shape has coalesced — the card reveals "say hello" */
  formed: boolean;
  celebrate: (args: CelebrateArgs) => void;
  markFormed: () => void;
  dismiss: () => void;
}

export const useGenesisStore = create<GenesisState>((set) => ({
  active: false,
  runId: 0,
  args: null,
  formed: false,
  celebrate: (args) => set((s) => ({ active: true, runId: s.runId + 1, args, formed: false })),
  markFormed: () => set({ formed: true }),
  dismiss: () => set({ active: false, formed: false }),
}));
