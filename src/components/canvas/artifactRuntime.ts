// Artifact iframe runtime.
//
// Builds the `srcDoc` for the sandboxed preview iframe so the model's artifacts
// actually *run*:
//   • react  — single-file JSX/TSX is transpiled in-iframe with Babel (CDN),
//              React + common libs resolve via an import map (esm.sh), Tailwind
//              is available (Play CDN). Renders like Claude Artifacts.
//   • html   — wrapped (or passed through) with Tailwind + an error overlay.
//   • svg    — static markup, wrapped.
// mermaid/markdown never reach here (rendered natively by ArtifactRenderer).
//
// Security: the iframe stays `sandbox="allow-scripts"` (NO allow-same-origin) so
// the artifact runs in an opaque, null origin — it cannot touch the parent DOM,
// cookies, or Supabase tokens. CSP adds 'unsafe-eval' (Babel + Tailwind JIT) and
// the CDNs; that capability is confined to the sandbox. Same trade-off Claude makes.
//
// The runtime posts diagnostics to the parent (`{__artifact:true,...}`) — errors
// and console output — which Phase 2's console overlay consumes.

/** esm.sh import map. Every React-consuming lib is `?external=react` so the
 *  artifact shares ONE React instance with our injected runtime — otherwise
 *  hooks throw "Invalid hook call". Versions track the app where it matters. */
const IMPORT_MAP = {
  imports: {
    "react": "https://esm.sh/react@18.3.1",
    "react/": "https://esm.sh/react@18.3.1/",
    "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
    "react-dom/": "https://esm.sh/react-dom@18.3.1&external=react/",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
    "lucide-react": "https://esm.sh/lucide-react@0.462.0?external=react",
    "recharts": "https://esm.sh/recharts@2.13.3?external=react",
    "framer-motion": "https://esm.sh/framer-motion@11.15.0?external=react,react-dom",
    "motion/react": "https://esm.sh/framer-motion@11.15.0?external=react,react-dom",
    "clsx": "https://esm.sh/clsx@2.1.1",
    "class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
    "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.5",
    "date-fns": "https://esm.sh/date-fns@3.6.0",
    "three": "https://esm.sh/three@0.170.0",
    "three/": "https://esm.sh/three@0.170.0/",
    "d3": "https://esm.sh/d3@7.9.0",
    "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.17.10?external=react,react-dom,three",
    "@react-three/drei": "https://esm.sh/@react-three/drei@9.114.0?external=react,react-dom,three",
  },
};

const BABEL_SRC = "https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js";
const TAILWIND_SRC = "https://cdn.tailwindcss.com";

const REACT_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "font-src https: data:",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://esm.sh",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com",
  "connect-src https://esm.sh https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
  "worker-src blob:",
  "child-src blob:",
].join("; ");

const HTML_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "font-src https: data:",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://esm.sh",
  "connect-src https://esm.sh https://cdn.tailwindcss.com",
].join("; ");

const OVERLAY_CSS = `
  html,body{margin:0}
  #root{min-height:100vh}
  #root:empty::after{content:"";position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid rgba(0,0,0,.15);border-top-color:rgba(0,0,0,.5);border-radius:50%;animation:__sp .7s linear infinite}
  @keyframes __sp{to{transform:rotate(360deg)}}
  #__err{position:fixed;inset:0;display:none;flex-direction:column;gap:12px;padding:24px;background:#08080a;color:rgba(244,243,240,.92);font:13px/1.6 'JetBrains Mono','SF Mono',ui-monospace,monospace;overflow:auto;z-index:2147483647}
  #__err.show{display:flex}
  #__err .tag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#f87171}
  #__err pre{margin:0;white-space:pre-wrap;word-break:break-word;background:#121216;border:1px solid rgba(248,113,113,.28);border-radius:10px;padding:14px;color:rgba(210,208,204,.78)}
  #__err .hint{color:rgba(161,159,155,.62);font-size:11px}
`;

/** Classic inline script: storage shim + error overlay + console forwarding +
 *  global error handlers. Runs before any artifact/user code. */
const COMMON_HEAD_JS = `
(function(){
  function post(p){ try{ parent.postMessage(Object.assign({__artifact:true},p),'*'); }catch(_){ } }
  window.__artifactPost = post;
  // Storage shim — null-origin sandbox throws on localStorage; keep well-behaved
  // artifacts from crashing on a trivial getItem/setItem.
  try { window.localStorage.getItem('__t'); } catch(_) {
    var mem={}; var api={getItem:function(k){return k in mem?mem[k]:null;},setItem:function(k,v){mem[k]=String(v);},removeItem:function(k){delete mem[k];},clear:function(){for(var k in mem)delete mem[k];},key:function(i){return Object.keys(mem)[i]||null;}};
    Object.defineProperty(api,'length',{get:function(){return Object.keys(mem).length;}});
    try{Object.defineProperty(window,'localStorage',{value:api,configurable:true});}catch(e){}
    try{Object.defineProperty(window,'sessionStorage',{value:api,configurable:true});}catch(e){}
  }
  var box=null;
  window.__artifactError=function(kind,message,stack){
    if(!box){ box=document.createElement('div'); box.id='__err';
      box.innerHTML='<div class="tag"></div><pre></pre><div class="hint">Fix the source and re-run · errors also appear in the console tab</div>';
      (document.body||document.documentElement).appendChild(box); }
    box.classList.add('show');
    box.querySelector('.tag').textContent=(kind||'')+' error';
    box.querySelector('pre').textContent=(message||'Unknown error')+(stack?('\\n\\n'+stack):'');
    post({type:'error',kind:kind,message:message,stack:stack});
  };
  ['log','warn','error','info'].forEach(function(m){ var o=console[m]?console[m].bind(console):function(){};
    console[m]=function(){ o.apply(null,arguments);
      var args=[].map.call(arguments,function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(_){return String(a);}});
      post({type:'console',level:m,args:args}); }; });
  window.addEventListener('error',function(e){ window.__artifactError('runtime', e.message, e.error&&e.error.stack); });
  window.addEventListener('unhandledrejection',function(e){ var r=e.reason||{}; window.__artifactError('promise', r.message||String(r), r.stack); });
})();
`;

/** Module code appended after the transpiled user module. Finds the component
 *  (default export → App), wraps it in an error boundary, and mounts. Uses
 *  dynamic import so it never collides with the user's own static imports. */
const MOUNT_TAIL = `
;Promise.all([import('react'),import('react-dom/client')]).then(function(m){
  var React=m[0].default||m[0]; var createRoot=m[1].createRoot;
  var Comp=(typeof __ARTIFACT_DEFAULT__!=='undefined'&&__ARTIFACT_DEFAULT__)||(typeof App!=='undefined'&&App)||null;
  if(!Comp){ window.__artifactError('mount','No component to render. Export a default component (export default function App() {…}) or name it "App".'); return; }
  var Boundary=class extends React.Component{
    constructor(p){super(p);this.state={e:null};}
    static getDerivedStateFromError(e){return {e:e};}
    componentDidCatch(e){ window.__artifactError('render', e.message, e.stack); }
    render(){ return this.state.e?null:this.props.children; }
  };
  try{ createRoot(document.getElementById('root')).render(React.createElement(Boundary,null,React.createElement(Comp))); window.__artifactPost({type:'ready'}); }
  catch(e){ window.__artifactError('render', e.message, e.stack); }
}).catch(function(e){ window.__artifactError('network', 'Failed to load the React runtime from the CDN. Check your connection and re-run. '+(e&&e.message||''), e&&e.stack); });
`;

/** Bootstrap (classic): read the user source, transpile with Babel, inject the
 *  result as a module script (imports resolve via the import map), append the
 *  mount tail unless the artifact mounts itself. */
const BOOTSTRAP_JS = `
(function(){
  function fail(k,m,s){ window.__artifactError(k,m,s); }
  if(typeof Babel==='undefined'){ fail('network','Could not load Babel from the CDN. Check your connection and re-run.'); return; }
  var src='', tail='', selfMount=false;
  try{
    src=decodeURIComponent(document.getElementById('__src').textContent);
    tail=decodeURIComponent(document.getElementById('__mount').textContent);
    selfMount=document.getElementById('__src').getAttribute('data-self-mount')==='1';
  }catch(e){ fail('runtime','Could not read artifact source.',e&&e.stack); return; }
  var out='';
  try{ out=Babel.transform(src,{filename:'artifact.tsx',presets:[['react',{runtime:'automatic'}],'typescript']}).code; }
  catch(e){ fail('transpile', e.message, e.stack); return; }
  var s=document.createElement('script'); s.type='module';
  s.textContent=out+(selfMount?'':tail);
  document.body.appendChild(s);
})();
`;

export interface NormalizedReactSource {
  code: string;
  selfMount: boolean;
}

/** Parent-side (testable) prep of single-file React source:
 *  - rewrite `export default …` → `var __ARTIFACT_DEFAULT__ = …` so the mount
 *    tail can find the root component (works for default-export and a top-level
 *    `App`).
 *  - detect self-mounting code so we don't double-mount. */
export function normalizeReactSource(raw: string): NormalizedReactSource {
  const selfMount = /createRoot\s*\(/.test(raw) || /ReactDOM\s*\.\s*render\s*\(/.test(raw);
  const code = raw.replace(/(^|\n)([ \t]*)export\s+default\s+/, "$1$2var __ARTIFACT_DEFAULT__ = ");
  return { code, selfMount };
}

function encode(s: string): string {
  return encodeURIComponent(s);
}

/** Build the iframe srcDoc for a React artifact (single-file JSX/TSX). */
export function buildReactRuntimeDoc(content: string): string {
  const { code, selfMount } = normalizeReactSource(content);
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    '<meta http-equiv="Content-Security-Policy" content="' + REACT_CSP + '">' +
    '<script type="importmap">' + JSON.stringify(IMPORT_MAP) + "</script>" +
    '<script src="' + TAILWIND_SRC + '"></script>' +
    '<script src="' + BABEL_SRC + '"></script>' +
    "<style>" + OVERLAY_CSS + "</style>" +
    "<script>" + COMMON_HEAD_JS + "</script>" +
    "</head><body><div id=\"root\"></div>" +
    '<script type="text/plain" id="__src" data-self-mount="' + (selfMount ? "1" : "0") + '">' + encode(code) + "</script>" +
    '<script type="text/plain" id="__mount">' + encode(MOUNT_TAIL) + "</script>" +
    "<script>" + BOOTSTRAP_JS + "</script>" +
    "</body></html>"
  );
}

/** Build the iframe srcDoc for an HTML or SVG artifact. Full documents get
 *  Tailwind + the error overlay injected into <head>; fragments are wrapped. */
export function buildHtmlDoc(content: string): string {
  const isFullDoc = /<html[\s>]/i.test(content) || /<!doctype/i.test(content);
  const headInject =
    '<script src="' + TAILWIND_SRC + '"></script>' +
    "<style>" + OVERLAY_CSS + "</style>" +
    "<script>" + COMMON_HEAD_JS + "</script>";

  if (isFullDoc) {
    if (/<\/head>/i.test(content)) return content.replace(/<\/head>/i, headInject + "</head>");
    if (/<body[^>]*>/i.test(content)) return content.replace(/(<body[^>]*>)/i, "$1" + headInject);
    return headInject + content;
  }
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    '<meta http-equiv="Content-Security-Policy" content="' + HTML_CSP + '">' +
    headInject +
    "</head><body style=\"margin:0;font-family:system-ui,-apple-system,sans-serif\">" +
    content +
    "</body></html>"
  );
}
