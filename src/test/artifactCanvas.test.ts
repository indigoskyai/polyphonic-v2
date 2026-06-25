import { describe, expect, it } from 'vitest';
import { normalizeReactSource, buildReactRuntimeDoc, buildHtmlDoc } from '../components/canvas/artifactRuntime';
import { isPromotableFence, fenceKind } from '../lib/streamingArtifacts';

describe('normalizeReactSource — entry normalization', () => {
  it('rewrites `export default function App` to a capturable binding', () => {
    const { code, selfMount } = normalizeReactSource('export default function App() { return null; }');
    expect(code).toContain('var __ARTIFACT_DEFAULT__ = function App()');
    expect(code).not.toMatch(/export\s+default/);
    expect(selfMount).toBe(false);
  });

  it('rewrites `export default <identifier>`', () => {
    const { code } = normalizeReactSource('const App = () => null;\nexport default App;');
    expect(code).toContain('var __ARTIFACT_DEFAULT__ = App;');
  });

  it('rewrites a default-exported arrow expression', () => {
    const { code } = normalizeReactSource('export default () => <div/>;');
    expect(code).toContain('var __ARTIFACT_DEFAULT__ = () => <div/>;');
  });

  it('detects self-mounting code (createRoot / ReactDOM.render)', () => {
    expect(normalizeReactSource('createRoot(document.getElementById("root")).render(<App/>);').selfMount).toBe(true);
    expect(normalizeReactSource('ReactDOM.render(<App/>, el);').selfMount).toBe(true);
    expect(normalizeReactSource('export default function App(){ return <div/>; }').selfMount).toBe(false);
  });

  it('leaves a plain top-level `App` (no export) untouched — the mount tail finds it', () => {
    const src = 'function App() { return <div/>; }';
    expect(normalizeReactSource(src).code).toBe(src);
  });
});

describe('buildReactRuntimeDoc — iframe document', () => {
  const doc = buildReactRuntimeDoc('export default function App(){ return <h1>hi</h1>; }');

  it('declares an import map with a single pinned React (external) for hooks safety', () => {
    expect(doc).toContain('type="importmap"');
    expect(doc).toContain('https://esm.sh/react@18.3.1');
    expect(doc).toContain('?external=react'); // lib React de-duped against the pinned one
  });

  it('loads Babel + Tailwind and ships the source URI-encoded (no escaping hazards)', () => {
    expect(doc).toContain('@babel/standalone');
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('id="__src"');
    expect(doc).toContain(encodeURIComponent('var __ARTIFACT_DEFAULT__ = function App'));
  });

  it('uses a CSP that permits the runtime but keeps the sandbox boundary', () => {
    expect(doc).toContain("script-src 'unsafe-inline' 'unsafe-eval'"); // Babel + Tailwind JIT
    expect(doc).not.toContain('allow-same-origin'); // never weaken the iframe sandbox here
  });
});

describe('buildHtmlDoc — html/svg', () => {
  it('wraps a fragment with a CSP shell + Tailwind', () => {
    const out = buildHtmlDoc('<div class="p-4">hi</div>');
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain('cdn.tailwindcss.com');
    expect(out).toContain('<div class="p-4">hi</div>');
  });

  it('injects into a full document head rather than double-wrapping', () => {
    const full = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';
    const out = buildHtmlDoc(full);
    expect(out.match(/<html/g)?.length).toBe(1); // not nested
    expect(out).toContain('cdn.tailwindcss.com'); // tailwind still injected into <head>
  });
});

describe('isPromotableFence — the one promotion rule', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

  it('maps renderable languages to kinds', () => {
    expect(fenceKind('jsx')).toBe('react');
    expect(fenceKind('tsx')).toBe('react');
    expect(fenceKind('html')).toBe('html');
    expect(fenceKind('python')).toBeNull();
  });

  it('promotes a substantial renderable block', () => {
    expect(isPromotableFence('jsx', lines(35))).toBe(true);
    expect(isPromotableFence('html', lines(40))).toBe(true);
  });

  it('promotes a short html/svg block that is visibly complete', () => {
    expect(isPromotableFence('html', '<html><body><p>x</p></body></html>')).toBe(true);
    expect(isPromotableFence('svg', '<svg><rect/></svg>')).toBe(true); // has a closing </svg>
  });

  it('keeps short snippets and non-renderable languages inline', () => {
    expect(isPromotableFence('jsx', lines(5))).toBe(false);
    expect(isPromotableFence('svg', '<svg><rect/>')).toBe(false); // short, not visibly complete
    expect(isPromotableFence('js', lines(50))).toBe(false);
    expect(isPromotableFence('python', lines(50))).toBe(false);
  });
});
