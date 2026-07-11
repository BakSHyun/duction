// 레이트 리밋 검증 (M17) — 한도 초과 차단 + Redis 장애 시 fail-open
import { rateLimit } from "../src/lib/ratelimit";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function main() {
  const mode = process.env.EXPECT ?? "limit";

  // 웜업 — 오프라인 큐 비활성 설계상 연결 수립 전 호출은 fail-open이므로,
  // 카운팅 검증은 연결이 준비된 뒤의 키로 수행한다
  await rateLimit("warmup", 100, 10);
  await new Promise((r) => setTimeout(r, 500));

  const key = `test:${Math.floor(Date.now() / 1000)}`;
  const results: boolean[] = [];
  for (let i = 0; i < 7; i++) results.push(await rateLimit(key, 5, 10));

  if (mode === "limit") {
    assert(results.slice(0, 5).every(Boolean), "한도 내 5회 허용");
    assert(!results[5] && !results[6], "6·7회째 차단");
  } else {
    assert(results.every(Boolean), "Redis 불가 시 fail-open (전부 허용)");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
