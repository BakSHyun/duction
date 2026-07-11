import { prisma } from "./prisma";
import { awardDuckPower, DUCK_POWER } from "./duckpower";
import {
  AUCTION_STATUS,
  BID_STATUS,
  ORDER_STATUS,
  FEE_RATE,
  PAYMENT_DUE_HOURS,
  SOFT_CLOSE_WINDOW_MS,
  bidIncrement,
} from "./constants";

export class BidError extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// 알림은 비즈니스 로직과 같은 트랜잭션에서 생성 (유실 방지)
function notify(
  tx: Tx,
  userId: string,
  type: string,
  title: string,
  link: string,
  body?: string,
) {
  return tx.notification.create({ data: { userId, type, title, link, body } });
}

/**
 * 동시 입찰 직렬화 — 같은 경매의 트랜잭션들이 이 락에서 줄을 선다.
 * 앱 레벨(Redis) 락 대신 DB 락을 쓰는 이유: ARCHITECTURE.md §5-1
 * (트랜잭션 롤백 시 자동 해제, 락 서비스라는 추가 장애점 없음)
 */
async function lockAuctionRow(tx: Tx, auctionId: string) {
  await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
}

/**
 * 프록시 입찰(자동입찰) 엔진 — eBay 방식.
 * 사용자는 "최대 입찰가"를 제출하고, 시스템이 경쟁 상황에 따라
 * 표시가(amount)를 최소한으로만 올린다.
 */
export async function placeBid(auctionId: string, bidderId: string, maxProxyAmount: number) {
  return prisma.$transaction(async (tx) => {
    await lockAuctionRow(tx, auctionId);
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { item: true },
    });
    if (!auction) throw new BidError("경매를 찾을 수 없습니다.");
    if (auction.status === AUCTION_STATUS.SCHEDULED)
      throw new BidError("아직 시작 전인 경매입니다. 시작 후 입찰할 수 있어요.");
    if (auction.status !== AUCTION_STATUS.LIVE) throw new BidError("종료된 경매입니다.");

    const now = new Date();
    if (auction.endsAt <= now) throw new BidError("마감된 경매입니다. 잠시 후 결과가 반영됩니다.");
    if (auction.item.sellerId === bidderId) throw new BidError("본인 경매에는 입찰할 수 없습니다.");

    const bidder = await tx.user.findUniqueOrThrow({ where: { id: bidderId } });
    if (bidder.penaltyLevel >= 3) throw new BidError("이용이 정지된 계정입니다.");
    if (bidder.suspendedUntil && bidder.suspendedUntil > now)
      throw new BidError("일시 정지 중인 계정입니다.");

    const leader = await tx.bid.findFirst({
      where: { auctionId, status: BID_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
    });

    // 내가 이미 최고 입찰자 → 최대가 상향만 허용 (현재가 변동 없음)
    if (leader && leader.bidderId === bidderId) {
      if (maxProxyAmount <= leader.maxProxyAmount)
        throw new BidError("이미 최고 입찰자입니다. 기존 최대가보다 높게만 변경할 수 있습니다.");
      await tx.bid.update({
        where: { id: leader.id },
        data: { maxProxyAmount },
      });
      return { currentPrice: auction.currentPrice, isLeading: true, extended: false };
    }

    const minAcceptable = leader
      ? auction.currentPrice + bidIncrement(auction.currentPrice)
      : auction.startPrice;
    if (maxProxyAmount < minAcceptable)
      throw new BidError(`최소 입찰가는 ${minAcceptable.toLocaleString()}원입니다.`);

    let newPrice: number;
    let isLeading: boolean;

    if (!leader) {
      // 첫 입찰 — 시작가로 시작
      newPrice = auction.startPrice;
      await tx.bid.create({
        data: { auctionId, bidderId, amount: newPrice, maxProxyAmount, status: BID_STATUS.ACTIVE },
      });
      isLeading = true;
    } else if (maxProxyAmount > leader.maxProxyAmount) {
      // 새 입찰자가 기존 리더의 최대가를 초과 → 리더 교체
      // 기존 리더는 자신의 최대가까지 자동 응찰된 것으로 기록
      newPrice = Math.min(
        maxProxyAmount,
        leader.maxProxyAmount + bidIncrement(leader.maxProxyAmount),
      );
      await tx.bid.update({
        where: { id: leader.id },
        data: { amount: leader.maxProxyAmount, status: BID_STATUS.OUTBID, isAuto: true },
      });
      await tx.bid.create({
        data: { auctionId, bidderId, amount: newPrice, maxProxyAmount, status: BID_STATUS.ACTIVE },
      });
      await notify(
        tx,
        leader.bidderId,
        "OUTBID",
        "입찰이 밀렸어요",
        `/auctions/${auctionId}`,
        `${auction.item.title} — 현재가 ${newPrice.toLocaleString()}원. 다시 입찰해보세요!`,
      );
      isLeading = true;
    } else {
      // 기존 리더의 최대가 이하 → 리더 유지, 현재가만 상승 (동액이면 선입찰 우선)
      newPrice = Math.min(
        leader.maxProxyAmount,
        maxProxyAmount + bidIncrement(maxProxyAmount),
      );
      await tx.bid.create({
        data: { auctionId, bidderId, amount: maxProxyAmount, maxProxyAmount, status: BID_STATUS.OUTBID },
      });
      await tx.bid.update({
        where: { id: leader.id },
        data: { amount: newPrice, isAuto: true },
      });
      isLeading = false;
    }

    await awardDuckPower(tx, bidderId, DUCK_POWER.BID_PLACED, "입찰 참여");

    // soft-close: 마감 5분 전 입찰 → 마감 5분 연장 (스나이핑 방지)
    let endsAt = auction.endsAt;
    let extended = false;
    if (auction.endsAt.getTime() - now.getTime() < SOFT_CLOSE_WINDOW_MS) {
      endsAt = new Date(now.getTime() + SOFT_CLOSE_WINDOW_MS);
      extended = true;
    }

    await tx.auction.update({
      where: { id: auctionId },
      data: {
        currentPrice: newPrice,
        endsAt,
        extendedCount: extended ? { increment: 1 } : undefined,
        bidCount: { increment: 1 },
      },
    });

    return { currentPrice: newPrice, isLeading, extended };
  });
}

/** 즉시구매 — 경매를 즉구가로 종료하고 주문 생성 */
export async function buyNow(auctionId: string, buyerId: string) {
  return prisma.$transaction(async (tx) => {
    await lockAuctionRow(tx, auctionId);
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { item: true },
    });
    if (!auction) throw new BidError("경매를 찾을 수 없습니다.");
    if (auction.status !== AUCTION_STATUS.LIVE || auction.endsAt <= new Date())
      throw new BidError("종료된 경매입니다.");
    if (!auction.buyNowPrice) throw new BidError("즉시구매가 설정되지 않은 경매입니다.");
    if (auction.item.sellerId === buyerId) throw new BidError("본인 경매는 구매할 수 없습니다.");

    await tx.bid.updateMany({
      where: { auctionId, status: BID_STATUS.ACTIVE },
      data: { status: BID_STATUS.OUTBID },
    });
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        status: AUCTION_STATUS.ENDED_SOLD,
        currentPrice: auction.buyNowPrice,
        winnerId: buyerId,
        endsAt: new Date(),
      },
    });
    const order = await tx.order.create({
      data: {
        auctionId,
        buyerId,
        sellerId: auction.item.sellerId,
        amount: auction.buyNowPrice,
        fee: Math.round(auction.buyNowPrice * FEE_RATE),
        paymentDueAt: new Date(Date.now() + PAYMENT_DUE_HOURS * 3600 * 1000),
      },
    });
    await notify(tx, buyerId, "WON", "즉시구매 완료 — 24시간 내 결제해주세요", "/me",
      `${auction.item.title} · ${auction.buyNowPrice.toLocaleString()}원`);
    await notify(tx, auction.item.sellerId, "SOLD", "판매됐어요 (즉시구매)", "/me",
      `${auction.item.title} · ${auction.buyNowPrice.toLocaleString()}원`);
    return order;
  });
}

/**
 * 마감 지난 LIVE 경매 정산 + 결제 기한 초과 주문 처리.
 * MVP는 페이지 조회 시 호출하는 lazy 방식 — 운영 전환 시 BullMQ 지연 잡으로 교체.
 */
export async function settleExpired() {
  const now = new Date();

  // 하우스키핑: 만료 세션 청소 + 발송 7일 경과 자동 구매확정 (멱등)
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const { autoConfirmShipped } = await import("./orders");
  await autoConfirmShipped();

  // 찜 마감 임박 알림 (M22) — 마감 1시간 전, 경매당 1회
  const endingSoon = await prisma.auction.findMany({
    where: {
      status: AUCTION_STATUS.LIVE,
      endingSoonNotifiedAt: null,
      endsAt: { gt: now, lte: new Date(now.getTime() + 3600 * 1000) },
    },
    include: {
      item: { select: { title: true } },
      watchers: { select: { userId: true } },
    },
  });
  for (const auction of endingSoon) {
    await prisma.$transaction(async (tx) => {
      await tx.auction.update({
        where: { id: auction.id },
        data: { endingSoonNotifiedAt: now },
      });
      if (auction.watchers.length > 0) {
        await tx.notification.createMany({
          data: auction.watchers.map((w) => ({
            userId: w.userId,
            type: "WATCHED_ENDING",
            title: "찜한 경매가 1시간 내에 마감돼요",
            body: `${auction.item.title} · 현재가 ${auction.currentPrice.toLocaleString()}원`,
            link: `/auctions/${auction.id}`,
          })),
        });
      }
    });
  }

  // 예약 경매 자동 시작 (M8)
  await prisma.auction.updateMany({
    where: { status: AUCTION_STATUS.SCHEDULED, startsAt: { lte: now } },
    data: { status: AUCTION_STATUS.LIVE },
  });

  const expired = await prisma.auction.findMany({
    where: { status: AUCTION_STATUS.LIVE, endsAt: { lte: now } },
    include: { item: true },
  });

  for (const auction of expired) {
    await prisma.$transaction(async (tx) => {
      // 마감 직전 입찰(placeBid)과의 경합 차단 — 락 획득 후 상태 재검증
      await lockAuctionRow(tx, auction.id);
      const fresh = await tx.auction.findUniqueOrThrow({ where: { id: auction.id } });
      if (fresh.status !== AUCTION_STATUS.LIVE || fresh.endsAt > new Date()) return; // soft-close 연장됨
      const winningBid = await tx.bid.findFirst({
        where: { auctionId: auction.id, status: BID_STATUS.ACTIVE },
      });

      // Reserve price 미달 → 유찰 (M7). 금액은 비공개이므로 사유만 알림
      // 가격류는 락 이후 재조회한 fresh 기준 (막판 입찰 반영)
      if (winningBid && fresh.reservePrice && fresh.currentPrice < fresh.reservePrice) {
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: AUCTION_STATUS.ENDED_UNSOLD },
        });
        await notify(tx, auction.item.sellerId, "UNSOLD", "최저 낙찰가 미달로 유찰됐어요",
          `/auctions/${auction.id}`, auction.item.title);
        await notify(tx, winningBid.bidderId, "RESERVE_NOT_MET", "아쉽게도 최저 낙찰가 미달로 유찰됐어요",
          `/auctions/${auction.id}`, `${auction.item.title} — 최고 입찰자였지만 판매자의 최저 낙찰가에 도달하지 못했어요.`);
        return;
      }

      if (winningBid) {
        await tx.bid.update({ where: { id: winningBid.id }, data: { status: BID_STATUS.WON } });
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: AUCTION_STATUS.ENDED_SOLD, winnerId: winningBid.bidderId },
        });
        await tx.order.create({
          data: {
            auctionId: auction.id,
            buyerId: winningBid.bidderId,
            sellerId: auction.item.sellerId,
            amount: fresh.currentPrice,
            fee: Math.round(fresh.currentPrice * FEE_RATE),
            paymentDueAt: new Date(now.getTime() + PAYMENT_DUE_HOURS * 3600 * 1000),
          },
        });
        await notify(tx, winningBid.bidderId, "WON", "낙찰됐어요 — 24시간 내 결제해주세요", "/me",
          `${auction.item.title} · ${fresh.currentPrice.toLocaleString()}원`);
        await notify(tx, auction.item.sellerId, "SOLD", "낙찰됐어요", "/me",
          `${auction.item.title} · ${fresh.currentPrice.toLocaleString()}원`);
      } else {
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: AUCTION_STATUS.ENDED_UNSOLD },
        });
        await notify(tx, auction.item.sellerId, "UNSOLD", "경매가 유찰됐어요", `/auctions/${auction.id}`,
          `${auction.item.title} — 다시 등록해보세요.`);
      }
    });
  }

  // 미결제 낙찰 파기: 주문 취소 + 페널티 + 차순위 승계 (M7)
  const overdue = await prisma.order.findMany({
    where: { status: ORDER_STATUS.PENDING_PAYMENT, paymentDueAt: { lte: now } },
    include: { auction: { include: { item: true } } },
  });
  for (const order of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: ORDER_STATUS.CANCELLED },
      });

      // 승계 주문 미결제는 페널티·재승계 없이 종료 (본인이 응찰한 시점과 상황이 다름)
      if (order.isSecondChance) {
        await notify(tx, order.sellerId, "ORDER_CANCELLED",
          "차순위 승계도 미결제로 취소됐어요", "/me", order.auction.item.title);
        return;
      }

      await notify(tx, order.buyerId, "ORDER_CANCELLED", "미결제로 주문이 취소되고 페널티가 부과됐어요", "/me");
      await awardDuckPower(tx, order.buyerId, DUCK_POWER.UNPAID_CANCEL, "낙찰 후 미결제 파기");
      const buyer = await tx.user.update({
        where: { id: order.buyerId },
        data: { penaltyLevel: { increment: 1 } },
      });
      if (buyer.penaltyLevel === 2) {
        await tx.user.update({
          where: { id: buyer.id },
          data: { suspendedUntil: new Date(now.getTime() + 7 * 24 * 3600 * 1000) },
        });
      }

      // 차순위 승계: 다른 입찰자의 최고 OUTBID 입찰에게 본인 응찰가로 승계 제안
      const runnerUp = await tx.bid.findFirst({
        where: {
          auctionId: order.auctionId,
          status: BID_STATUS.OUTBID,
          bidderId: { not: order.buyerId },
        },
        orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
      });
      if (runnerUp) {
        await tx.order.create({
          data: {
            auctionId: order.auctionId,
            buyerId: runnerUp.bidderId,
            sellerId: order.sellerId,
            amount: runnerUp.amount,
            fee: Math.round(runnerUp.amount * FEE_RATE),
            paymentDueAt: new Date(now.getTime() + PAYMENT_DUE_HOURS * 3600 * 1000),
            isSecondChance: true,
          },
        });
        await tx.auction.update({
          where: { id: order.auctionId },
          data: { winnerId: runnerUp.bidderId, currentPrice: runnerUp.amount },
        });
        await notify(tx, runnerUp.bidderId, "SECOND_CHANCE",
          "차순위 낙찰 기회가 왔어요 — 24시간 내 결제 시 구매 확정", "/me",
          `${order.auction.item.title} · ${runnerUp.amount.toLocaleString()}원 (미결제 시 페널티 없음)`);
        await notify(tx, order.sellerId, "SECOND_CHANCE",
          "차순위 입찰자에게 승계를 제안했어요", "/me", order.auction.item.title);
      } else {
        await notify(tx, order.sellerId, "ORDER_CANCELLED",
          "구매자 미결제로 주문이 취소됐어요 (차순위 없음)", "/me", order.auction.item.title);
      }
    });
  }
}

/**
 * 입찰 취소 (M22, PLANNING.md §3.1) — 오입력 구제.
 * 조건: 내가 현재 최고 입찰자 + 마감 1시간 이상 남음 + 이 경매에서 취소 이력 없음.
 * 취소 시 차순위 입찰이 리더로 복원된다.
 */
export async function cancelBid(auctionId: string, bidderId: string) {
  return prisma.$transaction(async (tx) => {
    await lockAuctionRow(tx, auctionId);
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== AUCTION_STATUS.LIVE)
      throw new BidError("진행 중인 경매가 아닙니다.");
    if (auction.endsAt.getTime() - Date.now() < 3600 * 1000)
      throw new BidError("마감 1시간 전에는 입찰을 취소할 수 없어요.");

    const myBid = await tx.bid.findFirst({
      where: { auctionId, bidderId, status: BID_STATUS.ACTIVE },
    });
    if (!myBid) throw new BidError("취소할 최고 입찰이 없습니다. (밀린 입찰은 자동으로 무효화돼요)");

    const alreadyCancelled = await tx.bid.count({
      where: { auctionId, bidderId, status: BID_STATUS.CANCELLED },
    });
    if (alreadyCancelled > 0) throw new BidError("입찰 취소는 경매당 1회만 가능해요.");

    await tx.bid.update({ where: { id: myBid.id }, data: { status: BID_STATUS.CANCELLED } });

    // 차순위 복원 — 다른 입찰자의 최고 OUTBID를 리더로
    const runnerUp = await tx.bid.findFirst({
      where: { auctionId, status: BID_STATUS.OUTBID, bidderId: { not: bidderId } },
      orderBy: [{ maxProxyAmount: "desc" }, { createdAt: "asc" }],
    });
    if (runnerUp) {
      await tx.bid.update({ where: { id: runnerUp.id }, data: { status: BID_STATUS.ACTIVE } });
      await tx.auction.update({
        where: { id: auctionId },
        data: { currentPrice: runnerUp.amount },
      });
      await notify(tx, runnerUp.bidderId, "OUTBID", "최고 입찰자로 복귀했어요",
        `/auctions/${auctionId}`, "앞선 입찰이 취소되어 다시 최고 입찰자가 됐어요.");
      return { currentPrice: runnerUp.amount };
    }
    await tx.auction.update({
      where: { id: auctionId },
      data: { currentPrice: auction.startPrice },
    });
    return { currentPrice: auction.startPrice };
  });
}
