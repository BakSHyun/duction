"use client";

import { useActionState } from "react";
import { askQuestionAction, answerQuestionAction, type ActionResult } from "@/app/actions";

type Question = {
  id: string;
  body: string;
  answer: string | null;
  askerNickname: string;
  createdAt: string;
};

export default function QnaSection({
  auctionId,
  questions,
  isLoggedIn,
  isSeller,
}: {
  auctionId: string;
  questions: Question[];
  isLoggedIn: boolean;
  isSeller: boolean;
}) {
  const [askState, submitAsk, askPending] = useActionState<ActionResult | null, FormData>(
    askQuestionAction,
    null,
  );
  const [answerState, submitAnswer, answerPending] = useActionState<ActionResult | null, FormData>(
    answerQuestionAction,
    null,
  );

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <h2 className="mb-3 text-sm font-bold">
        질문과 답변 ({questions.length})
        <span className="ml-2 text-xs font-normal text-mauve-light">
          상태가 궁금하면 DM 말고 여기서 — 기록이 남아야 서로 안전해요
        </span>
      </h2>

      {questions.length === 0 ? (
        <p className="mb-3 text-sm text-mauve-light">
          아직 질문이 없어요. 아이 상태(아이 메커니즘, 헤어, 기스)가 궁금하면 물어보세요.
        </p>
      ) : (
        <ul className="mb-3 space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg bg-blush/50 p-3 text-sm">
              <p>
                <span className="font-semibold text-ink/70">Q.</span> {q.body}
                <span className="ml-2 text-xs text-mauve-light">
                  {q.askerNickname} · {new Date(q.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </p>
              {q.answer ? (
                <p className="mt-2 border-l-2 border-duck pl-2">
                  <span className="font-semibold text-bill">A.</span> {q.answer}
                </p>
              ) : isSeller ? (
                <form action={submitAnswer} className="mt-2 flex gap-2">
                  <input type="hidden" name="questionId" value={q.id} />
                  <input
                    name="answer"
                    required
                    placeholder="답변 입력"
                    className="flex-1 rounded-lg border border-line-strong bg-card px-2 py-1.5 text-xs"
                  />
                  <button disabled={answerPending} className="rounded-lg bg-duck px-3 py-1 text-xs font-bold text-ink disabled:opacity-50">
                    답변
                  </button>
                </form>
              ) : (
                <p className="mt-1 text-xs text-mauve-light">답변 대기 중</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoggedIn && !isSeller && (
        <form action={submitAsk} className="flex gap-2">
          <input type="hidden" name="auctionId" value={auctionId} />
          <input
            name="body"
            required
            minLength={5}
            placeholder="판매자에게 질문하기"
            className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none"
          />
          <button disabled={askPending} className="rounded-lg bg-duck px-4 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50">
            {askPending ? "등록 중…" : "질문"}
          </button>
        </form>
      )}
      {(askState?.message || answerState?.message) && (
        <p className={`mt-2 rounded-lg p-2 text-xs font-medium ${(askState ?? answerState)?.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"}`}>
          {askState?.message ?? answerState?.message}
        </p>
      )}
    </div>
  );
}
