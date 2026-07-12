"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUser, verifyUser, startSession, endSession, getCurrentUser } from "@/lib/auth";
import { placeBid, buyNow, cancelBid, BidError } from "@/lib/bidding";
import { notifyFollowersOfNewListing } from "@/lib/artists";
import { createReview, ReviewError } from "@/lib/reviews";
import { disputeOrder, confirmOrder, OrderError } from "@/lib/orders";
import { awardDuckPower, DUCK_POWER } from "@/lib/duckpower";
import { rateLimit } from "@/lib/ratelimit";
import { ORDER_STATUS } from "@/lib/constants";

export type ActionResult = { ok: boolean; message?: string };

// ---------- 인증 ----------

export async function registerAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!email.includes("@") || password.length < 8 || nickname.length < 2)
    return { ok: false, message: "이메일, 8자 이상 비밀번호, 2자 이상 닉네임을 입력해주세요." };
  if (Buffer.byteLength(password, "utf8") > 72)
    return { ok: false, message: "비밀번호가 너무 깁니다. (최대 72바이트)" };
  try {
    const user = await createUser(email, password, nickname);
    await startSession(user.id);
  } catch {
    return { ok: false, message: "이미 사용 중인 이메일 또는 닉네임입니다." };
  }
  redirect("/");
}

export async function loginAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { headers } = await import("next/headers");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`login:${ip}`, 10, 300)))
    return { ok: false, message: "로그인 시도가 너무 많아요. 5분 후 다시 시도해주세요." };
  const user = await verifyUser(email, password);
  if (!user) return { ok: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." };
  await startSession(user.id);
  const next = String(formData.get("next") ?? "");
  // 내부 경로만 허용 — open redirect 방지
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

// ---------- 입찰 / 즉시구매 ----------

export async function bidAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const auctionId = String(formData.get("auctionId"));
  const maxAmount = Number(formData.get("maxAmount"));
  if (!Number.isInteger(maxAmount) || maxAmount <= 0)
    return { ok: false, message: "올바른 금액을 입력해주세요." };
  if (maxAmount > 100_000_000)
    return { ok: false, message: "최대 입찰가는 1억원을 넘을 수 없어요. 금액을 확인해주세요." };
  if (!(await rateLimit(`bid:${user.id}`, 30, 60)))
    return { ok: false, message: "입찰이 너무 빠릅니다. 잠시 후 다시 시도해주세요." };
  try {
    const result = await placeBid(auctionId, user.id, maxAmount);
    revalidatePath(`/auctions/${auctionId}`);
    return {
      ok: true,
      message: result.isLeading
        ? `현재 최고 입찰자입니다. (현재가 ${result.currentPrice.toLocaleString()}원${result.extended ? ", 마감 5분 연장" : ""})`
        : `다른 입찰자의 자동입찰가가 더 높습니다. (현재가 ${result.currentPrice.toLocaleString()}원)`,
    };
  } catch (e) {
    if (e instanceof BidError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function buyNowAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const auctionId = String(formData.get("auctionId"));
  try {
    await buyNow(auctionId, user.id);
  } catch (e) {
    if (e instanceof BidError) return { ok: false, message: e.message };
    throw e;
  }
  redirect("/me");
}

// ---------- 상품 등록 ----------

export async function createListingAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  if (user.penaltyLevel >= 3) return { ok: false, message: "이용이 정지된 계정입니다." };
  if (user.suspendedUntil && user.suspendedUntil > new Date())
    return { ok: false, message: "일시 정지 중인 계정입니다." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const conditionGrade = String(formData.get("conditionGrade") ?? "");
  const authenticity = String(formData.get("authenticity") ?? "UNKNOWN");
  const startPrice = Number(formData.get("startPrice"));
  const buyNowRaw = Number(formData.get("buyNowPrice"));
  const reserveRaw = Number(formData.get("reservePrice"));
  const durationHours = Number(formData.get("durationHours"));
  const startMode = String(formData.get("startMode") ?? "now");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");

  if (!title || !description || !categoryId || !conditionGrade)
    return { ok: false, message: "필수 항목을 모두 입력해주세요." };
  if (!Number.isInteger(startPrice) || startPrice < 1000)
    return { ok: false, message: "시작가는 1,000원 이상이어야 합니다." };
  const buyNowPrice = Number.isInteger(buyNowRaw) && buyNowRaw > 0 ? buyNowRaw : null;
  if (buyNowPrice && buyNowPrice <= startPrice)
    return { ok: false, message: "즉시구매가는 시작가보다 높아야 합니다." };
  // Reserve price (M7) — 비공개 최저 낙찰가
  const reservePrice = Number.isInteger(reserveRaw) && reserveRaw > 0 ? reserveRaw : null;
  if (reservePrice && reservePrice <= startPrice)
    return { ok: false, message: "최저 낙찰가는 시작가보다 높아야 합니다." };
  if (reservePrice && buyNowPrice && reservePrice > buyNowPrice)
    return { ok: false, message: "최저 낙찰가는 즉시구매가보다 높을 수 없습니다." };
  if (![24, 48, 72, 120, 168].includes(durationHours))
    return { ok: false, message: "경매 기간을 선택해주세요." };

  // 예약 시작 (M8) — 최대 7일 후, 분양 예고용
  let startsAt = new Date();
  let scheduled = false;
  if (startMode === "scheduled") {
    const parsed = new Date(scheduledAtRaw);
    if (isNaN(parsed.getTime()) || parsed.getTime() < Date.now() + 10 * 60 * 1000)
      return { ok: false, message: "예약 시작은 최소 10분 이후로 지정해주세요." };
    if (parsed.getTime() > Date.now() + 7 * 24 * 3600 * 1000)
      return { ok: false, message: "예약 시작은 최대 7일 이내로 지정해주세요." };
    startsAt = parsed;
    scheduled = true;
  }

  // 사진 저장 (MVP: 로컬 public/uploads — 운영 전환 시 R2/S3)
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length < 1) return { ok: false, message: "사진을 1장 이상 올려주세요. (인증샷 포함 권장)" };
  if (files.length > 10) return { ok: false, message: "사진은 최대 10장까지 가능합니다." };

  const urls: string[] = [];
  const { processAndSaveImage } = await import("@/lib/images");
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024)
      return { ok: false, message: "사진은 장당 8MB 이하로 올려주세요." };
    if (!file.type.startsWith("image/"))
      return { ok: false, message: "이미지 파일만 업로드할 수 있습니다." };
    try {
      // 리사이징 + WebP 변환 (M23) — 손상 파일은 여기서 걸러진다
      urls.push(await processAndSaveImage(file));
    } catch (err) {
      console.error("[upload] 이미지 처리 실패:", err);
      return { ok: false, message: "이미지를 처리할 수 없어요. 파일이 손상되지 않았는지 확인해주세요." };
    }
  }

  const blytheModelId = String(formData.get("blytheModelId") ?? "") || null;
  const customLevel = String(formData.get("customLevel") ?? "NONE");
  const customArtist = String(formData.get("customArtist") ?? "").trim() || null;
  const customDetails = String(formData.get("customDetails") ?? "").trim() || null;

  const item = await prisma.item.create({
    data: {
      sellerId: user.id,
      categoryId,
      title,
      description,
      conditionGrade,
      authenticity,
      blytheModelId,
      fullSetBox: formData.get("fullSetBox") === "on",
      fullSetCert: formData.get("fullSetCert") === "on",
      fullSetStand: formData.get("fullSetStand") === "on",
      fullSetOutfit: formData.get("fullSetOutfit") === "on",
      customLevel,
      customArtist,
      customDetails,
      images: {
        create: urls.map((url, i) => ({ url, sortOrder: i, isProofShot: i === 0 })),
      },
      auction: {
        create: {
          startPrice,
          buyNowPrice,
          reservePrice,
          currentPrice: startPrice,
          startsAt,
          // 경매 기간은 시작 시각부터 기산
          endsAt: new Date(startsAt.getTime() + durationHours * 3600 * 1000),
          status: scheduled ? "SCHEDULED" : "LIVE",
        },
      },
    },
    include: { auction: true },
  });

  // 외부거래 유도 의심 패턴 → 자동 신고 생성 (등록은 허용, 운영팀 검토)
  const { autoReportIfSuspicious } = await import("@/lib/moderation");
  await autoReportIfSuspicious(item.auction!.id, `${title}\n${description}`, "경매 등록");

  // 작가의 새 등록 → 팔로워에게 분양 알림
  if (user.isArtist) {
    await notifyFollowersOfNewListing(user.id, title, item.auction!.id);
  }

  await prisma.$transaction((tx) =>
    awardDuckPower(tx, user.id, DUCK_POWER.LISTING_CREATED, "경매 등록"),
  );

  // 연속 등록 모드 (M23) — 탈덕 정리러: 등록 후 폼으로 복귀
  if (formData.get("continueMode") === "on") redirect("/sell?done=1");
  redirect(`/auctions/${item.auction!.id}`);
}

// ---------- 분쟁 신고 (M12) ----------

export async function disputeOrderAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const orderId = String(formData.get("orderId"));
  const reason = String(formData.get("reason") ?? "");
  try {
    await disputeOrder(orderId, user.id, reason);
    revalidatePath("/me");
    return { ok: true, message: "신고가 접수됐어요. 운영팀이 확인 후 중재합니다." };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, message: e.message };
    throw e;
  }
}

// ---------- 상호 평가 (M9) ----------

export async function reviewAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const orderId = String(formData.get("orderId"));
  const rating = Number(formData.get("rating"));
  const tags = formData.getAll("tags").map(String);
  const comment = String(formData.get("comment") ?? "");
  try {
    await createReview(orderId, user.id, rating, tags, comment);
    revalidatePath("/me");
    return { ok: true, message: "평가가 등록됐어요. 감사합니다!" };
  } catch (e) {
    if (e instanceof ReviewError) return { ok: false, message: e.message };
    throw e;
  }
}

// ---------- 신고 (M6) ----------

export async function reportAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const targetId = String(formData.get("auctionId"));
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim() || null;
  if (!reason) return { ok: false, message: "신고 사유를 선택해주세요." };

  const duplicate = await prisma.report.findFirst({
    where: { reporterId: user.id, targetId, status: "OPEN" },
  });
  if (duplicate) return { ok: false, message: "이미 접수된 신고입니다. 운영팀이 확인 중이에요." };

  await prisma.report.create({
    data: { reporterId: user.id, targetType: "AUCTION", targetId, reason, detail },
  });
  return { ok: true, message: "신고가 접수됐습니다. 운영팀이 확인 후 조치합니다." };
}

// ---------- 작가 (M5) ----------

export async function becomeArtistAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const artistBio = String(formData.get("artistBio") ?? "").trim();
  const artistSns = String(formData.get("artistSns") ?? "").trim() || null;
  if (artistSns && !/^https?:\/\//.test(artistSns))
    return { ok: false, message: "SNS 링크는 http(s)://로 시작해야 해요." };
  if (artistBio.length < 10)
    return { ok: false, message: "소개를 10자 이상 작성해주세요. (작업 스타일, 분양 이력 등)" };
  await prisma.user.update({
    where: { id: user.id },
    data: { isArtist: true, artistBio, artistSns },
  });
  redirect(`/artists/${user.id}`);
}

export async function toggleFollowAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const artistId = String(formData.get("artistId"));
  if (artistId === user.id) return;
  const key = { followerId_artistId: { followerId: user.id, artistId } };
  const existing = await prisma.artistFollow.findUnique({ where: key });
  if (existing) {
    await prisma.artistFollow.delete({ where: key });
  } else {
    await prisma.artistFollow.create({ data: { followerId: user.id, artistId } });
  }
  revalidatePath(`/artists/${artistId}`);
}

// ---------- 찜 (관심 경매) ----------

export async function toggleWatchAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const auctionId = String(formData.get("auctionId"));
  const key = { userId_auctionId: { userId: user.id, auctionId } };
  const existing = await prisma.watchlist.findUnique({ where: key });
  if (existing) {
    await prisma.watchlist.delete({ where: key });
  } else {
    await prisma.watchlist.create({ data: { userId: user.id, auctionId } });
  }
  revalidatePath(`/auctions/${auctionId}`);
}

// ---------- 알림 ----------

export async function readNotificationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== user.id) redirect("/notifications");
  if (!notification.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
  redirect(notification.link ?? "/notifications");
}

export async function readAllNotificationsAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

// ---------- 주문 (모의 결제 / 배송 / 확정) ----------

export async function payOrderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const orderId = String(formData.get("orderId"));
  // 배송지 (M20) — 없으면 판매자가 보낼 곳이 없다
  const shipName = String(formData.get("shipName") ?? "").trim();
  const shipPhone = String(formData.get("shipPhone") ?? "").trim();
  const shipAddress = String(formData.get("shipAddress") ?? "").trim();
  if (!shipName || !shipPhone || shipAddress.length < 8) return;
  // MVP 모의 결제 — 운영 전환 시 토스페이먼츠 에스크로 연동
  const updated = await prisma.order.updateMany({
    where: { id: orderId, buyerId: user.id, status: ORDER_STATUS.PENDING_PAYMENT },
    data: { status: ORDER_STATUS.PAID, shipName, shipPhone, shipAddress },
  });
  // 다음 결제를 위해 기본 배송지로 저장
  await prisma.user.update({
    where: { id: user.id },
    data: { shipName, shipPhone, shipAddress },
  });
  if (updated.count > 0) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await prisma.notification.create({
      data: { userId: order.sellerId, type: "PAID", title: "결제 완료 — 발송해주세요", link: "/me" },
    });
  }
  revalidatePath("/me");
}

export async function shipOrderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const orderId = String(formData.get("orderId"));
  const trackingNo = String(formData.get("trackingNo") ?? "").trim();
  const carrier = String(formData.get("carrier") ?? "").trim();
  if (!trackingNo || !carrier) return;
  const updated = await prisma.order.updateMany({
    where: { id: orderId, sellerId: user.id, status: ORDER_STATUS.PAID },
    data: { status: ORDER_STATUS.SHIPPED, trackingNo, carrier },
  });
  if (updated.count > 0) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await prisma.notification.create({
      data: {
        userId: order.buyerId,
        type: "SHIPPED",
        title: "발송됐어요",
        body: `${carrier} ${trackingNo}`,
        link: "/me",
      },
    });
  }
  revalidatePath("/me");
}

export async function confirmOrderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const orderId = String(formData.get("orderId"));
  await confirmOrder(orderId, { buyerId: user.id }).catch(() => {
    // 상태가 이미 바뀐 경우 — UI 재검증만
  });
  revalidatePath("/me");
}

// ---------- 경매 Q&A (M20) ----------

export async function askQuestionAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const auctionId = String(formData.get("auctionId"));
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 5) return { ok: false, message: "질문을 5자 이상 적어주세요." };
  if (!(await rateLimit(`qna:${user.id}`, 10, 300)))
    return { ok: false, message: "질문이 너무 잦아요. 잠시 후 다시 시도해주세요." };

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { item: { select: { sellerId: true, title: true } } },
  });
  if (!auction) return { ok: false, message: "경매를 찾을 수 없습니다." };
  if (auction.item.sellerId === user.id)
    return { ok: false, message: "본인 경매에는 답변으로 소통해주세요." };

  const { detectOffsite } = await import("@/lib/moderation");
  if (detectOffsite(body))
    return { ok: false, message: "외부 거래 유도로 보이는 내용은 게시할 수 없어요. 모든 거래는 덕션 안에서 보호됩니다." };

  await prisma.$transaction(async (tx) => {
    await tx.auctionQuestion.create({ data: { auctionId, userId: user.id, body } });
    await tx.notification.create({
      data: {
        userId: auction.item.sellerId,
        type: "QUESTION",
        title: "새 질문이 달렸어요",
        body: `${auction.item.title} — ${body.slice(0, 50)}`,
        link: `/auctions/${auctionId}`,
      },
    });
  });
  revalidatePath(`/auctions/${auctionId}`);
  return { ok: true, message: "질문이 등록됐어요. 판매자가 답변하면 알려드릴게요." };
}

export async function answerQuestionAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const questionId = String(formData.get("questionId"));
  const answer = String(formData.get("answer") ?? "").trim();
  if (answer.length < 2) return { ok: false, message: "답변을 입력해주세요." };

  const question = await prisma.auctionQuestion.findUnique({
    where: { id: questionId },
    include: { auction: { include: { item: { select: { sellerId: true, title: true } } } } },
  });
  if (!question || question.auction.item.sellerId !== user.id)
    return { ok: false, message: "판매자만 답변할 수 있습니다." };

  const { detectOffsite } = await import("@/lib/moderation");
  if (detectOffsite(answer))
    return { ok: false, message: "외부 거래 유도로 보이는 내용은 게시할 수 없어요." };

  await prisma.$transaction(async (tx) => {
    await tx.auctionQuestion.update({
      where: { id: questionId },
      data: { answer, answeredAt: new Date() },
    });
    await tx.notification.create({
      data: {
        userId: question.userId,
        type: "ANSWER",
        title: "질문에 답변이 달렸어요",
        body: question.auction.item.title,
        link: `/auctions/${question.auctionId}`,
      },
    });
  });
  revalidatePath(`/auctions/${question.auctionId}`);
  return { ok: true, message: "답변이 등록됐어요." };
}

// ---------- 판매자 경매 관리 (M20) ----------

/** 입찰 전 경매 취소 — 입찰이 붙은 경매는 신뢰 문제로 취소 불가 */
export async function cancelMyAuctionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const auctionId = String(formData.get("auctionId"));
  await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { item: { select: { sellerId: true } } },
    });
    if (!auction || auction.item.sellerId !== user.id) return;
    if (!["LIVE", "SCHEDULED"].includes(auction.status) || auction.bidCount > 0) return;
    await tx.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED" } });
  });
  revalidatePath("/me");
}

/** 유찰 경매 원클릭 재등록 — 아이템·사진 복제 후 새 경매 (72시간) */
export async function relistAuctionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.penaltyLevel >= 3) return;
  const auctionId = String(formData.get("auctionId"));

  const old = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { item: { include: { images: true } } },
  });
  if (!old || old.item.sellerId !== user.id) return;
  if (!["ENDED_UNSOLD", "CANCELLED"].includes(old.status)) return;

  const item = await prisma.item.create({
    data: {
      sellerId: user.id,
      categoryId: old.item.categoryId,
      title: old.item.title,
      description: old.item.description,
      conditionGrade: old.item.conditionGrade,
      authenticity: old.item.authenticity,
      blytheModelId: old.item.blytheModelId,
      fullSetBox: old.item.fullSetBox,
      fullSetCert: old.item.fullSetCert,
      fullSetStand: old.item.fullSetStand,
      fullSetOutfit: old.item.fullSetOutfit,
      customLevel: old.item.customLevel,
      customArtist: old.item.customArtist,
      customDetails: old.item.customDetails,
      images: {
        create: old.item.images.map((img) => ({
          url: img.url,
          isProofShot: img.isProofShot,
          sortOrder: img.sortOrder,
        })),
      },
      auction: {
        create: {
          startPrice: old.startPrice,
          buyNowPrice: old.buyNowPrice,
          reservePrice: old.reservePrice,
          currentPrice: old.startPrice,
          endsAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      },
    },
    include: { auction: true },
  });
  redirect(`/auctions/${item.auction!.id}`);
}

// ---------- 계정 설정 (M20) ----------

export async function updateNicknameAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (nickname.length < 2 || nickname.length > 20)
    return { ok: false, message: "닉네임은 2~20자로 입력해주세요." };
  try {
    await prisma.user.update({ where: { id: user.id }, data: { nickname } });
  } catch {
    return { ok: false, message: "이미 사용 중인 닉네임입니다." };
  }
  revalidatePath("/settings");
  return { ok: true, message: "닉네임이 변경됐어요." };
}

export async function changePasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8 || Buffer.byteLength(next, "utf8") > 72)
    return { ok: false, message: "새 비밀번호는 8자 이상, 72바이트 이하여야 해요." };
  const verified = await verifyUser(user.email, current);
  if (!verified) return { ok: false, message: "현재 비밀번호가 올바르지 않습니다." };
  const bcrypt = (await import("bcryptjs")).default;
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return { ok: true, message: "비밀번호가 변경됐어요." };
}

export async function deleteAccountAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== user.nickname)
    return { ok: false, message: "확인을 위해 닉네임을 정확히 입력해주세요." };

  // 진행 중인 의무가 있으면 탈퇴 불가
  const [liveAuctions, activeOrders, activeBids] = await Promise.all([
    prisma.auction.count({ where: { item: { sellerId: user.id }, status: { in: ["LIVE", "SCHEDULED"] } } }),
    prisma.order.count({
      where: {
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
        status: { in: ["PENDING_PAYMENT", "PAID", "SHIPPED", "DISPUTED"] },
      },
    }),
    prisma.bid.count({ where: { bidderId: user.id, status: "ACTIVE", auction: { status: "LIVE" } } }),
  ]);
  if (liveAuctions + activeOrders + activeBids > 0)
    return {
      ok: false,
      message: "진행 중인 경매·입찰·주문이 있어 탈퇴할 수 없어요. 거래를 마무리한 뒤 다시 시도해주세요.",
    };

  // 익명화 탈퇴 — 거래 기록(낙찰가 히스토리·평가)은 플랫폼 무결성을 위해 보존
  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.artistFollow.deleteMany({ where: { OR: [{ followerId: user.id }, { artistId: user.id }] } });
    await tx.watchlist.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `deleted-${user.id}@deleted.duction`,
        nickname: `탈퇴회원${user.id.slice(-6)}`,
        passwordHash: "deleted",
        shipName: null,
        shipPhone: null,
        shipAddress: null,
        artistBio: null,
        artistSns: null,
        isArtist: false,
      },
    });
  });
  redirect("/");
}

// ---------- 푸시 알림 설정 (M22) ----------

const OPTOUT_ALLOWED = ["OUTBID", "NEW_LISTING", "QUESTION", "ANSWER", "WATCHED_ENDING"];

export async function savePushPrefsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const enabled = new Set(formData.getAll("enabled").map(String));
  // 체크 해제된 것 = 옵트아웃. 돈이 걸린 타입은 옵트아웃 불가 (목록에 없음)
  const optOut = OPTOUT_ALLOWED.filter((t) => !enabled.has(t));
  await prisma.user.update({
    where: { id: user.id },
    data: { pushOptOut: optOut.length ? JSON.stringify(optOut) : null },
  });
  revalidatePath("/settings");
  return { ok: true, message: "알림 설정이 저장됐어요." };
}

// ---------- 1:1 문의 (M21) ----------

export async function createInquiryAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 2 || body.length < 10)
    return { ok: false, message: "제목과 내용(10자 이상)을 입력해주세요." };
  if (!(await rateLimit(`inquiry:${user.id}`, 5, 3600)))
    return { ok: false, message: "문의가 너무 잦아요. 잠시 후 다시 시도해주세요." };
  await prisma.inquiry.create({ data: { userId: user.id, subject, body } });
  revalidatePath("/support");
  return { ok: true, message: "문의가 접수됐어요. 답변이 오면 알림으로 알려드릴게요." };
}

export async function cancelBidAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const auctionId = String(formData.get("auctionId"));
  try {
    const r = await cancelBid(auctionId, user.id);
    revalidatePath(`/auctions/${auctionId}`);
    return { ok: true, message: `입찰이 취소됐어요. (현재가 ${r.currentPrice.toLocaleString()}원)` };
  } catch (e) {
    if (e instanceof BidError) return { ok: false, message: e.message };
    throw e;
  }
}

// ---------- 컬렉션 피드 (M24) ----------

export async function createPostAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  if (user.penaltyLevel >= 3) return { ok: false, message: "이용이 정지된 계정입니다." };
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 5) return { ok: false, message: "5자 이상 적어주세요." };
  if (!(await rateLimit(`post:${user.id}`, 10, 3600)))
    return { ok: false, message: "잠시 후 다시 시도해주세요." };

  const { detectOffsite } = await import("@/lib/moderation");
  if (detectOffsite(body))
    return { ok: false, message: "외부 거래 유도로 보이는 내용은 게시할 수 없어요." };

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 4) return { ok: false, message: "사진은 최대 4장까지예요." };
  const urls: string[] = [];
  const { processAndSaveImage } = await import("@/lib/images");
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) return { ok: false, message: "사진은 장당 8MB 이하로 올려주세요." };
    if (!file.type.startsWith("image/")) return { ok: false, message: "이미지 파일만 업로드할 수 있습니다." };
    try {
      urls.push(await processAndSaveImage(file));
    } catch (err) {
      console.error("[upload] 이미지 처리 실패:", err);
      return { ok: false, message: "이미지를 처리할 수 없어요." };
    }
  }

  // 내 경매 링크 (선택) — 내 경매만 연결 가능
  const auctionId = String(formData.get("auctionId") ?? "") || null;
  if (auctionId) {
    const mine = await prisma.auction.findFirst({
      where: { id: auctionId, item: { sellerId: user.id } },
    });
    if (!mine) return { ok: false, message: "내 경매만 연결할 수 있어요." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.post.create({
      data: {
        userId: user.id,
        body,
        auctionId,
        images: { create: urls.map((url, i) => ({ url, sortOrder: i })) },
      },
    });
    await awardDuckPower(tx, user.id, 3, "피드 포스트 작성");
  });
  revalidatePath("/feed");
  return { ok: true, message: "게시됐어요!" };
}

export async function togglePostLikeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/feed");
  const postId = String(formData.get("postId"));
  const key = { userId_postId: { userId: user.id, postId } };
  const existing = await prisma.postLike.findUnique({ where: key });
  if (existing) {
    await prisma.postLike.delete({ where: key });
  } else {
    await prisma.postLike.create({ data: { userId: user.id, postId } }).catch(() => {});
  }
  revalidatePath("/feed");
}

export async function deleteMyPostAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const postId = String(formData.get("postId"));
  await prisma.post.deleteMany({ where: { id: postId, userId: user.id } });
  revalidatePath("/feed");
}
