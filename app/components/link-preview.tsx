import { Link2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { extractPreviewUrls, type LinkPreviewData } from '../lib/link-preview';
import { cn } from '../utils/cn';

const cache = new Map<string, LinkPreviewData | null>();
const pending = new Map<string, Promise<LinkPreviewData | null>>();

async function requestPreview(url: string) {
  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { preview?: LinkPreviewData | null };
  return payload.preview ?? null;
}

function loadPreview(url: string) {
  const existing = pending.get(url);
  if (existing) return existing;
  const request = requestPreview(url)
    .catch(() => null)
    .finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}

export function MessageLinkPreviews({ body, compact }: { body: string; compact?: boolean }) {
  const urls = useMemo(
    () =>
      extractPreviewUrls(
        body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' '),
      ),
    [body],
  );
  if (urls.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-2', compact ? 'mt-1.5' : 'mt-2')}>
      {urls.map((url) => (
        <PreviewCard key={url} url={url} />
      ))}
    </div>
  );
}

function PreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(() => cache.get(url));
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    if (cache.has(url)) {
      setPreview(cache.get(url));
      return;
    }
    let active = true;
    void loadPreview(url).then((data) => {
      cache.set(url, data);
      if (active) setPreview(data);
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (preview === null) return null;
  if (preview === undefined) {
    return (
      <div className="flex min-h-[92px] w-full max-w-[540px] animate-pulse items-center gap-3 rounded-xl border border-line/70 bg-paper/70 px-3.5 py-3">
        <span className="size-9 rounded-lg bg-line-soft" />
        <span className="flex-1 space-y-2">
          <span className="block h-2.5 w-28 rounded-full bg-line-soft" />
          <span className="block h-2 w-full max-w-64 rounded-full bg-line-soft" />
        </span>
      </div>
    );
  }

  const showImage = Boolean(preview.imageUrl) && !imageBroken;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex min-h-[92px] w-full max-w-[540px] overflow-hidden rounded-xl border border-line bg-paper transition-[border-color,box-shadow] duration-150 ease-out hover:border-ink/20 hover:shadow-[0_10px_24px_-20px_oklch(0_0_0_/_0.45)]"
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3.5 py-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.09em] text-faint uppercase">
          <Link2 size={11} />
          <span className="truncate">{preview.siteName || preview.domain}</span>
        </span>
        {preview.title && (
          <span className="line-clamp-2 text-[13px] leading-5 font-semibold text-ink transition-colors duration-100 group-hover:text-coral-deep">
            {preview.title}
          </span>
        )}
        {preview.description && (
          <span className="line-clamp-2 text-[12px] leading-5 text-muted">{preview.description}</span>
        )}
        <span className="truncate text-[11px] text-faint">{preview.domain}</span>
      </span>
      {showImage && (
        <span className="relative w-[112px] shrink-0 self-stretch overflow-hidden border-l border-line/70 bg-canvas sm:w-[168px]">
          <img
            src={preview.imageUrl ?? ''}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
            className="size-full object-cover outline-none"
          />
        </span>
      )}
    </a>
  );
}
