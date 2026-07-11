"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, registerAction, type ActionResult } from "@/app/actions";

const inputCls =
  "w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const next = useSearchParams().get("next") ?? "";

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="mb-6 text-center text-2xl font-bold">
        {mode === "login" ? "로그인" : "회원가입"}
      </h1>
      <form action={submit} className="space-y-3">
        {mode === "login" && next && <input type="hidden" name="next" value={next} />}
        {mode === "register" && (
          <input name="nickname" required minLength={2} maxLength={20} placeholder="닉네임" className={inputCls} />
        )}
        <input name="email" type="email" required placeholder="이메일" className={inputCls} />
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          placeholder={mode === "register" ? "비밀번호 (8자 이상)" : "비밀번호"}
          className={inputCls}
        />
        {state?.message && !state.ok && (
          <p className="rounded-lg bg-cream p-3 text-sm font-medium text-bill-deep">{state.message}</p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-xl bg-duck py-2.5 font-bold text-ink hover:bg-duck-deep disabled:opacity-50"
        >
          {pending ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-mauve">
        {mode === "login" ? (
          <>계정이 없으신가요? <Link href="/register" className="font-semibold text-bill">회원가입</Link></>
        ) : (
          <>이미 계정이 있으신가요? <Link href="/login" className="font-semibold text-bill">로그인</Link></>
        )}
      </p>
      {mode === "register" && (
        <p className="mt-6 rounded-lg bg-blush p-3 text-xs leading-relaxed text-mauve">
          MVP 데모 버전입니다. 운영 시에는 휴대폰 본인인증이 필수이며, 신규 계정은 입찰 한도가
          제한됩니다.
        </p>
      )}
    </div>
  );
}
