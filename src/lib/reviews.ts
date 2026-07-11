import { prisma } from "./prisma";
import { ORDER_STATUS } from "./constants";
import { awardDuckPower, DUCK_POWER } from "./duckpower";

export class ReviewError extends Error {}

/**
 * 상호 평가 (M9) — 구매확정 주문에 대해 거래 당사자가 상대방을 1회 평가.
 * 평점 집계(ratingAvg/ratingCount)를 같은 트랜잭션에서 갱신한다.
 */
export async function createReview(
  orderId: string,
  reviewerId: string,
  rating: number,
  tags: string[],
  comment?: string,
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new ReviewError("별점은 1~5점이어야 합니다.");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new ReviewError("주문을 찾을 수 없습니다.");
    if (order.status !== ORDER_STATUS.CONFIRMED)
      throw new ReviewError("구매확정된 거래만 평가할 수 있습니다.");
    if (reviewerId !== order.buyerId && reviewerId !== order.sellerId)
      throw new ReviewError("거래 당사자만 평가할 수 있습니다.");

    const targetId = reviewerId === order.buyerId ? order.sellerId : order.buyerId;

    const existing = await tx.review.findUnique({
      where: { orderId_reviewerId: { orderId, reviewerId } },
    });
    if (existing) throw new ReviewError("이미 평가한 거래입니다.");

    const review = await tx.review.create({
      data: {
        orderId,
        reviewerId,
        targetId,
        rating,
        tags: tags.length ? JSON.stringify(tags) : null,
        comment: comment?.trim() || null,
      },
    });

    const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
    const newCount = target.ratingCount + 1;
    const newAvg = (target.ratingAvg * target.ratingCount + rating) / newCount;
    await tx.user.update({
      where: { id: targetId },
      data: { ratingAvg: newAvg, ratingCount: newCount },
    });
    await awardDuckPower(tx, targetId, DUCK_POWER.REVIEW[rating] ?? 0, `평가 받음 (★${rating})`);

    return review;
  });
}
