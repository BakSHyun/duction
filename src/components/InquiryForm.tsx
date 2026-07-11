"use client";

import { useActionState } from "react";
import { createInquiryAction, type ActionResult } from "@/app/actions";

export default function InquiryForm() {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    createInquiryAction,
    null,
  );

  if (state?.ok) {
    return <p className="rounded-lg bg-ok-soft p-3 text-sm font-medium text-ok">{state.message}</p>;
  }

  return (
    <form action={submit} className="space-y-2 rounded-xl border border-line bg-card p-4">
      <input name="subject" required minLength={2} placeholder="제목" className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none" />
      <textarea name="body" required minLength={10} rows={4} placeholder="내용 (10자 이상)" className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none" />
      {state?.message && !state.ok && (
        <p className="rounded-lg bg-cream p-2 text-xs font-medium text-bill-deep">{state.message}</p>
      )}
      <button disabled={pending} className="rounded-lg bg-duck px-4 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50">
        {pending ? "접수 중…" : "문의 접수"}
      </button>
    </form>
  );
}
