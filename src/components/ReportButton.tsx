"use client";

import { useActionState, useState } from "react";
import { reportAction, type ActionResult } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/constants";

export default function ReportButton({ auctionId }: { auctionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(reportAction, null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-mauve-light underline underline-offset-2 hover:text-bill">
        이 경매 신고하기
      </button>
    );
  }

  return (
    <form action={submit} className="space-y-2 rounded-xl border border-line bg-card p-4 text-sm">
      <p className="font-semibold">경매 신고</p>
      <input type="hidden" name="auctionId" value={auctionId} />
      <select name="reason" required className="w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm">
        <option value="">사유 선택</option>
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <textarea
        name="detail"
        rows={2}
        placeholder="상세 내용 (선택)"
        className="w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm"
      />
      {state?.message && (
        <p className={`rounded-lg p-2 text-xs font-medium ${state.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-lg bg-duck px-4 py-1.5 text-xs font-bold text-ink disabled:opacity-50">
          {pending ? "접수 중…" : "신고 접수"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-mauve-light underline">
          닫기
        </button>
      </div>
    </form>
  );
}
