import { Check, Copy } from 'lucide-react';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { memo, useMemo, useState, type ReactNode } from 'react';

// A curated set keeps the bundle small; anything else renders as plain code with its label.
const lowlight = createLowlight({
  bash, css, diff, go, java, javascript, json, markdown, php, python, rust, sql, typescript, xml, yaml,
});

const ALIASES: Record<string, { grammar: string; label: string }> = {
  js: { grammar: 'javascript', label: 'JavaScript' },
  javascript: { grammar: 'javascript', label: 'JavaScript' },
  jsx: { grammar: 'javascript', label: 'JSX' },
  mjs: { grammar: 'javascript', label: 'JavaScript' },
  ts: { grammar: 'typescript', label: 'TypeScript' },
  typescript: { grammar: 'typescript', label: 'TypeScript' },
  tsx: { grammar: 'typescript', label: 'TSX' },
  json: { grammar: 'json', label: 'JSON' },
  sh: { grammar: 'bash', label: 'Shell' },
  shell: { grammar: 'bash', label: 'Shell' },
  bash: { grammar: 'bash', label: 'Bash' },
  zsh: { grammar: 'bash', label: 'Shell' },
  css: { grammar: 'css', label: 'CSS' },
  html: { grammar: 'xml', label: 'HTML' },
  xml: { grammar: 'xml', label: 'XML' },
  svg: { grammar: 'xml', label: 'SVG' },
  py: { grammar: 'python', label: 'Python' },
  python: { grammar: 'python', label: 'Python' },
  sql: { grammar: 'sql', label: 'SQL' },
  yml: { grammar: 'yaml', label: 'YAML' },
  yaml: { grammar: 'yaml', label: 'YAML' },
  diff: { grammar: 'diff', label: 'Diff' },
  md: { grammar: 'markdown', label: 'Markdown' },
  markdown: { grammar: 'markdown', label: 'Markdown' },
  go: { grammar: 'go', label: 'Go' },
  rs: { grammar: 'rust', label: 'Rust' },
  rust: { grammar: 'rust', label: 'Rust' },
  php: { grammar: 'php', label: 'PHP' },
  java: { grammar: 'java', label: 'Java' },
};

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
};

/** Renders lowlight's syntax tree as React elements, so no HTML string is ever injected. */
function renderTree(nodes: HastNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (node.type === 'text') return node.value ?? '';
    if (node.type === 'element') {
      const className = node.properties?.className;
      return (
        <span key={key} className={Array.isArray(className) ? className.join(' ') : className}>
          {renderTree(node.children ?? [], key)}
        </span>
      );
    }
    return null;
  });
}

export const CodeBlock = memo(function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const known = ALIASES[language.toLowerCase()];
  const label = known?.label ?? (language || 'Code');

  const highlighted = useMemo(() => {
    if (!known) return code;
    try {
      return renderTree(lowlight.highlight(known.grammar, code).children as HastNode[], 'c');
    } catch {
      return code;
    }
  }, [code, known]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused; the code stays selectable.
    }
  }

  return (
    <figure className="code-block my-1 max-w-full overflow-hidden rounded-[10px] bg-sidebar">
      <figcaption className="flex h-8 items-center justify-between border-b border-white/[0.06] pr-1 pl-3">
        <span className="text-[11px] font-medium text-sidebar-text">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : `Copy ${label} code`}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-sidebar-text transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-5 text-sidebar-bright">
        <code className="hljs">{highlighted}</code>
      </pre>
    </figure>
  );
});
