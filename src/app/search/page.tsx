import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";
import { AUCTION_STATUS, AUTHENTICITY, CONDITION_GRADES } from "@/lib/constants";
import AuctionCard from "@/components/AuctionCard";

export const metadata = { title: "경매 찾기" };

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "ending", label: "마감임박순" },
  { value: "newest", label: "신규등록순" },
  { value: "bids", label: "입찰많은순" },
  { value: "price_asc", label: "낮은가격순" },
  { value: "price_desc", label: "높은가격순" },
] as const;

const PAGE_SIZE = 24;

type Search = {
  q?: string;
  cat?: string;
  auth?: string;
  grade?: string | string[];
  status?: string;
  sort?: string;
  price_min?: string;
  price_max?: string;
  page?: string;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  await settleExpired();

  const q = (params.q ?? "").trim();
  const cat = params.cat ?? "";
  const auth = params.auth ?? "";
  const grades = [params.grade ?? []].flat();
  const status = params.status ?? "live";
  const sort = params.sort ?? "ending";
  const priceMin = Number(params.price_min) > 0 ? Number(params.price_min) : null;
  const priceMax = Number(params.price_max) > 0 ? Number(params.price_max) : null;
  const page = Math.max(1, Number(params.page) || 1);

  // 부모 카테고리 선택 시 하위 전체 포함
  const categories = await prisma.category.findMany({
    include: { children: true },
    orderBy: { sortOrder: "asc" },
  });
  let categoryIds: string[] | undefined;
  if (cat) {
    const selected = categories.find((c) => c.slug === cat);
    if (selected) {
      categoryIds = selected.children.length
        ? selected.children.map((c) => c.id)
        : [selected.id];
    }
  }

  const statusFilter =
    status === "ended"
      ? { in: [AUCTION_STATUS.ENDED_SOLD, AUCTION_STATUS.ENDED_UNSOLD] }
      : status === "all"
        ? { not: AUCTION_STATUS.CANCELLED }
        : { equals: AUCTION_STATUS.LIVE };

  const orderBy =
    sort === "newest"
      ? { createdAt: "desc" as const }
      : sort === "bids"
        ? { bidCount: "desc" as const }
        : sort === "price_asc"
          ? { currentPrice: "asc" as const }
          : sort === "price_desc"
            ? { currentPrice: "desc" as const }
            : { endsAt: "asc" as const };

  const where = {
    status: statusFilter,
    ...(priceMin || priceMax
      ? { currentPrice: { ...(priceMin && { gte: priceMin }), ...(priceMax && { lte: priceMax }) } }
      : {}),
    item: {
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      ...(auth && { authenticity: auth }),
      ...(grades.length > 0 && { conditionGrade: { in: grades } }),
      ...(q && {
        OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }],
      }),
    },
  };

  const [total, results, modelNames] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({
      where,
      orderBy,
      include: { item: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.blytheModel.findMany({ select: { name: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 페이지 링크 — 현재 필터를 유지한 채 page만 교체
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("cat", cat);
    if (auth) sp.set("auth", auth);
    for (const g of grades) sp.append("grade", g);
    if (status !== "live") sp.set("status", status);
    if (sort !== "ending") sp.set("sort", sort);
    if (priceMin) sp.set("price_min", String(priceMin));
    if (priceMax) sp.set("price_max", String(priceMax));
    if (p > 1) sp.set("page", String(p));
    return `/search?${sp.toString()}`;
  };

  const parents = categories.filter((c) => !c.parentId);
  const inputCls = "rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-semibold">
        {q ? <>&lsquo;{q}&rsquo; 검색 결과</> : "경매 찾기"}
        <span className="ml-2 num text-sm font-normal text-mauve-light">{total.toLocaleString()}건</span>
      </h1>

      <datalist id="model-suggestions">
        {modelNames.map((m) => (
          <option key={m.name} value={m.name} />
        ))}
      </datalist>

      {/* 필터 — 모든 상태가 URL에 담겨 공유 가능 */}
      <form method="get" className="space-y-3 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={q} list="model-suggestions" placeholder="키워드 · 모델명" className={`${inputCls} w-44`} />
          <input name="price_min" type="number" min={0} step={1000} defaultValue={priceMin ?? ""} placeholder="최소가" className={`${inputCls} num w-24`} />
          <span className="text-mauve-light">~</span>
          <input name="price_max" type="number" min={0} step={1000} defaultValue={priceMax ?? ""} placeholder="최대가" className={`${inputCls} num w-24`} />
          <select name="cat" defaultValue={cat} className={inputCls}>
            <option value="">전체 카테고리</option>
            {parents.map((p) => (
              <optgroup key={p.id} label={p.name}>
                <option value={p.slug}>{p.name} 전체</option>
                {p.children.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select name="auth" defaultValue={auth} className={inputCls}>
            <option value="">정품 구분 전체</option>
            {AUTHENTICITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={inputCls}>
            <option value="live">진행 중</option>
            <option value="ended">종료 (낙찰가 기록)</option>
            <option value="all">전체</option>
          </select>
          <select name="sort" defaultValue={sort} className={inputCls}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-mauve">상태 등급</span>
          {CONDITION_GRADES.map((g) => (
            <label key={g.value} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name="grade"
                value={g.value}
                defaultChecked={grades.includes(g.value)}
                className="accent-bill"
              />
              {g.label}
            </label>
          ))}
          <button className="ml-auto rounded-lg bg-duck px-4 py-1.5 text-sm font-bold text-ink hover:bg-duck-deep">
            필터 적용
          </button>
          <Link href="/search" className="text-sm text-mauve-light underline">
            초기화
          </Link>
        </div>
      </form>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-14 text-center">
          <p className="font-medium text-mauve">조건에 맞는 경매가 없어요</p>
          <Link href="/search" className="mt-2 inline-block text-sm font-semibold text-bill underline">
            필터 초기화
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 pt-2 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-line-strong bg-card px-4 py-1.5 font-medium hover:border-bill/40">
              ← 이전
            </Link>
          ) : (
            <span className="px-4 py-1.5 text-mauve-light">← 이전</span>
          )}
          <span className="num text-mauve">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-line-strong bg-card px-4 py-1.5 font-medium hover:border-bill/40">
              다음 →
            </Link>
          ) : (
            <span className="px-4 py-1.5 text-mauve-light">다음 →</span>
          )}
        </nav>
      )}
    </div>
  );
}
