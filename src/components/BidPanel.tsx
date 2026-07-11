"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bidAction, buyNowAction, cancelBidAction, type ActionResult } from "@/app/actions";
import { bidIncrement } from "@/lib/constants";
import { krw } from "@/lib/format";
import Countdown from "./Countdown";

type BidPanelProps = {
  auctionId: string;
  initial: {
    currentPrice: number;
    startsAt: string;
    endsAt: string;
    bidCount: number;
    status: string;
    buyNowPrice: number | null;
    reserveSet: boolean;
    reserveMet: boolean | null;
  };
  isLoggedIn: boolean;
  isSeller: boolean;
};

export default function BidPanel({ auctionId, initial, isLoggedIn, isSeller }: BidPanelProps) {
  const router = useRouter();
  const [live, setLive] = useState(initial);
  const [bidState, submitBid, bidPending] = useActionState<ActionResult | null, FormData>(
    bidAction,
    null,
  );
  const [buyState, submitBuy, buyPending] = useActionState<ActionResult | null, FormData>(
    buyNowAction,
    null,
  );
  const [cancelState, submitCancel, cancelPending] = useActionState<ActionResult | null, FormData>(
    cancelBidAction,
    null,
  );

  // 3초 폴링으로 현재가·마감시간 실시간 갱신 (예고 경매는 시작 감지용)
  useEffect(() => {
    if (initial.status !== "LIVE" && initial.status !== "SCHEDULED") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/auctions/${auctionId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setLive((prev) => ({ ...prev, ...data }));
        if (data.status !== initial.status) router.refresh();
      } catch {
        // 네트워크 오류는 다음 폴링에서 회복
      }
    }, 3000);
    return () => clearInterval(t);
  }, [auctionId, initial.status, router]);

  const scheduled = live.status === "SCHEDULED";
  const ended = live.status !== "LIVE" && !scheduled;
  const minBid = live.bidCount > 0 ? live.currentPrice + bidIncrement(live.currentPrice) : live.currentPrice;

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-mauve">현재가</p>
          <p className="num font-display text-3xl font-semibold text-bill">{krw(live.currentPrice)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-mauve">입찰 {live.bidCount}건</p>
          {ended ? (
            <p className="font-bold text-mauve-light">
              {live.status === "ENDED_SOLD" ? "낙찰 완료" : live.status === "ENDED_UNSOLD" ? "유찰" : "종료"}
            </p>
          ) : scheduled ? (
            <p className="font-bold text-wisteria">분양 예고</p>
          ) : (
            <Countdown endsAt={live.endsAt} className="text-sm" />
          )}
        </div>
      </div>

      {live.reserveSet && !ended && (
        <p
          className={`rounded-lg p-2.5 text-xs font-medium ${
            live.reserveMet ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
          }`}
        >
          {live.reserveMet
            ? "✓ 최저 낙찰가에 도달했어요 — 마감 시 낙찰됩니다"
            : "이 경매는 비공개 최저 낙찰가가 설정되어 있어요. 아직 미달 상태 — 마감 시 미달이면 유찰됩니다."}
        </p>
      )}

      {scheduled && (
        <div className="rounded-lg bg-wisteria-soft p-4 text-center text-sm">
          <p className="font-semibold text-wisteria">
            시작까지 <Countdown endsAt={live.startsAt} className="font-bold" overText="곧 시작" />
          </p>
          <p className="mt-1 text-xs text-wisteria/80">시작 전에는 입찰할 수 없어요. 찜해두면 놓치지 않아요.</p>
        </div>
      )}

      {!ended && !scheduled && !isSeller && (
        <>
          <form action={submitBid} className="space-y-2">
            <input type="hidden" name="auctionId" value={auctionId} />
            <label className="block text-xs font-medium text-ink/70">
              최대 입찰가 (자동입찰 상한 — 시스템이 필요한 만큼만 올려요)
            </label>
            <div className="flex gap-2">
              <input
                name="maxAmount"
                type="number"
                min={minBid}
                step={100}
                placeholder={`${minBid.toLocaleString()} 이상`}
                required
                className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-bill focus:outline-none"
              />
              <button
                disabled={bidPending || !isLoggedIn}
                className="shrink-0 rounded-lg bg-duck px-5 py-2 text-sm font-bold text-ink hover:bg-duck-deep disabled:opacity-50"
              >
                {bidPending ? "입찰 중…" : "입찰"}
              </button>
            </div>
            <p className="text-xs text-mauve-light">
              최소 입찰가 {krw(minBid)} · 마감 5분 전 입찰 시 5분 연장
            </p>
          </form>

          {isLoggedIn && (
            <form action={submitCancel} className="text-right">
              <input type="hidden" name="auctionId" value={auctionId} />
              <button
                disabled={cancelPending}
                className="text-xs text-mauve-light underline underline-offset-2 hover:text-bill disabled:opacity-50"
              >
                입찰을 잘못 넣었나요? 취소하기 (경매당 1회 · 마감 1시간 전까지)
              </button>
            </form>
          )}

          {live.buyNowPrice && (
            <form action={submitBuy}>
              <input type="hidden" name="auctionId" value={auctionId} />
              <button
                disabled={buyPending || !isLoggedIn}
                className="w-full rounded-lg border-2 border-bill py-2 text-sm font-bold text-bill hover:bg-cream disabled:opacity-50"
              >
                {krw(live.buyNowPrice)} 즉시구매
              </button>
            </form>
          )}

          {!isLoggedIn && (
            <p className="rounded-lg bg-blush p-3 text-center text-sm text-mauve">
              입찰하려면 <a href="/login" className="font-semibold text-bill underline">로그인</a>이
              필요합니다.
            </p>
          )}
        </>
      )}

      {isSeller && !ended && (
        <p className="rounded-lg bg-blush p-3 text-center text-sm text-mauve">
          내가 등록한 경매입니다.
        </p>
      )}

      {(bidState?.message || buyState?.message || cancelState?.message) && (
        <p
          className={`rounded-lg p-3 text-sm font-medium ${
            (bidState ?? buyState ?? cancelState)?.ok ? "bg-ok-soft text-ok" : "bg-cream text-bill-deep"
          }`}
        >
          {bidState?.message ?? buyState?.message ?? cancelState?.message}
        </p>
      )}
    </div>
  );
}
