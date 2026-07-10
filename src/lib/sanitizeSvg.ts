/**
 * Minimal SVG sanitiser for inline rendering via dangerouslySetInnerHTML.
 * Strips:
 *  - <script>…</script> blocks
 *  - inline event handler attributes (on*="…")
 *  - javascript: URLs on href / xlink:href
 * Everything else is preserved verbatim.
 *
 * SVG content comes from our own model output, but user-provided SVGs (or
 * model-provided SVGs echoing untrusted input) could carry active content, so
 * we scrub before injecting into the DOM.
 */
export function sanitizeSvg(source: string): string {
  if (!source) return '';
  let out = source;
  // Remove <script …>…</script> (any casing, multiline).
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  // Remove self-closing / unterminated script tags.
  out = out.replace(/<script\b[^>]*\/?>/gi, '');
  // Remove inline event handlers: on…="…" or on…='…' or on…=unquoted
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  // Neutralise javascript: URLs in href / xlink:href.
  out = out.replace(/(href|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2');
  return out;
}
