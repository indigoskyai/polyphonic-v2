// Minimal Solana wallet helper. Detects common injected wallets and provides
// connect + signMessage. Covers Phantom, Solflare, Backpack, Glow, OKX —
// the vast majority of SPL holders.

import bs58 from 'bs58';

export type WalletId = 'phantom' | 'solflare' | 'backpack' | 'glow' | 'okx';

export interface DetectedWallet {
  id: WalletId;
  name: string;
  provider: SolanaProvider;
  icon?: string;
}

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signMessage: (msg: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
}

const WALLET_META: Record<WalletId, { name: string; downloadUrl: string }> = {
  phantom: { name: 'Phantom', downloadUrl: 'https://phantom.app/download' },
  solflare: { name: 'Solflare', downloadUrl: 'https://solflare.com/download' },
  backpack: { name: 'Backpack', downloadUrl: 'https://backpack.app/downloads' },
  glow: { name: 'Glow', downloadUrl: 'https://glow.app/download' },
  okx: { name: 'OKX Wallet', downloadUrl: 'https://www.okx.com/web3' },
};

export function detectWallets(): DetectedWallet[] {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  const out: DetectedWallet[] = [];

  const phantom = w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
  if (phantom) out.push({ id: 'phantom', name: 'Phantom', provider: phantom });

  if (w.solflare?.isSolflare || w.solflare) out.push({ id: 'solflare', name: 'Solflare', provider: w.solflare });

  const backpack = w.backpack?.solana ?? (w.xnft?.solana ? w.xnft.solana : null);
  if (backpack) out.push({ id: 'backpack', name: 'Backpack', provider: backpack });

  if (w.glow) out.push({ id: 'glow', name: 'Glow', provider: w.glow });
  if (w.okxwallet?.solana) out.push({ id: 'okx', name: 'OKX Wallet', provider: w.okxwallet.solana });

  return out;
}

export function getWalletDownloadUrl(id: WalletId): string {
  return WALLET_META[id].downloadUrl;
}

export async function connectAndSign(
  provider: SolanaProvider,
  message: string,
): Promise<{ address: string; signatureBase58: string }> {
  const conn = await provider.connect();
  const address = conn.publicKey.toString();
  const encoded = new TextEncoder().encode(message);
  const result = await provider.signMessage(encoded, 'utf8');
  const sig = (result as any).signature ?? result;
  const signatureBase58 = bs58.encode(sig as Uint8Array);
  return { address, signatureBase58 };
}
