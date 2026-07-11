import Redis from "ioredis";

/**
 * Redis 레이트 리밋 (M17) — 고정 윈도우 카운터.
 * 원칙 (ARCHITECTURE.md §5-3): Redis는 보조 장치다.
 * REDIS_URL이 없거나 Redis가 죽어 있으면 **fail-open** — 입찰·로그인은 계속 동작한다.
 * 레이트 리밋이 안 걸리는 것과 서비스가 멈추는 것 중 전자가 낫다.
 */

let client: Redis | null = null;
let initialized = false;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!initialized) {
    initialized = true;
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      // 연결이 없으면 명령을 큐에 쌓지 않고 즉시 실패 → fail-open.
      // 입찰 경로가 Redis 재연결을 기다리며 블록되는 것을 원천 차단한다.
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 5000, 60_000), // 죽어 있으면 천천히 재시도
    });
    client.on("error", () => {
      // 연결 오류는 fail-open으로 흡수 — 로그 폭주 방지를 위해 무시
    });
  }
  return client;
}

/**
 * @returns true = 허용, false = 한도 초과
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // 미설정 — fail-open

  try {
    // 절대 상한 800ms — 어떤 경우에도 레이트 리밋이 요청을 붙잡지 못하게
    const result = await Promise.race([
      (async () => {
        const redisKey = `rl:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.expire(redisKey, windowSec);
        return count <= limit;
      })(),
      new Promise<true>((resolve) => setTimeout(() => resolve(true), 800)),
    ]);
    return result;
  } catch {
    return true; // Redis 장애 — fail-open
  }
}
