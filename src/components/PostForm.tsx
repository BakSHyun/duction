"use client";

import { useActionState } from "react";
import { createPostAction, type ActionResult } from "@/app/actions";

type MyAuction = { id: string; title: string };

export default function PostForm({ myAuctions }: { myAuctions: MyAuction[] }) {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    createPostAction,
    null,
  );

  return (
    <form action={submit} className="space-y-2 rounded-xl border border-line bg-card p-4">
      <textarea
        name="body"
        required
        minLength={5}
        rows={3}
        placeholder="우리 아이 자랑해주세요 — 새로 온 아이, 커스텀 근황, 오늘의 코디…"
        className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="images" accept="image/*" multiple className="flex-1 text-xs" />
        {myAuctions.length > 0 && (
          <select name="auctionId" className="rounded-lg border border-line-strong px-2 py-1.5 text-xs">
            <option value="">경매 연결 안 함</option>
            {myAuctions.map((a) => (
              <option key={a.id} value={a.id}>
                🔗 {a.title.slice(0, 30)}
              </option>
            ))}
          </select>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-duck px-5 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50"
        >
          {pending ? "게시 중…" : "게시"}
        </button>
      </div>
      {state?.message && (
        <p className={`rounded-lg p-2 text-xs font-medium ${state.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
