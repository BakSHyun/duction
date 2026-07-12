"use client";

import { useState } from "react";

/** 엑박 방지 이미지 (M26) — 로드 실패·누락 시 브랜드 기본 이미지로 폴백 */
export default function Img({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const effective = !src || failed ? "/placeholder.svg" : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={effective}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
