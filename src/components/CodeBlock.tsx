import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Copy, Check } from "lucide-react";

// VS Code Dark+-inspired syntax theme
const polyDark: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: "#d4d4d4",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    lineHeight: "1.6",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    tabSize: 2,
  },
  'pre[class*="language-"]': {
    color: "#d4d4d4",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    lineHeight: "1.6",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    tabSize: 2,
    padding: "20px",
    margin: "0",
    overflow: "auto",
    background: "#0d0d0d",
  },
  comment: { color: "#5c6370", fontStyle: "italic" },
  prolog: { color: "#5c6370" },
  doctype: { color: "#5c6370" },
  cdata: { color: "#5c6370" },
  punctuation: { color: "#808080" },
  property: { color: "#9cdcfe" },
  tag: { color: "#569cd6" },
  boolean: { color: "#569cd6" },
  number: { color: "#b5cea8" },
  constant: { color: "#b5cea8" },
  symbol: { color: "#f44747" },
  deleted: { color: "#f44747" },
  selector: { color: "#d7ba7d" },
  "attr-name": { color: "#9cdcfe" },
  string: { color: "#ce9178" },
  char: { color: "#ce9178" },
  builtin: { color: "#4ec9b0" },
  inserted: { color: "#b5cea8" },
  operator: { color: "#d4d4d4" },
  entity: { color: "#d4d4d4" },
  url: { color: "#ce9178" },
  ".language-css .token.string": { color: "#ce9178" },
  ".style .token.string": { color: "#ce9178" },
  atrule: { color: "#c5a5c5" },
  "attr-value": { color: "#ce9178" },
  keyword: { color: "#c5a5c5" },
  function: { color: "#dcdcaa" },
  "class-name": { color: "#4ec9b0" },
  regex: { color: "#d16969" },
  important: { color: "#569cd6", fontWeight: "bold" },
  variable: { color: "#9cdcfe" },
};

// Language color dots
const langColors: Record<string, string> = {
  javascript: "#f7df1e",
  js: "#f7df1e",
  typescript: "#3178c6",
  ts: "#3178c6",
  tsx: "#3178c6",
  jsx: "#f7df1e",
  python: "#3776ab",
  py: "#3776ab",
  rust: "#dea584",
  go: "#00add8",
  html: "#e34c26",
  css: "#264de4",
  json: "#b5cea8",
  bash: "#89b4fa",
  sh: "#89b4fa",
  shell: "#89b4fa",
  sql: "#dcdcaa",
  yaml: "#c5a5c5",
  yml: "#c5a5c5",
  markdown: "#d4d4d4",
  md: "#d4d4d4",
  ruby: "#cc342d",
  java: "#b07219",
  c: "#555555",
  cpp: "#f34b7d",
  csharp: "#178600",
  php: "#4f5d95",
  swift: "#f05138",
  kotlin: "#a97bff",
  dart: "#00b4ab",
};

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dotColor = langColors[language.toLowerCase()] || "#555";

  return (
    <div style={{ margin: "16px 0", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "#141414",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: dotColor,
            display: "inline-block",
            opacity: 0.7,
          }} />
          <span style={{
            fontSize: "11px",
            color: "#555",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {language}
          </span>
        </div>

        <button
          onClick={handleCopy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 10px",
            borderRadius: "6px",
            border: "none",
            background: copied ? "rgba(78,201,176,0.1)" : "transparent",
            color: copied ? "#4ec9b0" : "#555",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            if (!copied) {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.color = "#888";
            }
          }}
          onMouseLeave={(e) => {
            if (!copied) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#555";
            }
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        style={polyDark}
        language={language}
        PreTag="div"
        showLineNumbers={true}
        lineNumberStyle={{
          color: "#333",
          fontSize: "12px",
          fontFamily: "var(--font-mono)",
          paddingRight: "16px",
          minWidth: "2.5em",
          textAlign: "right",
          userSelect: "none",
        }}
        customStyle={{
          borderRadius: 0,
          margin: 0,
          fontSize: "13px",
          lineHeight: "1.6",
          padding: "16px 20px",
          background: "#0d0d0d",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontSize: "13px",
      fontFamily: "var(--font-mono)",
      background: "rgba(255,255,255,0.06)",
      padding: "2px 7px",
      borderRadius: "4px",
      border: "1px solid rgba(255,255,255,0.08)",
      color: "#d4d4d4",
    }}>
      {children}
    </code>
  );
}
