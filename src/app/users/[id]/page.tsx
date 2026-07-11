import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";
import AuctionCard from "@/components/AuctionCard";
import DuckBadge from "@/components/DuckBadge";

export const dynamic = "force-dynamic";

// 일반 판매자 프로필 (M20) — 작가는 /artists/[id]로 리다이렉트
export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleExpired();

  const profile = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      nickname: true,
      isArtist: true,
      duckPower: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      createdAt: true,
      items: {
        where: { auction: { isNot: null } },
        include: { auction: { include: { item: { include: { images: { take: 1 } } } } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!profile) notFound();
  if (profile.isArtist) redirect(`/artists/${profile.id}`);

  const live = profile.items
    .filter((i) => i.auction!.status === "LIVE")
    .map((i) => i.auction!)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  const sold = profile.items
    .filter((i) => i.auction!.status === "ENDED_SOLD")
    .map((i) => i.auction!)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());

  const reviews = await prisma.review.findMany({
    where: { targetId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const reviewerNames = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: reviews.map((r) => r.reviewerId) } },
        select: { id: true, nickname: true },
      })
    ).map((u) => [u.id, u.nickname]),
  );

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">{profile.nickname}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mauve">
          <DuckBadge power={profile.duckPower} />
          거래 {profile.salesCount}회 ·{" "}
          {profile.ratingCount > 0 ? `평점 ${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})` : "평가 없음"} ·{" "}
          {new Date(profile.createdAt).toLocaleDateString("ko-KR")} 가입
        </p>
      </section>

      {reviews.length > 0 && (
        <section>
          <h2 className="mb-3 font-display font-semibold">받은 후기</h2>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-card p-3 text-sm">
                <span className="text-amber-400">{"★".repeat(r.rating)}</span>
                <span className="ml-2 text-xs text-mauve-light">
                  {reviewerNames.get(r.reviewerId) ?? "익명"} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                </span>
                {r.tags && (
                  <span className="ml-2 space-x-1">
                    {(JSON.parse(r.tags) as string[]).map((t) => (
                      <span key={t} className="rounded bg-blush px-1.5 py-0.5 text-[11px] text-ink/70">{t}</span>
                    ))}
                  </span>
                )}
                {r.comment && <p className="mt-1 text-ink/80">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display font-semibold">판매 중 ({live.length})</h2>
        {live.length === 0 ? (
          <p className="text-sm text-mauve-light">판매 중인 경매가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {live.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </section>

      {sold.length > 0 && (
        <section>
          <h2 className="mb-3 font-display font-semibold">판매 완료 ({sold.length})</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sold.slice(0, 8).map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
