export type CompanionImportSource = 'generic' | 'openclaw';

export const BRIDGE_INSTALL_COMMAND = 'curl -fsSL https://get.polyphonic.dev/bridge | sh';

export function buildCompanionImportHandoff(source: CompanionImportSource, deviceName?: string | null): string {
  if (source === 'openclaw') {
    return [
      'System companion-import context for Luca, not a visible user command.',
      'The user wants to bring a local OpenClaw being into Polyphonic.',
      deviceName ? `A paired Bridge device is available: ${deviceName}.` : 'They may need help installing or pairing Polyphonic Bridge first.',
      'Begin warmly. Explain the two safe paths: upload an OpenClaw folder or pair Bridge so local beings can be discovered with permission.',
      'Ask whether this should be treated as a continuation, a copy, or an adapted web counterpart.',
      'Do not create or save anything in this first turn; simply start the migration conversation.',
    ].join(' ');
  }

  return [
    'System companion-import context for Luca, not a visible user command.',
    'The user wants to bring an existing digital companion from another chat app into Polyphonic.',
    'Begin warmly. Ask for source material such as exported conversations, system prompts, memory files, relationship history, voice examples, boundaries, and what must be preserved.',
    'Make this feel simple: tell the user they can attach files here, paste important fragments, or use the Import page for a large ChatGPT or Claude export.',
    'Do not create or save anything in this first turn; simply start the migration conversation.',
  ].join(' ');
}
