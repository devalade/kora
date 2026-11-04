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

export function toggleTaskLine(markdown: string, index: number) {
  const target = taskListLines(markdown)[index];
  if (!target) return markdown;
  const lines = markdown.split('\n');
  const line = lines[target.line];
  if (line === undefined) return markdown;
  lines[target.line] = line.replace(
    TASK_LINE,
    (_, prefix: string, mark: string, suffix: string) =>
      `${prefix}${mark.toLowerCase() === 'x' ? ' ' : 'x'}${suffix}`,
  );
  return lines.join('\n');
}

export function toggleTaskAtLine(markdown: string, lineIndex: number) {
  const lines = markdown.split('\n');
  const line = lines[lineIndex];
  if (line === undefined) return markdown;
  lines[lineIndex] = line.replace(
    TASK_LINE,
    (_, prefix: string, mark: string, suffix: string) =>
      `${prefix}${mark.toLowerCase() === 'x' ? ' ' : 'x'}${suffix}`,
  );
  return lines.join('\n');
}
