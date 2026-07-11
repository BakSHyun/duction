"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AUCTION_STATUS, BID_STATUS } from "@/lib/constants";
import { awardDuckPower, DUCK_POWER } from "@/lib/duckpower";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");
  return user;
}

/** 감사 로그 (M21) — 어드민 액션은 전부 기록 */
async function logAudit(adminId: string, action: string, targetType: string, targetId: string, detail?: string) {
  await prisma.auditLog.create({ data: { adminId, action, targetType, targetId, detail } });
}

export async function dismissReportAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("reportId"));
  await prisma.report.update({
    where: { id },
    data: { status: "DISMISSED", resolution: "기각", resolvedAt: new Date() },
  });
  const admin0 = await requireAdmin();
  await logAudit(admin0.id, "신고 기각", "REPORT", id);
  revalidatePath("/admin");
}

/** 경매 강제 취소 — 입찰 전체 취소 + 판매자 알림. 신고 처리에서 호출 */
export async function cancelAuctionAction(formData: FormData) {
  await requireAdmin();
  const auctionId = String(formData.get("auctionId"));
  const reportId = String(formData.get("reportId") ?? "");

  await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { item: true },
    });
    if (!auction || auction.status !== AUCTION_STATUS.LIVE) return;

    await tx.bid.updateMany({
      where: { auctionId, status: { in: [BID_STATUS.ACTIVE, BID_STATUS.OUTBID] } },
      data: { status: BID_STATUS.CANCELLED },
    });
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: AUCTION_STATUS.CANCELLED },
    });
    await tx.notification.create({
      data: {
        userId: auction.item.sellerId,
        type: "AUCTION_CANCELLED",
        title: "경매가 운영정책 위반으로 취소됐어요",
        body: auction.item.title,
        link: `/auctions/${auctionId}`,
      },
    });
    if (reportId) {
      await tx.report.update({
        where: { id: reportId },
        data: { status: "RESOLVED", resolution: "경매 취소", resolvedAt: new Date() },
      });
    }
  });
  revalidatePath("/admin");
}

/** 유저 제재 — 단계 지정 (1=경고, 2=7일 정지, 3=영구 정지) */
export async function sanctionUserAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const level = Number(formData.get("level"));
  const reportId = String(formData.get("reportId") ?? "");
  if (![1, 2, 3].includes(level)) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        penaltyLevel: level,
        suspendedUntil: level === 2 ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null,
      },
    });
    const labels: Record<number, string> = {
      1: "경고가 부과됐어요",
      2: "7일 이용 정지가 부과됐어요",
      3: "영구 이용 정지됐어요",
    };
    await tx.notification.create({
      data: { userId, type: "PENALTY", title: labels[level], body: "운영정책 위반", link: "/me" },
    });
    await awardDuckPower(tx, userId, DUCK_POWER.SANCTION_PER_LEVEL * level, `운영 제재 ${level}단계`);
    if (reportId) {
      await tx.report.update({
        where: { id: reportId },
        data: { status: "RESOLVED", resolution: `유저 제재 ${level}단계`, resolvedAt: new Date() },
      });
    }

    // 영구 정지 → 해당 유저의 진행 중 경매 전부 내리기 (M21)
    if (level === 3) {
      const liveAuctions = await tx.auction.findMany({
        where: { item: { sellerId: userId }, status: { in: [AUCTION_STATUS.LIVE, AUCTION_STATUS.SCHEDULED] } },
        include: { bids: { where: { status: { in: [BID_STATUS.ACTIVE, BID_STATUS.OUTBID] } } } },
      });
      for (const a of liveAuctions) {
        await tx.auction.update({ where: { id: a.id }, data: { status: AUCTION_STATUS.CANCELLED } });
        await tx.bid.updateMany({
          where: { auctionId: a.id, status: { in: [BID_STATUS.ACTIVE, BID_STATUS.OUTBID] } },
          data: { status: BID_STATUS.CANCELLED },
        });
        for (const bidderId of new Set(a.bids.map((b) => b.bidderId))) {
          await tx.notification.create({
            data: {
              userId: bidderId,
              type: "AUCTION_CANCELLED",
              title: "입찰한 경매가 판매자 제재로 취소됐어요",
              link: `/auctions/${a.id}`,
            },
          });
        }
      }
    }
  });
  const admin = await requireAdmin();
  await logAudit(admin.id, `유저 제재 ${level}단계`, "USER", userId);
  revalidatePath("/admin");
}

/** 분쟁 중재 (M12) — 환불 처리 또는 기각 */
export async function resolveDisputeAction(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId"));
  const resolution = String(formData.get("resolution"));
  if (resolution !== "refund" && resolution !== "dismiss") return;
  const { resolveDispute } = await import("@/lib/orders");
  await resolveDispute(orderId, resolution);
  revalidatePath("/admin");
}

/** 작가 인증 배지 부여/해제 (M8) */
export async function toggleArtistVerifyAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isArtist) return;
  await prisma.user.update({
    where: { id: userId },
    data: { artistVerified: !user.artistVerified },
  });
  revalidatePath("/admin");
}

/** 정산 완료 처리 (M21) — 실제 이체 후 클릭 */
export async function settleSettlementAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("settlementId"));
  const settlement = await prisma.settlement.update({
    where: { id },
    data: { status: "PAID", settledAt: new Date() },
  });
  await prisma.notification.create({
    data: {
      userId: settlement.sellerId,
      type: "SETTLED",
      title: `정산이 완료됐어요 — ${settlement.amount.toLocaleString()}원`,
      link: "/me",
    },
  });
  await logAudit(admin.id, "정산 완료", "SETTLEMENT", id, `${settlement.amount}원`);
  revalidatePath("/admin");
}

/** 공지 작성 (M21) */
export async function createNoticeAction(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;
  const notice = await prisma.notice.create({
    data: { title, body, pinned: formData.get("pinned") === "on" },
  });
  await logAudit(admin.id, "공지 작성", "NOTICE", notice.id, title);
  revalidatePath("/");
  revalidatePath("/notices");
  revalidatePath("/admin");
}

/** 1:1 문의 답변 (M21) */
export async function answerInquiryAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("inquiryId"));
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return;
  const inquiry = await prisma.inquiry.update({
    where: { id },
    data: { answer, answeredAt: new Date(), status: "ANSWERED" },
  });
  await prisma.notification.create({
    data: {
      userId: inquiry.userId,
      type: "INQUIRY_ANSWERED",
      title: "문의에 답변이 도착했어요",
      body: inquiry.subject,
      link: "/support",
    },
  });
  await logAudit(admin.id, "문의 답변", "INQUIRY", id);
  revalidatePath("/admin");
}
