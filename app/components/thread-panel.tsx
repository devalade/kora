import { Link2, MoreHorizontal, Pencil, SmilePlus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getThreadFn, sendMessageFn, setTypingFn, toggleReactionFn } from '../lib/chat';
import type { MessageView, ThreadView, UserSummary } from '../lib/types';
import { Avatar } from './avatar';
import { clockTime, fullDate, plural } from '../lib/format';
import { MessageComposer } from './message-composer';
import { IssueEmbeds } from './issue-embed';
import { MessageLinkPreviews } from './link-preview';
import { ActionIcon, EditBox, MenuItem, MessageMenu, TypingRow, type MessageActions } from './message-list';
import { EmojiPopover } from './emoji-picker';
import { RichText } from './rich-text';
import { useLiveRefresh } from '../lib/realtime-client';
import { useDisplayTimeZone } from '../lib/use-display-time-zone';
import { cn } from '../utils/cn';

/** Changes when a reply, reaction, file or typing indicator changes; presence is ignored. */
function threadToken(thread: ThreadView) {
  return [thread.parent, ...thread.replies]
    .map((message) =>
      [
        message.id,
        message.editedAt,
        message.deletedAt,
        message.attachments.length,
        message.reactions.map((reaction) => `${reaction.emoji}${reaction.count}`).join(','),
      ].join(':'),
    )
    .concat(thread.typing.map((person) => person.id).join(','))
    .join('|');
}

export function ThreadPanel({
  workspaceSlug,
  messageId,
  channelName,
  members,
  meId,
  onClose,
  onChanged,
  onMentionClick,
  actions,
}: {
  workspaceSlug: string;
  messageId: string;
  channelName: string;
  members?: UserSummary[];
  meId?: string;
  onClose: () => void;
  onChanged: () => void;
  onMentionClick?: (userId: string) => void;
  /** Edit, delete and copy link; the panel refreshes itself after an edit or delete. */
  actions?: MessageActions;
}) {
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const typingSentAt = useRef(0);

  // The panel is keyed by thread, so `messageId` is stable for the life of the component's polling.
  const poll = useCallback(async (): Promise<string | null> => {
    const request = ++requestRef.current;
    try {
      const next = await getThreadFn({ data: { messageId } });
      if (request !== requestRef.current) return null;
      setThread(next);
      setError(null);
      return threadToken(next);
    } catch (caught) {
      if (request === requestRef.current) {
        setError(caught instanceof Error ? caught.message : 'Thread not found.');
      }
      return null;
    }
  }, [messageId]);

  // First paint, then refetch whenever the realtime socket reports a change in this channel.
  useEffect(() => {
    void poll();
  }, [poll]);
  const channelId = thread?.parent?.channelId ?? null;
  useLiveRefresh(workspaceSlug, poll, (event) =>
    (event.t === 'chat' || event.t === 'typing') && event.c === channelId,
  );
  const typingKey = thread?.typing.map((person) => person.id).join(',') ?? '';
  useEffect(() => {
    if (!typingKey) return;
    const timer = setTimeout(() => void poll(), 5_500);
    return () => clearTimeout(timer);
  }, [typingKey, poll]);

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

  function onTyping(active: boolean) {
    const parent = thread?.parent;
    if (!parent) return;
    if (active) {
      if (Date.now() - typingSentAt.current < 2000) return;
      typingSentAt.current = Date.now();
    } else {
      typingSentAt.current = 0;
    }
    void setTypingFn({ data: { channelId: parent.channelId, threadId: parent.id, active } }).catch(
      () => undefined,
    );
  }

  async function reply(body: string, attachmentIds: string[]) {
    const parent = thread?.parent;
    if (!parent) return;
    await sendMessageFn({
      data: { channelId: parent.channelId, body, parentId: parent.id, attachmentIds },
    });
    await refresh();
  }

  const threadActions: MessageActions | undefined = actions && {
    ...actions,
    onEdit: actions.onEdit
      ? async (message, body) => {
          await actions.onEdit!(message, body);
          await refresh();
        }
      : undefined,
  };

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
              actions={threadActions}
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
                actions={threadActions}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {thread && thread.typing.length > 0 && (
          <TypingRow people={thread.typing} className="px-1 pb-2" />
        )}
        <MessageComposer
          compact
          channelLabel={`#${channelName}`}
          placeholder="Reply in thread"
          members={members}
          onSend={reply}
          onTyping={onTyping}
          draftKey={`thread:${messageId}`}
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
  actions,
  large,
}: {
  message: MessageView;
  onReact: (messageId: string, emoji: string) => void;
  members?: UserSummary[];
  meId?: string;
  onMentionClick?: (userId: string) => void;
  actions?: MessageActions;
  large?: boolean;
}) {
  const timeZone = useDisplayTimeZone();
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const deleted = Boolean(message.deletedAt);
  const isMine = message.author.id === meId;
  const canEdit = Boolean(actions?.onEdit && isMine && !deleted);
  const canDelete = Boolean(actions?.onDelete && (isMine || actions.canModerate) && !deleted);
  return (
    <article
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={cn(
        'message-row group relative flex gap-3',
        large && 'rounded-2xl bg-canvas p-3',
        (pickerOpen || menuOpen) && 'is-active',
      )}
    >
      {!deleted && !editing && (
        <div className="message-actions absolute -top-3 right-0 z-20 flex items-center gap-0.5 rounded-[12px] border border-line/70 bg-paper p-1 shadow-[var(--kora-shadow-popover)]">
          <ActionIcon ref={pickerAnchor} label="Add reaction" active={pickerOpen} onClick={() => setPickerOpen((open) => !open)}>
            <SmilePlus size={14} />
          </ActionIcon>
          {canEdit && (
            <ActionIcon label="Edit message" onClick={() => setEditing(true)}>
              <Pencil size={13} />
            </ActionIcon>
          )}
          {(canDelete || actions?.onCopyLink) && (
            <ActionIcon ref={menuAnchor} label="More actions" active={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <MoreHorizontal size={14} />
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
      <Avatar name={message.author.name} src={message.author.avatarUrl} color={message.author.avatarColor} size={large ? 'md' : 'sm'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-semibold">{message.author.name}</span>
          <span className="text-[11px] text-faint tabular-nums" title={fullDate(message.createdAt, timeZone)}>
            {clockTime(message.createdAt, timeZone)}
          </span>
        </div>
        {deleted ? (
          <p className="mt-0.5 text-[13.5px] leading-6 text-faint italic">This message was deleted.</p>
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
          <div className="mt-0.5 text-[13.5px] leading-6 text-ink-soft">
            <RichText
              body={message.body}
              issues={message.issues}
              members={members}
              meId={meId}
              onMentionClick={onMentionClick}
            />
            {message.editedAt && <span className="ml-1 text-[11px] text-faint">(edited)</span>}
          </div>
        )}
        {!deleted && !editing && <IssueEmbeds body={message.body} issues={message.issues} compact />}
        {!deleted && !editing && <MessageLinkPreviews body={message.body} compact />}
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
