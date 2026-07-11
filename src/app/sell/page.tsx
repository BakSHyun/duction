import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import SellForm from "@/components/SellForm";

export const metadata = { title: "경매 등록" };

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/sell");

  const [categories, models] = await Promise.all([
    prisma.category.findMany({
      where: { children: { none: {} } }, // 말단 카테고리만 선택 가능
      include: { parent: true },
      orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.blytheModel.findMany({ orderBy: [{ line: "asc" }, { releaseYear: "asc" }] }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-2xl font-semibold">경매 등록</h1>
      <p className="mb-6 text-sm text-mauve">
        정확한 상태 기재와 인증샷이 빠른 낙찰의 지름길이에요.
      </p>
      <SellForm
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentName: c.parent?.name ?? null,
        }))}
        models={models.map((m) => ({
          id: m.id,
          name: m.name,
          line: m.line,
          releaseYear: m.releaseYear,
        }))}
      />
    </div>
  );
}
