import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Download, FileText, Link2, MessageSquareText, MoreHorizontal, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import type { MessageView, UserSummary } from '../lib/types';
import { Avatar } from './avatar';
import { clockTime, dayLabel, fileSize, fullDate, plural, relativeTime } from '../lib/format';
import { RichText } from './rich-text';
import { IssueEmbeds } from './issue-embed';
import { MessageLinkPreviews } from './link-preview';
import { cn } from '../utils/cn';
import { useDisplayTimeZone } from '../lib/use-display-time-zone';
import { EmojiPopover } from './emoji-picker';
import { FloatingMenu } from './floating';

/** What a message row can do besides reacting and replying. Missing handlers hide the action. */
export type MessageActions = {
  onEdit?: (message: MessageView, body: string) => Promise<void>;
  onDelete?: (message: MessageView) => void;
  onCopyLink?: (message: MessageView) => void;
  /** Workspace admins may delete anyone's message. */
  canModerate?: boolean;
};

const QUICK_REACTIONS = ['👍', '🎉', '❤️'];

export function MessageList({
  messages,
  meId,
  channelLabel,
  channelNames,
  members,
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
  onMentionClick,
  actions,
  unreadAfter,
  highlightId,
}: {
  messages: MessageView[];
  meId: string;
  channelLabel: string;
  channelNames?: Set<string>;
  members?: UserSummary[];
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
  onMentionClick?: (userId: string) => void;
  actions?: MessageActions;
  /** The viewer's read marker when the channel opened: a "New" line goes above the first later message. */
  unreadAfter?: string | null;
  /** A linked message, scrolled to and tinted. */
  highlightId?: string | null;
}) {
  const timeZone = useDisplayTimeZone();
  const firstUnreadId = unreadAfter
    ? messages.find((message) => message.createdAt > unreadAfter && message.author.id !== meId)?.id
    : undefined;
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
              !previous ||
              dayLabel(previous.createdAt, timeZone) !== dayLabel(message.createdAt, timeZone);
            const sameAuthor = previous && previous.author.id === message.author.id;
            const closeInTime =
              previous &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                5 * 60_000;
            const isFirstUnread = message.id === firstUnreadId;
            const grouped = Boolean(previous && sameAuthor && closeInTime && !newDay && !isFirstUnread);
            return (
              <div key={message.id}>
                {newDay && (
                  <div className="sticky top-0 z-10 flex items-center gap-3 bg-canvas/92 py-3 backdrop-blur">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                      {dayLabel(message.createdAt, timeZone)}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                {isFirstUnread && (
                  <div className="flex items-center gap-2 py-1" role="separator" aria-label="New messages">
                    <span className="h-px flex-1 bg-coral/50" />
                    <span className="text-[11px] font-semibold text-coral-deep">New</span>
                  </div>
                )}
                <MessageRow
                  message={message}
                  grouped={Boolean(grouped)}
                  isMine={message.author.id === meId}
                  channelNames={channelNames}
                  members={members}
                  meId={meId}
                  onReply={onReply}
                  onReact={onReact}
                  onOpenThread={onOpenThread}
                  onImageOpen={onImageOpen}
                  onMentionClick={onMentionClick}
                  actions={actions}
                  highlighted={message.id === highlightId}
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
  members,
  meId,
  onReply,
  onReact,
  onOpenThread,
  onImageOpen,
  onMentionClick,
  actions,
  highlighted,
}: {
  message: MessageView;
  grouped: boolean;
  isMine: boolean;
  channelNames?: Set<string>;
  members?: UserSummary[];
  meId: string;
  onReply: (message: MessageView) => void;
  onReact: (messageId: string, emoji: string) => void;
  onOpenThread: (message: MessageView) => void;
  onImageOpen: (url: string, name: string) => void;
  onMentionClick?: (userId: string) => void;
  actions?: MessageActions;
  highlighted?: boolean;
}) {
  const timeZone = useDisplayTimeZone();
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const deleted = Boolean(message.deletedAt);
  const canEdit = Boolean(actions?.onEdit && isMine && !deleted);
  const canDelete = Boolean(actions?.onDelete && (isMine || actions.canModerate) && !deleted);
  const hasMenu = !deleted && Boolean(canEdit || canDelete || actions?.onCopyLink);
  return (
    <div
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={cn(
        'message-row group relative -mx-2 rounded-xl px-2 transition-colors duration-100 hover:bg-ink/[0.025]',
        grouped ? 'py-0.5' : 'pt-3 pb-1',
        highlighted && 'bg-coral-soft/60 hover:bg-coral-soft/60',
        (pickerOpen || menuOpen) && 'is-active',
      )}
    >
      <div className="flex gap-3">
        <div className="w-9 shrink-0 pt-0.5">
          {!grouped && (
            <Avatar
              name={message.author.name} src={message.author.avatarUrl}
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
                title={fullDate(message.createdAt, timeZone)}
              >
                {clockTime(message.createdAt, timeZone)}
              </span>
              {message.author.title && (
                <span className="hidden text-[11px] text-faint sm:inline">
                  {message.author.title}
                </span>
              )}
            </div>
          )}

          {deleted ? (
            <p className="text-[14px] leading-6 text-faint italic">This message was deleted.</p>
          ) : editing && actions?.onEdit ? (
            <EditBox
              initial={message.body}
              onCancel={() => setEditing(false)}
              onSave={async (body) => {
                await actions.onEdit!(message, body);
                setEditing(false);
              }}
            />
          ) : (
            <div className="text-[14.5px] leading-6 text-ink-soft">
              <RichText
                body={message.body}
                channelNames={channelNames}
                issues={message.issues}
                members={members}
                meId={meId}
                onMentionClick={onMentionClick}
              />
              {message.editedAt && (
                <span className="ml-1 text-[11px] text-faint" title={fullDate(message.editedAt, timeZone)}>
                  (edited)
                </span>
              )}
            </div>
          )}

          {!deleted && !editing && <IssueEmbeds body={message.body} issues={message.issues} />}
          {!deleted && !editing && <MessageLinkPreviews body={message.body} />}

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

      {!deleted && !editing && (
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
          <ActionIcon
            ref={pickerAnchor}
            label="Add reaction"
            active={pickerOpen}
            onClick={() => {
              setMenuOpen(false);
              setPickerOpen((open) => !open);
            }}
          >
            <SmilePlus size={15} />
          </ActionIcon>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <ActionIcon label="Reply in thread" onClick={() => onReply(message)}>
            <CornerUpLeft size={15} />
          </ActionIcon>
          {canEdit && (
            <ActionIcon label="Edit message" onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </ActionIcon>
          )}
          {hasMenu && (
            <ActionIcon
              ref={menuAnchor}
              label="More actions"
              active={menuOpen}
              onClick={() => {
                setPickerOpen(false);
                setMenuOpen((open) => !open);
              }}
            >
              <MoreHorizontal size={15} />
            </ActionIcon>
          )}
        </div>
      )}
      {pickerOpen && (
        <EmojiPopover
          anchor={pickerAnchor}
          label="Pick a reaction"
          onClose={() => setPickerOpen(false)}
          onPick={(emoji) => {
            setPickerOpen(false);
            onReact(message.id, emoji);
          }}
        />
      )}
      {menuOpen && (
        <MessageMenu anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
          {actions?.onCopyLink && (
            <MenuItem
              icon={<Link2 size={14} />}
              onClick={() => {
                setMenuOpen(false);
                actions.onCopyLink!(message);
              }}
            >
              Copy link
            </MenuItem>
          )}
          {canEdit && (
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              Edit message
            </MenuItem>
          )}
          {canDelete && (
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                setMenuOpen(false);
                actions!.onDelete!(message);
              }}
            >
              Delete message
            </MenuItem>
          )}
        </MessageMenu>
      )}
    </div>
  );
}

export function ActionIcon({
  ref,
  label,
  active,
  onClick,
  children,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-[10px] transition-[background-color,color,transform] duration-100 active:scale-[0.96]',
        active ? 'bg-line-soft text-ink' : 'text-muted hover:bg-line-soft hover:text-ink',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function MessageMenu({
  anchor,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, onClose]);
  return (
    <FloatingMenu anchor={anchor} menuRef={menuRef} align="end" className="min-w-[180px] p-1">
      <div role="menu" aria-label="Message actions">
        {children}
      </div>
    </FloatingMenu>
  );
}

export function MenuItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-line-soft focus-visible:bg-line-soft',
        danger ? 'text-coral-deep' : 'text-ink',
      )}
    >
      <span className={danger ? 'text-coral-deep' : 'text-muted'}>{icon}</span>
      {children}
    </button>
  );
}

/** Enter saves, Shift+Enter adds a line, Escape cancels. */
export function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [value]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the edit.');
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 rounded-xl border border-line bg-paper p-2 focus-within:border-ink/25">
      <textarea
        ref={ref}
        value={value}
        aria-label="Edit message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
          }
        }}
        className="block w-full resize-none bg-transparent text-[14.5px] leading-6 text-ink outline-none"
        rows={1}
      />
      {error && <p className="mt-1 text-[12px] text-coral-deep">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-faint">Escape to cancel, Enter to save</span>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md px-2.5 text-[12px] font-medium text-muted hover:bg-line-soft hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="h-7 rounded-md bg-ink px-2.5 text-[12px] font-medium text-paper hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function TypingRow({
  people,
  className = 'pt-3 pb-1 pl-12',
}: {
  people: UserSummary[];
  className?: string;
}) {
  const names = people.map((person) => person.name.split(' ')[0]);
  return (
    <div className={cn('flex items-center gap-2 text-[13px] text-ink-soft', className)} aria-live="polite">
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((person) => (
          <Avatar
            key={person.id}
            name={person.name}
            src={person.avatarUrl}
            color={person.avatarColor}
            size="2xs"
            className="ring-2 ring-paper"
          />
        ))}
      </span>
      <span>
        {names.length === 1 ? (
          <>
            <span className="font-semibold text-ink">{names[0]}</span> is typing
          </>
        ) : names.length === 2 ? (
          <>
            <span className="font-semibold text-ink">{names[0]}</span> and{' '}
            <span className="font-semibold text-ink">{names[1]}</span> are typing
          </>
        ) : (
          'Several people are typing'
        )}
      </span>
      <span className="flex items-end gap-0.5 pb-0.5">
        <span className="typing-dot size-1.5 rounded-full bg-muted" />
        <span className="typing-dot size-1.5 rounded-full bg-muted" />
        <span className="typing-dot size-1.5 rounded-full bg-muted" />
      </span>
    </div>
  );
}
