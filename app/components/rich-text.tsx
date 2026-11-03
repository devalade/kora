import type { ReactNode } from 'react';

const TOKEN = /(https?:\/\/[^\s<]+|@[A-Za-z][\w.-]*|#[a-z0-9][a-z0-9-]*)/g;

export function RichText({ body, channelNames }: { body: string; channelNames?: Set<string> }) {
  if (!body) return null;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;

  while ((match = TOKEN.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('http')) {
      parts.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-mint-deep underline decoration-mint-deep/30 underline-offset-2 hover:decoration-mint-deep"
        >
          {token}
        </a>,
      );
    } else if (token.startsWith('@')) {
      parts.push(
        <span
          key={key++}
          className="rounded-md bg-coral-soft px-1 py-0.5 font-medium text-coral-deep"
        >
          {token}
        </span>,
      );
    } else if (token.startsWith('#')) {
      const known = !channelNames || channelNames.has(token.slice(1).toLowerCase());
      parts.push(
        <span
          key={key++}
          className={
            known
              ? 'rounded-md bg-sage px-1 py-0.5 font-medium text-ink-soft'
              : 'font-medium text-ink-soft'
          }
        >
          {token}
        </span>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));

  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}
