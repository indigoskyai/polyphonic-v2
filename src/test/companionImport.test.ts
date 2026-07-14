import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRIDGE_INSTALL_COMMAND, buildCompanionImportHandoff } from '@/lib/companionImport';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('chat-native companion import', () => {
  it('starts companion migration as hidden Luca context rather than an immediate write', () => {
    const generic = buildCompanionImportHandoff('generic');
    const openclaw = buildCompanionImportHandoff('openclaw', 'Riley Mac');

    expect(generic).toContain('System companion-import context for Luca');
    expect(generic).toContain('attach files here');
    expect(generic).toContain('Do not create or save anything in this first turn');
    expect(openclaw).toContain('OpenClaw');
    expect(openclaw).toContain('Riley Mac');
    expect(openclaw).toContain('continuation, a copy, or an adapted web counterpart');
    expect(openclaw).toContain('Do not create or save anything in this first turn');
  });

  it('keeps companion migration out of the normal chat attachment composer', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    const attachmentControl = readRepoFile('src/components/attachments/AttachmentSourceControl.tsx');
    const panel = readRepoFile('src/components/chat/CompanionImportPanel.tsx');

    expect(chatView).not.toContain('CompanionImportPanel');
    expect(chatView).not.toContain('setCompanionImportOpen');
    expect(chatView).toContain('<AttachmentSourceControl');
    expect(attachmentControl).toContain('attachment-source-menu');
    expect(attachmentControl).toContain('Upload files');
    expect(attachmentControl).toContain('Take a photo');

    expect(panel).toContain('Bring a companion into Polyphonic');
    expect(panel).toContain('Start a guided migration');
    expect(panel).toContain('Attach source files here');
    expect(panel).toContain('OpenClaw / local Bridge');
    expect(panel).toContain('openclaw_devices');
    expect(panel).toContain('BRIDGE_INSTALL_COMMAND');
    expect(BRIDGE_INSTALL_COMMAND).toContain('get.polyphonic.dev/bridge');
  });
});
