import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DuckBadge from "@/components/DuckBadge";

export const metadata = { title: "커스텀 작가" };

export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const artists = await prisma.user.findMany({
    where: { isArtist: true },
    select: {
      id: true,
      nickname: true,
      artistVerified: true,
      artistBio: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      duckPower: true,
      _count: { select: { followers: true } },
    },
    orderBy: { followers: { _count: "desc" } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">커스텀 작가</h1>
          <p className="mt-1 text-sm text-mauve">
            팔로우하면 새 분양이 시작될 때 바로 알림을 받아요.
          </p>
        </div>
        <Link
          href="/artist/setup"
          className="shrink-0 rounded-full border border-bill px-4 py-1.5 text-sm font-semibold text-bill hover:bg-cream"
        >
          작가로 등록하기
        </Link>
      </div>

      {artists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-mauve-light">
          아직 등록된 작가가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {artists.map((a) => (
            <Link
              key={a.id}
              href={`/artists/${a.id}`}
              className="rounded-xl border border-line bg-card p-4 transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">
                  {a.nickname}
                  <span className="ml-1.5 rounded bg-wisteria-soft px-1.5 py-0.5 text-[11px] font-semibold text-wisteria">
                    작가
                  </span>
                  {a.artistVerified && (
                    <span className="ml-1 rounded bg-verdigris-soft px-1.5 py-0.5 text-[11px] font-semibold text-verdigris">
                      인증 ✓
                    </span>
                  )}
                </p>
                <p className="text-sm text-mauve">팔로워 {a._count.followers}</p>
              </div>
              {a.artistBio && (
                <p className="mt-2 line-clamp-2 text-sm text-ink/70">{a.artistBio}</p>
              )}
              <p className="mt-2 flex items-center gap-2 text-xs text-mauve-light">
                <DuckBadge power={a.duckPower} />
                거래 {a.salesCount}회 · {a.ratingCount > 0 ? `평점 ${a.ratingAvg.toFixed(1)}` : "평가 없음"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
