import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@duction-test.co" } },
    select: { id: true, email: true },
  });
  const ids = testUsers.map((u) => u.id);
  const items = await prisma.item.findMany({ where: { sellerId: { in: ids } }, include: { auction: true } });
  for (const item of items) {
    if (item.auction) {
      await prisma.bid.deleteMany({ where: { auctionId: item.auction.id } });
      await prisma.auctionQuestion.deleteMany({ where: { auctionId: item.auction.id } });
      await prisma.watchlist.deleteMany({ where: { auctionId: item.auction.id } });
      await prisma.order.deleteMany({ where: { auctionId: item.auction.id } });
      await prisma.auction.delete({ where: { id: item.auction.id } });
    }
    await prisma.item.delete({ where: { id: item.id } });
  }
  await prisma.bid.deleteMany({ where: { bidderId: { in: ids } } });
  const del = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`정리 완료: 테스트 유저 ${del.count}명, 테스트 경매 ${items.length}건 삭제`);
}
main().finally(() => prisma.$disconnect());
