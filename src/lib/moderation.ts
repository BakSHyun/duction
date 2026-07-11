/**
 * 외부거래 유도 자동 감지 (M21, PLANNING.md §3.4)
 * 플랫폼 이탈 = 에스크로 보호 상실 + 수수료 회피. 명백한 패턴은 게시 차단,
 * 애매한 패턴은 자동 신고 생성으로 운영팀 검토에 넘긴다 (과차단 방지).
 */

// 명백한 외부거래 유도 — 게시 차단 대상
const HARD_PATTERNS: RegExp[] = [
  /open\.kakao\.com/i, // 오픈채팅 링크
  /카톡\s*(아이디|id)/i,
  /(계좌|입금).{0,12}\d{6,}/, // 계좌·입금 + 긴 숫자열
  /\d{2,3}-\d{3,4}-\d{4}/, // 전화번호 포맷
  /직\s*거\s*래.{0,10}(입금|선입금|계좌)/,
];

// 의심 패턴 — 게시는 허용하되 자동 신고 생성
const SOFT_PATTERNS: RegExp[] = [
  /(트위터|엑스|인스타|디엠|DM)\s*(으로|로)?\s*(연락|문의|주세요)/i,
  /수수료\s*(없이|아깝)/,
  /직거래/,
];

export function detectOffsite(text: string): boolean {
  return HARD_PATTERNS.some((p) => p.test(text));
}

export function detectSuspicious(text: string): boolean {
  return SOFT_PATTERNS.some((p) => p.test(text));
}

/** 등록·게시물에서 의심 패턴 발견 시 자동 신고 생성 (시스템 발신 — reporterId null) */
export async function autoReportIfSuspicious(targetId: string, text: string, context: string) {
  const { prisma } = await import("./prisma");
  if (!detectSuspicious(text) && !detectOffsite(text)) return false;
  await prisma.report.create({
    data: {
      reporterId: null,
      targetType: "AUCTION",
      targetId,
      reason: "OFFSITE",
      detail: `[자동 감지 · ${context}] ${text.slice(0, 200)}`,
    },
  });
  return true;
}
