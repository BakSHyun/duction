import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { settleExpired } from "@/lib/bidding";
import { krw } from "@/lib/format";
import { BID_STATUS, ORDER_STATUS } from "@/lib/constants";
import { payOrderAction, shipOrderAction, confirmOrderAction, cancelMyAuctionAction, relistAuctionAction } from "@/app/actions";
import Countdown from "@/components/Countdown";
import ReviewForm from "@/components/ReviewForm";
import DisputeButton from "@/components/DisputeButton";
import DuckBadge from "@/components/DuckBadge";
import { duckTier, nextTierInfo } from "@/lib/duckpower";

export const metadata = { title: "마이페이지" };

export const dynamic = "force-dynamic";

const ORDER_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "결제 대기",
  PAID: "결제 완료 · 발송 대기",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  CONFIRMED: "구매 확정",
  DISPUTED: "분쟁 중",
  REFUNDED: "환불",
  CANCELLED: "취소 (미결제)",
};

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await settleExpired();

  const [myBids, myListings, purchases, sales, watchlist] = await Promise.all([
    prisma.bid.findMany({
      where: { bidderId: user.id, auction: { status: "LIVE" } },
      orderBy: { createdAt: "desc" },
      include: { auction: { include: { item: { select: { title: true } } } } },
    }),
    prisma.auction.findMany({
      where: { item: { sellerId: user.id } },
      orderBy: { createdAt: "desc" },
      include: { item: { select: { title: true } } },
    }),
    prisma.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { auction: { include: { item: { select: { title: true } } } }, seller: { select: { nickname: true } } },
    }),
    prisma.order.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { auction: { include: { item: { select: { title: true } } } }, buyer: { select: { nickname: true } } },
    }),
    prisma.watchlist.findMany({
      where: { userId: user.id },
      include: { auction: { include: { item: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // 내가 이미 평가한 주문 (평가 폼 숨김용)
  const myReviews = await prisma.review.findMany({
    where: { reviewerId: user.id },
    select: { orderId: true },
  });
  const reviewedOrderIds = new Set(myReviews.map((r) => r.orderId));
  // 덕력 현황 (M14)
  const duckLogs = await prisma.duckPowerLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const tier = duckTier(user.duckPower);
  const next = nextTierInfo(user.duckPower);
  const watchedLive = watchlist
    .filter((w) => w.auction.status === "LIVE")
    .sort((a, b) => a.auction.endsAt.getTime() - b.auction.endsAt.getTime());

  // 경매별 내 최신 입찰만 표시
  const latestBidByAuction = [...new Map(myBids.map((b) => [b.auctionId, b])).values()];

  const btnCls = "rounded-lg bg-duck px-4 py-1.5 text-xs font-bold text-ink hover:bg-duck-deep";
  const cardCls = "rounded-xl border border-line bg-card p-4";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{user.nickname}</h1>
          <p className="text-sm text-mauve">
            거래 {user.salesCount}회 · {user.ratingCount > 0 ? `평점 ${user.ratingAvg.toFixed(1)}` : "평가 없음"}
            {user.penaltyLevel > 0 && (
              <span className="ml-2 font-semibold text-bill">페널티 {user.penaltyLevel}단계</span>
            )}
          </p>
        </div>
        <Link href="/settings" className="rounded-full border border-line-strong bg-card px-4 py-1.5 text-sm font-medium text-mauve hover:border-bill/40">
          설정
        </Link>
        <Link
          href={user.isArtist ? `/artists/${user.id}` : "/artist/setup"}
          className="rounded-full border border-wisteria/40 bg-wisteria-soft px-4 py-1.5 text-sm font-semibold text-wisteria hover:border-wisteria"
        >
          {user.isArtist ? "내 작가 프로필" : "작가로 등록하기"}
        </Link>
      </div>

      {/* 덕력 (M14) — 신뢰의 단일 수치 */}
      <section className="rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DuckBadge power={user.duckPower} size="md" />
            {next ? (
              <p className="text-sm text-mauve">
                다음 등급 <span className="font-semibold text-ink">{next.next.name}</span>까지{" "}
                <span className="num font-semibold text-bill">{next.remaining.toLocaleString()}</span> 덕력
              </p>
            ) : (
              <p className="text-sm font-semibold text-bill-deep">최고 등급입니다 🏆</p>
            )}
          </div>
          <p className="text-xs text-mauve-light">
            거래 완료 +50 · 평가 ★5 +20 · 등록 +5 · 입찰 +2 · 미결제 −100
          </p>
        </div>
        {next && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blush">
            <div
              className="h-full rounded-full bg-duck"
              style={{
                width: `${Math.min(100, Math.round(((user.duckPower - tier.min) / (next.next.min - tier.min)) * 100))}%`,
              }}
            />
          </div>
        )}
        {duckLogs.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-mauve">
            {duckLogs.map((log) => (
              <li key={log.id} className="flex justify-between">
                <span>{log.reason}</span>
                <span className={`num font-semibold ${log.amount > 0 ? "text-ok" : "text-bill-deep"}`}>
                  {log.amount > 0 ? "+" : ""}
                  {log.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 입찰 중 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">입찰 중 ({latestBidByAuction.length})</h2>
        {latestBidByAuction.length === 0 ? (
          <p className="text-sm text-mauve-light">입찰 중인 경매가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {latestBidByAuction.map((bid) => (
              <li key={bid.id} className={`${cardCls} flex items-center justify-between gap-3 text-sm`}>
                <Link href={`/auctions/${bid.auctionId}`} className="min-w-0 flex-1 truncate font-medium hover:text-bill">
                  {bid.auction.item.title}
                </Link>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
                    bid.status === BID_STATUS.ACTIVE ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"
                  }`}
                >
                  {bid.status === BID_STATUS.ACTIVE ? "최고 입찰" : "밀림"}
                </span>
                <span className="shrink-0 font-semibold">{krw(bid.auction.currentPrice)}</span>
                <Countdown endsAt={bid.auction.endsAt.toISOString()} className="shrink-0 text-xs text-mauve" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 찜한 경매 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">찜한 경매 ({watchedLive.length})</h2>
        {watchedLive.length === 0 ? (
          <p className="text-sm text-mauve-light">찜한 진행 중 경매가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {watchedLive.map((w) => (
              <li key={w.auctionId} className={`${cardCls} flex items-center justify-between gap-3 text-sm`}>
                <Link href={`/auctions/${w.auctionId}`} className="min-w-0 flex-1 truncate font-medium hover:text-bill">
                  ♥ {w.auction.item.title}
                </Link>
                <span className="shrink-0 font-semibold">{krw(w.auction.currentPrice)}</span>
                <Countdown endsAt={w.auction.endsAt.toISOString()} className="shrink-0 text-xs text-mauve" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 구매 (낙찰) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">구매 내역 ({purchases.length})</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-mauve-light">낙찰받은 경매가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((order) => (
              <li key={order.id} className={`${cardCls} space-y-2 text-sm`}>
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/auctions/${order.auctionId}`} className="min-w-0 flex-1 truncate font-medium hover:text-bill">
                    {order.auction.item.title}
                  </Link>
                  <span className="shrink-0 font-semibold">{krw(order.amount)}</span>
                  <span className="shrink-0 rounded bg-blush px-2 py-0.5 text-xs font-semibold text-ink/70">
                    {ORDER_LABEL[order.status]}
                  </span>
                </div>
                {order.status === ORDER_STATUS.PENDING_PAYMENT && (
                  <form action={payOrderAction} className="space-y-2 rounded-lg bg-blush/60 p-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <p className="text-xs font-semibold">배송지 입력 후 결제해주세요</p>
                    <div className="flex gap-2">
                      <input name="shipName" required defaultValue={user.shipName ?? ""} placeholder="받는 분" className="w-28 rounded-lg border border-line-strong bg-card px-2 py-1.5 text-xs" />
                      <input name="shipPhone" required defaultValue={user.shipPhone ?? ""} placeholder="연락처" className="w-36 rounded-lg border border-line-strong bg-card px-2 py-1.5 text-xs" />
                    </div>
                    <input name="shipAddress" required minLength={8} defaultValue={user.shipAddress ?? ""} placeholder="주소 (도로명 + 상세주소)" className="w-full rounded-lg border border-line-strong bg-card px-2 py-1.5 text-xs" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-bill">
                        결제 기한: {new Date(order.paymentDueAt).toLocaleString("ko-KR")}
                      </span>
                      <button className={btnCls}>결제하기 (모의)</button>
                    </div>
                  </form>
                )}
                {order.status === ORDER_STATUS.SHIPPED && (
                  <>
                    <form action={confirmOrderAction} className="flex items-center justify-between">
                      <input type="hidden" name="orderId" value={order.id} />
                      <span className="text-xs text-mauve">
                        {order.carrier} {order.trackingNo}
                      </span>
                      <button className={btnCls}>수령 확인 (구매 확정)</button>
                    </form>
                    <DisputeButton orderId={order.id} />
                  </>
                )}
                {order.status === ORDER_STATUS.DISPUTED && (
                  <p className="rounded-lg bg-warn-soft p-2.5 text-xs text-warn">
                    분쟁 중재 중 — 신고 사유: {order.disputeReason}
                  </p>
                )}
                {order.status === ORDER_STATUS.CONFIRMED && !reviewedOrderIds.has(order.id) && (
                  <ReviewForm orderId={order.id} targetLabel={`판매자 ${order.seller.nickname}`} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 판매 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">판매 관리 ({myListings.length})</h2>
        {myListings.length === 0 ? (
          <p className="text-sm text-mauve-light">
            등록한 경매가 없습니다. <Link href="/sell" className="font-semibold text-bill">첫 경매를 시작해보세요.</Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {myListings.map((auction) => {
              const order = sales.find((s) => s.auctionId === auction.id);
              return (
                <li key={auction.id} className={`${cardCls} space-y-2 text-sm`}>
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/auctions/${auction.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-bill">
                      {auction.item.title}
                    </Link>
                    <span className="shrink-0 font-semibold">{krw(auction.currentPrice)}</span>
                    <span className="shrink-0 rounded bg-blush px-2 py-0.5 text-xs font-semibold text-ink/70">
                      {auction.status === "LIVE"
                        ? `진행 중 · 입찰 ${auction.bidCount}건`
                        : auction.status === "ENDED_SOLD"
                          ? "낙찰"
                          : auction.status === "ENDED_UNSOLD"
                            ? "유찰"
                            : "취소"}
                    </span>
                  </div>
                  {auction.status === "LIVE" && auction.bidCount === 0 && (
                    <form action={cancelMyAuctionAction}>
                      <input type="hidden" name="auctionId" value={auction.id} />
                      <button className="text-xs text-mauve underline hover:text-bill">경매 취소 (입찰 전에만 가능)</button>
                    </form>
                  )}
                  {(auction.status === "ENDED_UNSOLD" || auction.status === "CANCELLED") && (
                    <form action={relistAuctionAction}>
                      <input type="hidden" name="auctionId" value={auction.id} />
                      <button className="rounded-lg border border-bill px-3 py-1 text-xs font-bold text-bill hover:bg-cream">다시 등록하기 (72시간)</button>
                    </form>
                  )}
                  {order && (
                    <div className="border-t border-line pt-2">
                      <p className="mb-1 text-xs text-mauve">
                        구매자 {order.buyer.nickname} · {ORDER_LABEL[order.status]} · 정산 예정{" "}
                        {krw(order.amount - order.fee)} (수수료 {krw(order.fee)})
                      </p>
                      {order.status === ORDER_STATUS.PAID && order.shipAddress && (
                        <p className="rounded-lg bg-blush/60 p-2 text-xs text-ink/80">
                          📦 배송지: {order.shipName} · {order.shipPhone} · {order.shipAddress}
                        </p>
                      )}
                      {order.status === ORDER_STATUS.PAID && (
                        <form action={shipOrderAction} className="flex gap-2">
                          <input type="hidden" name="orderId" value={order.id} />
                          <input name="carrier" required placeholder="택배사" className="w-24 rounded-lg border border-line-strong px-2 py-1 text-xs" />
                          <input name="trackingNo" required placeholder="운송장 번호" className="flex-1 rounded-lg border border-line-strong px-2 py-1 text-xs" />
                          <button className={btnCls}>발송 등록</button>
                        </form>
                      )}
                      {order.status === ORDER_STATUS.CONFIRMED && !reviewedOrderIds.has(order.id) && (
                        <ReviewForm orderId={order.id} targetLabel={`구매자 ${order.buyer.nickname}`} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
