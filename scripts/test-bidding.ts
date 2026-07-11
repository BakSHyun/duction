// 입찰 엔진 시나리오 테스트 — 임시 경매를 만들어 검증 후 삭제
import { PrismaClient } from "@prisma/client";
import { placeBid, buyNow, cancelBid, settleExpired } from "../src/lib/bidding";
import { notifyFollowersOfNewListing } from "../src/lib/artists";
import { createReview } from "../src/lib/reviews";
import { disputeOrder, resolveDispute } from "../src/lib/orders";
import { sendPendingPushes } from "../src/lib/push";

const prisma = new PrismaClient();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function main() {
  const users = await prisma.user.findMany({ take: 3, orderBy: { createdAt: "asc" } });
  const [seller, alice, bob] = users;
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "neo" } });

  // 테스트가 유저 페널티를 건드리므로 원상복구용 스냅샷
  const aliceSnapshot = await prisma.user.findUniqueOrThrow({
    where: { id: alice.id },
    select: { penaltyLevel: true, suspendedUntil: true },
  });

  const makeAuction = async (opts: {
    startPrice: number;
    buyNowPrice?: number;
    reservePrice?: number;
    endsInMs: number;
    startsInMs?: number; // 지정 시 SCHEDULED 예약 경매
  }) => {
    const item = await prisma.item.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: "TEST",
        description: "TEST",
        conditionGrade: "B",
        auction: {
          create: {
            startPrice: opts.startPrice,
            currentPrice: opts.startPrice,
            buyNowPrice: opts.buyNowPrice,
            reservePrice: opts.reservePrice,
            startsAt: opts.startsInMs ? new Date(Date.now() + opts.startsInMs) : undefined,
            endsAt: new Date(Date.now() + opts.endsInMs),
            status: opts.startsInMs ? "SCHEDULED" : "LIVE",
          },
        },
      },
      include: { auction: true },
    });
    return item.auction!;
  };

  // --- 시나리오 1: 첫 입찰은 시작가로 시작 ---
  const a = await makeAuction({ startPrice: 50_000, endsInMs: 3600_000 });
  let r = await placeBid(a.id, alice.id, 100_000);
  assert(r.currentPrice === 50_000 && r.isLeading, "첫 입찰 → 현재가 = 시작가(50,000), 리더");

  // --- 시나리오 2: 낮은 최대가로 도전 → 리더 유지, 현재가만 상승 ---
  r = await placeBid(a.id, bob.id, 70_000);
  // bob 70,000 <= alice 100,000 → alice 유지, 현재가 = min(100000, 70000+5000) = 75,000
  assert(!r.isLeading, "낮은 최대가 도전 → 리더 아님");
  assert(r.currentPrice === 75_000, `현재가 자동 경쟁 = 75,000 (실제 ${r.currentPrice})`);

  // --- 시나리오 3: 리더 최대가 초과 → 리더 교체 ---
  r = await placeBid(a.id, bob.id, 150_000);
  // bob 150,000 > alice 100,000 → bob 리더, 현재가 = min(150000, 100000+5000) = 105,000
  assert(r.isLeading, "최대가 초과 → 리더 교체");
  assert(r.currentPrice === 105_000, `현재가 = 105,000 (실제 ${r.currentPrice})`);

  // --- 시나리오 3.5: 리더 교체 시 이전 리더에게 OUTBID 알림 ---
  const outbidNotif = await prisma.notification.findFirst({
    where: { userId: alice.id, type: "OUTBID" },
    orderBy: { createdAt: "desc" },
  });
  assert(!!outbidNotif, "리더 교체 → 이전 리더 OUTBID 알림 생성");

  // --- 시나리오 4: 본인 경매 입찰 차단 ---
  let blocked = false;
  try { await placeBid(a.id, seller.id, 200_000); } catch { blocked = true; }
  assert(blocked, "판매자 본인 입찰 차단");

  // --- 시나리오 5: 최소 입찰가 미달 거부 ---
  blocked = false;
  try { await placeBid(a.id, alice.id, 105_000); } catch { blocked = true; }
  assert(blocked, "최소 입찰가(현재가+단위) 미달 거부");

  // --- 시나리오 6: soft-close — 마감 5분 전 입찰 시 연장 ---
  const b = await makeAuction({ startPrice: 10_000, endsInMs: 2 * 60_000 }); // 2분 남음
  r = await placeBid(b.id, alice.id, 20_000);
  assert(r.extended, "마감 2분 전 입찰 → soft-close 연장");
  const bAfter = await prisma.auction.findUniqueOrThrow({ where: { id: b.id } });
  const remaining = bAfter.endsAt.getTime() - Date.now();
  assert(remaining > 4 * 60_000 && bAfter.extendedCount === 1, `연장 후 잔여 ${Math.round(remaining / 1000)}초, extendedCount=1`);

  // --- 시나리오 7: 즉시구매 → 경매 종료 + 주문 생성 + 기존 입찰 OUTBID ---
  const c = await makeAuction({ startPrice: 30_000, buyNowPrice: 100_000, endsInMs: 3600_000 });
  await placeBid(c.id, alice.id, 40_000);
  const order = await buyNow(c.id, bob.id);
  assert(order.amount === 100_000 && order.fee === 6_000, "즉구 주문: 금액 100,000 / 수수료 6,000 (6%)");
  const cAfter = await prisma.auction.findUniqueOrThrow({ where: { id: c.id } });
  assert(cAfter.status === "ENDED_SOLD" && cAfter.winnerId === bob.id, "즉구 → ENDED_SOLD, 낙찰자 지정");
  const aliceBid = await prisma.bid.findFirstOrThrow({ where: { auctionId: c.id, bidderId: alice.id } });
  assert(aliceBid.status === "OUTBID", "기존 입찰 OUTBID 처리");
  const wonNotif = await prisma.notification.findFirst({ where: { userId: bob.id, type: "WON" } });
  const soldNotif = await prisma.notification.findFirst({ where: { userId: seller.id, type: "SOLD" } });
  assert(!!wonNotif && !!soldNotif, "즉구 → 낙찰자 WON + 판매자 SOLD 알림 생성");

  // --- 시나리오 8: 작가 팔로우 → 신규 분양 알림 (M5) ---
  await prisma.artistFollow.upsert({
    where: { followerId_artistId: { followerId: alice.id, artistId: seller.id } },
    update: {},
    create: { followerId: alice.id, artistId: seller.id },
  });
  const notified = await notifyFollowersOfNewListing(seller.id, "테스트 분양", a.id);
  assert(notified >= 1, `작가 신규 등록 → 팔로워 ${notified}명에게 알림`);
  const newListingNotif = await prisma.notification.findFirst({
    where: { userId: alice.id, type: "NEW_LISTING" },
  });
  assert(!!newListingNotif && newListingNotif.link === `/auctions/${a.id}`, "NEW_LISTING 알림 내용·링크 정확");
  await prisma.artistFollow.delete({
    where: { followerId_artistId: { followerId: alice.id, artistId: seller.id } },
  });

  // --- 시나리오 9: Reserve price 미달 → 유찰 (M7) ---
  const d = await makeAuction({ startPrice: 10_000, reservePrice: 50_000, endsInMs: 3600_000 });
  await placeBid(d.id, alice.id, 20_000); // 현재가 10,000 < reserve 50,000
  await prisma.auction.update({ where: { id: d.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await settleExpired();
  const dAfter = await prisma.auction.findUniqueOrThrow({ where: { id: d.id } });
  assert(dAfter.status === "ENDED_UNSOLD", "reserve 미달 마감 → 유찰");
  const reserveNotif = await prisma.notification.findFirst({
    where: { userId: alice.id, type: "RESERVE_NOT_MET" },
  });
  assert(!!reserveNotif, "최고 입찰자에게 RESERVE_NOT_MET 알림");

  // --- 시나리오 10: 미결제 → 차순위 승계 (M7) ---
  const e = await makeAuction({ startPrice: 10_000, endsInMs: 3600_000 });
  await placeBid(e.id, alice.id, 30_000); // alice 리더
  await placeBid(e.id, bob.id, 20_000); // bob 차순위 (본인 응찰가 20,000 기록)
  await prisma.auction.update({ where: { id: e.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await settleExpired(); // alice 낙찰, 주문 생성
  const order1 = await prisma.order.findFirstOrThrow({ where: { auctionId: e.id, buyerId: alice.id } });
  await prisma.order.update({ where: { id: order1.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
  await settleExpired(); // 미결제 처리 → 페널티 + 차순위 승계
  const aliceAfter = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
  assert(aliceAfter.penaltyLevel === aliceSnapshot.penaltyLevel + 1, "미결제 낙찰자 페널티 +1");
  const sc = await prisma.order.findFirstOrThrow({ where: { auctionId: e.id, buyerId: bob.id } });
  assert(sc.isSecondChance && sc.amount === 20_000, `차순위 승계 주문 생성 (본인 응찰가 ${sc.amount.toLocaleString()}원)`);
  const scNotif = await prisma.notification.findFirst({ where: { userId: bob.id, type: "SECOND_CHANCE" } });
  assert(!!scNotif, "차순위에게 SECOND_CHANCE 알림");

  // 승계 주문도 미결제 → 페널티 없음 + 재승계 없음
  const bobBefore = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
  await prisma.order.update({ where: { id: sc.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
  await settleExpired();
  const bobAfter = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
  const scAfter = await prisma.order.findUniqueOrThrow({ where: { id: sc.id } });
  const orderCount = await prisma.order.count({ where: { auctionId: e.id } });
  assert(
    scAfter.status === "CANCELLED" && bobAfter.penaltyLevel === bobBefore.penaltyLevel && orderCount === 2,
    "승계 미결제 → 페널티 없음, 재승계 없음",
  );

  // --- 시나리오 11: 예약 경매 — 시작 전 입찰 차단 + 자동 시작 (M8) ---
  const f = await makeAuction({ startPrice: 10_000, endsInMs: 7200_000, startsInMs: 3600_000 });
  blocked = false;
  try { await placeBid(f.id, alice.id, 20_000); } catch { blocked = true; }
  assert(blocked, "SCHEDULED 경매 시작 전 입찰 차단");
  await prisma.auction.update({ where: { id: f.id }, data: { startsAt: new Date(Date.now() - 1000) } });
  await settleExpired();
  const fAfter = await prisma.auction.findUniqueOrThrow({ where: { id: f.id } });
  assert(fAfter.status === "LIVE", "시작 시각 도달 → 자동 LIVE 전환");
  r = await placeBid(f.id, alice.id, 20_000);
  assert(r.isLeading, "LIVE 전환 후 입찰 정상 동작");

  // --- 시나리오 12: 상호 평가 → 평점 집계 (M9) ---
  // 시나리오 7의 즉구 주문(경매 c, 구매자 bob)을 구매확정으로 전환해 평가
  const cOrder = await prisma.order.findFirstOrThrow({ where: { auctionId: c.id } });
  await prisma.order.update({ where: { id: cOrder.id }, data: { status: "CONFIRMED" } });
  const sellerBefore = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
  await createReview(cOrder.id, bob.id, 5, ["설명과 일치해요"], "포장 최고!");
  const sellerAfter = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
  const expectedAvg =
    (sellerBefore.ratingAvg * sellerBefore.ratingCount + 5) / (sellerBefore.ratingCount + 1);
  assert(
    sellerAfter.ratingCount === sellerBefore.ratingCount + 1 &&
      Math.abs(sellerAfter.ratingAvg - expectedAvg) < 1e-9,
    `평가 → 평점 집계 갱신 (${sellerAfter.ratingAvg.toFixed(2)} / ${sellerAfter.ratingCount}건)`,
  );
  blocked = false;
  try { await createReview(cOrder.id, bob.id, 4, [], ""); } catch { blocked = true; }
  assert(blocked, "동일 주문 중복 평가 차단");
  blocked = false;
  try { await createReview(cOrder.id, alice.id, 1, [], ""); } catch { blocked = true; }
  assert(blocked, "거래 당사자 아닌 유저 평가 차단");
  // 평점 원복 + 리뷰 삭제
  await prisma.review.deleteMany({ where: { orderId: cOrder.id } });
  await prisma.user.update({
    where: { id: seller.id },
    data: { ratingAvg: sellerBefore.ratingAvg, ratingCount: sellerBefore.ratingCount },
  });

  // --- 시나리오 13: 분쟁 신고 → 중재 (M12) ---
  // 시나리오 12에서 CONFIRMED로 만든 주문을 SHIPPED로 되돌려 분쟁 흐름 검증
  await prisma.order.update({ where: { id: cOrder.id }, data: { status: "SHIPPED" } });
  await disputeOrder(cOrder.id, bob.id, "설명과 달리 페이스에 기스가 있습니다.");
  let cOrderNow = await prisma.order.findUniqueOrThrow({ where: { id: cOrder.id } });
  assert(cOrderNow.status === "DISPUTED" && !!cOrderNow.disputeReason, "분쟁 신고 → DISPUTED + 사유 저장");
  const disputeNotif = await prisma.notification.findFirst({
    where: { userId: seller.id, type: "DISPUTE_OPENED" },
  });
  assert(!!disputeNotif, "판매자에게 분쟁 접수 알림");
  // 기각 → SHIPPED 복귀
  await resolveDispute(cOrder.id, "dismiss");
  cOrderNow = await prisma.order.findUniqueOrThrow({ where: { id: cOrder.id } });
  assert(cOrderNow.status === "SHIPPED", "기각 → 배송 중 복귀 (재확정 가능)");
  // 다시 신고 → 환불
  await disputeOrder(cOrder.id, bob.id, "재검수해도 하자가 명확합니다. 환불 원합니다.");
  await resolveDispute(cOrder.id, "refund");
  cOrderNow = await prisma.order.findUniqueOrThrow({ where: { id: cOrder.id } });
  assert(cOrderNow.status === "REFUNDED", "환불 처리 → REFUNDED");

  // --- 시나리오 14: 웹푸시 파이프라인 (M13) ---
  // 도달 불가 endpoint 구독 → 발송 시도 후 알림이 pushedAt 마킹되는지 (재시도 폭풍 방지)
  await prisma.pushSubscription.create({
    data: { userId: bob.id, endpoint: "https://127.0.0.1:1/dead-endpoint", p256dh: "BPdummykey", auth: "dummyauth" },
  });
  const pushNotif = await prisma.notification.create({
    data: { userId: bob.id, type: "OUTBID", title: "푸시 테스트", link: "/" },
  });
  await sendPendingPushes();
  const pushed = await prisma.notification.findUniqueOrThrow({ where: { id: pushNotif.id } });
  assert(!!pushed.pushedAt, "발송 시도 후 pushedAt 마킹 (실패해도 재시도 폭풍 없음)");
  const unpushedCount = await prisma.notification.count({ where: { pushedAt: null, userId: bob.id } });
  assert(unpushedCount === 0, "미발송 큐 소진");
  await prisma.pushSubscription.deleteMany({ where: { userId: bob.id } });

  // --- 시나리오 15: 덕력 시스템 (M14) ---
  // 입찰 +2가 적립되고, 로그 합계 == duckPower 불변식이 유지되는지
  const bobPowerBefore = (await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).duckPower;
  const g = await makeAuction({ startPrice: 10_000, endsInMs: 3600_000 });
  await placeBid(g.id, bob.id, 15_000);
  const bobPowerAfter = (await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).duckPower;
  assert(bobPowerAfter === bobPowerBefore + 2, `입찰 → 덕력 +2 (${bobPowerBefore} → ${bobPowerAfter})`);
  const logSum = await prisma.duckPowerLog.aggregate({
    where: { userId: bob.id },
    _sum: { amount: true },
  });
  assert((logSum._sum.amount ?? 0) === bobPowerAfter, "덕력 로그 합계 == duckPower (불변식)");
  // 미결제 -100 검증: 시나리오 10에서 alice가 -100을 받았는지 로그 확인
  const unpaidLog = await prisma.duckPowerLog.findFirst({
    where: { userId: alice.id, reason: "낙찰 후 미결제 파기" },
  });
  assert(!!unpaidLog && unpaidLog.amount === -100, "미결제 파기 → 덕력 -100 로그");

  // --- 시나리오 16: 발송 7일 경과 자동 구매확정 (M16) ---
  const sellerSalesBefore = (await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).salesCount;
  const h = await makeAuction({ startPrice: 10_000, buyNowPrice: 30_000, endsInMs: 3600_000 });
  const hOrder = await buyNow(h.id, bob.id);
  await prisma.order.update({
    where: { id: hOrder.id },
    data: { status: "SHIPPED", updatedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
  });
  await settleExpired(); // 하우스키핑에서 자동확정
  const hOrderAfter = await prisma.order.findUniqueOrThrow({ where: { id: hOrder.id } });
  assert(hOrderAfter.status === "CONFIRMED", "발송 7일 경과 → 자동 구매확정");
  const autoNotif = await prisma.notification.findFirst({
    where: { userId: bob.id, type: "CONFIRMED" },
  });
  assert(!!autoNotif, "자동확정 알림 발송");
  const sellerSalesAfter = (await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).salesCount;
  assert(sellerSalesAfter === sellerSalesBefore + 1, "자동확정 → 판매자 거래 횟수 +1");
  await prisma.user.update({ where: { id: seller.id }, data: { salesCount: sellerSalesBefore } });

  // --- 시나리오 17: 입찰 취소 → 차순위 복원 (M22) ---
  const i2 = await makeAuction({ startPrice: 10_000, endsInMs: 7200_000 });
  await placeBid(i2.id, alice.id, 30_000); // alice 리더 (10,000)
  await placeBid(i2.id, bob.id, 50_000); // bob 리더 교체 (31,000)
  const cancelRes = await cancelBid(i2.id, bob.id);
  const i2After = await prisma.auction.findUniqueOrThrow({ where: { id: i2.id } });
  const aliceRestored = await prisma.bid.findFirst({
    where: { auctionId: i2.id, bidderId: alice.id, status: "ACTIVE" },
  });
  assert(!!aliceRestored, "입찰 취소 → 차순위(alice) 리더 복원");
  assert(cancelRes.currentPrice === aliceRestored!.amount && i2After.currentPrice === aliceRestored!.amount,
    `취소 후 현재가 = 차순위 표시가 (${i2After.currentPrice.toLocaleString()})`);
  blocked = false;
  try { await cancelBid(i2.id, alice.id); } catch { blocked = true; }
  // alice는 취소 이력이 없으므로 취소 가능해야 함 → blocked=false 확인 후 재취소 이력 검증
  assert(!blocked, "취소 이력 없는 유저는 취소 가능");
  blocked = false;
  await placeBid(i2.id, bob.id, 20_000);
  try { await cancelBid(i2.id, bob.id); } catch { blocked = true; }
  assert(blocked, "경매당 1회 취소 제한 (bob 재취소 차단)");

  // --- 시나리오 18: 찜 마감 임박 알림 (M22) ---
  const j = await makeAuction({ startPrice: 10_000, endsInMs: 30 * 60_000 }); // 30분 후 마감
  await prisma.watchlist.create({ data: { userId: alice.id, auctionId: j.id } });
  await settleExpired();
  const endingNotif = await prisma.notification.findFirst({
    where: { userId: alice.id, type: "WATCHED_ENDING" },
  });
  const jAfter = await prisma.auction.findUniqueOrThrow({ where: { id: j.id } });
  assert(!!endingNotif && !!jAfter.endingSoonNotifiedAt, "찜한 경매 마감 1시간 전 → 알림 + 중복방지 마킹");
  await prisma.watchlist.delete({ where: { userId_auctionId: { userId: alice.id, auctionId: j.id } } });

  // --- 시나리오 19: 구매확정 → 정산 장부 생성 (M21) ---
  const settlement = await prisma.settlement.findFirst({ where: { orderId: hOrder.id } });
  assert(!!settlement && settlement.amount === hOrder.amount - hOrder.fee,
    `자동확정 → 정산 대기 생성 (정산액 ${settlement?.amount.toLocaleString()}원)`);
  await prisma.settlement.deleteMany({ where: { orderId: hOrder.id } });

  // --- 정리: 테스트 데이터 삭제 + 유저 상태 복구 ---
  await prisma.user.update({
    where: { id: alice.id },
    data: { penaltyLevel: aliceSnapshot.penaltyLevel, suspendedUntil: aliceSnapshot.suspendedUntil },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [alice.id, bob.id, seller.id] } },
  });
  for (const auc of [a, b, c, d, e, f, g, h, i2, j]) {
    await prisma.order.deleteMany({ where: { auctionId: auc.id } });
    await prisma.bid.deleteMany({ where: { auctionId: auc.id } });
    const full = await prisma.auction.findUniqueOrThrow({ where: { id: auc.id } });
    await prisma.auction.delete({ where: { id: auc.id } });
    await prisma.item.delete({ where: { id: full.itemId } });
  }
  console.log("\n모든 시나리오 통과, 테스트 데이터 정리 완료");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
