import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getThreadFn, sendMessageFn, toggleReactionFn } from '../lib/chat';
import type { MessageView, ThreadView, UserSummary } from '../lib/types';
import { Avatar } from './avatar';
import { clockTime, fullDate, plural } from '../lib/format';
import { MessageComposer } from './message-composer';
import { MessageLinkPreviews } from './link-preview';
import { RichText } from './rich-text';
import { cn } from '../utils/cn';

export function ThreadPanel({
  messageId,
  channelName,
  members,
  meId,
  onClose,
  onChanged,
  onMentionClick,
}: {
  messageId: string;
  channelName: string;
  members?: UserSummary[];
  meId?: string;
  onClose: () => void;
  onChanged: () => void;
  onMentionClick?: (userId: string) => void;
}) {
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const request = ++requestRef.current;
      try {
        const next = await getThreadFn({ data: { messageId } });
        if (!cancelled && request === requestRef.current) {
          setThread(next);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled && request === requestRef.current) {
          setError(caught instanceof Error ? caught.message : 'Thread not found.');
        }
      }
    }
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [messageId]);

  async function refresh() {
    const request = ++requestRef.current;
    const next = await getThreadFn({ data: { messageId } });
    if (request !== requestRef.current) return;
    setThread(next);
    onChanged();
  }

  async function react(targetId: string, emoji: string) {
    try {
      await toggleReactionFn({ data: { messageId: targetId, emoji } });
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Reaction failed.');
    }
  }

  async function reply(body: string, attachmentIds: string[]) {
    const parent = thread?.parent;
    if (!parent) return;
    await sendMessageFn({
      data: { channelId: parent.channelId, body, parentId: parent.id, attachmentIds },
    });
    await refresh();
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-line bg-paper xl:w-[380px]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">Thread</h2>
          <p className="text-[11px] text-muted">
            {thread ? plural(thread.replies.length, 'reply', 'replies') : 'Loading'} in #{channelName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-line-soft hover:text-ink"
          aria-label="Close thread"
        >
          <X size={17} />
        </button>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        {thread && (
          <div className="space-y-4">
            <ThreadMessage
              message={thread.parent}
              onReact={react}
              members={members}
              meId={meId}
              onMentionClick={onMentionClick}
              large
            />
            {thread.replies.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-faint uppercase">
                  {plural(thread.replies.length, 'reply', 'replies')}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            {thread.replies.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                onReact={react}
                members={members}
                meId={meId}
                onMentionClick={onMentionClick}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <MessageComposer
          compact
          channelLabel={`#${channelName}`}
          placeholder="Reply in thread"
          members={members}
          onSend={reply}
          onTyping={() => undefined}
        />
      </div>
    </aside>
  );
}

function ThreadMessage({
  message,
  onReact,
  members,
  meId,
  onMentionClick,
  large,
}: {
  message: MessageView;
  onReact: (messageId: string, emoji: string) => void;
  members?: UserSummary[];
  meId?: string;
  onMentionClick?: (userId: string) => void;
  large?: boolean;
}) {
  return (
    <article className={cn('flex gap-3', large && 'rounded-2xl bg-canvas p-3')}>
      <Avatar name={message.author.name} color={message.author.avatarColor} size={large ? 'md' : 'sm'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-semibold">{message.author.name}</span>
          <span className="text-[11px] text-faint tabular-nums" title={fullDate(message.createdAt)}>
            {clockTime(message.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 text-[13.5px] leading-6 text-ink-soft">
          <RichText
            body={message.body}
            members={members}
            meId={meId}
            onMentionClick={onMentionClick}
          />
        </div>
        <MessageLinkPreviews body={message.body} compact />
        {message.attachments.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.attachments.map((attachment) =>
              attachment.mime.startsWith('image/') ? (
                <img
                  key={attachment.id}
                  src={attachment.url}
                  alt={attachment.name}
                  className="max-h-56 rounded-xl border border-line object-contain"
                />
              ) : (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-xs text-ink-soft hover:border-ink/20"
                >
                  <span className="truncate">{attachment.name}</span>
                </a>
              ),
            )}
          </div>
        )}
        {message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message.id, reaction.emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]',
                  reaction.mine
                    ? 'border-coral/40 bg-coral-soft text-coral-deep'
                    : 'border-line text-muted',
                )}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
