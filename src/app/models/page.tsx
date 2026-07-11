import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BLYTHE_LINES } from "@/lib/constants";
import { krw } from "@/lib/format";

export const metadata = { title: "모델 도감·시세" };

export const dynamic = "force-dynamic";

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { line = "" } = await searchParams;

  const models = await prisma.blytheModel.findMany({
    where: line ? { line } : undefined,
    orderBy: [{ line: "asc" }, { releaseYear: "asc" }],
    include: {
      items: {
        include: { auction: { select: { status: true, currentPrice: true, endsAt: true } } },
      },
    },
  });

  const rows = models.map((m) => {
    const auctions = m.items.map((i) => i.auction).filter(Boolean);
    const liveCount = auctions.filter((a) => a!.status === "LIVE").length;
    // 시세는 무커스텀 낙찰만 집계 (작가 프리미엄 왜곡 방지)
    const sold = m.items
      .filter((i) => i.customLevel === "NONE" && i.auction?.status === "ENDED_SOLD")
      .map((i) => i.auction!.currentPrice);
    const avg = sold.length ? Math.round(sold.reduce((s, p) => s + p, 0) / sold.length) : null;
    return { model: m, liveCount, soldCount: sold.length, avg };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">브라이스 모델 도감</h1>
        <p className="mt-1 text-sm text-mauve">
          모델별 실거래 낙찰가를 확인하세요. 시세는 무커스텀 정품 낙찰 기준입니다.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link
          href="/models"
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${!line ? "border-bill bg-cream text-bill" : "border-line-strong bg-card"}`}
        >
          전체
        </Link>
        {BLYTHE_LINES.map((l) => (
          <Link
            key={l.value}
            href={`/models?line=${l.value}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${line === l.value ? "border-bill bg-cream text-bill" : "border-line-strong bg-card"}`}
          >
            {l.label.split(" (")[0]}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ model, liveCount, soldCount, avg }) => (
          <Link
            key={model.id}
            href={`/models/${model.id}`}
            className="rounded-xl border border-line bg-card p-4 transition hover:shadow-md"
          >
            <p className="text-xs text-mauve-light">
              {BLYTHE_LINES.find((l) => l.value === model.line)?.label ?? model.line}
              {model.releaseYear && ` · ${model.releaseYear}`}
            </p>
            <p className="mt-0.5 font-bold">{model.name}</p>
            <div className="mt-2 flex items-center gap-3 text-sm">
              {avg !== null ? (
                <span className="font-semibold text-bill">
                  평균 낙찰 {krw(avg)} <span className="text-xs font-normal text-mauve-light">({soldCount}건)</span>
                </span>
              ) : (
                <span className="text-mauve-light">낙찰 기록 없음</span>
              )}
              {liveCount > 0 && (
                <span className="rounded bg-ok-soft px-1.5 py-0.5 text-xs font-semibold text-ok">
                  경매 중 {liveCount}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
