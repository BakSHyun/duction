import { prisma } from "./prisma";

/**
 * 작가가 새 경매를 열면 팔로워 전원에게 알림 — M5의 킬러 루프.
 * 트위터 선착순 분양을 "팔로우 → 알림 → 입찰"로 대체한다.
 */
export async function notifyFollowersOfNewListing(
  artistId: string,
  itemTitle: string,
  auctionId: string,
) {
  const [artist, followers] = await Promise.all([
    prisma.user.findUnique({ where: { id: artistId }, select: { nickname: true } }),
    prisma.artistFollow.findMany({ where: { artistId }, select: { followerId: true } }),
  ]);
  if (!artist || followers.length === 0) return 0;

  await prisma.notification.createMany({
    data: followers.map((f) => ({
      userId: f.followerId,
      type: "NEW_LISTING",
      title: `${artist.nickname} 새 분양이 시작됐어요`,
      body: itemTitle,
      link: `/auctions/${auctionId}`,
    })),
  });
  return followers.length;
}
