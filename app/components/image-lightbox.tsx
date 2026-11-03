import { Download, X } from 'lucide-react';
import { useEffect } from 'react';

export function ImageLightbox({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-[70] flex flex-col bg-ink/88 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-white/80 sm:px-6">
        <p className="min-w-0 truncate text-xs font-medium">{name}</p>
        <div className="flex items-center gap-1.5">
          <a
            href={url}
            download={name}
            className="grid size-9 place-items-center rounded-xl text-white/60 transition-colors duration-100 hover:bg-white/10 hover:text-white active:scale-[0.96]"
            aria-label="Download image"
            title="Download"
          >
            <Download size={17} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl text-white/60 transition-colors duration-100 hover:bg-white/10 hover:text-white active:scale-[0.96]"
            aria-label="Close image"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-8"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="rounded-[22px] bg-white/95 p-2 shadow-[0_30px_80px_-30px_oklch(0_0_0_/_0.8)]">
          <img
            src={url}
            alt={name}
            className="max-h-[calc(100dvh-140px)] max-w-[calc(100vw-64px)] rounded-[16px] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
