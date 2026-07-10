import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { responsiveImageProps } from '../../utils/images';

interface ImagePreviewModalProps {
  images: string[];
  index: number;
  title: string;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export default function ImagePreviewModal({ images, index, title, onClose, onIndexChange }: ImagePreviewModalProps) {
  const imageCount = images.length;
  const safeIndex = imageCount ? ((index % imageCount) + imageCount) % imageCount : 0;
  const canMove = imageCount > 1 && Boolean(onIndexChange);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && canMove) onIndexChange?.((safeIndex - 1 + imageCount) % imageCount);
      if (event.key === 'ArrowRight' && canMove) onIndexChange?.((safeIndex + 1) % imageCount);
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [canMove, imageCount, onClose, onIndexChange, safeIndex]);

  if (!imageCount || typeof document === 'undefined') return null;

  const move = (offset: number) => {
    onIndexChange?.((safeIndex + offset + imageCount) % imageCount);
  };

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/92 p-4 backdrop-blur-sm print:hidden sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="fixed right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white text-slate-950 shadow-2xl transition hover:scale-105 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-950 sm:right-6 sm:top-6"
        aria-label="关闭图片预览"
        title="关闭图片预览"
      >
        <X className="h-5 w-5" />
      </button>

      {canMove && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            className="fixed left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-xl backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white sm:left-6"
            aria-label="上一张图片"
            title="上一张图片"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            className="fixed right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-xl backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white sm:right-6"
            aria-label="下一张图片"
            title="下一张图片"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <figure
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-[min(94vw,1280px)] flex-col items-center justify-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-0 w-full items-center justify-center">
          <img
            src={images[safeIndex]}
            {...responsiveImageProps(images[safeIndex], '94vw')}
            alt={title}
            className="max-h-[calc(100vh-8.5rem)] max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
        <figcaption className="max-w-full truncate text-center text-sm font-semibold text-white">
          {title}
          {imageCount > 1 && <span className="ml-2 text-white/55">{safeIndex + 1} / {imageCount}</span>}
        </figcaption>
        {imageCount > 1 && (
          <div className="flex justify-center gap-1.5">
            {images.map((image, dotIndex) => (
              <button
                key={`${image}-${dotIndex}`}
                type="button"
                onClick={() => onIndexChange?.(dotIndex)}
                className={`h-1.5 rounded-full transition ${dotIndex === safeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'}`}
                aria-label={`查看第 ${dotIndex + 1} 张图片`}
              />
            ))}
          </div>
        )}
      </figure>
    </div>,
    document.body,
  );
}
