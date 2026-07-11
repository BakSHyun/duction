import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";
import { BLYTHE_LINES } from "@/lib/constants";
import { krw } from "@/lib/format";
import { AuthenticityBadge, GradeBadge } from "@/components/Badges";
import AuctionCard from "@/components/AuctionCard";
import PriceChart from "@/components/PriceChart";

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ custom?: string }>;
}) {
  const { id } = await params;
  const { custom } = await searchParams;
  const includeCustom = custom === "1";
  await settleExpired();

  const model = await prisma.blytheModel.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          auction: { include: { item: { include: { images: { take: 1 } } } } },
        },
      },
    },
  });
  if (!model) notFound();

  const withAuction = model.items.filter((i) => i.auction);
  const liveAuctions = withAuction
    .filter((i) => i.auction!.status === "LIVE")
    .map((i) => i.auction!)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());

  // 시세: 기본은 무커스텀만 (작가 프리미엄 왜곡 방지), 토글로 커스텀 포함
  const soldItems = withAuction
    .filter((i) => i.auction!.status === "ENDED_SOLD")
    .filter((i) => includeCustom || i.customLevel === "NONE")
    .sort((a, b) => b.auction!.endsAt.getTime() - a.auction!.endsAt.getTime());
  const prices = soldItems.map((i) => i.auction!.currentPrice);
  const stats = prices.length
    ? {
        count: prices.length,
        avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
        min: Math.min(...prices),
        max: Math.max(...prices),
      }
    : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/models" className="text-sm text-mauve-light hover:text-bill">
          ← 모델 도감
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">{model.name}</h1>
        <p className="mt-1 text-sm text-mauve">
          {BLYTHE_LINES.find((l) => l.value === model.line)?.label ?? model.line}
          {model.releaseYear && ` · ${model.releaseYear}년 발매`}
          {model.msrpJpy && ` · 정가 ¥${model.msrpJpy.toLocaleString()}`}
        </p>
      </div>

      {/* 시세 요약 */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">실거래 시세</h2>
          <Link
            href={includeCustom ? `/models/${id}` : `/models/${id}?custom=1`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              includeCustom ? "border-bill bg-cream text-bill" : "border-line-strong text-mauve"
            }`}
          >
            커스텀 포함 {includeCustom ? "ON" : "OFF"}
          </Link>
        </div>
        {stats ? (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-mauve-light">평균 낙찰가 ({stats.count}건)</p>
              <p className="text-xl font-extrabold text-bill">{krw(stats.avg)}</p>
            </div>
            <div>
              <p className="text-xs text-mauve-light">최저</p>
              <p className="font-display text-xl font-semibold">{krw(stats.min)}</p>
            </div>
            <div>
              <p className="text-xs text-mauve-light">최고</p>
              <p className="font-display text-xl font-semibold">{krw(stats.max)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mauve-light">아직 낙찰 기록이 없습니다. 첫 거래의 주인공이 되어보세요.</p>
        )}
        {soldItems.length >= 2 && (
          <div className="mt-5 border-t border-line pt-4">
            <PriceChart
              points={soldItems.map((i) => ({ date: i.auction!.endsAt, price: i.auction!.currentPrice }))}
            />
          </div>
        )}
      </section>

      {/* 진행 중 경매 */}
      {liveAuctions.length > 0 && (
        <section>
          <h2 className="mb-3 font-display font-semibold">이 모델의 진행 중 경매 ({liveAuctions.length})</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {liveAuctions.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}

      {/* 낙찰 히스토리 */}
      <section>
        <h2 className="mb-3 font-display font-semibold">낙찰 히스토리</h2>
        {soldItems.length === 0 ? (
          <p className="text-sm text-mauve-light">낙찰 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-mauve-light">
                  <th className="p-3 font-medium">낙찰일</th>
                  <th className="p-3 font-medium">낙찰가</th>
                  <th className="p-3 font-medium">상태</th>
                  <th className="p-3 font-medium">구분</th>
                  <th className="p-3 font-medium">커스텀</th>
                </tr>
              </thead>
              <tbody>
                {soldItems.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <Link href={`/auctions/${i.auction!.id}`} className="text-ink/70 underline-offset-2 hover:text-bill hover:underline">
                        {new Date(i.auction!.endsAt).toLocaleDateString("ko-KR")}
                      </Link>
                    </td>
                    <td className="p-3 font-bold text-bill">{krw(i.auction!.currentPrice)}</td>
                    <td className="p-3"><GradeBadge value={i.conditionGrade} /></td>
                    <td className="p-3"><AuthenticityBadge value={i.authenticity} /></td>
                    <td className="p-3 text-xs text-mauve">
                      {i.customLevel === "NONE" ? "무커스텀" : i.customArtist ?? "커스텀"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
