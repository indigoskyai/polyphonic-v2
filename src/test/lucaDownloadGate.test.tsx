import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
  },
}));

import LucaDownloadGate from '@/components/download/LucaDownloadGate';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Luca private beta download gate', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('opens a passphrase dialog from the public landing trigger', () => {
    render(<LucaDownloadGate />);

    fireEvent.click(screen.getByRole('button', { name: /download luca/i }));

    expect(screen.getByRole('dialog', { name: /download luca for macos/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock download/i })).toBeInTheDocument();
  });

  it('does not call the edge function for an empty passphrase', () => {
    render(<LucaDownloadGate />);

    fireEvent.click(screen.getByRole('button', { name: /download luca/i }));
    fireEvent.click(screen.getByRole('button', { name: /unlock download/i }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter the beta passphrase/i);
  });

  it('calls the edge function and starts the returned download', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        downloadUrl: 'https://downloads.polyphonic.chat/Luca.dmg?token=short',
        fileName: 'Luca.dmg',
        expiresInSeconds: 900,
      },
      error: null,
    });

    render(<LucaDownloadGate />);

    fireEvent.click(screen.getByRole('button', { name: /download luca/i }));
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: ' private-beta ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock download/i }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('luca-download', {
        body: {
          passphrase: 'private-beta',
          platform: 'macos-arm64',
        },
      });
      expect(clickSpy).toHaveBeenCalled();
    });

    expect(await screen.findByText(/unlocked/i)).toBeInTheDocument();
    clickSpy.mockRestore();
  });

  it('keeps the beta passphrase on the server side', () => {
    const component = readRepoFile('src/components/download/LucaDownloadGate.tsx');
    const edge = readRepoFile('supabase/functions/luca-download/index.ts');
    const config = readRepoFile('supabase/config.toml');

    expect(component).toContain('supabase.functions.invoke<LucaDownloadResponse>');
    expect(component).toContain("'luca-download'");
    expect(component).not.toContain('LUCA_DOWNLOAD_PASSPHRASE');
    expect(edge).toContain('LUCA_DOWNLOAD_PASSPHRASE');
    expect(edge).toContain('MAX_FAILED_ATTEMPTS');
    expect(edge).toContain('LUCA_DOWNLOAD_DISABLED');
    expect(edge).toContain('retryAfterSeconds');
    expect(edge).toContain('LUCA_DOWNLOAD_STORAGE_BUCKET');
    expect(edge).toContain('createSignedUrl');
    expect(config).toMatch(/\[functions\.luca-download\]\s+verify_jwt = false/);
  });
});
