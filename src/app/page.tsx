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
    <div className="space-y-16 sm:space-y-20">
      {pinnedNotice && (
        <Link href="/notices" className="block rounded-xl border border-duck-deep/40 bg-cream px-4 py-3 text-sm hover:border-duck-deep">
          <span className="mr-2 rounded bg-duck px-1.5 py-0.5 text-[11px] font-bold text-ink">공지</span>
          <span className="font-medium">{pinnedNotice.title}</span>
          <span className="ml-1 text-mauve">→</span>
        </Link>
      )}

      {/* 히어로 */}
      <section className="soft-rise relative overflow-hidden rounded-[2rem] border border-line bg-card px-6 py-10 shadow-[0_24px_80px_rgba(74,57,22,0.08)] sm:px-12 sm:py-14 lg:px-16 lg:py-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-duck/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-72 rounded-tl-full bg-cream" />
        <DuckMark className="pointer-events-none absolute bottom-4 right-4 h-32 w-32 rotate-[-5deg] drop-shadow-[0_18px_20px_rgba(201,106,14,0.18)] sm:bottom-8 sm:right-10 sm:h-52 sm:w-52" />
        <div className="relative z-10 max-w-2xl">
        <p className="section-kicker">Blythe Auction House · Since 2026</p>
        <h1 className="mt-5 font-display text-[2.4rem] font-black leading-[1.16] tracking-[-0.055em] text-balance sm:text-5xl lg:text-[3.65rem]">
          좋아했던 마음까지,<br />제값에 이어지도록.
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-7 text-mauve sm:text-base">
          모든 입찰 기록이 공개되고, 대금은 수령 확인까지 덕션이 보관합니다. 정품과 팩토리는 반드시
          구분 표기 — 선입금 없는 브라이스 거래를 시작하세요.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/search" className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-lg shadow-ink/10 transition hover:-translate-y-0.5 hover:bg-bill">
            지금 경매 보기 <span aria-hidden="true">→</span>
          </Link>
          <Link href="/guide/first-bid" className="rounded-full border border-line-strong bg-white/70 px-6 py-3 text-sm font-semibold text-ink/80 transition hover:border-bill/40 hover:bg-white">
            첫 입찰 가이드
          </Link>
        </div>
        {/* 스탯 스트립 — 돌아가는 시장의 증거 */}
        <div className="mt-9 flex flex-wrap gap-3 text-sm text-mauve">
          <span>
            진행 중 <strong className="num ml-1 rounded-full bg-duck/60 px-2 py-0.5 font-extrabold text-ink">{liveCount}</strong>
          </span>
          <span>
            누적 낙찰 <strong className="num font-extrabold text-ink">{soldCount}</strong>건
          </span>
          <span>
            활동 작가 <strong className="num font-extrabold text-ink">{artistCount}</strong>명
          </span>
        </div>
        </div>
      </section>

      {/* 카테고리 숏컷 */}
      <nav className="-mt-9 flex flex-wrap gap-2 border-b border-line pb-7 sm:-mt-12">
        {parentCategories.map((c) => (
          <a
            key={c.id}
            href={`/search?cat=${c.slug}`}
            className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-bill hover:text-bill"
          >
            {c.name}
          </a>
        ))}
        <Link href="/models" className="rounded-full border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-bill">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
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
