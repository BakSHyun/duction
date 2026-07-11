"use client";

import { useActionState, useState } from "react";
import { disputeOrderAction, type ActionResult } from "@/app/actions";

export default function DisputeButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    disputeOrderAction,
    null,
  );

  if (state?.ok) {
    return <p className="rounded-lg bg-warn-soft p-2.5 text-xs font-medium text-warn">{state.message}</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-mauve underline underline-offset-2 hover:text-warn"
      >
        받은 상품에 문제가 있나요?
      </button>
    );
  }

  return (
    <form action={submit} className="space-y-2 rounded-lg bg-warn-soft/60 p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-xs font-semibold text-warn">
        문제 신고 — 접수되면 구매확정이 잠기고 운영팀이 중재해요
      </p>
      <textarea
        name="reason"
        required
        minLength={10}
        rows={2}
        placeholder="설명과 다른 점, 하자 부위를 구체적으로 적어주세요 (10자 이상)"
        className="w-full rounded-lg border border-line-strong bg-card px-2 py-1.5 text-xs"
      />
      {state?.message && !state.ok && (
        <p className="text-xs font-medium text-bill-deep">{state.message}</p>
      )}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-lg bg-warn px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
          {pending ? "접수 중…" : "신고 접수"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-mauve underline">
          닫기
        </button>
      </div>
    </form>
  );
}
