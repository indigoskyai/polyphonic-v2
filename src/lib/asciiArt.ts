/**
 * ASCII Art Detection & Preprocessing
 *
 * Scans message content for lines that look like ASCII art and wraps
 * consecutive runs in triple-backtick code fences so ReactMarkdown
 * renders them inside a monospace CodeBlock with no word-wrap.
 */

const ASCII_SPECIAL = new Set([
  '|', '/', '\\', '-', '=', '+', '*', '#', '_', '~',
  '<', '>', '^', 'v', '.', ':', ';', '!', '@', '%',
  '(', ')', '[', ']', '{', '}', '`',
]);

// Unicode box-drawing range: U+2500–U+257F
// Unicode block elements: U+2580–U+259F
const UNICODE_ART_RE = /[\u2500-\u257F\u2580-\u259F\u2502\u2503\u250C\u2510\u2514\u2518\u251C\u2524\u252C\u2534\u253C]/;

function isAsciiArtLine(line: string): boolean {
  const trimmed = line.trimEnd();
  if (trimmed.length === 0) return false;

  // Unicode box-drawing characters are definitive
  if (UNICODE_ART_RE.test(trimmed)) return true;

  const stripped = trimmed.trim();
  const nonSpaceChars = trimmed.replace(/\s/g, '');
  if (nonSpaceChars.length < 3) return false;

  // Table row heuristic: starts and ends with |
  if (stripped.startsWith('|') && stripped.endsWith('|')) return true;

  // Border/separator heuristic: line is mostly +, -, =, _
  const borderChars = nonSpaceChars.replace(/[+\-=_|]/g, '');
  if (borderChars.length === 0 && nonSpaceChars.length >= 3) return true;

  let specialCount = 0;
  for (const ch of nonSpaceChars) {
    if (ASCII_SPECIAL.has(ch)) specialCount++;
  }

  return nonSpaceChars.length >= 5 && specialCount / nonSpaceChars.length > 0.35;
}

export function preprocessAsciiArt(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let insideFence = false;
  let artBuffer: string[] = [];
  let blankBuffer: string[] = [];

  const flushArt = () => {
    if (artBuffer.length >= 2) {
      // Remove trailing blank lines from art block
      while (artBuffer.length > 0 && artBuffer[artBuffer.length - 1].trim() === '') {
        artBuffer.pop();
      }
      if (artBuffer.length >= 2) {
        result.push('```');
        result.push(...artBuffer);
        result.push('```');
      } else {
        // Not enough lines, output as-is
        result.push(...artBuffer);
      }
    } else {
      // Single art line — don't wrap, output as-is
      result.push(...artBuffer);
    }
    artBuffer = [];
    blankBuffer = [];
  };

  for (const line of lines) {
    // Track fence state
    if (line.trimStart().startsWith('```')) {
      if (artBuffer.length > 0) flushArt();
      insideFence = !insideFence;
      result.push(line);
      continue;
    }

    if (insideFence) {
      result.push(line);
      continue;
    }

    const trimmed = line.trimEnd();
    const isBlank = trimmed.length === 0;
    const isArt = !isBlank && isAsciiArtLine(trimmed);

    if (isArt) {
      // If we had accumulated blank lines while in an art run, include them
      if (artBuffer.length > 0 && blankBuffer.length > 0) {
        artBuffer.push(...blankBuffer);
      }
      blankBuffer = [];
      artBuffer.push(line);
    } else if (isBlank && artBuffer.length > 0 && blankBuffer.length < 2) {
      // Tolerate up to 2 blank lines between art lines
      blankBuffer.push(line);
    } else if (isBlank && artBuffer.length > 0) {
      // Too many blanks, flush art
      flushArt();
      result.push(line);
    } else {
      // Non-art, non-blank line
      if (artBuffer.length > 0) {
        flushArt();
      }
      if (blankBuffer.length > 0) {
        result.push(...blankBuffer);
        blankBuffer = [];
      }
      result.push(line);
    }
  }

  // Flush any remaining art
  if (artBuffer.length > 0) flushArt();
  if (blankBuffer.length > 0) result.push(...blankBuffer);

  return result.join('\n');
}
