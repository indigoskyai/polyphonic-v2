/**
 * Minimal regex-driven syntax highlighter. No dependencies.
 * Returns an HTML string with <span class="syntax-*"> token wrappers.
 * Unknown languages return escaped-only HTML with no markup.
 */

const KEYWORDS: Record<string, RegExp> = {
  js: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|typeof|instanceof|in|of|null|undefined|true|false|try|catch|finally|throw|import|export|from|default|as|async|await|yield|static|get|set)\b/g,
  ts: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|typeof|instanceof|in|of|null|undefined|true|false|try|catch|finally|throw|import|export|from|default|as|async|await|yield|static|get|set|interface|type|enum|namespace|declare|public|private|protected|readonly|abstract|implements|keyof|never|unknown|any|void)\b/g,
  tsx: /\b(const|let|var|function|return|if|else|for|while|class|extends|new|this|typeof|instanceof|null|undefined|true|false|try|catch|throw|import|export|from|default|async|await|interface|type|enum|namespace|declare|readonly|abstract|implements)\b/g,
  json: /\b(true|false|null)\b/g,
  sh: /\b(if|then|else|elif|fi|for|in|do|done|while|case|esac|function|return|exit|export|unset|echo|cd|pwd|ls|cat|grep|awk|sed)\b/g,
  css: /\b(important|inherit|initial|unset|auto|none|hidden|visible|block|flex|grid|inline|inline-block|absolute|relative|fixed|sticky|static)\b/g,
  html: /\b(html|head|body|div|span|h1|h2|h3|h4|h5|h6|p|a|img|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|title)\b/g,
  sql: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|UNION|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|DISTINCT|LIMIT|OFFSET|TRUE|FALSE)\b/gi,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;',
  );
}

type Token = { start: number; end: number; cls: string };

function tokensForLang(source: string, lang: string): Token[] {
  const tokens: Token[] = [];
  // Comments
  const commentPatterns: RegExp[] = [];
  if (['js', 'ts', 'tsx', 'css'].includes(lang)) {
    commentPatterns.push(/\/\/[^\n]*/g);
    commentPatterns.push(/\/\*[\s\S]*?\*\//g);
  } else if (lang === 'sh') {
    commentPatterns.push(/#[^\n]*/g);
  } else if (lang === 'sql') {
    commentPatterns.push(/--[^\n]*/g);
  } else if (lang === 'html') {
    commentPatterns.push(/<!--[\s\S]*?-->/g);
  }
  commentPatterns.forEach((p) => {
    let m: RegExpExecArray | null;
    while ((m = p.exec(source)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'syntax-comment' });
    }
  });

  // Strings
  const stringPatterns: RegExp[] = [];
  if (['js', 'ts', 'tsx', 'json', 'sh', 'css', 'sql'].includes(lang)) {
    stringPatterns.push(/"(?:[^"\\]|\\.)*"/g);
    stringPatterns.push(/'(?:[^'\\]|\\.)*'/g);
  }
  if (['js', 'ts', 'tsx'].includes(lang)) {
    stringPatterns.push(/`(?:[^`\\]|\\.)*`/g);
  }
  stringPatterns.forEach((p) => {
    let m: RegExpExecArray | null;
    while ((m = p.exec(source)) !== null) {
      // avoid double-tagging inside comments
      if (tokens.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
      tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'syntax-string' });
    }
  });

  // Keywords
  const kw = KEYWORDS[lang];
  if (kw) {
    let m: RegExpExecArray | null;
    while ((m = kw.exec(source)) !== null) {
      if (tokens.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
      tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'syntax-keyword' });
    }
  }

  // Functions (js/ts/tsx only)
  if (['js', 'ts', 'tsx'].includes(lang)) {
    const fn = /\b([a-zA-Z_]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = fn.exec(source)) !== null) {
      if (tokens.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
      tokens.push({ start: m.index, end: m.index + m[1].length, cls: 'syntax-function' });
    }
  }

  // Numbers
  const num = /\b\d+(?:\.\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = num.exec(source)) !== null) {
    if (tokens.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
    tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'syntax-number' });
  }

  return tokens.sort((a, b) => a.start - b.start);
}

export function highlight(source: string, lang: string): string {
  const normalized = (lang || '').toLowerCase();
  if (!KEYWORDS[normalized] && !['html'].includes(normalized)) {
    // Unknown — return escaped only
    return escapeHtml(source);
  }

  const tokens = tokensForLang(source, normalized);
  if (tokens.length === 0) return escapeHtml(source);

  let out = '';
  let cursor = 0;
  for (const tok of tokens) {
    if (tok.start < cursor) continue;
    if (tok.start > cursor) out += escapeHtml(source.slice(cursor, tok.start));
    out += `<span class="${tok.cls}">${escapeHtml(source.slice(tok.start, tok.end))}</span>`;
    cursor = tok.end;
  }
  if (cursor < source.length) out += escapeHtml(source.slice(cursor));
  return out;
}
