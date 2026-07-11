import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";
import { AUCTION_STATUS } from "@/lib/constants";
import { krw } from "@/lib/format";
import AuctionCard from "@/components/AuctionCard";
import RecentlyViewed from "@/components/RecentlyViewed";

export const dynamic = "force-dynamic";

function DuckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <ellipse cx="16.5" cy="21.5" rx="11.5" ry="8" fill="#FFD400" />
      <circle cx="12" cy="10.5" r="7" fill="#FFD400" />
      <ellipse cx="21.5" cy="11.5" rx="4.8" ry="2.6" fill="#C96A0E" />
      <ellipse cx="17" cy="22" rx="4.5" ry="3" fill="#EFC000" />
      <circle cx="14.2" cy="8.6" r="1.5" fill="#26231C" />
    </svg>
  );
}

export default async function HomePage() {
  await settleExpired();

  const [ending, popular, artistLive, scheduled, ended, parentCategories, stats, soldModels] =
    await Promise.all([
      prisma.auction.findMany({
        where: { status: AUCTION_STATUS.LIVE },
        orderBy: { endsAt: "asc" },
        include: { item: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        take: 8,
      }),
      prisma.auction.findMany({
        where: { status: AUCTION_STATUS.LIVE, bidCount: { gt: 0 } },
        orderBy: { bidCount: "desc" },
        include: { item: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        take: 4,
      }),
      prisma.auction.findMany({
        where: { status: AUCTION_STATUS.LIVE, item: { seller: { isArtist: true } } },
        orderBy: { endsAt: "asc" },
        include: {
          item: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
              seller: { select: { nickname: true } },
            },
          },
        },
        take: 4,
      }),
      prisma.auction.findMany({
        where: { status: AUCTION_STATUS.SCHEDULED },
        orderBy: { startsAt: "asc" },
        include: { item: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        take: 4,
      }),
      prisma.auction.findMany({
        where: { status: AUCTION_STATUS.ENDED_SOLD },
        orderBy: { endsAt: "desc" },
        include: { item: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
        take: 4,
      }),
      prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
      Promise.all([
        prisma.auction.count({ where: { status: AUCTION_STATUS.LIVE } }),
        prisma.auction.count({ where: { status: AUCTION_STATUS.ENDED_SOLD } }),
        prisma.user.count({ where: { isArtist: true } }),
      ]),
      // 시세 하이라이트 — 무커스텀 낙찰 기록이 있는 모델
      prisma.blytheModel.findMany({
        where: { items: { some: { customLevel: "NONE", auction: { status: "ENDED_SOLD" } } } },
        include: {
          items: {
            where: { customLevel: "NONE", auction: { status: "ENDED_SOLD" } },
            include: { auction: { select: { currentPrice: true } } },
          },
        },
        take: 3,
      }),
    ]);

  const [liveCount, soldCount, artistCount] = stats;
  const pinnedNotice = await prisma.notice.findFirst({
    where: { pinned: true },
    orderBy: { createdAt: "desc" },
  });
  const modelHighlights = soldModels.map((m) => {
    const prices = m.items.map((i) => i.auction!.currentPrice);
    return {
      id: m.id,
      name: m.name,
      releaseYear: m.releaseYear,
      count: prices.length,
      avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
    };
  });

  return (
    <div className="space-y-12">
      {pinnedNotice && (
        <Link href="/notices" className="block rounded-xl border border-duck-deep/40 bg-cream px-4 py-3 text-sm hover:border-duck-deep">
          <span className="mr-2 rounded bg-duck px-1.5 py-0.5 text-[11px] font-bold text-ink">공지</span>
          <span className="font-medium">{pinnedNotice.title}</span>
          <span className="ml-1 text-mauve">→</span>
        </Link>
      )}

      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-line pb-10 pt-4 sm:pb-14 sm:pt-8">
        <DuckMark className="pointer-events-none absolute -right-8 top-2 h-44 w-44 opacity-[0.12] sm:right-4 sm:h-56 sm:w-56 sm:opacity-100" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-bill">
          Blythe Auction House
        </p>
        <h1 className="mt-4 max-w-2xl font-display text-3xl font-semibold leading-[1.35] text-balance sm:text-4xl">
          아끼던 아이에게,
          <br />
          제값을 아는 새 집사를.
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-mauve sm:text-[15px]">
          모든 입찰 기록이 공개되고, 대금은 수령 확인까지 덕션이 보관합니다. 정품과 팩토리는 반드시
          구분 표기 — 선입금 없는 브라이스 거래를 시작하세요.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/search" className="rounded-full bg-duck px-6 py-2.5 text-sm font-bold text-ink hover:bg-duck-deep">
            경매 둘러보기
          </Link>
          <Link href="/guide/first-bid" className="rounded-full border border-line-strong bg-card px-6 py-2.5 text-sm font-semibold text-ink/80 hover:border-bill/40">
            처음이신가요? 첫 입찰 가이드
          </Link>
        </div>
        {/* 스탯 스트립 — 돌아가는 시장의 증거 */}
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-mauve">
          <span>
            진행 중 경매 <strong className="num font-bold text-ink">{liveCount}</strong>
          </span>
          <span>
            누적 낙찰 <strong className="num font-bold text-ink">{soldCount}</strong>건
          </span>
          <span>
            활동 작가 <strong className="num font-bold text-ink">{artistCount}</strong>명
          </span>
        </div>
      </section>

      {/* 카테고리 숏컷 */}
      <nav className="flex flex-wrap gap-2">
        {parentCategories.map((c) => (
          <a
            key={c.id}
            href={`/search?cat=${c.slug}`}
            className="rounded-full border border-line-strong bg-card px-4 py-1.5 text-sm font-medium hover:border-bill hover:text-bill"
          >
            {c.name}
          </a>
        ))}
        <Link href="/models" className="rounded-full border border-line-strong bg-card px-4 py-1.5 text-sm font-medium hover:border-bill hover:text-bill">
          모델 도감·시세
        </Link>
      </nav>

      {/* 분양 예고 */}
      {scheduled.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">분양 예고 · 곧 시작</h2>
            <Link href="/artists" className="text-sm text-mauve hover:text-bill">작가 보기 →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {scheduled.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}

      {/* 인기 입찰 */}
      {popular.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">지금 가장 뜨거운 경매</h2>
            <Link href="/search?sort=bids" className="text-sm text-mauve hover:text-bill">더보기 →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {popular.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}

      {/* 마감 임박 */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">마감 임박 — 지금 아니면 놓쳐요</h2>
          <Link href="/search" className="text-sm text-mauve hover:text-bill">전체 경매 →</Link>
        </div>
        {ending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-mauve-light">
            진행 중인 경매가 없습니다. 첫 경매를 등록해보세요!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {ending.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </section>

      {/* 작가 분양 */}
      {artistLive.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">작가 분양 중</h2>
            <Link href="/artists" className="text-sm text-mauve hover:text-bill">작가 디렉토리 →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {artistLive.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}

      {/* 시세 하이라이트 */}
      {modelHighlights.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">모델 시세, 여기서만 볼 수 있어요</h2>
              <p className="mt-1 text-sm text-mauve">실거래 낙찰가 기준 · 무커스텀 정품</p>
            </div>
            <Link href="/models" className="text-sm font-semibold text-bill hover:underline">도감 전체 →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {modelHighlights.map((m) => (
              <Link key={m.id} href={`/models/${m.id}`} className="rounded-xl border border-line bg-porcelain p-4 transition hover:border-bill/40">
                <p className="text-xs text-mauve-light">
                  {m.name}
                  {m.releaseYear && ` · ${m.releaseYear}`}
                </p>
                <p className="num mt-1 text-xl font-bold text-bill">{krw(m.avg)}</p>
                <p className="text-xs text-mauve">평균 낙찰가 · {m.count}건</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 신뢰 스트립 */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "대금은 덕션이 보관",
            body: "결제하면 판매자에게 바로 가지 않아요. 수령 확인 후 정산 — 선입금 먹튀가 불가능한 구조.",
            href: "/guide/safe-trade",
          },
          {
            title: "정품·팩토리 강제 구분",
            body: "모든 경매에 구분 배지가 붙어요. 팩토리를 정품으로 속이면 영구 정지.",
            href: "/guide/authenticity",
          },
          {
            title: "덕력으로 보는 신뢰",
            body: "거래·평가·미결제 이력이 하나의 수치로. 알에서 황금오리까지, 조작 불가능한 기록.",
            href: "/guide/safe-trade",
          },
        ].map((c) => (
          <Link key={c.title} href={c.href} className="rounded-xl border border-line bg-card p-5 transition hover:border-bill/40">
            <h3 className="font-bold">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-mauve">{c.body}</p>
            <span className="mt-2 inline-block text-xs font-semibold text-bill">자세히 →</span>
          </Link>
        ))}
      </section>

      {/* 최근 본 경매 (M22 — localStorage) */}
      <RecentlyViewed />

      {/* 최근 낙찰 */}
      {ended.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">최근 낙찰 — 실거래 기록</h2>
            <Link href="/search?status=ended" className="text-sm text-mauve hover:text-bill">낙찰 기록 전체 →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {ended.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
