"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="font-display text-2xl font-semibold">잠시 문제가 생겼어요</h1>
      <p className="mt-2 text-sm text-mauve">
        일시적인 오류예요. 다시 시도해도 반복되면 잠시 후에 들러주세요 — 입찰·결제 기록은 안전하게
        보관되고 있어요.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-duck px-5 py-2 text-sm font-bold text-ink hover:bg-duck-deep"
      >
        다시 시도
      </button>
    </div>
  );
}
