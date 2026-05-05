import { describe, expect, it } from 'vitest';
import {
  buildAttachmentPromptContext,
  inferAttachmentLanguage,
  safeAttachmentFileName,
} from '@/lib/chatAttachments';
import type { MessageAttachment } from '@/stores/threadStore';

describe('chat attachment helpers', () => {
  it('sanitizes storage file names', () => {
    expect(safeAttachmentFileName(' Riley notes (final)!!.md ')).toBe('Riley-notes-final.md');
    expect(safeAttachmentFileName('')).toBe('attachment');
  });

  it('infers code languages from common file names and mimes', () => {
    expect(inferAttachmentLanguage('kernel.ts')).toBe('typescript');
    expect(inferAttachmentLanguage('data.json', 'application/json')).toBe('json');
    expect(inferAttachmentLanguage('README', 'text/markdown')).toBeUndefined();
  });

  it('formats attachment prompt context without leaking URLs', () => {
    const attachments: MessageAttachment[] = [
      {
        type: 'file',
        url: 'https://signed.example/private-token',
        meta: { name: 'brief.pdf', mime: 'application/pdf', size: 2048, path: 'user/thread/brief.pdf' },
      },
      {
        type: 'code',
        url: 'https://signed.example/code-token',
        meta: { name: 'notes.md', mime: 'text/markdown', size: 19, lang: 'markdown', code: '# Continuity\nCarry this.' },
      },
    ];

    const context = buildAttachmentPromptContext(attachments);
    expect(context).toContain('Attached files:');
    expect(context).toContain('brief.pdf (application/pdf, 2 KB)');
    expect(context).toContain('```markdown');
    expect(context).toContain('Carry this.');
    expect(context).not.toContain('signed.example');
    expect(context).not.toContain('private-token');
  });
});
