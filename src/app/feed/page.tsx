import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import DuckBadge from "@/components/DuckBadge";
import PostForm from "@/components/PostForm";
import { togglePostLikeAction, deleteMyPostAction } from "@/app/actions";

export const metadata = { title: "컬렉션 피드" };
export const dynamic = "force-dynamic";

// 컬렉션 자랑 피드 (M24) — 커뮤니티가 곧 리텐션
export default async function FeedPage() {
  const user = await getCurrentUser();

  const [posts, myAuctions] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        likes: { select: { userId: true } },
      },
    }),
    user
      ? prisma.auction.findMany({
          where: { item: { sellerId: user.id }, status: { in: ["LIVE", "SCHEDULED"] } },
          include: { item: { select: { title: true } } },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const authors = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(posts.map((p) => p.userId))] } },
        select: { id: true, nickname: true, duckPower: true, isArtist: true },
      })
    ).map((u) => [u.id, u]),
  );
  const linkedAuctions = new Map(
    (
      await prisma.auction.findMany({
        where: { id: { in: posts.map((p) => p.auctionId).filter((x): x is string => !!x) } },
        include: { item: { select: { title: true } } },
      })
    ).map((a) => [a.id, a]),
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">컬렉션 피드</h1>
        <p className="mt-1 text-sm text-mauve">아이들 자랑하는 곳. 경매를 연결하면 홍보도 돼요.</p>
      </div>

      {user ? (
        <PostForm
          myAuctions={myAuctions.map((a) => ({ id: a.id, title: a.item.title }))}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-mauve">
          <Link href="/login?next=/feed" className="font-semibold text-bill underline">로그인</Link>하고
          아이 자랑을 시작하세요.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-mauve-light">
          첫 자랑의 주인공이 되어보세요!
        </p>
      ) : (
        <ul className="space-y-4">
          {posts.map((post) => {
            const author = authors.get(post.userId);
            const liked = user ? post.likes.some((l) => l.userId === user.id) : false;
            const linked = post.auctionId ? linkedAuctions.get(post.auctionId) : null;
            return (
              <li key={post.id} className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="flex items-center gap-2 p-3">
                  <Link
                    href={author?.isArtist ? `/artists/${post.userId}` : `/users/${post.userId}`}
                    className="text-sm font-bold hover:text-bill"
                  >
                    {author?.nickname ?? "익명"}
                  </Link>
                  {author && <DuckBadge power={author.duckPower} showPower={false} />}
                  <span className="ml-auto text-xs text-mauve-light">
                    {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                  {user?.id === post.userId && (
                    <form action={deleteMyPostAction}>
                      <input type="hidden" name="postId" value={post.id} />
                      <button className="text-xs text-mauve-light hover:text-bill" aria-label="삭제">✕</button>
                    </form>
                  )}
                </div>

                {post.images.length > 0 && (
                  <div className={`grid gap-0.5 ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                    {post.images.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={img.id} src={img.url} alt="" className="aspect-square w-full object-cover" />
                    ))}
                  </div>
                )}

                <div className="space-y-2 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
                  {linked && (
                    <Link
                      href={`/auctions/${linked.id}`}
                      className="block rounded-lg border border-line bg-porcelain px-3 py-2 text-xs hover:border-bill/40"
                    >
                      🔗 {linked.item.title}
                      {linked.status === "LIVE" && (
                        <span className="num ml-2 font-bold text-bill">
                          {linked.currentPrice.toLocaleString()}원 경매 중
                        </span>
                      )}
                    </Link>
                  )}
                  <form action={togglePostLikeAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        liked ? "border-bill bg-cream text-bill" : "border-line-strong text-mauve hover:border-bill/40"
                      }`}
                    >
                      {liked ? "♥" : "♡"} {post.likes.length}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
