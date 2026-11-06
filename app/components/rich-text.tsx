import { memo, useMemo, type ReactNode } from 'react';
import type { IssueRef, UserSummary } from '../lib/types';
import { IssueChip } from './issue-embed';
import { CodeBlock } from './code-block';
import { mentionHandle, mentionLookup } from '../lib/mentions';
import { cn } from '../utils/cn';

const INLINE_SOURCE = [
  '`[^`\\n]+`',
  '\\*\\*[^*\\n]+\\*\\*',
  '__[^_\\n]+__',
  '~~[^~\\n]+~~',
  '\\*[^*\\n]+\\*',
  '_[^_\\n]+_',
  '\\[[^\\]\\n]+\\]\\((?:https?:\\/\\/|mailto:)[^)\\s]+\\)',
  'https?:\\/\\/[^\\s<"]+',
  '(?<![\\w.-])@[A-Za-z0-9._-]+',
  '(?<![\\w.-])#[a-z0-9][a-z0-9-]*',
  '(?<![\\w@#./-])[A-Z][A-Z0-9]{1,4}-\\d{1,6}(?![\\w-])',
].join('|');

type InlineContext = {
  lookup: Map<string, Pick<UserSummary, 'id' | 'name' | 'email' | 'title' | 'online'>>;
  channelNames?: Set<string>;
  issues?: Map<string, IssueRef>;
  meId?: string;
  onMentionClick?: (userId: string) => void;
};

function trimUrl(value: string) {
  let url = value;
  url = url.replace(/[.,;:!?]+$/, '');
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1);
  }
  return url;
}

function renderInline(
  text: string,
  context: InlineContext,
  keyPrefix: string,
  depth = 0,
): ReactNode[] {
  if (!text) return [];
  if (depth > 3) return [text];
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(new RegExp(INLINE_SOURCE, 'g'))) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const tokenKey = `${keyPrefix}-${key++}`;
    if (token.startsWith('`')) {
      parts.push(
        <code
          key={tokenKey}
          className="rounded-[5px] bg-canvas px-1 py-0.5 font-mono text-[0.86em] text-ink-soft"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(
        <strong key={tokenKey} className="font-semibold text-ink">
          {renderInline(token.slice(2, -2), context, tokenKey, depth + 1)}
        </strong>,
      );
    } else if (token.startsWith('~~')) {
      parts.push(
        <del key={tokenKey} className="text-muted">
          {renderInline(token.slice(2, -2), context, tokenKey, depth + 1)}
        </del>,
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      parts.push(
        <em key={tokenKey}>{renderInline(token.slice(1, -1), context, tokenKey, depth + 1)}</em>,
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={tokenKey}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-mint-deep underline decoration-mint-deep/30 underline-offset-2 hover:decoration-mint-deep"
          >
            {renderInline(link[1], { ...context, issues: undefined }, tokenKey, depth + 1)}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith('http')) {
      const url = trimUrl(token);
      const trailing = token.slice(url.length);
      parts.push(
        <a
          key={tokenKey}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-mint-deep underline decoration-mint-deep/30 underline-offset-2 hover:decoration-mint-deep"
        >
          {url}
        </a>,
      );
      if (trailing) parts.push(trailing);
    } else if (token.startsWith('@')) {
      const handle = token.slice(1).toLowerCase();
      const person = context.lookup.get(handle);
      if (person) {
        const mine = person.id === context.meId;
        const clickable = Boolean(context.onMentionClick) && !mine;
        const label = `@${person.name}`;
        const className = cn(
          'inline rounded-md px-1 py-0.5 font-medium',
          mine ? 'bg-coral text-white' : 'bg-coral-soft text-coral-deep',
          clickable && 'cursor-pointer hover:brightness-[0.97]',
        );
        parts.push(
          clickable ? (
            <button
              key={tokenKey}
              type="button"
              title={`Message ${person.name}`}
              onClick={() => context.onMentionClick?.(person.id)}
              className={className}
            >
              {label}
            </button>
          ) : (
            <span key={tokenKey} title={mentionHandle(person)} className={className}>
              {label}
            </span>
          ),
        );
      } else {
        parts.push(
          <span
            key={tokenKey}
            className="rounded-md bg-coral-soft px-1 py-0.5 font-medium text-coral-deep"
          >
            {token}
          </span>,
        );
      }
    } else if (token.startsWith('#')) {
      const known = !context.channelNames || context.channelNames.has(token.slice(1).toLowerCase());
      parts.push(
        <span
          key={tokenKey}
          className={
            known
              ? 'rounded-md bg-sage px-1 py-0.5 font-medium text-ink-soft'
              : 'font-medium text-ink-soft'
          }
        >
          {token}
        </span>,
      );
    } else if (/^[A-Z]/.test(token)) {
      const issue = context.issues?.get(token);
      parts.push(issue ? <IssueChip key={tokenKey} issue={issue} /> : token);
    } else {
      parts.push(token);
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function isEmbeddedKeyLine(line: string, context: { issues?: Map<string, IssueRef> }) {
  const key = line.trim();
  return /^[A-Z][A-Z0-9]{1,4}-\d{1,6}$/.test(key) && Boolean(context.issues?.get(key));
}

function isBlockStart(line: string) {
  return (
    /^\s*```/.test(line) ||
    /^\s*#{1,4}\s+/.test(line) ||
    /^\s*(?:---+|\*\*\*+)\s*$/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*+]\s+\S/.test(line) ||
    /^\s*\d+[.)]\s+\S/.test(line)
  );
}

function renderBlocks(body: string, context: InlineContext) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    // A key alone on its line becomes an embed card under the message; showing a chip too repeats it.
    if (isEmbeddedKeyLine(line, context)) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([\w-]*)\s*$/);
    if (fence) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<CodeBlock key={`block-${key++}`} code={code.join('\n')} language={fence[1]} />);
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const sizes = ['text-[17px]', 'text-[16px]', 'text-[15px]', 'text-[14px]'];
      const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push(
        <Heading
          key={`block-${key++}`}
          className={cn('font-semibold tracking-[-0.01em] text-ink', sizes[level - 1])}
        >
          {renderInline(heading[2], context, `h-${key}`)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`block-${key++}`} className="border-line" />);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`block-${key++}`}
          className="border-l-2 border-line pl-3 text-muted"
        >
          {quote.map((quoteLine, quoteIndex) => (
            <span key={`quote-${quoteIndex}`}>
              {renderInline(quoteLine, context, `q-${key}-${quoteIndex}`)}
              {quoteIndex < quote.length - 1 && <br />}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+\S/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+\S/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }
      // "- [ ] item" and "- [x] item" are checklist items, as the task editor writes them.
      const checks = items.map((item) => item.match(/^\[( |x|X)\]\s+(.*)$/));
      if (checks.every(Boolean)) {
        blocks.push(
          <ul key={`block-${key++}`} className="space-y-0.5">
            {checks.map((check, itemIndex) => (
              <li key={`li-${itemIndex}`} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={check![1] !== ' '}
                  readOnly
                  disabled
                  aria-label={check![2]}
                  className="mt-[5px] size-3.5 shrink-0 accent-ink"
                />
                <span className={cn(check![1] !== ' ' && 'text-muted line-through')}>
                  {renderInline(check![2], context, `cl-${key}-${itemIndex}`)}
                </span>
              </li>
            ))}
          </ul>,
        );
        continue;
      }
      blocks.push(
        <ul key={`block-${key++}`} className="list-disc space-y-0.5 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>
              {renderInline(item, context, `ul-${key}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+\S/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+\S/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`block-${key++}`} className="list-decimal space-y-0.5 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>
              {renderInline(item, context, `ol-${key}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index]) &&
      !isEmbeddedKeyLine(lines[index], context)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`block-${key++}`}>
        {paragraph.map((paragraphLine, lineIndex) => (
          <span key={`line-${lineIndex}`}>
            {renderInline(paragraphLine, context, `p-${key}-${lineIndex}`)}
            {lineIndex < paragraph.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  }

  return blocks;
}

export const RichText = memo(function RichText({
  body,
  channelNames,
  issues,
  members,
  meId,
  onMentionClick,
}: {
  body: string;
  channelNames?: Set<string>;
  issues?: IssueRef[];
  members?: UserSummary[];
  meId?: string;
  onMentionClick?: (userId: string) => void;
}) {
  const lookup = useMemo(() => mentionLookup(members ?? []), [members]);
  const issueMap = useMemo(
    () => (issues && issues.length > 0 ? new Map(issues.map((issue) => [issue.key, issue])) : undefined),
    [issues],
  );
  if (!body) return null;
  const context: InlineContext = { lookup, channelNames, issues: issueMap, meId, onMentionClick };
  return (
    <div className="break-words">
      <div className="space-y-1.5">{renderBlocks(body, context)}</div>
    </div>
  );
});
