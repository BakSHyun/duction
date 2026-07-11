"use client";

import { useActionState } from "react";
import {
  updateNicknameAction,
  changePasswordAction,
  deleteAccountAction,
  type ActionResult,
} from "@/app/actions";

const inputCls =
  "w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-sm focus:border-bill focus:outline-none";
const btnCls =
  "rounded-lg bg-duck px-4 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50";

function Message({ state }: { state: ActionResult | null }) {
  if (!state?.message) return null;
  return (
    <p className={`rounded-lg p-2.5 text-xs font-medium ${state.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
      {state.message}
    </p>
  );
}

export default function SettingsForms({ nickname }: { nickname: string }) {
  const [nickState, submitNick, nickPending] = useActionState<ActionResult | null, FormData>(updateNicknameAction, null);
  const [pwState, submitPw, pwPending] = useActionState<ActionResult | null, FormData>(changePasswordAction, null);
  const [delState, submitDel, delPending] = useActionState<ActionResult | null, FormData>(deleteAccountAction, null);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 font-bold">닉네임 변경</h2>
        <form action={submitNick} className="space-y-2">
          <input name="nickname" defaultValue={nickname} required minLength={2} maxLength={20} className={inputCls} />
          <Message state={nickState} />
          <button disabled={nickPending} className={btnCls}>변경</button>
        </form>
      </section>

      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 font-bold">비밀번호 변경</h2>
        <form action={submitPw} className="space-y-2">
          <input name="current" type="password" required placeholder="현재 비밀번호" className={inputCls} />
          <input name="next" type="password" required minLength={8} placeholder="새 비밀번호 (8자 이상)" className={inputCls} />
          <Message state={pwState} />
          <button disabled={pwPending} className={btnCls}>변경</button>
        </form>
      </section>

      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-1 font-bold text-bill-deep">회원 탈퇴</h2>
        <p className="mb-3 text-xs leading-relaxed text-mauve">
          진행 중인 경매·입찰·주문이 없어야 탈퇴할 수 있어요. 거래 기록과 낙찰가 히스토리는
          플랫폼 신뢰를 위해 익명화된 채 보존됩니다.
        </p>
        <form action={submitDel} className="space-y-2">
          <input name="confirm" required placeholder={`확인을 위해 닉네임(${nickname})을 입력`} className={inputCls} />
          <Message state={delState} />
          <button disabled={delPending} className="rounded-lg border border-bill px-4 py-2 text-sm font-bold text-bill-deep hover:bg-cream disabled:opacity-50">
            탈퇴하기
          </button>
        </form>
      </section>
    </div>
  );
}
