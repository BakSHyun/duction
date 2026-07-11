import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { settleExpired } from "@/lib/bidding";
import { krw } from "@/lib/format";
import { toggleFollowAction } from "@/app/actions";
import AuctionCard from "@/components/AuctionCard";
import { GradeBadge } from "@/components/Badges";
import DuckBadge from "@/components/DuckBadge";

export const dynamic = "force-dynamic";

export default async function ArtistProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleExpired();

  const [artist, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nickname: true,
        isArtist: true,
        artistVerified: true,
        artistBio: true,
        artistSns: true,
        ratingAvg: true,
        ratingCount: true,
        salesCount: true,
        duckPower: true,
        createdAt: true,
        _count: { select: { followers: true } },
        items: {
          where: { auction: { isNot: null } },
          include: {
            auction: { include: { item: { include: { images: { take: 1 } } } } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getCurrentUser(),
  ]);
  if (!artist || !artist.isArtist) notFound();

  const isFollowing = viewer
    ? !!(await prisma.artistFollow.findUnique({
        where: { followerId_artistId: { followerId: viewer.id, artistId: artist.id } },
      }))
    : false;

  // 받은 후기 최근 5건 (M9)
  const reviews = await prisma.review.findMany({
    where: { targetId: artist.id },
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

  const live = artist.items
    .filter((i) => i.auction!.status === "LIVE")
    .map((i) => i.auction!)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  const soldItems = artist.items
    .filter((i) => i.auction!.status === "ENDED_SOLD")
    .sort((a, b) => b.auction!.endsAt.getTime() - a.auction!.endsAt.getTime());

  return (
    <div className="space-y-8">
      {/* 프로필 헤더 */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              {artist.nickname}
              <span className="ml-2 rounded bg-wisteria-soft px-2 py-0.5 text-xs font-semibold text-wisteria">
                커스텀 작가
              </span>
              {artist.artistVerified && (
                <span className="ml-1.5 rounded bg-verdigris-soft px-2 py-0.5 text-xs font-semibold text-verdigris">
                  인증 ✓
                </span>
              )}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-mauve">
              <DuckBadge power={artist.duckPower} />
              팔로워 {artist._count.followers} · 거래 {artist.salesCount}회 ·{" "}
              {artist.ratingCount > 0 ? `평점 ${artist.ratingAvg.toFixed(1)}` : "평가 없음"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewer?.id === artist.id ? (
              <Link
                href="/artist/setup"
                className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold text-ink/70 hover:border-bill"
              >
                프로필 수정
              </Link>
            ) : (
              <form action={toggleFollowAction}>
                <input type="hidden" name="artistId" value={artist.id} />
                <button
                  className={`rounded-full px-5 py-1.5 text-sm font-bold transition ${
                    isFollowing
                      ? "border border-line-strong bg-card text-mauve"
                      : "bg-duck text-ink hover:bg-duck-deep"
                  }`}
                >
                  {isFollowing ? "팔로잉 ✓" : "+ 팔로우"}
                </button>
              </form>
            )}
          </div>
        </div>
        {artist.artistBio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {artist.artistBio}
          </p>
        )}
        {artist.artistSns && (
          <a
            href={artist.artistSns}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-bill underline underline-offset-2"
          >
            SNS ↗
          </a>
        )}
        <p className="mt-3 text-xs text-mauve-light">
          팔로우하면 이 작가의 새 분양이 시작될 때 알림을 받아요.
        </p>
      </section>

      {/* 분양 중 */}
      <section>
        <h2 className="mb-3 font-display font-semibold">분양 중 ({live.length})</h2>
        {live.length === 0 ? (
          <p className="text-sm text-mauve-light">진행 중인 분양이 없습니다. 팔로우하고 기다려보세요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {live.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </section>

      {/* 받은 후기 */}
      {reviews.length > 0 && (
        <section>
          <h2 className="mb-3 font-display font-semibold">받은 후기</h2>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                  <span className="text-xs text-mauve-light">
                    {reviewerNames.get(r.reviewerId) ?? "익명"} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                {r.tags && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(JSON.parse(r.tags) as string[]).map((t) => (
                      <span key={t} className="rounded bg-blush px-1.5 py-0.5 text-[11px] text-ink/70">{t}</span>
                    ))}
                  </div>
                )}
                {r.comment && <p className="mt-1 text-ink/80">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 분양 이력 — 낙찰가 공개가 작가 네임밸류의 근거 */}
      <section>
        <h2 className="mb-3 font-display font-semibold">분양 완료 이력 ({soldItems.length})</h2>
        {soldItems.length === 0 ? (
          <p className="text-sm text-mauve-light">아직 완료된 분양이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {soldItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <Link
                  href={`/auctions/${i.auction!.id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:text-bill"
                >
                  {i.title}
                </Link>
                <GradeBadge value={i.conditionGrade} />
                <span className="shrink-0 font-bold text-bill">{krw(i.auction!.currentPrice)}</span>
                <span className="shrink-0 text-xs text-mauve-light">
                  {new Date(i.auction!.endsAt).toLocaleDateString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
