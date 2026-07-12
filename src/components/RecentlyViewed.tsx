"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * 최근 본 경매 (M22) — localStorage 기반이라 서버 저장 없음.
 * 상세 페이지에서 RecordView가 기록하고, 홈에서 이 컴포넌트가 보여준다.
 */
type Entry = { id: string; title: string; price: number; img: string | null };

const KEY = "duction:recent";

export function recordView(entry: Entry) {
  try {
    const list: Entry[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    const next = [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, 8);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage 불가 환경 — 무시
  }
}

export function RecordView(props: Entry) {
  useEffect(() => {
    recordView(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.id]);
  return null;
}

export default function RecentlyViewed() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    try {
      setEntries(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      // 무시
    }
  }, []);

  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-lg font-semibold">최근 본 경매</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {entries.map((e) => (
          <Link
            key={e.id}
            href={`/auctions/${e.id}`}
            className="w-36 shrink-0 overflow-hidden rounded-md border border-line bg-card transition hover:border-bill/30"
          >
            <div className="aspect-square bg-blush">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.img || "/placeholder.svg"} alt={e.title} onError={(ev) => { ev.currentTarget.src = "/placeholder.svg"; }} className="h-full w-full object-cover" />
            </div>
            <div className="p-2">
              <p className="line-clamp-1 text-xs font-medium">{e.title}</p>
              <p className="num text-sm font-bold text-bill">{e.price.toLocaleString()}원</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
