import { prisma } from "@/lib/prisma";

export const metadata = { title: "공지사항" };
export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const notices = await prisma.notice.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 30,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold">공지사항</h1>
      {notices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-mauve-light">
          아직 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-card p-5">
              <p className="font-bold">
                {n.pinned && <span className="mr-1.5 rounded bg-duck px-1.5 py-0.5 text-[11px] font-bold text-ink">중요</span>}
                {n.title}
                <span className="ml-2 text-xs font-normal text-mauve-light">
                  {new Date(n.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
