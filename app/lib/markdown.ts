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
