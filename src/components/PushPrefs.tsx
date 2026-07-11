"use client";

import { useActionState } from "react";
import { savePushPrefsAction, type ActionResult } from "@/app/actions";

// 푸시로 받을 알림 유형 — 인앱 알림은 항상 쌓이고, 외부 발송(푸시)만 거른다
const PREF_TYPES = [
  { value: "OUTBID", label: "입찰이 밀렸을 때" },
  { value: "NEW_LISTING", label: "팔로우한 작가의 새 분양" },
  { value: "QUESTION", label: "내 경매에 질문" },
  { value: "ANSWER", label: "내 질문에 답변" },
  { value: "WATCHED_ENDING", label: "찜한 경매 마감 임박" },
] as const;

export default function PushPrefs({ optOut }: { optOut: string[] }) {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    savePushPrefsAction,
    null,
  );

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="mb-1 font-bold">푸시 알림 설정</h2>
      <p className="mb-3 text-xs text-mauve">
        끄더라도 알림함에는 쌓여요. 낙찰·결제·제재 등 돈이 걸린 알림은 끌 수 없어요.
      </p>
      <form action={submit} className="space-y-2">
        {PREF_TYPES.map((t) => (
          <label key={t.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value={t.value}
              defaultChecked={!optOut.includes(t.value)}
              className="accent-bill"
            />
            {t.label}
          </label>
        ))}
        {state?.message && (
          <p className={`rounded-lg p-2 text-xs font-medium ${state.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
            {state.message}
          </p>
        )}
        <button disabled={pending} className="rounded-lg bg-duck px-4 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50">
          저장
        </button>
      </form>
    </section>
  );
}
