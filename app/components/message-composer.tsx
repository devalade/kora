import { Loader2, Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';

type Uploaded = { id: string; name: string; mime: string; size: number };

const EMOJIS = ['👍', '✅', '🎉', '❤️', '🔥', '👀', '🙏', '😂', '🚀', '💡'];

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
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploading = uploadingCount > 0;
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function upload(file: File) {
    setUploadingCount((count) => count + 1);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const payload = (await response.json()) as Uploaded & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Upload failed.');
      setFiles((current) => [...current, payload].slice(0, 6));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploadingCount((count) => Math.max(0, count - 1));
    }
  }

  async function submit() {
    const text = body.trim();
    if ((!text && files.length === 0) || sending || uploading) return;
    setSending(true);
    try {
      await onSend(text, files.map((file) => file.id));
      setBody('');
      setFiles([]);
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
        'rounded-2xl border border-line bg-paper shadow-[0_1px_0_rgba(23,26,26,0.04)] transition focus-within:border-ink/25 focus-within:shadow-[0_10px_30px_-18px_rgba(23,26,26,0.35)]',
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
            className="grid size-6 place-items-center rounded-md hover:bg-line-soft"
            aria-label="Cancel reply"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {(files.length > 0 || uploading) && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((file) => (
            <span
              key={file.id}
              className="inline-flex max-w-full items-center gap-2 rounded-lg bg-sage px-2.5 py-1.5 text-xs text-ink-soft"
            >
              <Paperclip size={12} />
              <span className="max-w-44 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                className="text-muted hover:text-ink"
                aria-label={`Remove ${file.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {uploading && (
            <span className="inline-flex items-center gap-2 rounded-lg bg-line-soft px-2.5 py-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" /> Uploading
            </span>
          )}
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
              const chosen = [...(event.target.files ?? [])];
              for (const file of chosen) void upload(file);
              event.target.value = '';
            }}
          />
          <IconButton label="Attach a file" onClick={() => inputRef.current?.click()}>
            <Paperclip size={17} />
          </IconButton>
          <div className="relative">
            <IconButton label="Add emoji" onClick={() => setEmojiOpen((open) => !open)}>
              <Smile size={17} />
            </IconButton>
            {emojiOpen && (
              <div className="animate-pop absolute bottom-10 left-0 z-20 grid w-56 grid-cols-5 gap-1 rounded-2xl border border-line bg-paper p-2 shadow-xl">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setBody((current) => `${current}${emoji}`);
                      setEmojiOpen(false);
                      textRef.current?.focus();
                    }}
                    className="grid size-9 place-items-center rounded-lg text-lg hover:bg-line-soft"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-faint sm:block">
            <kbd className="rounded border border-line px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to
            send
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || uploading || (!body.trim() && files.length === 0)}
            className="grid size-9 place-items-center rounded-xl bg-coral text-white transition hover:bg-coral-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-faint"
            aria-label="Send message"
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <SendHorizontal size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
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
      className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-line-soft hover:text-ink"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
