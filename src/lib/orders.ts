import { prisma } from "./prisma";
import { ORDER_STATUS } from "./constants";
import { awardDuckPower, DUCK_POWER } from "./duckpower";

export class OrderError extends Error {}

/**
 * 구매확정 — 유저 확정(마이페이지)과 자동확정(워커)이 공유하는 단일 경로.
 * 정산·평판·덕력이 전부 여기 걸려 있으므로 로직 분기를 금지한다.
 */
export async function confirmOrder(orderId: string, opts: { buyerId?: string; auto?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { auction: { include: { item: { select: { title: true } } } } },
    });
    if (!order || order.status !== ORDER_STATUS.SHIPPED)
      throw new OrderError("확정할 수 없는 주문입니다.");
    if (opts.buyerId && order.buyerId !== opts.buyerId)
      throw new OrderError("구매자만 확정할 수 있습니다.");

    await tx.order.update({ where: { id: orderId }, data: { status: ORDER_STATUS.CONFIRMED } });
    await tx.user.update({ where: { id: order.sellerId }, data: { salesCount: { increment: 1 } } });
    // 정산 장부 (M21) — 확정 즉시 정산 대기 생성, 어드민이 이체 후 완료 처리
    await tx.settlement.create({
      data: {
        orderId,
        sellerId: order.sellerId,
        amount: order.amount - order.fee,
        fee: order.fee,
      },
    });
    await awardDuckPower(tx, order.buyerId, DUCK_POWER.TRADE_CONFIRMED, "거래 완료 (구매)");
    await awardDuckPower(tx, order.sellerId, DUCK_POWER.TRADE_CONFIRMED, "거래 완료 (판매)");

    if (opts.auto) {
      const body = order.auction.item.title;
      await tx.notification.create({
        data: { userId: order.buyerId, type: "CONFIRMED", title: "발송 7일 경과로 자동 구매확정됐어요", body, link: "/me" },
      });
      await tx.notification.create({
        data: { userId: order.sellerId, type: "CONFIRMED", title: "구매확정 완료 — 정산이 진행돼요", body, link: "/me" },
      });
    }
    return order;
  });
}

/** 발송 후 7일 경과 주문 자동확정 (워커/lazy-settle에서 호출) */
export async function autoConfirmShipped(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const stale = await prisma.order.findMany({
    where: { status: ORDER_STATUS.SHIPPED, updatedAt: { lte: cutoff } },
    select: { id: true },
  });
  for (const { id } of stale) {
    await confirmOrder(id, { auto: true }).catch(() => {
      // 동시 확정 등으로 상태가 바뀐 경우 — 무시 (멱등)
    });
  }
  return stale.length;
}

/** 분쟁 신고 (M12) — 배송 중/완료 주문에서 구매자가 상태 불일치를 신고 */
export async function disputeOrder(orderId: string, buyerId: string, reason: string) {
  if (reason.trim().length < 10)
    throw new OrderError("신고 사유를 10자 이상 구체적으로 적어주세요. (하자 부위, 설명과 다른 점)");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { auction: { include: { item: { select: { title: true } } } } },
    });
    if (!order || order.buyerId !== buyerId) throw new OrderError("주문을 찾을 수 없습니다.");
    if (![ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(order.status as never))
      throw new OrderError("배송 중이거나 배송 완료된 주문만 신고할 수 있습니다.");

    await tx.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.DISPUTED, disputeReason: reason.trim() },
    });
    await tx.notification.create({
      data: {
        userId: order.sellerId,
        type: "DISPUTE_OPENED",
        title: "구매자가 문제를 신고했어요 — 운영팀이 중재합니다",
        body: order.auction.item.title,
        link: "/me",
      },
    });
    return order;
  });
}

/** 분쟁 중재 (M12, 어드민 전용 호출) — refund: 환불 처리 / dismiss: 기각(배송 중 복귀) */
export async function resolveDispute(orderId: string, resolution: "refund" | "dismiss") {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { auction: { include: { item: { select: { title: true } } } } },
    });
    if (!order || order.status !== ORDER_STATUS.DISPUTED)
      throw new OrderError("분쟁 중인 주문이 아닙니다.");

    if (resolution === "refund") {
      await tx.order.update({ where: { id: orderId }, data: { status: ORDER_STATUS.REFUNDED } });
      await tx.notification.create({
        data: { userId: order.buyerId, type: "DISPUTE_RESOLVED", title: "환불 처리됐어요", body: order.auction.item.title, link: "/me" },
      });
      await tx.notification.create({
        data: { userId: order.sellerId, type: "DISPUTE_RESOLVED", title: "분쟁이 환불로 종결됐어요", body: order.auction.item.title, link: "/me" },
      });
    } else {
      // 기각 → 배송 중 상태로 복귀, 구매자가 다시 수령 확인 가능
      await tx.order.update({ where: { id: orderId }, data: { status: ORDER_STATUS.SHIPPED } });
      await tx.notification.create({
        data: { userId: order.buyerId, type: "DISPUTE_RESOLVED", title: "신고가 기각됐어요 — 수령 확인을 진행해주세요", body: order.auction.item.title, link: "/me" },
      });
      await tx.notification.create({
        data: { userId: order.sellerId, type: "DISPUTE_RESOLVED", title: "분쟁이 기각으로 종결됐어요", body: order.auction.item.title, link: "/me" },
      });
    }
    return order;
  });
}
