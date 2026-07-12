"use client";

import { useCallback, useEffect, useState } from "react";

/** 이미지 라이트박스 갤러리 (M22) — 하자 부위 확대 확인용 */
const FALLBACK = "/placeholder.svg";
const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
  if (e.currentTarget.src.endsWith(FALLBACK)) return;
  e.currentTarget.src = FALLBACK;
};

export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [open, setOpen] = useState<number | null>(null);

  const move = useCallback(
    (delta: number) => {
      setOpen((cur) => (cur === null ? null : (cur + delta + images.length) % images.length));
    },
    [images.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, move]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        <button onClick={() => setOpen(0)} className="block w-full overflow-hidden rounded-2xl bg-blush">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]} alt={alt} onError={onErr} className="aspect-square w-full cursor-zoom-in object-cover" />
        </button>
        {images.length > 1 && (
          <div className="grid grid-cols-5 gap-2">
            {images.slice(1).map((url, i) => (
              <button key={url + i} onClick={() => setOpen(i + 1)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" onError={onErr} className="aspect-square cursor-zoom-in rounded-lg object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {open !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[open]}
            alt={alt}
            onError={onErr}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 rounded-full bg-card/20 px-3 py-1.5 text-sm font-bold text-white"
            aria-label="닫기"
          >
            ✕
          </button>
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); move(-1); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-card/20 px-3 py-2 text-lg text-white"
                aria-label="이전 사진"
              >
                ←
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); move(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-card/20 px-3 py-2 text-lg text-white"
                aria-label="다음 사진"
              >
                →
              </button>
              <p className="num absolute bottom-4 text-sm text-white/80">
                {open + 1} / {images.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
