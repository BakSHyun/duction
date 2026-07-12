import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "./actions";
import NotificationBell from "@/components/NotificationBell";
import NativePush from "@/components/NativePush";

export const viewport: Viewport = {
  themeColor: "#FFD400",
  viewportFit: "cover", // 앱 웹뷰·노치 대응 — safe-area는 globals.css
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "덕션 — 브라이스 경매", template: "%s | 덕션" },
  description: "브라이스 인형 수집가를 위한 안전한 경매 플랫폼. 입찰 기록 공개, 에스크로 안전거래.",
  openGraph: {
    siteName: "덕션",
    type: "website",
    locale: "ko_KR",
    title: "덕션 — 브라이스 경매",
    description: "좋아했던 마음까지, 제값에 이어지도록.",
    images: [{ url: "/og.png", width: 1536, height: 900, alt: "덕션 — 좋아했던 마음까지, 제값에 이어지도록." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "덕션 — 브라이스 경매",
    description: "좋아했던 마음까지, 제값에 이어지도록.",
    images: ["/og.png"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unreadCount = user
    ? await prisma.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;
  return (
    <html lang="ko">
      <body className="min-h-screen bg-porcelain text-ink antialiased">
        <NativePush isLoggedIn={!!user} />
        <header className="sticky top-0 z-20 border-b border-line/80 bg-[#fffef9]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <Link href="/" className="flex shrink-0 items-baseline gap-2">
              <svg viewBox="0 0 32 32" className="h-[26px] w-[26px] self-center" aria-hidden="true">
                <ellipse cx="16.5" cy="21.5" rx="11.5" ry="8" fill="#FFD400" />
                <circle cx="12" cy="10.5" r="7" fill="#FFD400" />
                <ellipse cx="21.5" cy="11.5" rx="4.8" ry="2.6" fill="#C96A0E" />
                <ellipse cx="17" cy="22" rx="4.5" ry="3" fill="#EFC000" />
                <circle cx="14.2" cy="8.6" r="1.5" fill="#26231C" />
              </svg>
              <span className="text-[22px] font-black tracking-[-0.04em] text-ink">덕션</span>
              <span className="hidden text-[11px] font-medium tracking-[0.15em] text-mauve-light md:inline">
                DUCTION · BLYTHE AUCTION
              </span>
            </Link>
            <form action="/search" className="hidden flex-1 sm:block sm:max-w-xs">
              <input
                name="q"
                placeholder="모델명, 키워드 검색"
                className="w-full rounded-full border border-line bg-white/80 px-4 py-2 text-sm shadow-sm transition placeholder:text-mauve-light hover:border-line-strong focus:border-bill focus:outline-none"
              />
            </form>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/search" className="font-medium hover:text-bill sm:hidden">
                검색
              </Link>
              <Link href="/feed" className="hidden font-medium hover:text-bill sm:block">
                피드
              </Link>
              <Link href="/models" className="hidden font-medium hover:text-bill sm:block">
                도감·시세
              </Link>
              <Link href="/artists" className="hidden font-medium hover:text-bill sm:block">
                작가
              </Link>
              <Link href="/guide" className="hidden font-medium hover:text-bill sm:block">
                가이드
              </Link>
              <Link
                href="/sell"
                className="rounded-full bg-ink px-4 py-2 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-bill"
              >
                판매하기
              </Link>
              {user ? (
                <>
                  {user.isAdmin && (
                    <Link href="/admin" className="font-semibold text-warn hover:text-warn">
                      운영
                    </Link>
                  )}
                  <NotificationBell initialCount={unreadCount} />
                  <Link href="/me" className="font-medium hover:text-bill">
                    {user.nickname}
                  </Link>
                  <form action={logoutAction}>
                    <button className="text-mauve hover:text-ink">로그아웃</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="font-medium hover:text-bill">
                    로그인
                  </Link>
                  <Link href="/register" className="text-mauve hover:text-ink">
                    회원가입
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mt-20 border-t border-line bg-blush/55">
          <div className="mx-auto max-w-6xl space-y-3 px-4 py-12 sm:px-6">
            <p className="text-sm font-bold text-ink">
              덕션{" "}
              <span className="text-xs font-normal text-mauve">
                아끼던 아이에게, 제값을 아는 새 집사를.
              </span>
            </p>
            <p className="space-x-3 text-xs">
              <a href="/guide" className="text-mauve hover:text-bill">이용 가이드</a>
              <a href="/guide/authenticity" className="text-mauve hover:text-bill">정품 구별법</a>
              <a href="/guide/safe-trade" className="text-mauve hover:text-bill">안전거래</a>
              <a href="/models" className="text-mauve hover:text-bill">모델 도감·시세</a>
              <a href="/notices" className="text-mauve hover:text-bill">공지사항</a>
              <a href="/support" className="text-mauve hover:text-bill">1:1 문의</a>
            </p>
            <p className="text-xs leading-relaxed text-mauve-light">
              덕션은 통신판매중개자이며 거래 당사자가 아닙니다 · 팩토리 제품을 정품으로 판매 시 영구
              이용 정지됩니다
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
