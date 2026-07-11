import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <svg viewBox="0 0 32 32" className="mx-auto h-16 w-16 opacity-60" aria-hidden="true">
        <ellipse cx="16.5" cy="21.5" rx="11.5" ry="8" fill="#FFD400" />
        <circle cx="12" cy="10.5" r="7" fill="#FFD400" />
        <ellipse cx="21.5" cy="11.5" rx="4.8" ry="2.6" fill="#C96A0E" />
        <circle cx="14.2" cy="8.6" r="1.5" fill="#26231C" />
      </svg>
      <h1 className="mt-4 font-display text-2xl font-semibold">페이지가 헤엄쳐 갔어요</h1>
      <p className="mt-2 text-sm text-mauve">
        주소가 바뀌었거나 삭제된 경매일 수 있어요. 종료된 경매는 낙찰 기록에서 찾을 수 있습니다.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="rounded-full bg-duck px-5 py-2 text-sm font-bold text-ink hover:bg-duck-deep">
          홈으로
        </Link>
        <Link href="/search?status=ended" className="rounded-full border border-line-strong bg-card px-5 py-2 text-sm font-semibold hover:border-bill/40">
          낙찰 기록 보기
        </Link>
      </div>
    </div>
  );
}
