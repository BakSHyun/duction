import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES } from "@/lib/guides";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.summary };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) notFound();

  const idx = GUIDES.findIndex((g) => g.slug === slug);
  const next = GUIDES[idx + 1];

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href="/guide" className="text-sm text-mauve hover:text-bill">
          ← 가이드
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-balance">{guide.title}</h1>
        <p className="mt-2 text-sm text-mauve">{guide.summary}</p>
      </div>

      {guide.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="mb-3 text-lg font-bold">{section.heading}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p.slice(0, 20)} className="mb-3 text-[15px] leading-relaxed text-ink/80">
              {p}
            </p>
          ))}
          {section.list && (
            <ul className="space-y-2">
              {section.list.map((item) => (
                <li key={item.slice(0, 20)} className="flex gap-2 text-[15px] leading-relaxed text-ink/80">
                  <span className="mt-0.5 shrink-0 text-bill">·</span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <div className="flex items-center justify-between border-t border-line pt-6">
        <Link href="/search" className="rounded-full bg-duck px-5 py-2 text-sm font-bold text-ink hover:bg-duck-deep">
          경매 둘러보기
        </Link>
        {next && (
          <Link href={`/guide/${next.slug}`} className="text-sm font-medium text-bill hover:underline">
            다음: {next.title} →
          </Link>
        )}
      </div>
    </article>
  );
}
