import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import InquiryForm from "@/components/InquiryForm";

export const metadata = { title: "1:1 문의" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/support");

  const inquiries = await prisma.inquiry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">1:1 문의</h1>
        <p className="mt-1 text-sm text-mauve">
          거래 중 문제는 해당 주문의 &lsquo;문제 신고&rsquo;가 빨라요. 그 외 궁금한 점을 남겨주세요.
        </p>
      </div>

      <InquiryForm />

      {inquiries.length > 0 && (
        <section>
          <h2 className="mb-3 font-display font-semibold">내 문의 내역</h2>
          <ul className="space-y-2">
            {inquiries.map((inq) => (
              <li key={inq.id} className="rounded-xl border border-line bg-card p-4 text-sm">
                <p className="font-semibold">
                  {inq.subject}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${inq.status === "ANSWERED" ? "bg-ok-soft text-ok" : "bg-blush text-mauve"}`}>
                    {inq.status === "ANSWERED" ? "답변 완료" : "답변 대기"}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink/70">{inq.body}</p>
                {inq.answer && (
                  <p className="mt-2 whitespace-pre-wrap border-l-2 border-duck pl-2 text-ink/80">
                    <span className="font-semibold text-bill">덕션 운영팀</span> — {inq.answer}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
