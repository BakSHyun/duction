"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (res.ok) setCount((await res.json()).count);
      } catch {
        // 다음 폴링에서 회복
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [initialCount]);

  return (
    <Link href="/notifications" className="relative p-1" aria-label="알림">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/70 hover:text-bill">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-duck px-1 text-[10px] font-bold text-ink">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
