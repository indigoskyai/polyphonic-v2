import {
  assertSafeSvg,
  classifyAttachment,
  cleanFileName,
  safeStorageName,
  sniffMime,
} from './attachments.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, message: string) {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

Deno.test('normalizes names and blocks executable or macro-enabled formats', () => {
  assert(cleanFileName('folder/Report final.pdf') === 'Report final.pdf', 'Did not strip path');
  assert(safeStorageName('Report final.pdf') === 'Report-final.pdf', 'Did not normalize storage name');
  assert(classifyAttachment('photo.heic', 'image/heic') === 'image', 'HEIC was not classified');
  assert(classifyAttachment('voice.webm', 'audio/webm') === 'audio', 'WebM audio was misclassified as video');
  assertThrows(() => classifyAttachment('invoice.pdf.exe', 'application/pdf'), 'Executable extension was accepted');
  assertThrows(() => classifyAttachment('sheet.xlsm', 'application/vnd.ms-excel'), 'Macro workbook was accepted');
});

Deno.test('sniffs common magic bytes and rejects executable payloads', () => {
  assert(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/octet-stream', 'file.pdf') === 'application/pdf', 'PDF magic not detected');
  assert(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'application/octet-stream', 'file.png') === 'image/png', 'PNG magic not detected');
  assertThrows(() => sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 'application/pdf', 'file.pdf'), 'PE executable was accepted');
});

Deno.test('allows inert SVG and rejects active SVG', () => {
  assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
  assertThrows(() => assertSafeSvg('<svg><script>alert(1)</script></svg>'), 'Script SVG was accepted');
  assertThrows(() => assertSafeSvg('<svg><image href="https://example.com/x.png"/></svg>'), 'External SVG reference was accepted');
  assertThrows(() => assertSafeSvg('<svg><style>rect{fill:url(https://example.com/x.svg)}</style></svg>'), 'External SVG CSS reference was accepted');
});
