import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";
import { getCurrentUser } from "@/lib/auth";
import { krw } from "@/lib/format";
import { BLYTHE_LINES, CONDITION_GRADES, CUSTOM_LEVELS } from "@/lib/constants";
import { AuthenticityBadge, GradeBadge } from "@/components/Badges";
import BidPanel from "@/components/BidPanel";
import ReportButton from "@/components/ReportButton";
import DuckBadge from "@/components/DuckBadge";
import QnaSection from "@/components/QnaSection";
import Gallery from "@/components/Gallery";
import { RecordView } from "@/components/RecentlyViewed";
import { toggleWatchAction } from "@/app/actions";

export const dynamic = "force-dynamic";

// 트위터 공유 카드 (M10) — og:image는 같은 폴더의 opengraph-image.tsx가 자동 연결
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { item: { select: { title: true } } },
  });
  if (!auction) return {};
  const price = `${auction.currentPrice.toLocaleString("ko-KR")}원`;
  const title = `${auction.item.title} | ${auction.status === "SCHEDULED" ? "분양 예고" : `현재가 ${price}`}`;
  const description =
    auction.status === "LIVE"
      ? `입찰 ${auction.bidCount}건 · 마감 ${auction.endsAt.toLocaleString("ko-KR")} — 덕션에서 안전하게 입찰하세요`
      : "브라이스 수집가를 위한 안전한 경매 — 덕션";
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

function maskNickname(nickname: string) {
  if (nickname.length <= 2) return nickname[0] + "*";
  return nickname.slice(0, 2) + "*".repeat(Math.min(nickname.length - 2, 4));
}

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleExpired();

  const [auction, user] = await Promise.all([
    prisma.auction.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            seller: {
              select: {
                id: true,
                nickname: true,
                isArtist: true,
                artistVerified: true,
                ratingAvg: true,
                ratingCount: true,
                salesCount: true,
                duckPower: true,
              },
            },
            category: true,
            blytheModel: true,
          },
        },
        bids: { orderBy: { createdAt: "desc" }, take: 20, include: { bidder: { select: { nickname: true } } } },
        questions: { orderBy: { createdAt: "asc" } },
        _count: { select: { watchers: true } },
      },
    }),
    getCurrentUser(),
  ]);
  if (!auction) notFound();

  const isWatching = user
    ? !!(await prisma.watchlist.findUnique({
        where: { userId_auctionId: { userId: user.id, auctionId: auction.id } },
      }))
    : false;

  const askerNames = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: auction.questions.map((q) => q.userId) } },
        select: { id: true, nickname: true },
      })
    ).map((u) => [u.id, maskNickname(u.nickname)]),
  );

  const { item } = auction;
  const fullSet = [
    item.fullSetBox && "박스",
    item.fullSetCert && "증지",
    item.fullSetStand && "스탠드",
    item.fullSetOutfit && "기본 아웃핏",
  ].filter(Boolean);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {/* 이미지 갤러리 — 클릭 확대 (M22) */}
        <RecordView
          id={auction.id}
          title={item.title}
          price={auction.currentPrice}
          img={item.images[0]?.url ?? null}
        />
        <Gallery images={item.images.map((img) => img.url)} alt={item.title} />

        {/* 상품 정보 */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <AuthenticityBadge value={item.authenticity} />
            <GradeBadge value={item.conditionGrade} />
            <span className="text-xs text-mauve-light">{item.category.name}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold">{item.title}</h1>
            <form action={toggleWatchAction} className="shrink-0">
              <input type="hidden" name="auctionId" value={auction.id} />
              <button
                className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  isWatching
                    ? "border-bill bg-cream text-bill"
                    : "border-line-strong bg-card text-mauve hover:border-bill/40"
                }`}
              >
                {isWatching ? "♥" : "♡"} {auction._count.watchers}
              </button>
            </form>
          </div>
          {auction._count.watchers > 0 && (
            <p className="mt-1 text-xs text-mauve-light">{auction._count.watchers}명이 지켜보는 중</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-card p-4 text-sm">
          {!item.blytheModel && item.modelNameFree && (
            <div>
              <dt className="text-xs text-mauve-light">모델 (직접 기입)</dt>
              <dd className="font-medium">{item.modelNameFree}</dd>
            </div>
          )}
          {item.blytheModel && (
            <>
              <div>
                <dt className="text-xs text-mauve-light">모델</dt>
                <dd className="font-medium">
                  <a href={`/models/${item.blytheModel.id}`} className="text-bill underline-offset-2 hover:underline">
                    {item.blytheModel.name}
                  </a>
                  {item.blytheModel.releaseYear && ` (${item.blytheModel.releaseYear})`}
                  <span className="ml-1 text-xs text-mauve-light">시세 보기 →</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mauve-light">라인</dt>
                <dd className="font-medium">
                  {BLYTHE_LINES.find((l) => l.value === item.blytheModel!.line)?.label ?? item.blytheModel.line}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-xs text-mauve-light">상태 등급</dt>
            <dd className="font-medium">
              {CONDITION_GRADES.find((g) => g.value === item.conditionGrade)?.desc}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mauve-light">풀셋 구성</dt>
            <dd className="font-medium">{fullSet.length ? fullSet.join(" · ") : "해당 없음"}</dd>
          </div>
          <div>
            <dt className="text-xs text-mauve-light">커스텀</dt>
            <dd className="font-medium">
              {CUSTOM_LEVELS.find((c) => c.value === item.customLevel)?.label}
              {item.customArtist && ` · 작가: ${item.customArtist}`}
            </dd>
          </div>
          {item.customDetails && (
            <div className="col-span-2">
              <dt className="text-xs text-mauve-light">커스텀 내역</dt>
              <dd className="font-medium">{item.customDetails}</dd>
            </div>
          )}
        </dl>

        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">상세 설명</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{item.description}</p>
        </div>

        {/* Q&A (M20) */}
        <QnaSection
          auctionId={auction.id}
          questions={auction.questions.map((q) => ({
            id: q.id,
            body: q.body,
            answer: q.answer,
            askerNickname: askerNames.get(q.userId) ?? "익명",
            createdAt: q.createdAt.toISOString(),
          }))}
          isLoggedIn={!!user}
          isSeller={user?.id === item.sellerId}
        />

        {/* 입찰 기록 — 투명성이 셀링포인트 */}
        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-3 text-sm font-bold">입찰 기록 ({auction.bidCount}건)</h2>
          {auction.bids.length === 0 ? (
            <p className="text-sm text-mauve-light">아직 입찰이 없습니다. 첫 입찰자가 되어보세요!</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {auction.bids.map((bid) => (
                <li key={bid.id} className="flex items-center justify-between py-2">
                  <span className="text-ink/70">
                    {maskNickname(bid.bidder.nickname)}
                    {bid.isAuto && <span className="ml-1 text-xs text-mauve-light">(자동)</span>}
                  </span>
                  <span
                    className={`font-semibold ${bid.status === "ACTIVE" || bid.status === "WON" ? "text-bill" : "text-mauve-light line-through"}`}
                  >
                    {krw(bid.amount)}
                  </span>
                  <span className="text-xs text-mauve-light">
                    {new Date(bid.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 우측: 입찰 패널 + 판매자 */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <BidPanel
          auctionId={auction.id}
          initial={{
            currentPrice: auction.currentPrice,
            startsAt: auction.startsAt.toISOString(),
            endsAt: auction.endsAt.toISOString(),
            bidCount: auction.bidCount,
            status: auction.status,
            buyNowPrice: auction.buyNowPrice,
            reserveSet: auction.reservePrice != null,
            reserveMet: auction.reservePrice != null ? auction.currentPrice >= auction.reservePrice : null,
          }}
          isLoggedIn={!!user}
          isSeller={user?.id === item.sellerId}
        />
        <div className="rounded-2xl border border-line bg-card p-4 text-sm">
          <p className="text-xs text-mauve-light">판매자</p>
          {item.seller.isArtist ? (
            <a href={`/artists/${item.seller.id}`} className="font-bold text-bill hover:underline">
              {item.seller.nickname}
              <span className="ml-1.5 rounded bg-wisteria-soft px-1.5 py-0.5 text-[11px] font-semibold text-wisteria">
                작가
              </span>
              {item.seller.artistVerified && (
                <span className="ml-1 rounded bg-verdigris-soft px-1.5 py-0.5 text-[11px] font-semibold text-verdigris">
                  인증 ✓
                </span>
              )}
            </a>
          ) : (
            <a href={`/users/${item.seller.id}`} className="font-bold hover:text-bill hover:underline">
              {item.seller.nickname}
            </a>
          )}
          <div className="mt-1.5">
            <DuckBadge power={item.seller.duckPower} />
          </div>
          <p className="mt-1 text-mauve">
            거래 {item.seller.salesCount}회 ·{" "}
            {item.seller.ratingCount > 0 ? `평점 ${item.seller.ratingAvg.toFixed(1)}` : "평가 없음"}
          </p>
          {item.seller.isArtist && (
            <a
              href={`/artists/${item.seller.id}`}
              className="mt-2 inline-block text-xs text-mauve underline underline-offset-2"
            >
              작가 프로필·분양 이력 보기 →
            </a>
          )}
        </div>
        <div className="rounded-2xl bg-blush p-4 text-xs leading-relaxed text-mauve">
          낙찰 후 24시간 내 미결제 시 자동 취소 및 페널티가 부과됩니다. 결제 대금은 덕션이 보관하며
          수령 확인 후 판매자에게 정산됩니다.
        </div>
        {user && user.id !== item.sellerId && <ReportButton auctionId={auction.id} />}
      </div>
    </div>
  );
}
