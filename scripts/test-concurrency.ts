/**
 * 동시 입찰 직렬화 검증 — ARCHITECTURE.md §5-1
 * 10명이 서로 다른 최대가로 "동시에" 입찰해도 FOR UPDATE 락 덕분에
 * 최종 상태가 순차 실행과 동일해야 한다 (lost update 없음).
 */
import { PrismaClient } from "@prisma/client";
import { placeBid } from "../src/lib/bidding";

const prisma = new PrismaClient();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function main() {
  const seller = await prisma.user.findFirstOrThrow({ where: { email: "seller@duction.kr" } });
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "neo" } });

  // 임시 입찰자 10명
  const bidders = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `stress${i}@test.local` },
        update: {},
        create: { email: `stress${i}@test.local`, nickname: `스트레스${i}`, passwordHash: "x" },
      }),
    ),
  );

  const item = await prisma.item.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: "CONCURRENCY-TEST",
      description: "t",
      conditionGrade: "B",
      auction: {
        create: { startPrice: 10_000, currentPrice: 10_000, endsAt: new Date(Date.now() + 3600_000) },
      },
    },
    include: { auction: true },
  });
  const auctionId = item.auction!.id;

  // 10명이 10,000 ~ 100,000원의 최대가로 동시 입찰
  const results = await Promise.allSettled(
    bidders.map((b, i) => placeBid(auctionId, b.id, (i + 1) * 10_000)),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.length - succeeded;
  console.log(`동시 입찰 10건 → 성공 ${succeeded} / 거절(최소가 미달) ${rejected}`);

  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  const activeBids = await prisma.bid.findMany({ where: { auctionId, status: "ACTIVE" } });
  const bidRows = await prisma.bid.count({ where: { auctionId } });

  // 불변식 검증
  assert(activeBids.length === 1, "최고 입찰자는 정확히 1명");
  assert(activeBids[0].maxProxyAmount === 100_000, "최대가 제출자(100,000)가 리더");
  // 차상위 최대가 90,000 → 현재가 = min(100000, 90000 + 5000) = 95,000
  assert(auction.currentPrice === 95_000, `현재가 = 95,000 (실제 ${auction.currentPrice.toLocaleString()})`);
  assert(auction.bidCount === bidRows, `bidCount(${auction.bidCount}) == 실제 입찰 행 수(${bidRows}) — lost update 없음`);

  // 정리
  await prisma.notification.deleteMany({ where: { userId: { in: bidders.map((b) => b.id) } } });
  await prisma.bid.deleteMany({ where: { auctionId } });
  await prisma.auction.delete({ where: { id: auctionId } });
  await prisma.item.delete({ where: { id: item.id } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  console.log("\n동시성 검증 통과, 테스트 데이터 정리 완료");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
