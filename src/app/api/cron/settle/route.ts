import { NextResponse } from "next/server";
import { settleExpired } from "@/lib/bidding";
import { sendPendingNotifications } from "@/lib/push";

/**
 * 정산 크론 엔드포인트 (M25) — Cloud Scheduler가 1분 주기로 호출.
 * 워커 컨테이너 없이 Cloud Run scale-to-zero 구성에서 정산을 보장한다.
 * (lazy-settle이 폴백으로 항상 존재 — ARCHITECTURE.md §5-2 멱등)
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await settleExpired();
  const pushed = await sendPendingNotifications();
  return NextResponse.json({ ok: true, pushed });
}
