"use client";

import { useActionState } from "react";
import { becomeArtistAction, type ActionResult } from "@/app/actions";

const inputCls =
  "w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none";

export default function ArtistSetupForm({
  defaults,
}: {
  defaults: { artistBio: string; artistSns: string };
}) {
  const [state, submit, pending] = useActionState<ActionResult | null, FormData>(
    becomeArtistAction,
    null,
  );

  return (
    <form action={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-semibold">작가 소개 *</label>
        <textarea
          name="artistBio"
          required
          rows={5}
          defaultValue={defaults.artistBio}
          placeholder={"작업 스타일, 커스텀 경력, 분양 이력을 소개해주세요.\n예) 2022년부터 활동 중. 내추럴 페이스업과 수제 아이칩이 주력입니다. 분양 이력 30회+"}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">SNS 링크 (선택)</label>
        <input
          name="artistSns"
          type="url"
          defaultValue={defaults.artistSns}
          placeholder="https://twitter.com/..."
          className={inputCls}
        />
      </div>
      {state?.message && !state.ok && (
        <p className="rounded-lg bg-cream p-3 text-sm font-medium text-bill-deep">{state.message}</p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-duck py-3 font-bold text-ink hover:bg-duck-deep disabled:opacity-50"
      >
        {pending ? "저장 중…" : "작가 프로필 저장"}
      </button>
      <p className="text-xs leading-relaxed text-mauve-light">
        작가로 등록하면 프로필이 작가 디렉토리에 공개되고, 팔로워에게 새 분양 알림이 발송됩니다.
        운영 정식 오픈 시 인증 심사가 도입될 예정입니다.
      </p>
    </form>
  );
}
