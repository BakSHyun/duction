import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import DuckBadge from "@/components/DuckBadge";
import { sanctionUserAction } from "../actions";

export const metadata = { title: "유저 관리" };
export const dynamic = "force-dynamic";

// 유저 관리 콘솔 (M21) — 검색 → 상태 확인 → 직접 제재
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) redirect("/");
  const { q = "" } = await searchParams;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { nickname: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      nickname: true,
      email: true,
      duckPower: true,
      penaltyLevel: true,
      suspendedUntil: true,
      salesCount: true,
      ratingAvg: true,
      ratingCount: true,
      isArtist: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">유저 관리</h1>
        <Link href="/admin" className="text-sm text-mauve hover:text-bill">← 운영 콘솔</Link>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="닉네임 또는 이메일 검색"
          className="w-72 rounded-lg border border-line-strong bg-card px-3 py-2 text-sm focus:border-bill focus:outline-none"
        />
        <button className="rounded-lg bg-duck px-4 py-2 text-sm font-bold text-ink hover:bg-duck-deep">검색</button>
      </form>

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={u.isArtist ? `/artists/${u.id}` : `/users/${u.id}`} className="font-bold hover:text-bill">
                {u.nickname}
              </Link>
              <DuckBadge power={u.duckPower} />
              {u.isAdmin && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">운영자</span>}
              {u.isArtist && <span className="rounded bg-wisteria-soft px-1.5 py-0.5 text-[11px] font-semibold text-wisteria">작가</span>}
              {u.penaltyLevel > 0 && (
                <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-bill-deep">
                  페널티 {u.penaltyLevel}단계{u.penaltyLevel >= 3 ? " (영구정지)" : u.suspendedUntil && u.suspendedUntil > new Date() ? " (정지 중)" : ""}
                </span>
              )}
              <span className="ml-auto text-xs text-mauve-light">
                {u.email} · 거래 {u.salesCount} · {u.ratingCount > 0 ? `★${u.ratingAvg.toFixed(1)}` : "평가없음"} · {new Date(u.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </div>
            {!u.isAdmin && (
              <form action={sanctionUserAction} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <select name="level" defaultValue="1" className="rounded-lg border border-line-strong px-2 py-1 text-xs">
                  <option value="1">1단계 경고</option>
                  <option value="2">2단계 7일 정지</option>
                  <option value="3">3단계 영구 정지 (경매 전체 취소)</option>
                </select>
                <button className="rounded-lg bg-duck px-3 py-1 text-xs font-bold text-ink hover:bg-duck-deep">제재 적용</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
