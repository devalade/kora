import {
  AlertCircle,
  FileText,
  Loader2,
  Paperclip,
  RotateCcw,
  SendHorizontal,
  Smile,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';

type Draft = {
  localId: string;
  attachmentId?: string;
  name: string;
  mime: string;
  size: number;
  previewUrl?: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  file: File;
};

const EMOJIS = [
  '👍',
  '✅',
  '🎉',
  '❤️',
  '🔥',
  '👀',
  '🙏',
  '😂',
  '🚀',
  '💡',
  '😍',
  '🤝',
  '💯',
  '✨',
  '👏',
  '😅',
  '🫡',
  '☕',
];

const MAX_FILES = 6;

export function MessageComposer({
  channelLabel,
  placeholder,
  compact,
  replyingTo,
  onCancelReply,
  onSend,
  onTyping,
}: {
  channelLabel: string;
  placeholder?: string;
  compact?: boolean;
  replyingTo?: string;
  onCancelReply?: () => void;
  onSend: (body: string, attachmentIds: string[]) => Promise<void>;
  onTyping: (active: boolean) => void;
}) {
  const [body, setBody] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const draftsRef = useRef<Draft[]>([]);
  const uploading = drafts.some((draft) => draft.status === 'uploading');
  const readyFiles = drafts.filter((draft) => draft.status === 'done');
  const hasFailed = drafts.some((draft) => draft.status === 'error');

  useEffect(() => {
    const stored = window.localStorage.getItem('kora.recentEmojis');
    if (stored) {
      try {
        setRecentEmojis(JSON.parse(stored) as string[]);
      } catch {
        // Ignore a malformed local list.
      }
    }
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      for (const xhr of xhrs.current.values()) xhr.abort();
      for (const draft of draftsRef.current) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (emojiPopoverRef.current?.contains(event.target as Node)) return;
      if (emojiButtonRef.current?.contains(event.target as Node)) return;
      setEmojiOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEmojiOpen(false);
        emojiButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiOpen]);

  function markTyping() {
    onTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping(false), 2600);
  }

  function resize() {
    const element = textRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }

  function patchDraft(localId: string, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.localId === localId ? { ...draft, ...patch } : draft)),
    );
  }

  function startUpload(localId: string, file: File) {
    const xhr = new XMLHttpRequest();
    xhrs.current.set(localId, xhr);
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      patchDraft(localId, { progress: Math.round((event.loaded / event.total) * 100) });
    };
    xhr.onload = () => {
      xhrs.current.delete(localId);
      let payload: { id?: string; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText) as { id?: string; error?: string };
      } catch {
        payload = { error: 'The upload returned an unreadable response.' };
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.id) {
        patchDraft(localId, {
          attachmentId: payload.id,
          status: 'done',
          progress: 100,
          error: undefined,
        });
      } else {
        patchDraft(localId, {
          status: 'error',
          error: payload.error ?? 'Upload failed.',
        });
      }
    };
    xhr.onerror = () => {
      xhrs.current.delete(localId);
      patchDraft(localId, { status: 'error', error: 'Network error. Try again.' });
    };
    xhr.onabort = () => {
      xhrs.current.delete(localId);
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  }

  function pickFiles(fileList: FileList | null) {
    setEmojiOpen(false);
    const chosen = [...(fileList ?? [])];
    if (chosen.length === 0) return;
    const room = Math.max(0, MAX_FILES - drafts.length);
    if (chosen.length > room) {
      toast.error(`You can attach up to ${MAX_FILES} files.`);
    }
    for (const file of chosen.slice(0, room)) {
      const localId = crypto.randomUUID();
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      const draft: Draft = {
        localId,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl,
        progress: 0,
        status: 'uploading',
        file,
      };
      setDrafts((current) => [...current, draft]);
      startUpload(localId, file);
    }
  }

  function removeDraft(localId: string) {
    xhrs.current.get(localId)?.abort();
    xhrs.current.delete(localId);
    setDrafts((current) => {
      const draft = current.find((item) => item.localId === localId);
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return current.filter((item) => item.localId !== localId);
    });
  }

  function retryDraft(draft: Draft) {
    patchDraft(draft.localId, {
      status: 'uploading',
      progress: 0,
      error: undefined,
      attachmentId: undefined,
    });
    startUpload(draft.localId, draft.file);
  }

  function insertEmoji(emoji: string) {
    const element = textRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    setBody(next);
    setRecentEmojis((current) => {
      const updated = [emoji, ...current.filter((item) => item !== emoji)].slice(0, 6);
      window.localStorage.setItem('kora.recentEmojis', JSON.stringify(updated));
      return updated;
    });
    requestAnimationFrame(() => {
      element?.focus();
      const position = start + emoji.length;
      element?.setSelectionRange(position, position);
      resize();
    });
  }

  async function submit() {
    const text = body.trim();
    if ((!text && readyFiles.length === 0) || sending || uploading || hasFailed) return;
    setSending(true);
    try {
      await onSend(
        text,
        readyFiles.map((draft) => draft.attachmentId!).filter(Boolean),
      );
      for (const draft of drafts) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      }
      setBody('');
      setDrafts([]);
      setEmojiOpen(false);
      onTyping(false);
      if (textRef.current) {
        textRef.current.style.height = '0px';
        textRef.current.focus();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message did not send.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        'group/composer relative rounded-[18px] border border-line/80 bg-paper shadow-[var(--kora-shadow-composer)] transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ink/20 focus-within:shadow-[var(--kora-shadow-composer-focus)]',
        compact ? 'mx-0' : 'mx-5 mb-5',
      )}
    >
      {replyingTo && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2 text-xs text-muted">
          <span>
            Replying in thread to <span className="font-semibold text-ink">{replyingTo}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-6 place-items-center rounded-md transition-colors duration-100 hover:bg-line-soft active:scale-[0.96]"
            aria-label="Cancel reply"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.localId}
              draft={draft}
              onRemove={() => removeDraft(draft.localId)}
              onRetry={() => retryDraft(draft)}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textRef}
        rows={1}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          resize();
          markTyping();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder ?? `Message ${channelLabel}`}
        className="block max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-6 outline-none placeholder:text-faint"
        aria-label={`Message ${channelLabel}`}
      />

      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
        <div className="flex items-center gap-0.5">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => {
              pickFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <ComposerIcon
            label="Attach a file"
            onClick={() => {
              setEmojiOpen(false);
              inputRef.current?.click();
            }}
          >
            <Paperclip size={16} strokeWidth={1.8} />
          </ComposerIcon>

          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => setEmojiOpen((open) => !open)}
            className={cn(
              'grid size-8 place-items-center rounded-[10px] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]',
              emojiOpen
                ? 'bg-coral-soft text-coral-deep'
                : 'text-muted hover:bg-line-soft hover:text-ink',
            )}
            aria-label="Add emoji"
            aria-expanded={emojiOpen}
            aria-haspopup="dialog"
            title="Add emoji"
          >
            <Smile size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {uploading && (
            <span className="hidden items-center gap-1.5 text-[11px] font-medium text-muted sm:flex">
              <Loader2 size={12} className="animate-spin" />
              Uploading
            </span>
          )}
          {hasFailed && (
            <span className="hidden items-center gap-1.5 text-[11px] font-medium text-danger sm:flex">
              <AlertCircle size={12} />
              Upload failed
            </span>
          )}
          <span className="hidden text-[11px] text-faint sm:block">
            <kbd className="rounded-md border border-line/80 bg-canvas px-1.5 py-0.5 font-mono text-[9px]">
              Enter
            </kbd>{' '}
            to send
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              sending || uploading || hasFailed || (!body.trim() && readyFiles.length === 0)
            }
            className="grid size-9 place-items-center rounded-[10px] bg-coral text-white shadow-[0_6px_16px_-8px_oklch(0.62_0.16_32_/_0.7)] transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-coral-deep active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:bg-line disabled:text-faint disabled:shadow-none"
            aria-label="Send message"
          >
            {sending || uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <SendHorizontal size={16} strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>
      {emojiOpen && (
              <div
                ref={emojiPopoverRef}
                role="dialog"
                aria-label="Pick an emoji"
                className="popover-in absolute bottom-[calc(100%+10px)] left-3 z-40 max-h-[min(320px,60vh)] w-[264px] overflow-y-auto rounded-[18px] border border-line/70 bg-paper shadow-[var(--kora-shadow-popover)]"
              >
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.1em] text-faint uppercase">
                    Emoji
                  </span>
                  <span className="text-[10px] text-faint">Click to insert</span>
                </div>
                {recentEmojis.length > 0 && (
                  <div className="px-1.5 pb-1">
                    <p className="px-1.5 pb-0.5 text-[9px] font-medium text-faint">Recent</p>
                    <div className="grid grid-cols-6">
                      {recentEmojis.map((emoji) => (
                        <EmojiButton key={`recent-${emoji}`} emoji={emoji} onPick={insertEmoji} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="px-1.5 pb-2">
                  <p className="px-1.5 pb-0.5 text-[9px] font-medium text-faint">All</p>
                  <div className="grid grid-cols-6">
                    {EMOJIS.map((emoji) => (
                      <EmojiButton key={emoji} emoji={emoji} onPick={insertEmoji} />
                    ))}
                  </div>
                </div>
              </div>
            )}
    </div>
  );
}

function DraftCard({
  draft,
  onRemove,
  onRetry,
}: {
  draft: Draft;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isImage = Boolean(draft.previewUrl);
  return (
    <div
      className={cn(
        'group/draft relative overflow-hidden rounded-[12px] border border-line/80 bg-canvas',
        isImage ? 'size-20' : 'flex w-[230px] items-center gap-2.5 px-2.5 py-2',
      )}
    >
      {isImage ? (
        <>
          <img
            src={draft.previewUrl}
            alt={draft.name}
            title={draft.name}
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10"
          />
          {draft.status === 'uploading' && (
            <div className="absolute inset-0 grid place-items-center bg-ink/45 backdrop-blur-[1px]">
              {draft.progress > 0 ? (
                <span className="font-mono text-[10px] font-medium text-white tabular-nums">
                  {draft.progress}%
                </span>
              ) : (
                <Loader2 size={15} className="animate-spin text-white" />
              )}
            </div>
          )}
          {draft.status === 'error' && (
            <div className="absolute inset-0 grid place-items-center bg-danger/75">
              <button
                type="button"
                onClick={onRetry}
                className="grid size-8 place-items-center rounded-full bg-white/90 text-danger active:scale-[0.96]"
                aria-label={`Retry ${draft.name}`}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-ink/65 text-white opacity-100 backdrop-blur transition-opacity duration-100 focus-visible:opacity-100 active:scale-[0.96] sm:opacity-0 sm:group-hover/draft:opacity-100 sm:focus-visible:opacity-100"
            aria-label={`Remove ${draft.name}`}
          >
            <X size={11} />
          </button>
        </>
      ) : (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-sage text-ink-soft">
            {draft.status === 'uploading' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : draft.status === 'error' ? (
              <AlertCircle size={15} className="text-danger" />
            ) : (
              <FileText size={15} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-ink">{draft.name}</span>
            <span className="mt-0.5 block truncate text-[10px] text-faint">
              {draft.status === 'uploading'
                ? draft.progress > 0
                  ? `Uploading ${draft.progress}%`
                  : 'Uploading'
                : draft.status === 'error'
                  ? draft.error ?? 'Upload failed'
                  : fileSize(draft.size)}
            </span>
          </span>
          {draft.status === 'error' ? (
            <button
              type="button"
              onClick={onRetry}
              className="grid size-6 place-items-center rounded-md text-danger transition-colors duration-100 hover:bg-danger/10 active:scale-[0.96]"
              aria-label={`Retry ${draft.name}`}
            >
              <RotateCcw size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className="grid size-6 place-items-center rounded-md text-faint transition-colors duration-100 hover:bg-line-soft hover:text-ink active:scale-[0.96]"
              aria-label={`Remove ${draft.name}`}
            >
              <X size={12} />
            </button>
          )}
          {draft.status === 'uploading' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line-soft">
              <span
                className="block h-full bg-coral transition-[width] duration-200 ease-out"
                style={{ width: `${draft.progress}%` }}
              />
            </span>
          )}
        </>
      )}
    </div>
  );
}

function EmojiButton({ emoji, onPick }: { emoji: string; onPick: (emoji: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      className="grid size-10 place-items-center rounded-[10px] text-[19px] leading-none transition-[background-color,transform] duration-100 ease-out hover:bg-line-soft active:scale-[0.94]"
    >
      {emoji}
    </button>
  );
}

function ComposerIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-8 place-items-center rounded-[10px] text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-line-soft hover:text-ink active:scale-[0.96]"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
