import {
  AlertCircle,
  AtSign,
  Bold,
  Code2,
  FileText,
  Hash,
  Italic,
  Link2,
  Loader2,
  Paperclip,
  RotateCcw,
  SendHorizontal,
  Smile,
  X,
} from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { htmlToMarkdown } from '../lib/clipboard';
import { searchIssueRefsFn, type IssueRefSearch } from '../lib/issue-refs';
import {
  findMentionTrigger,
  matchMentionPeople,
  mentionHandle,
  type MentionTrigger,
} from '../lib/mentions';
import type { UserSummary } from '../lib/types';
import { cn } from '../utils/cn';
import { Avatar } from './avatar';
import { EmojiPopover } from './emoji-picker';
import { TaskStatusIcon } from './task-icons';

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

/** The server refuses larger files (api/upload.ts); checking first saves a doomed upload. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DRAFT_PREFIX = 'kora.draft.';

function readDraft(key: string | undefined) {
  if (!key) return '';
  try {
    return window.localStorage.getItem(DRAFT_PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(key: string | undefined, text: string) {
  if (!key) return;
  try {
    if (text.trim()) window.localStorage.setItem(DRAFT_PREFIX + key, text);
    else window.localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // Drafts are a convenience; a full or blocked storage just means no draft.
  }
}

const MAX_FILES = 6;

type HashTrigger = { start: number; end: number; query: string };
type HashItem =
  | { kind: 'issue'; id: string; issue: IssueRefSearch['issues'][number] }
  | { kind: 'channel'; id: string; name: string };

/** Finds a `#query` just before the cursor: a channel name or an issue key such as KOR-12. */
function findHashTrigger(text: string, cursor: number): HashTrigger | null {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const match = before.match(/(^|[\s([{])#([A-Za-z0-9-]{0,40})$/);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: before.length - query.length - 1, end: cursor, query };
}

export function MessageComposer({
  channelLabel,
  placeholder,
  compact,
  replyingTo,
  members,
  onCancelReply,
  onSend,
  onTyping,
  draftKey,
  acceptPageDrops,
}: {
  channelLabel: string;
  placeholder?: string;
  /** Unsent text is kept per key (a channel or a thread) in this browser. */
  draftKey?: string;
  /** Files dropped anywhere on the page attach here (the channel composer, not the thread one). */
  acceptPageDrops?: boolean;
  compact?: boolean;
  replyingTo?: string;
  members?: UserSummary[];
  onCancelReply?: () => void;
  onSend: (body: string, attachmentIds: string[]) => Promise<void>;
  onTyping: (active: boolean) => void;
}) {
  const [body, setBody] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<MentionTrigger | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hash, setHash] = useState<HashTrigger | null>(null);
  const [hashIndex, setHashIndex] = useState(0);
  const [hashResults, setHashResults] = useState<(IssueRefSearch & { query: string }) | null>(null);
  const { workspaceSlug } = useParams({ strict: false });
  const hashPopoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const mentionPopoverRef = useRef<HTMLDivElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const draftsRef = useRef<Draft[]>([]);
  const uploading = drafts.some((draft) => draft.status === 'uploading');
  const readyFiles = drafts.filter((draft) => draft.status === 'done');
  const hasFailed = drafts.some((draft) => draft.status === 'error');
  const mentionResults = useMemo(
    () => (mention ? matchMentionPeople(members ?? [], mention.query).slice(0, 8) : []),
    [members, mention],
  );

  // `#` suggests issues and channels. Typing narrows the list; stale replies are dropped.
  const hashItems = useMemo<HashItem[]>(() => {
    if (!hash || !hashResults) return [];
    const issueItems: HashItem[] = hashResults.issues.map((issue) => ({
      kind: 'issue',
      id: issue.id,
      issue,
    }));
    const channelItems: HashItem[] = hashResults.channels
      .slice(0, issueItems.length > 0 ? 4 : 8)
      .map((channel) => ({ kind: 'channel', id: channel.id, name: channel.name }));
    // Keys and title matches lead; with nothing typed yet, channels come first as they always did.
    return hash.query && issueItems.length > 0
      ? [...issueItems, ...channelItems]
      : [...channelItems, ...issueItems];
  }, [hash, hashResults]);
  const hashActive = hash !== null;
  const hashQuery = hash?.query ?? '';

  useEffect(() => {
    if (!hashActive || !workspaceSlug) {
      setHashResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchIssueRefsFn({ data: { workspaceSlug, query: hashQuery } })
        .then((result) => {
          if (!cancelled) setHashResults({ ...result, query: hashQuery });
        })
        .catch(() => undefined);
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hashActive, hashQuery, workspaceSlug]);

  useEffect(() => {
    if (!hash) return;
    const active = hashPopoverRef.current?.querySelector('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [hash, hashIndex]);

  useEffect(() => {
    if (!hash) return;
    const onPointerDown = (event: PointerEvent) => {
      if (hashPopoverRef.current?.contains(event.target as Node)) return;
      setHash(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [hash]);

  useEffect(() => {
    const saved = readDraft(draftKey);
    if (saved) {
      setBody(saved);
      requestAnimationFrame(resize);
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

  // Keep the draft as it is typed.
  useEffect(() => {
    writeDraft(draftKey, body);
  }, [draftKey, body]);

  // Dropping files anywhere on the page attaches them here.
  useEffect(() => {
    if (!acceptPageDrops) return;
    let depth = 0;
    const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes('Files'));
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      pickFilesRef.current([...(event.dataTransfer?.files ?? [])]);
      textRef.current?.focus();
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [acceptPageDrops]);

  useEffect(() => {
    if (!mention) return;
    const active = mentionPopoverRef.current?.querySelector('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [mention, mentionIndex]);

  useEffect(() => {
    if (!mention) return;
    const onPointerDown = (event: PointerEvent) => {
      if (mentionPopoverRef.current?.contains(event.target as Node)) return;
      if (mentionButtonRef.current?.contains(event.target as Node)) return;
      setMention(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mention]);

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

  function syncMention(value: string, cursor: number) {
    const trigger = members?.length ? findMentionTrigger(value, cursor) : null;
    const hashTrigger = trigger || !workspaceSlug ? null : findHashTrigger(value, cursor);
    if (trigger || hashTrigger) setEmojiOpen(false);
    setMention(trigger);
    setMentionIndex(0);
    setHash(hashTrigger);
    setHashIndex(0);
  }

  function chooseHash(item: HashItem) {
    const trigger = hash;
    if (!trigger) return;
    // Issues are stored as plain keys, channels as #name. No special markup.
    const token = item.kind === 'issue' ? `${item.issue.key} ` : `#${item.name} `;
    const next = body.slice(0, trigger.start) + token + body.slice(trigger.end);
    setBody(next);
    setHash(null);
    markTyping();
    requestAnimationFrame(() => {
      const target = textRef.current;
      if (!target) return;
      target.focus();
      const cursor = trigger.start + token.length;
      target.setSelectionRange(cursor, cursor);
      resize();
    });
  }

  function replaceSelection(text: string, selectStart: number, selectEnd = selectStart) {
    const element = textRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? start;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    setMention(null);
    setHash(null);
    markTyping();
    requestAnimationFrame(() => {
      const target = textRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(start + selectStart, start + selectEnd);
      resize();
    });
  }

  function wrapSelection(prefix: string, suffix = prefix, placeholder = 'text') {
    const element = textRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? start;
    const selected = body.slice(start, end) || placeholder;
    replaceSelection(`${prefix}${selected}${suffix}`, prefix.length, prefix.length + selected.length);
  }

  function insertLink() {
    const element = textRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? start;
    const selected = body.slice(start, end) || 'link text';
    const text = `[${selected}](https://)`;
    replaceSelection(text, selected.length + 3, selected.length + 11);
  }

  function chooseMention(person: UserSummary) {
    const trigger = mention;
    if (!trigger) return;
    const token = `@${mentionHandle(person)} `;
    const next = body.slice(0, trigger.start) + token + body.slice(trigger.end);
    setBody(next);
    setMention(null);
    markTyping();
    requestAnimationFrame(() => {
      const target = textRef.current;
      if (!target) return;
      target.focus();
      const cursor = trigger.start + token.length;
      target.setSelectionRange(cursor, cursor);
      resize();
    });
  }

  function startMention() {
    if (!members?.length) return;
    const element = textRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? start;
    const needsSpace = start > 0 && !/[\s([{]/.test(body[start - 1] ?? '');
    const prefix = needsSpace ? ' ' : '';
    const next = body.slice(0, start) + prefix + '@' + body.slice(end);
    const triggerStart = start + prefix.length;
    setBody(next);
    setEmojiOpen(false);
    setMention({ start: triggerStart, end: triggerStart + 1, query: '' });
    setMentionIndex(0);
    markTyping();
    requestAnimationFrame(() => {
      const target = textRef.current;
      if (!target) return;
      target.focus();
      const cursor = triggerStart + 1;
      target.setSelectionRange(cursor, cursor);
      resize();
    });
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    // A pasted screenshot or copied file attaches like a picked one.
    const files = [...event.clipboardData.files];
    if (files.length > 0) {
      event.preventDefault();
      pickFiles(files);
      return;
    }
    const html = event.clipboardData.getData('text/html');
    if (!html) return;
    const markdown = htmlToMarkdown(html);
    if (!markdown || markdown.length > 8000) return;
    const hasFormatting = /(\*\*|~~|`|\[[^\]]+\]\(|\n[-*] |\n\d+\. )/.test(markdown);
    if (!hasFormatting) return;
    event.preventDefault();
    replaceSelection(markdown, markdown.length);
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

  function pickFiles(fileList: FileList | File[] | null) {
    setEmojiOpen(false);
    const all = [...(fileList ?? [])];
    const tooBig = all.filter((file) => file.size > MAX_FILE_BYTES);
    if (tooBig.length > 0) {
      toast.error(
        tooBig.length === 1
          ? `${tooBig[0].name} is over the 25 MB limit.`
          : `${tooBig.length} files are over the 25 MB limit.`,
      );
    }
    const chosen = all.filter((file) => file.size <= MAX_FILE_BYTES);
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

  const pickFilesRef = useRef(pickFiles);
  pickFilesRef.current = pickFiles;

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
    setEmojiOpen(false);
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
      writeDraft(draftKey, '');
      setDrafts([]);
      setEmojiOpen(false);
      setMention(null);
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
        dragging && 'border-coral/60 shadow-[0_0_0_4px_rgba(239,95,62,0.12)]',
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[18px] bg-paper/90 text-[13px] font-medium text-coral-deep">
          Drop files to share in {channelLabel}
        </div>
      )}
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
          const next = event.target.value;
          setBody(next);
          resize();
          syncMention(next, event.target.selectionStart);
          markTyping();
        }}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (hash) {
            if (event.key === 'Escape') {
              event.preventDefault();
              setHash(null);
              return;
            }
            if (hashItems.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHashIndex((current) => (current + 1) % hashItems.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHashIndex((current) => (current - 1 + hashItems.length) % hashItems.length);
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                chooseHash(hashItems[Math.min(hashIndex, hashItems.length - 1)]);
                return;
              }
            }
          }
          if (mention) {
            if (event.key === 'Escape') {
              event.preventDefault();
              setMention(null);
              return;
            }
            if (mentionResults.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setMentionIndex((current) => (current + 1) % mentionResults.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setMentionIndex(
                  (current) => (current - 1 + mentionResults.length) % mentionResults.length,
                );
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                chooseMention(mentionResults[Math.min(mentionIndex, mentionResults.length - 1)]);
                return;
              }
            }
          }
          const modifier = event.metaKey || event.ctrlKey;
          if (modifier && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === 'b') {
              event.preventDefault();
              wrapSelection('**');
              return;
            }
            if (key === 'i') {
              event.preventDefault();
              wrapSelection('*');
              return;
            }
            if (key === 'e') {
              event.preventDefault();
              wrapSelection('`');
              return;
            }
            if (key === 'k') {
              event.preventDefault();
              insertLink();
              return;
            }
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder ?? `Message ${channelLabel}`}
        className="block max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[16px] leading-6 outline-none placeholder:text-faint sm:text-[15px]"
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
            label="Attach files (up to 25 MB each)"
            onClick={() => {
              setEmojiOpen(false);
              setMention(null);
              inputRef.current?.click();
            }}
          >
            <Paperclip size={16} strokeWidth={1.8} />
          </ComposerIcon>

          <button
            ref={mentionButtonRef}
            type="button"
            onClick={() => {
              setEmojiOpen(false);
              if (mention) {
                setMention(null);
                textRef.current?.focus();
                return;
              }
              startMention();
            }}
            className={cn(
              'grid size-8 place-items-center rounded-[10px] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]',
              mention
                ? 'bg-coral-soft text-coral-deep'
                : 'text-muted hover:bg-line-soft hover:text-ink',
            )}
            aria-label="Tag a teammate"
            aria-expanded={Boolean(mention)}
            aria-haspopup="listbox"
            title="Tag a teammate (@)"
          >
            <AtSign size={16} strokeWidth={1.8} />
          </button>

          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <span className="hidden items-center gap-0.5 sm:flex">
            <ComposerIcon label="Bold (Cmd+B)" keepFocus onClick={() => wrapSelection('**')}>
              <Bold size={15} strokeWidth={2} />
            </ComposerIcon>
            <ComposerIcon label="Italic (Cmd+I)" keepFocus onClick={() => wrapSelection('*')}>
              <Italic size={15} strokeWidth={2} />
            </ComposerIcon>
            <ComposerIcon label="Code (Cmd+E)" keepFocus onClick={() => wrapSelection('`')}>
              <Code2 size={15} strokeWidth={1.9} />
            </ComposerIcon>
            <ComposerIcon label="Link (Cmd+K)" keepFocus onClick={insertLink}>
              <Link2 size={15} strokeWidth={1.9} />
            </ComposerIcon>
          </span>

          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => {
              setEmojiOpen((open) => !open);
              setMention(null);
            }}
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
      {hash && hashItems.length > 0 && (
        <div
          ref={hashPopoverRef}
          role="listbox"
          aria-label="Link an issue or channel"
          className="popover-in absolute bottom-[calc(100%+10px)] left-3 z-40 w-[min(360px,calc(100%-24px))] overflow-hidden rounded-[16px] border border-line/70 bg-paper shadow-[var(--kora-shadow-popover)]"
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-faint uppercase">
              Link an issue or channel
            </span>
            <span className="text-[10px] text-faint">↑↓ · Enter</span>
          </div>
          <div className="scroll-thin max-h-[288px] overflow-y-auto px-1.5 pb-2">
            {hashItems.map((item, index) => {
              const active = index === Math.min(hashIndex, hashItems.length - 1);
              const kind = item.kind;
              const showLabel = index === 0 || hashItems[index - 1].kind !== kind;
              return (
                <div key={`${kind}-${item.id}`}>
                  {showLabel && (
                    <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
                      {kind === 'issue' ? 'Issues' : 'Channels'}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHashIndex(index)}
                    onClick={() => chooseHash(item)}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-[10px] px-2 text-left transition-colors duration-100',
                      active ? 'bg-coral-soft/75' : 'hover:bg-line-soft',
                    )}
                  >
                    {item.kind === 'issue' ? (
                      <>
                        <TaskStatusIcon status={item.issue.status} size={16} />
                        <span className="w-[52px] shrink-0 text-[12px] font-medium text-muted tabular-nums">
                          {item.issue.key}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {item.issue.title}
                        </span>
                      </>
                    ) : (
                      <>
                        <Hash size={16} strokeWidth={1.8} className="shrink-0 text-faint" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {item.name}
                        </span>
                      </>
                    )}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px] text-faint"
                      >
                        Enter
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {mention && (
        <div
          ref={mentionPopoverRef}
          role="listbox"
          aria-label="Tag a teammate"
          className="popover-in absolute bottom-[calc(100%+10px)] left-3 z-40 w-[300px] overflow-hidden rounded-[16px] border border-line/70 bg-paper shadow-[var(--kora-shadow-popover)]"
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-faint uppercase">
              Tag a teammate
            </span>
            <span className="text-[10px] text-faint">↑↓ · Enter</span>
          </div>
          <div className="scroll-thin max-h-[264px] overflow-y-auto px-1.5 pb-2">
            {mentionResults.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted">
                No teammate matches @{mention.query}.
              </p>
            ) : (
              mentionResults.map((person, index) => {
                const active = index === Math.min(mentionIndex, mentionResults.length - 1);
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setMentionIndex(index)}
                    onClick={() => chooseMention(person)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-100',
                      active ? 'bg-coral-soft/75' : 'hover:bg-line-soft',
                    )}
                  >
                    <Avatar
                      name={person.name} src={person.avatarUrl}
                      color={person.avatarColor}
                      size="sm"
                      online={person.online}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {person.name}
                      </span>
                      <span className="block truncate text-[10.5px] text-faint">
                        @{person.handle}
                        {person.title ? ` · ${person.title}` : ''}
                      </span>
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px] text-faint"
                      >
                        Enter
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {emojiOpen && (
        <EmojiPopover anchor={emojiButtonRef} align="start" onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />
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

function ComposerIcon({
  label,
  onClick,
  keepFocus,
  children,
}: {
  label: string;
  onClick: () => void;
  keepFocus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
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
