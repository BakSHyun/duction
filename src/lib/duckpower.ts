/**
 * 덕력 시스템 (M14) — 신뢰의 단일 수치.
 * 모든 변동은 서버 이벤트에서만 발생하고 DuckPowerLog에 남는다 (조작 방지 + 투명성).
 * 점수 규칙: DEVELOPMENT-PLAN.md §4.14
 */

// 트랜잭션 클라이언트 타입 (bidding.ts와 동일 패턴)
import { prisma } from "./prisma";
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const DUCK_POWER = {
  TRADE_CONFIRMED: 50,
  LISTING_CREATED: 5,
  BID_PLACED: 2,
  UNPAID_CANCEL: -100,
  SANCTION_PER_LEVEL: -200,
  REVIEW: { 5: 20, 4: 10, 3: 0, 2: -20, 1: -40 } as Record<number, number>,
} as const;

export const DUCK_TIERS = [
  { min: 2000, name: "황금오리", color: "gold" },
  { min: 800, name: "청둥오리", color: "teal" },
  { min: 300, name: "노랑오리", color: "yellow" },
  { min: 100, name: "아기오리", color: "cream" },
  { min: 0, name: "알", color: "stone" },
] as const;

export type DuckTier = (typeof DUCK_TIERS)[number];

export function duckTier(power: number): DuckTier {
  return DUCK_TIERS.find((t) => power >= t.min) ?? DUCK_TIERS[DUCK_TIERS.length - 1];
}

/** 다음 등급까지 남은 덕력 (최고 등급이면 null) */
export function nextTierInfo(power: number): { next: DuckTier; remaining: number } | null {
  const idx = DUCK_TIERS.findIndex((t) => power >= t.min);
  if (idx <= 0) return null;
  const next = DUCK_TIERS[idx - 1];
  return { next, remaining: next.min - power };
}

/** 덕력 적립·차감 — 반드시 비즈니스 이벤트와 같은 트랜잭션에서 호출 */
export async function awardDuckPower(tx: Tx, userId: string, amount: number, reason: string) {
  if (amount === 0) return;
  await tx.user.update({ where: { id: userId }, data: { duckPower: { increment: amount } } });
  await tx.duckPowerLog.create({ data: { userId, amount, reason } });
}
