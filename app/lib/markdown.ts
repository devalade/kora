const TASK_LINE = /^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])(\])/;

export type ChecklistProgress = {
  done: number;
  total: number;
};

export function taskListLines(markdown: string) {
  return markdown.split('\n').flatMap((text, line) => {
    const match = text.match(TASK_LINE);
    if (!match) return [];
    return [{ line, checked: match[2]?.toLowerCase() === 'x' }];
  });
}

export function taskProgress(markdown: string): ChecklistProgress {
  const lines = taskListLines(markdown);
  return {
    total: lines.length,
    done: lines.filter((item) => item.checked).length,
  };
}

/** Markdown reduced to one line of plain text, for inbox previews and other short quotes. */
export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*(?:#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
