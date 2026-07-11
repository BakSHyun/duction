"use client";

import { useActionState, useState } from "react";
import { reviewAction, type ActionResult } from "@/app/actions";
import { REVIEW_TAGS } from "@/lib/constants";

export default function ReviewForm({ orderId, targetLabel }: { orderId: string; targetLabel: string }) {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(reviewAction, null);
  const [rating, setRating] = useState(5);

  if (state?.ok) {
    return <p className="rounded-lg bg-ok-soft p-2.5 text-xs font-medium text-ok">{state.message}</p>;
  }

  return (
    <form action={submit} className="space-y-2 rounded-lg bg-porcelain p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{targetLabel} 평가</span>
        <span className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`text-lg ${n <= rating ? "text-amber-400" : "text-mauve-light"}`}
              aria-label={`${n}점`}
            >
              ★
            </button>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {REVIEW_TAGS.map((t) => (
          <label key={t} className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="tags" value={t} className="accent-bill" /> {t}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          name="comment"
          maxLength={100}
          placeholder="한줄 후기 (선택)"
          className="flex-1 rounded-lg border border-line-strong px-2 py-1 text-xs"
        />
        <button disabled={pending} className="rounded-lg bg-duck px-3 py-1 text-xs font-bold text-ink disabled:opacity-50">
          {pending ? "등록 중…" : "등록"}
        </button>
      </div>
      {state?.message && !state.ok && (
        <p className="text-xs font-medium text-bill">{state.message}</p>
      )}
    </form>
  );
}
