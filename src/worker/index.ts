/**
 * 정산 워커 — ARCHITECTURE.md §3
 * 경매 마감·예약 시작·미결제 페널티·차순위 승계를 주기 처리한다.
 * 웹 프로세스와 분리: 정산 폭주가 웹 응답을 못 느리게 하고, 웹이 죽어도 정산은 돈다.
 * settleExpired()는 멱등 + row lock — 웹의 lazy-settle과 동시에 돌아도 안전 (§5-2).
 */
import { prisma } from "../lib/prisma";
import { settleExpired } from "../lib/bidding";
import { sendPendingNotifications } from "../lib/push";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
let running = true;
let consecutiveFailures = 0;

async function tick() {
  try {
    await settleExpired();
    // 웹푸시 발송 — 정산과 분리된 관심사지만 같은 tick에서 순차 처리 (M13)
    await sendPendingNotifications();
    consecutiveFailures = 0;
  } catch (err) {
    // DB 순단은 재시도로 흡수하되, 연속 실패는 프로세스 재시작에 맡긴다 (§5-5)
    consecutiveFailures += 1;
    console.error(`[worker] settle failed (${consecutiveFailures}회 연속):`, err);
    if (consecutiveFailures >= 10) {
      console.error("[worker] 연속 실패 한도 초과 — 종료 후 컨테이너 재시작에 위임");
      process.exit(1);
    }
  }
}

async function main() {
  console.log(`[worker] 정산 워커 시작 (주기 ${INTERVAL_MS}ms)`);
  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await prisma.$disconnect();
  console.log("[worker] 정상 종료");
}

// graceful shutdown — 처리 중인 트랜잭션을 끝내고 종료
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} 수신 — 현재 tick 종료 후 중단`);
    running = false;
  });
}

main();
