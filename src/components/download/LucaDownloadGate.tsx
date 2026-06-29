import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, LockKeyhole, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type LucaDownloadResponse = {
  ok?: boolean;
  downloadUrl?: string;
  fileName?: string;
  expiresInSeconds?: number;
  error?: string;
};

function openLucaDownloadUrl(downloadUrl: string, fileName?: string) {
  const parsed = new URL(downloadUrl, window.location.href);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Download link is not a valid web URL.');
  }

  const anchor = document.createElement('a');
  anchor.href = parsed.toString();
  if (fileName) anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function LucaDownloadGate() {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setError('');
    setSuccess('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = passphrase.trim();
    setError('');
    setSuccess('');

    if (!value) {
      setError('Enter the beta passphrase to unlock the download.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<LucaDownloadResponse>(
        'luca-download',
        {
          body: {
            passphrase: value,
            platform: 'macos-arm64',
          },
        },
      );

      if (invokeError) {
        throw new Error(invokeError.message || 'The download gate is unavailable.');
      }

      if (!data?.ok || !data.downloadUrl) {
        throw new Error(data?.error || 'The passphrase did not unlock a download.');
      }

      openLucaDownloadUrl(data.downloadUrl, data.fileName || 'Luca.dmg');
      setPassphrase('');
      setSuccess(
        data.expiresInSeconds
          ? `Unlocked. Your download link expires in about ${Math.ceil(data.expiresInSeconds / 60)} minutes.`
          : 'Unlocked. Your download should begin now.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock the Luca download.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="luca-download-trigger"
        onClick={() => {
          setOpen(true);
          setError('');
          setSuccess('');
        }}
      >
        <ArrowDownToLine size={14} strokeWidth={1.65} aria-hidden="true" />
        <span>Download Luca</span>
      </button>

      {open && (
        <div
          className="luca-download-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="luca-download-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="luca-download-title"
            aria-describedby="luca-download-description"
          >
            <button
              type="button"
              className="luca-download-close"
              aria-label="Close Luca download"
              onClick={close}
              disabled={submitting}
            >
              <X size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>

            <div className="luca-download-mark" aria-hidden="true">
              <LockKeyhole size={16} strokeWidth={1.65} />
            </div>

            <div className="luca-download-copy">
              <p className="luca-download-eyebrow">Private beta</p>
              <h2 id="luca-download-title">Download Luca for macOS.</h2>
              <p id="luca-download-description">
                Enter the beta passphrase. If it checks out, Polyphonic will create a short-lived
                download link for the latest notarized Apple Silicon build.
              </p>
            </div>

            <form className="luca-download-form" onSubmit={submit}>
              <label htmlFor="luca-download-passphrase">Passphrase</label>
              <input
                id="luca-download-passphrase"
                ref={inputRef}
                type="password"
                autoComplete="off"
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter beta passphrase"
                disabled={submitting}
              />
              <button type="submit" disabled={submitting}>
                {submitting ? 'Unlocking…' : 'Unlock download'}
              </button>
            </form>

            {(error || success) && (
              <p
                className={`luca-download-status${success ? ' luca-download-status--success' : ''}`}
                role={error ? 'alert' : 'status'}
              >
                {error || success}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
