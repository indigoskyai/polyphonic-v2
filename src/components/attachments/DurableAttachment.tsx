import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './durable-attachment.css';
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { refreshAttachment } from '@/lib/attachmentApi';
import { inferAttachmentLanguage } from '@/lib/chatAttachments';
import type { AttachmentDescriptor } from '@/types/attachments';
import MediaLightbox from '@/components/messages/MediaLightbox';
import CodePreviewCard from '@/components/attachments/CodePreviewCard';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(kind: AttachmentDescriptor['kind']) {
  if (kind === 'audio') return <FileAudio aria-hidden="true" />;
  if (kind === 'video') return <FileVideo aria-hidden="true" />;
  if (kind === 'spreadsheet') return <FileSpreadsheet aria-hidden="true" />;
  if (kind === 'archive') return <FileArchive aria-hidden="true" />;
  if (kind === 'code' || kind === 'text') return <FileCode2 aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function parseSections(text: string, marker: 'Sheet' | 'Slide' | 'Page') {
  const expression = new RegExp(`^\\[${marker} ([^\\]]+)\\]\\s*$`, 'gm');
  const matches = [...text.matchAll(expression)];
  if (!matches.length) return [];
  return matches.map((match, index) => ({
    label: match[1],
    content: text.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
  }));
}

function SpreadsheetPreview({ text }: { text: string }) {
  const sheets = useMemo(() => parseSections(text, 'Sheet'), [text]);
  const [selected, setSelected] = useState(0);
  const content = sheets[selected]?.content || text;
  const rows = content.split('\n').filter(Boolean).slice(0, 250).map((row) => row.split('\t').slice(0, 60));
  return (
    <div className="durable-sheet-preview">
      {sheets.length > 1 && (
        <label className="durable-preview-select">
          <span>Sheet</span>
          <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {sheets.map((sheet, index) => <option key={`${sheet.label}-${index}`} value={index}>{sheet.label}</option>)}
          </select>
        </label>
      )}
      <div className="durable-sheet-scroll" tabIndex={0} aria-label="Spreadsheet preview">
        <table>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PagedTextPreview({ text, marker }: { text: string; marker: 'Slide' | 'Page' }) {
  const sections = useMemo(() => parseSections(text, marker), [marker, text]);
  const [selected, setSelected] = useState(0);
  if (!sections.length) return <pre className="durable-text-preview">{text.slice(0, 40_000)}</pre>;
  return (
    <div className="durable-paged-preview">
      <label className="durable-preview-select">
        <span>{marker}</span>
        <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {sections.map((section, index) => <option key={`${section.label}-${index}`} value={index}>{section.label}</option>)}
        </select>
      </label>
      <pre className="durable-text-preview">{sections[selected]?.content}</pre>
    </div>
  );
}

export default function DurableAttachment({ initial }: { initial: AttachmentDescriptor }) {
  const [attachment, setAttachment] = useState(initial);
  const [loading, setLoading] = useState(initial.status === 'ready' && !initial.preview?.url);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttachment(await refreshAttachment(initial.id));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not open file');
    } finally {
      setLoading(false);
    }
  }, [initial.id]);

  useEffect(() => {
    if (attachment.status === 'ready' && !attachment.preview?.url) void refresh();
  }, [attachment.preview?.url, attachment.status, refresh]);

  useEffect(() => {
    const expiry = attachment.preview?.expiresAt;
    if (!expiry) return;
    const refreshIn = Math.max(0, new Date(expiry).getTime() - Date.now() - 60_000);
    const timer = window.setTimeout(() => void refresh(), refreshIn);
    return () => window.clearTimeout(timer);
  }, [attachment.preview?.expiresAt, refresh]);

  const url = attachment.preview?.url;
  const downloadUrl = attachment.preview?.downloadUrl || url;
  const transcript = attachment.derivatives?.find((item) => item.kind === 'transcript');
  const summary = attachment.derivatives?.find((item) => item.kind === 'summary');
  const transcriptText = transcript?.text || '';
  const summaryText = summary?.text || '';

  if (attachment.kind === 'image' && url) {
    return (
      <>
        <button type="button" className="durable-attachment-image-button" onClick={() => setLightboxOpen(true)} aria-label={`Open ${attachment.name}`}>
          <img className="durable-attachment-image" src={url} alt={attachment.name} onError={() => void refresh()} />
          <span className="durable-attachment-image-meta">{attachment.name} · {formatSize(attachment.sizeBytes)}</span>
        </button>
        <MediaLightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)} src={url} alt={attachment.name} filename={attachment.name} />
      </>
    );
  }

  return (
    <section className="durable-attachment" data-kind={attachment.kind} data-status={attachment.status}>
      <div className="durable-attachment-heading">
        <span className="durable-attachment-icon">{iconFor(attachment.kind)}</span>
        <span className="durable-attachment-title">
          <strong>{attachment.name}</strong>
          <small>{attachment.mimeType} · {formatSize(attachment.sizeBytes)}</small>
        </span>
        <span className="durable-attachment-actions">
          {loading && <LoaderCircle className="durable-attachment-spin" aria-label="Refreshing file access" />}
          {(error || attachment.status === 'failed') && (
            <button type="button" onClick={() => void refresh()} aria-label={`Retry opening ${attachment.name}`}><RefreshCw aria-hidden="true" /></button>
          )}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${attachment.name}`}><ExternalLink aria-hidden="true" /></a>}
          {downloadUrl && <a href={downloadUrl} download={attachment.name} aria-label={`Download ${attachment.name}`}><Download aria-hidden="true" /></a>}
        </span>
      </div>

      {(error || attachment.error) && <p className="durable-attachment-error" role="alert">{error || attachment.error}</p>}
      {url && attachment.kind === 'document' && attachment.mimeType === 'application/pdf' && (
        <details className="durable-attachment-details">
          <summary>Preview PDF <ChevronDown aria-hidden="true" /></summary>
          <iframe className="durable-pdf-preview" src={`${url}#view=FitH`} title={`Preview of ${attachment.name}`} />
        </details>
      )}
      {url && attachment.kind === 'audio' && <audio controls preload="metadata" src={url} onError={() => void refresh()} />}
      {url && attachment.kind === 'video' && <video controls preload="metadata" src={url} onError={() => void refresh()} />}

      {summaryText && <div className="durable-media-summary"><span>Scene summary</span><p>{summaryText}</p></div>}
      {transcriptText && (
        <details className="durable-attachment-details">
          <summary>Transcript <ChevronDown aria-hidden="true" /></summary>
          <pre className="durable-text-preview">{transcriptText}</pre>
        </details>
      )}
      {attachment.extractedText && attachment.kind === 'spreadsheet' && <SpreadsheetPreview text={attachment.extractedText} />}
      {attachment.extractedText && attachment.kind === 'presentation' && <PagedTextPreview text={attachment.extractedText} marker="Slide" />}
      {attachment.extractedText && attachment.kind === 'document' && attachment.mimeType !== 'application/pdf' && <PagedTextPreview text={attachment.extractedText} marker="Page" />}
      {attachment.extractedText && attachment.kind === 'code' && (
        <details className="durable-attachment-details">
          <summary>Preview code <ChevronDown aria-hidden="true" /></summary>
          <CodePreviewCard
            code={attachment.extractedText.slice(0, 40_000)}
            lang={inferAttachmentLanguage(attachment.name, attachment.mimeType)}
            label={attachment.name}
          />
        </details>
      )}
      {attachment.extractedText && ['text', 'archive'].includes(attachment.kind) && (
        <details className="durable-attachment-details">
          <summary>{attachment.kind === 'archive' ? 'Archive contents' : 'Preview text'} <ChevronDown aria-hidden="true" /></summary>
          <pre className="durable-text-preview">{attachment.extractedText.slice(0, 40_000)}</pre>
        </details>
      )}
    </section>
  );
}
