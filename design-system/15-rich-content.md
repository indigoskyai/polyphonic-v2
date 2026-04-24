# Phase 15 — Rich Content Rendering

## Goal

Full markdown rendering inside agent + user messages. After this phase: any message body can contain headings (h1–h4), ordered/unordered lists, blockquotes, tables, horizontal rules, links, inline code, fenced code blocks (with optional language tag header + syntax highlighting per agent color), images (with three-color agent gradient placeholder when src is missing), and `<kbd>` shortcut keys. Every element styled with Phase 01 tokens — no hardcoded colors, fonts sized within the existing scale, mono used wherever the mockup specifies. The renderer is a single component used by every message-rendering surface so we never have two markdown implementations to maintain.

## Dependencies

- Phase 01 (foundation tokens — text tiers, surface elevation, mono font, agent identity colors)
- Phase 02 (Pill — not used directly, but shared primitive philosophy)
- `react-markdown` (add if not installed) + `remark-gfm` (for tables, strikethrough, task lists)

## Files

- `src/components/rich/RichBody.tsx` (new — the canonical renderer)
- `src/components/rich/syntaxHighlight.ts` (new — tiny token-class mapper, no library dep)
- `src/index.css` — add `.rich-body` block + `.syntax-*` classes + `.chat-image` + `kbd` styling
- `package.json` — add `react-markdown` + `remark-gfm` if not present
- `src/components/chat/MessageBubble.tsx` (or wherever messages are rendered) — replace any existing inline markdown / dangerouslySetInnerHTML with `<RichBody source={message.content} />`

## Tasks

### 15.1 — Install dependencies

- [ ] `bun add react-markdown remark-gfm` (only if not already in `package.json`).
- [ ] Verify `react-markdown` version supports custom `components` prop for element overrides.

### 15.2 — Headings

- [ ] Add to `src/index.css` under `.rich-body`:
```css
.rich-body h1,
.rich-body h2,
.rich-body h3,
.rich-body h4 { margin-top: 0; }

.rich-body h1 {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 24px 0 12px;
  letter-spacing: var(--track-display);
}
.rich-body h1:first-child { margin-top: 0; }

.rich-body h2 {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 24px 0 10px;
}
.rich-body h3 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-body);
  margin: 20px 0 8px;
  letter-spacing: var(--track-ui);
}
.rich-body h4 {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 16px 0 8px;
  letter-spacing: var(--track-mono);
  text-transform: uppercase;
}
```

### 15.3 — Lists

- [ ] Add to `src/index.css`:
```css
.rich-body ul,
.rich-body ol {
  padding-left: 24px;
  margin: 0 0 16px;
}
.rich-body li {
  margin-bottom: 6px;
  line-height: 1.65;
}
.rich-body ul li::marker { color: var(--text-ghost); }
.rich-body ol li::marker {
  color: var(--text-ghost);
  font-family: var(--font-mono);
  font-size: 13px;
}
```

### 15.4 — Blockquote

- [ ] Add to `src/index.css`:
```css
.rich-body blockquote {
  border-left: 2px solid var(--border-strong);
  padding: 2px 0 2px 16px;
  margin: 16px 0;
  color: var(--text-body);
  font-style: italic;
}
```

### 15.5 — Tables

- [ ] Add to `src/index.css`:
```css
.rich-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
}
.rich-body th {
  text-align: left;
  font-weight: 500;
  padding: 8px 12px;
  font-size: 10px;
  letter-spacing: var(--track-mono);
  text-transform: uppercase;
  color: var(--text-ghost);
  border-bottom: 1px solid var(--border);
}
.rich-body td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-body);
}
.rich-body td:first-child { color: var(--text-primary); }
.rich-body tr:last-child td { border-bottom: none; }
```

### 15.6 — Horizontal rule + links

- [ ] Add to `src/index.css`:
```css
.rich-body hr {
  border: none;
  height: 1px;
  background: var(--border-subtle);
  margin: 24px 0;
}
.rich-body a {
  color: var(--text-secondary);
  text-decoration: none;
  border-bottom: 1px solid var(--border-strong);
  transition: all var(--dur-fast) var(--ease-out);
}
.rich-body a:hover {
  color: var(--text-primary);
  border-bottom-color: var(--border-focus);
}
```
*(Note: `--border-dim` mentioned in the original spec doesn't exist as a token — using `--border-strong` for the rest state and `--border-focus` for hover. If a softer rest border is desired, swap to `--border-faint`.)*

### 15.7 — Images + figures

- [ ] Add to `src/index.css`:
```css
.rich-body img {
  max-width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  margin: 12px 0;
  display: block;
}
.rich-body figure {
  margin: 16px 0;
}
.rich-body figcaption {
  font-size: 11px;
  color: var(--text-ghost);
  margin-top: 8px;
  text-align: center;
}
```

### 15.8 — Inline code + code blocks

- [ ] Add to `src/index.css`:
```css
.rich-body code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--surface-1);
  padding: 2px 6px;
  border-radius: 4px;
}
.rich-body pre {
  background: var(--floor);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin: 16px 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
  overflow-x: auto;
  box-shadow: var(--shadow-inset-highlight);
}
.rich-body pre code {
  background: none;
  padding: 0;
}
.rich-body .code-with-header {
  margin: 16px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
}
.rich-body .code-lang-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  text-transform: uppercase;
  letter-spacing: var(--track-mono);
  background: var(--surface-1);
  padding: 6px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.rich-body .code-with-header pre {
  margin: 0;
  border: none;
  border-radius: 0;
}
```

### 15.9 — Syntax highlighting

- [ ] Add to `src/index.css`:
```css
.rich-body .syntax-keyword  { color: var(--vektor-full); }
.rich-body .syntax-string   { color: var(--anima-full); }
.rich-body .syntax-comment  { color: var(--text-ghost); font-style: italic; }
.rich-body .syntax-function { color: var(--luca-full); }
.rich-body .syntax-number   { color: var(--v3); }
```

- [ ] Create `src/components/rich/syntaxHighlight.ts`. Lightweight per-language highlighter — no `prismjs`, no `highlight.js`. Single function:
```ts
export function highlight(source: string, lang: string): string {
  // returns HTML string with <span class="syntax-*"> spans wrapping tokens
  // Supported langs: js, ts, tsx, json, sh, css, html, sql. Unknown → no markup.
}
```
- [ ] Use simple regex passes per language. Keywords list per lang (e.g. js: `const|let|var|function|return|if|else|for|while|class|export|import|from|async|await|new|typeof`). Strings: `'…'` / `"…"` / backticks. Comments: `//…` and `/*…*/`. Numbers: `\b\d+(\.\d+)?\b`. Functions: `\b([a-zA-Z_]\w*)\s*\(`.
- [ ] Apply in `RichBody`'s `code` component override when `inline === false` and `lang` is set.

### 15.10 — Image placeholder (chat-image)

- [ ] Add to `src/index.css`:
```css
.chat-image {
  max-width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  display: block;
  margin-top: 8px;
  background: linear-gradient(135deg,
    rgba(201, 168, 124, 0.08),
    rgba(124, 168, 201, 0.08),
    rgba(201, 124, 168, 0.08)
  );
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-ghost);
}
```
- [ ] In `RichBody`'s `img` override: if `src` is empty / errors on load, render a `<div className="chat-image">{alt || 'image'}</div>` instead of a broken `<img>`.

### 15.11 — KBD

- [ ] Add to `src/index.css`:
```css
.rich-body kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-soft);
  line-height: 1;
  vertical-align: middle;
}
```

### 15.12 — RichBody component

- [ ] Create `src/components/rich/RichBody.tsx`:
```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { highlight } from './syntaxHighlight'

interface RichBodyProps {
  source: string
  className?: string
}

export function RichBody({ source, className }: RichBodyProps) {
  return (
    <div className={`rich-body ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            const lang = /language-(\w+)/.exec(className ?? '')?.[1]
            if (inline || !lang) {
              return <code {...props}>{children}</code>
            }
            const html = highlight(String(children).replace(/\n$/, ''), lang)
            return (
              <div className="code-with-header">
                <div className="code-lang-tag">{lang}</div>
                <pre><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
              </div>
            )
          },
          img({ src, alt }) {
            if (!src) return <div className="chat-image">{alt || 'image'}</div>
            return <img src={src} alt={alt ?? ''} onError={(e) => {
              const parent = (e.target as HTMLImageElement).parentElement
              if (parent) parent.innerHTML = `<div class="chat-image">${alt || 'image'}</div>`
            }} />
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
```

### 15.13 — Wire into MessageBubble

- [ ] Replace any existing markdown rendering in the message component with `<RichBody source={message.content} />`. Remove competing markdown libs if any.

## Verification

1. **Headings:** Render a test message containing all of `#`, `##`, `###`, `####`. Sizes match spec (20/16/14/12), h4 uppercase + tracked.
2. **Lists:** Ordered list shows mono numerals. Unordered shows ghost-color bullets. Nested lists indent correctly.
3. **Blockquote:** 2px left accent, italic, body color.
4. **Table:** Headers uppercase ghost color, first column primary color, last row no bottom border.
5. **Code block:** ` ```ts ` block renders with `TS` lang tag header, vektor-blue keywords, anima-magenta strings, luca-tan function names, ghost italic comments.
6. **Image (broken):** Insert `![demo]()` — placeholder gradient renders with caption text "demo".
7. **KBD:** `<kbd>⌘K</kbd>` renders as a small inline key cap.
8. **Playwright snapshot:**
```js
() => {
  const el = document.querySelector('.rich-body')
  return {
    h1: !!el?.querySelector('h1'),
    table: !!el?.querySelector('table'),
    code: !!el?.querySelector('.code-with-header'),
    kbd: !!el?.querySelector('kbd'),
  }
}
```
   Assert all true on a test message containing each.
9. **Token compliance:** Run a grep against `src/components/rich/` for hex colors (`#[0-9a-f]{3,6}`) — should be zero matches. All colors via `var(--…)`.
10. **Console:** 0 new errors. **No XSS:** confirm `react-markdown` is configured without `rehype-raw` (so raw HTML in source is escaped); the only `dangerouslySetInnerHTML` is on highlighted code, which we generate ourselves.

## Backend asks

None.

## Commit

```
phase 15: rich content rendering — full markdown via react-markdown

- src/components/rich/RichBody.tsx (new — canonical renderer)
- src/components/rich/syntaxHighlight.ts (new — minimal regex
  highlighter, no library dep)
- src/index.css — .rich-body block: h1-h4, lists, blockquote,
  tables, hr, links, images, inline code, code blocks with
  optional lang-tag header, syntax-* spans (per-agent colors),
  .chat-image gradient placeholder, kbd cap styling
- src/components/chat/MessageBubble.tsx — replaced inline markdown
  with <RichBody source={message.content} />
- package.json — added react-markdown + remark-gfm

Verified: every markdown element renders with phase-01 tokens, no
hardcoded colors in component code, syntax highlighting tinted with
agent identity colors, broken images degrade to gradient placeholder.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
