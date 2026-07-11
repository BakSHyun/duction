import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "가이드",
  description: "정품 구별법, 첫 입찰, 안전거래, 포장까지 — 덕션 이용 가이드",
};

export default function GuideIndexPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">덕션 가이드</h1>
        <p className="mt-1 text-sm text-mauve">
          처음이라면 위에서부터 차례로 읽어보세요. 안전한 거래의 절반은 아는 것에서 시작해요.
        </p>
      </div>
      <div className="space-y-3">
        {GUIDES.map((g, i) => (
          <Link
            key={g.slug}
            href={`/guide/${g.slug}`}
            className="block rounded-xl border border-line bg-card p-5 transition hover:border-bill/40 hover:shadow-sm"
          >
            <p className="text-xs font-semibold tracking-[0.15em] text-bill">GUIDE {i + 1}</p>
            <h2 className="mt-1 text-lg font-bold">{g.title}</h2>
            <p className="mt-1 text-sm text-mauve">{g.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
