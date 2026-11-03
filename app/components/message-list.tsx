import { CornerUpLeft, Download, FileText, MessageSquareText, SmilePlus } from 'lucide-react';
import type { MessageView, UserSummary } from '../lib/types';
import { Avatar } from './avatar';
import { clockTime, dayLabel, fileSize, fullDate, plural, relativeTime } from '../lib/format';
import { RichText } from './rich-text';
import { cn } from '../utils/cn';

const QUICK_REACTIONS = ['👍', '🎉', '❤️'];

export function MessageList({
  messages,
  meId,
  channelLabel,
  channelNames,
  typing,
  hasMore,
  loadingMore,
  isDm,
  dmName,
  onLoadMore,
  onReply,
  onReact,
  onOpenThread,
  onImageOpen,
}: {
  messages: MessageView[];
  meId: string;
  channelLabel: string;
  channelNames?: Set<string>;
  typing: UserSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  isDm?: boolean;
  dmName?: string;
  onLoadMore: () => void;
  onReply: (message: MessageView) => void;
  onReact: (messageId: string, emoji: string) => void;
  onOpenThread: (message: MessageView) => void;
  onImageOpen: (url: string, name: string) => void;
}) {
  return (
    <div className="pb-2">
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-medium text-muted transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            {loadingMore ? 'Loading earlier messages' : 'Load earlier messages'}
          </button>
        </div>
      )}

      <div className="px-5 pt-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-line bg-paper/60 px-6 py-8">
            <span className="grid size-11 place-items-center rounded-2xl bg-coral-soft text-coral-deep">
              <MessageSquareText size={21} />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em]">
                {isDm
                  ? `This is the start of your conversation with ${dmName ?? channelLabel}.`
                  : `This is the start of #${channelLabel}.`}
              </h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted">
                {isDm
                  ? 'Say hello, share a file, or pick up the thread from somewhere else.'
                  : 'Say hello, share what you are working on, or drop a file. Threads keep the noisy parts out of the channel.'}
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay =
              !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
            const sameAuthor = previous && previous.author.id === message.author.id;
            const closeInTime =
              previous &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                5 * 60_000;
            const grouped = Boolean(previous && sameAuthor && closeInTime && !newDay);
            return (
              <div key={message.id}>
                {newDay && (
                  <div className="sticky top-0 z-10 flex items-center gap-3 bg-canvas/92 py-3 backdrop-blur">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                      {dayLabel(message.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageRow
                  message={message}
                  grouped={Boolean(grouped)}
                  isMine={message.author.id === meId}
                  channelNames={channelNames}
                  onReply={onReply}
                  onReact={onReact}
                  onOpenThread={onOpenThread}
                  onImageOpen={onImageOpen}
                />
              </div>
            );
          })
        )}

        {typing.length > 0 && <TypingRow people={typing} />}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  isMine,
  channelNames,
  onReply,
  onReact,
  onOpenThread,
  onImageOpen,
}: {
  message: MessageView;
  grouped: boolean;
  isMine: boolean;
  channelNames?: Set<string>;
  onReply: (message: MessageView) => void;
  onReact: (messageId: string, emoji: string) => void;
  onOpenThread: (message: MessageView) => void;
  onImageOpen: (url: string, name: string) => void;
}) {
  return (
    <div
      className={cn(
        'message-row group relative -mx-2 rounded-xl px-2 transition-colors duration-100 hover:bg-paper/80',
        grouped ? 'py-0.5' : 'pt-3 pb-1',
      )}
    >
      <div className="flex gap-3">
        <div className="w-9 shrink-0 pt-0.5">
          {!grouped && (
            <Avatar
              name={message.author.name}
              color={message.author.avatarColor}
              size="md"
              online={message.author.online}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[14.5px] font-semibold tracking-[-0.01em]">
                {message.author.name}
                {isMine && <span className="ml-1.5 text-[11px] font-normal text-faint">you</span>}
              </span>
              <span
                className="text-[11px] text-faint tabular-nums"
                title={fullDate(message.createdAt)}
                suppressHydrationWarning
              >
                {clockTime(message.createdAt)}
              </span>
              {message.author.title && (
                <span className="hidden text-[11px] text-faint sm:inline">
                  {message.author.title}
                </span>
              )}
            </div>
          )}

          <div className="text-[14.5px] leading-6 text-ink-soft">
            <RichText body={message.body} channelNames={channelNames} />
            {message.editedAt && <span className="ml-1 text-[11px] text-faint">(edited)</span>}
          </div>

          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {message.attachments.map((attachment) =>
                attachment.mime.startsWith('image/') ? (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => onImageOpen(attachment.url, attachment.name)}
                    className="mt-2 block w-fit max-w-full overflow-hidden rounded-2xl border border-line bg-paper transition-[border-color,transform] duration-150 ease-out hover:border-ink/20 active:scale-[0.995]"
                    aria-label={`Open ${attachment.name}`}
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      loading="lazy"
                      className="max-h-[320px] max-w-full object-contain outline outline-1 -outline-offset-1 outline-black/10"
                    />
                  </button>
                ) : (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    className="flex w-fit max-w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 transition hover:border-ink/20"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-sage text-ink-soft">
                      <FileText size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-64 truncate text-[13px] font-medium">
                        {attachment.name}
                      </span>
                      <span className="block text-[11px] text-faint">
                        {fileSize(attachment.size)}
                      </span>
                    </span>
                    <Download size={15} className="ml-2 text-faint" />
                  </a>
                ),
              )}
            </div>
          )}

          {message.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onReact(message.id, reaction.emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                    reaction.mine
                      ? 'border-coral/40 bg-coral-soft text-coral-deep'
                      : 'border-line bg-paper text-muted hover:border-ink/20 hover:text-ink',
                  )}
                  title={`${reaction.count} reaction${reaction.count === 1 ? '' : 's'}`}
                >
                  <span className="text-[14px] leading-none">{reaction.emoji}</span>
                  <span className="font-medium">{reaction.count}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onReact(message.id, '👍')}
                className="grid size-6 place-items-center rounded-full border border-line bg-paper text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
                aria-label="Add reaction"
              >
                <SmilePlus size={12} />
              </button>
            </div>
          )}

          {message.replyCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              className="mt-2 inline-flex items-center gap-2 rounded-lg py-1 text-left text-xs font-semibold text-mint-deep transition hover:text-ink"
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageSquareText size={13} />
                {plural(message.replyCount, 'reply', 'replies')}
              </span>
              {message.lastReplyAt && (
                <span className="font-normal text-faint tabular-nums" suppressHydrationWarning>
                  last {relativeTime(message.lastReplyAt)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="message-actions absolute -top-4 right-2 z-20 flex items-center gap-1 overflow-visible rounded-[14px] border border-line/70 bg-paper p-1.5 shadow-[var(--kora-shadow-popover)]">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(message.id, emoji)}
            className="grid size-8 place-items-center overflow-visible rounded-[10px] text-[17px] leading-none transition-[background-color,transform] duration-100 hover:bg-line-soft active:scale-[0.96]"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={() => onReply(message)}
          className="grid size-8 place-items-center rounded-[10px] text-muted transition-[background-color,color,transform] duration-100 hover:bg-line-soft hover:text-ink active:scale-[0.96]"
          aria-label="Reply in thread"
          title="Reply in thread"
        >
          <CornerUpLeft size={15} />
        </button>
      </div>
    </div>
  );
}

function TypingRow({ people }: { people: UserSummary[] }) {
  const names = people.map((person) => person.name.split(' ')[0]);
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 pl-12 text-xs text-muted">
      <span className="flex items-end gap-0.5">
        <span className="typing-dot size-1.5 rounded-full bg-faint" />
        <span className="typing-dot size-1.5 rounded-full bg-faint" />
        <span className="typing-dot size-1.5 rounded-full bg-faint" />
      </span>
      <span>
        {names.length === 1
          ? `${names[0]} is typing`
          : names.length === 2
            ? `${names[0]} and ${names[1]} are typing`
            : 'Several people are typing'}
      </span>
    </div>
  );
}
