const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);

function cleanMarkdown(value: string) {
  const codeBlocks: string[] = [];
  const protectedValue = value.replace(/```[\s\S]*?```/g, (block) => {
    codeBlocks.push(block);
    return `\u0000KORA_CODE_${codeBlocks.length - 1}\u0000`;
  });
  return protectedValue
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\u0000KORA_CODE_(\d+)\u0000/g, (_, index: string) => codeBlocks[Number(index)] ?? '')
    .trim();
}

function listToMarkdown(element: Element) {
  const ordered = element.tagName === 'OL';
  const items = [...element.children].filter((child) => child.tagName === 'LI');
  const lines = items.map((item, index) => {
    const marker = ordered ? `${index + 1}. ` : '- ';
    const content = renderChildren(item, false).trim();
    const contentLines = content ? content.split('\n') : [''];
    return marker + contentLines[0] + contentLines.slice(1).map((line) => `\n  ${line}`).join('');
  });
  return `${lines.join('\n')}\n\n`;
}

function renderChildren(node: Node, preserveWhitespace: boolean) {
  let output = '';
  for (const child of node.childNodes) {
    output += renderNode(child, preserveWhitespace);
  }
  return output;
}

function renderNode(node: Node, preserveWhitespace: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    return preserveWhitespace ? text : text.replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as Element;
  const tag = element.tagName;
  if (tag === 'BR') return '\n';
  if (tag === 'HR') return '\n---\n\n';
  if (tag === 'IMG') return '';
  if (tag === 'PRE') {
    const language = element.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1] ?? '';
    const code = element.textContent?.replace(/\n$/, '') ?? '';
    return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  }
  if (tag === 'CODE' && element.parentElement?.tagName !== 'PRE') {
    const code = element.textContent?.replace(/`/g, "'") ?? '';
    if (!code) return '';
    return `\`${code}\``;
  }
  if (tag === 'STRONG' || tag === 'B') {
    const inner = renderChildren(element, preserveWhitespace).trim();
    return inner ? `**${inner}**` : '';
  }
  if (tag === 'EM' || tag === 'I') {
    const inner = renderChildren(element, preserveWhitespace).trim();
    return inner ? `*${inner}*` : '';
  }
  if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
    const inner = renderChildren(element, preserveWhitespace).trim();
    return inner ? `~~${inner}~~` : '';
  }
  if (tag === 'A') {
    const href = element.getAttribute('href') ?? '';
    const inner = renderChildren(element, preserveWhitespace).trim();
    if (!href || href.startsWith('javascript:')) return inner;
    if (!inner || inner === href) return href;
    return `[${inner}](${href})`;
  }
  if (tag === 'UL' || tag === 'OL') return listToMarkdown(element);
  if (tag === 'BLOCKQUOTE') {
    const inner = renderChildren(element, preserveWhitespace).trim();
    if (!inner) return '';
    return `${inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}\n\n`;
  }
  if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
    const level = Number(tag.slice(1));
    const prefix = '#'.repeat(Math.min(level, 4));
    const inner = renderChildren(element, preserveWhitespace).trim();
    return inner ? `${prefix} ${inner}\n\n` : '';
  }
  if (BLOCK_TAGS.has(tag)) {
    const inner = renderChildren(element, preserveWhitespace);
    return inner.trim() ? `${inner}\n\n` : '';
  }
  return renderChildren(element, preserveWhitespace);
}

export function htmlToMarkdown(html: string) {
  if (typeof DOMParser === 'undefined' || !html.trim()) return '';
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.body;
  if (!body) return '';
  return cleanMarkdown(renderChildren(body, false));
}
