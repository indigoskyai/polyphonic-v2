import { unzipSync } from 'fflate';

const MAX_EXTRACTED_CHARS = 120_000;
const MAX_TEXT_READ_BYTES = 4 * 1024 * 1024;
const MAX_HASH_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 200;
const MAX_OFFICE_FILES = 750;
const MAX_ARCHIVE_EXPANDED_BYTES = 250 * 1024 * 1024;
const MAX_EXTRACTED_MEMBER_BYTES = 12 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm',
  'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c',
  'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'zsh', 'sql', 'yaml', 'yml', 'toml', 'ini',
]);

const BLOCKED_ARCHIVE_EXTENSIONS = new Set([
  'exe', 'dll', 'dylib', 'so', 'app', 'dmg', 'pkg', 'msi', 'apk', 'jar', 'com',
  'bat', 'cmd', 'ps1', 'vbs', 'scr', 'docm', 'dotm', 'xlsm', 'xltm', 'xlam',
  'pptm', 'potm', 'ppam', 'ppsm', 'sldm',
]);

const NESTED_ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'tgz']);

export interface PreparedAttachmentExtraction {
  extracted_text?: string;
  checksum?: string;
  derivatives?: Array<{
    kind: 'extraction';
    label: string;
    metadata?: Record<string, string | number | boolean>;
  }>;
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
}

function extensionOf(name: string): string {
  const leaf = name.split('/').pop() || '';
  return leaf.includes('.') ? leaf.split('.').pop()!.toLowerCase() : '';
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(blob);
  });
}

function normalizeExtractedText(value: string): string {
  return value
    .split('\u0000').join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function textFromXml(xml: string, paragraphTags: string[]): string {
  let prepared = xml;
  for (const tag of paragraphTags) {
    prepared = prepared.replace(new RegExp(`</${tag}>`, 'gi'), '\n');
  }
  prepared = prepared
    .replace(/<(?:w:tab|a:tab|br|w:br|a:br)\b[^>]*\/?\s*>/gi, '\t')
    .replace(/<[^>]+>/g, ' ');
  return normalizeExtractedText(decodeEntities(prepared).replace(/[ \t]{2,}/g, ' '));
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function inspectZip(bytes: Uint8Array, office: boolean): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= minimum; index -= 1) {
    if (uint32(view, index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('The ZIP directory is missing or damaged.');
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = uint32(view, eocd + 12);
  const centralOffset = uint32(view, eocd + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported.');
  }
  if (entryCount > (office ? MAX_OFFICE_FILES : MAX_ARCHIVE_FILES)) {
    throw new Error(`This archive contains too many files (maximum ${office ? MAX_OFFICE_FILES : MAX_ARCHIVE_FILES}).`);
  }
  if (centralOffset + centralSize > bytes.length) throw new Error('The ZIP directory is invalid.');

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  let expandedBytes = 0;
  while (cursor < centralOffset + centralSize && entries.length < entryCount) {
    if (uint32(view, cursor) !== 0x02014b50) throw new Error('The ZIP directory is invalid.');
    const flags = view.getUint16(cursor + 8, true);
    const compressedSize = uint32(view, cursor + 20);
    const uncompressedSize = uint32(view, cursor + 24);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const externalAttributes = uint32(view, cursor + 38);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, '/');
    const directory = name.endsWith('/');
    const mode = (externalAttributes >>> 16) & 0xffff;
    const ext = extensionOf(name);

    if ((flags & 1) !== 0) throw new Error('Encrypted or password-protected archives are not supported.');
    if ((mode & 0xf000) === 0xa000) throw new Error('Archives containing symbolic links are not supported.');
    if (name.startsWith('/') || name.split('/').some((part) => part === '..')) throw new Error('The archive contains an unsafe path.');
    if (!office && NESTED_ARCHIVE_EXTENSIONS.has(ext)) throw new Error('Nested archives are not supported.');
    if (BLOCKED_ARCHIVE_EXTENSIONS.has(ext)) throw new Error('The archive contains executable or macro-enabled content.');
    if (office && /(?:^|\/)vbaProject\.bin$/i.test(name)) throw new Error('Macro-enabled Office files are not supported.');
    if (compressedSize > 0 && uncompressedSize > 1024 * 1024 && uncompressedSize / compressedSize > 200) {
      throw new Error('The archive expands beyond the safe compression ratio.');
    }

    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) throw new Error('The archive expands beyond the safe size limit.');
    entries.push({ name, compressedSize, uncompressedSize, directory });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length !== entryCount) throw new Error('The ZIP directory is incomplete.');
  return entries;
}

function unzipSelected(bytes: Uint8Array, wanted: Set<string>): Record<string, Uint8Array> {
  return unzipSync(bytes, {
    filter: (entry) => wanted.has(entry.name) && entry.originalSize <= MAX_EXTRACTED_MEMBER_BYTES,
  });
}

function parseDocx(bytes: Uint8Array, entries: ZipEntry[]): string {
  const wanted = new Set(entries
    .filter((entry) => /^word\/(?:document|comments|footnotes|endnotes|header\d+|footer\d+)\.xml$/i.test(entry.name))
    .map((entry) => entry.name));
  if (!wanted.has('word/document.xml')) throw new Error('This DOCX file does not contain a document body.');
  const files = unzipSelected(bytes, wanted);
  const ordered = Object.keys(files).sort((a, b) => a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b));
  return normalizeExtractedText(ordered.map((name) => {
    const label = name === 'word/document.xml' ? '[Document]' : `[${name.replace('word/', '').replace('.xml', '')}]`;
    return `${label}\n${textFromXml(new TextDecoder().decode(files[name]), ['w:p', 'w:tr'])}`;
  }).join('\n\n'));
}

function numericSuffix(value: string): number {
  return Number(value.match(/(\d+)(?=\.xml$)/)?.[1] || 0);
}

function parsePptx(bytes: Uint8Array, entries: ZipEntry[]): string {
  const slideNames = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => numericSuffix(a) - numericSuffix(b));
  if (!slideNames.length) throw new Error('This PPTX file does not contain any slides.');
  const files = unzipSelected(bytes, new Set(slideNames));
  return normalizeExtractedText(slideNames.map((name, index) => (
    `[Slide ${index + 1}]\n${textFromXml(new TextDecoder().decode(files[name]), ['a:p'])}`
  )).join('\n\n'));
}

function sharedStringValues(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => textFromXml(match[1], ['r']));
}

function parseSheetXml(xml: string, sharedStrings: string[]): string {
  const rows: string[] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const cellRef = attributes.match(/\br="([A-Z]+)\d+"/i)?.[1] || '';
      const column = cellRef ? cellRef.split('').reduce((sum, character) => sum * 26 + character.toUpperCase().charCodeAt(0) - 64, 0) : cells.length + 1;
      while (cells.length < Math.min(column - 1, 100)) cells.push('');
      const type = attributes.match(/\bt="([^"]+)"/i)?.[1];
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1]
        ?? body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i)?.[1]
        ?? '';
      const value = type === 's' ? sharedStrings[Number(raw)] ?? raw : decodeEntities(raw);
      if (cells.length < 100) cells.push(value.replace(/[\t\n]+/g, ' ').trim());
    }
    rows.push(cells.join('\t'));
    if (rows.length >= 5_000) {
      rows.push('[Rows truncated after 5,000]');
      break;
    }
  }
  return rows.join('\n');
}

function parseXlsx(bytes: Uint8Array, entries: ZipEntry[]): string {
  const names = entries.map((entry) => entry.name);
  const wanted = new Set(names.filter((name) => (
    name === 'xl/sharedStrings.xml' || name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
  )));
  const files = unzipSelected(bytes, wanted);
  const decoder = new TextDecoder();
  const shared = files['xl/sharedStrings.xml'] ? sharedStringValues(decoder.decode(files['xl/sharedStrings.xml'])) : [];
  const workbook = files['xl/workbook.xml'] ? decoder.decode(files['xl/workbook.xml']) : '';
  const sheetLabels = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*>/gi)].map((match) => decodeEntities(match[1]));
  const sheetNames = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((a, b) => numericSuffix(a) - numericSuffix(b));
  if (!sheetNames.length) throw new Error('This XLSX file does not contain any worksheets.');
  return normalizeExtractedText(sheetNames.map((name, index) => (
    `[Sheet ${sheetLabels[index] || index + 1}]\n${parseSheetXml(decoder.decode(files[name]), shared)}`
  )).join('\n\n'));
}

function parseArchive(bytes: Uint8Array, entries: ZipEntry[]): string {
  const wantedEntries = entries.filter((entry) => !entry.directory && TEXT_EXTENSIONS.has(extensionOf(entry.name)) && entry.uncompressedSize <= MAX_EXTRACTED_MEMBER_BYTES);
  const files = unzipSelected(bytes, new Set(wantedEntries.map((entry) => entry.name)));
  const decoder = new TextDecoder();
  const sections: string[] = [];
  for (const entry of entries) {
    if (entry.directory) continue;
    const payload = files[entry.name];
    if (payload) sections.push(`[Archive member: ${entry.name}]\n${decoder.decode(payload)}`);
    else sections.push(`[Archive member: ${entry.name}]\n[Binary or too large for inline preview: ${entry.uncompressedSize} bytes]`);
    if (sections.join('\n\n').length >= MAX_EXTRACTED_CHARS) break;
  }
  return normalizeExtractedText(sections.join('\n\n'));
}

function parseRtf(value: string): string {
  return normalizeExtractedText(value
    .replace(/\\'[0-9a-f]{2}/gi, (token) => String.fromCharCode(Number.parseInt(token.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_match, code) => String.fromCharCode((Number(code) + 65536) % 65536))
    .replace(/\\(?:par|line)\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, ''));
}

function parseLegacyOffice(bytes: Uint8Array): string {
  const latin = new TextDecoder('windows-1252').decode(bytes);
  const latinRuns = latin.match(/[\x20-\x7e\u00a0-\u024f]{4,}/g) || [];
  const utf16 = new TextDecoder('utf-16le').decode(bytes);
  const unicodeRuns = utf16.match(/[\p{L}\p{N}\p{P}\p{Zs}]{4,}/gu) || [];
  const useful = [...latinRuns, ...unicodeRuns]
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 4 && !/^[\W_]+$/u.test(value));
  return normalizeExtractedText(`[Legacy Office text recovery]\n${[...new Set(useful)].join('\n')}`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function extractionResult(text: string, label: string, metadata?: Record<string, string | number | boolean>): PreparedAttachmentExtraction {
  const normalized = normalizeExtractedText(text);
  return {
    ...(normalized ? { extracted_text: normalized } : {}),
    derivatives: [{ kind: 'extraction', label, ...(metadata ? { metadata } : {}) }],
  };
}

export async function prepareAttachmentExtraction(file: File): Promise<PreparedAttachmentExtraction> {
  const ext = extensionOf(file.name);
  const checksumBytes = file.size <= MAX_HASH_BYTES ? await readBlobBytes(file) : null;
  const checksum = checksumBytes ? await sha256(checksumBytes) : undefined;
  let result: PreparedAttachmentExtraction = {};

  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
    let text = await readBlobText(file.slice(0, MAX_TEXT_READ_BYTES));
    if (ext === 'json') {
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep the original text */ }
    }
    if (ext === 'html' || ext === 'htm') {
      text = text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
      text = textFromXml(text, ['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    }
    result = extractionResult(text, 'Browser text extraction');
  } else if (ext === 'rtf') {
    result = extractionResult(parseRtf(await readBlobText(file.slice(0, MAX_TEXT_READ_BYTES))), 'Browser RTF extraction');
  } else if (['doc', 'xls', 'ppt'].includes(ext)) {
    const bytes = checksumBytes || await readBlobBytes(file);
    result = extractionResult(parseLegacyOffice(bytes), 'Browser legacy Office recovery');
  } else if (['docx', 'pptx', 'xlsx', 'zip'].includes(ext)) {
    const bytes = checksumBytes || await readBlobBytes(file);
    const office = ext !== 'zip';
    const entries = inspectZip(bytes, office);
    const text = ext === 'docx' ? parseDocx(bytes, entries)
      : ext === 'pptx' ? parsePptx(bytes, entries)
      : ext === 'xlsx' ? parseXlsx(bytes, entries)
      : parseArchive(bytes, entries);
    const label = ext === 'zip' ? 'Browser ZIP extraction' : `Browser ${ext.toUpperCase()} extraction`;
    result = extractionResult(text, label, { fileCount: entries.length, expandedBytes: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) });
  }

  return { ...result, ...(checksum ? { checksum } : {}) };
}
