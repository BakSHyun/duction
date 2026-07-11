// SQLite는 enum 미지원 → 상태값 상수 정의 (prisma/schema.prisma 주석과 동기화)

export const AUCTION_STATUS = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  ENDED_SOLD: "ENDED_SOLD",
  ENDED_UNSOLD: "ENDED_UNSOLD",
  CANCELLED: "CANCELLED",
} as const;

export const BID_STATUS = {
  ACTIVE: "ACTIVE",
  OUTBID: "OUTBID",
  WON: "WON",
  CANCELLED: "CANCELLED",
} as const;

export const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CONFIRMED: "CONFIRMED",
  DISPUTED: "DISPUTED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;

export const CONDITION_GRADES = [
  { value: "S", label: "S · 미개봉", desc: "미개봉 신품 (박스 손상 별도 표기)" },
  { value: "A", label: "A · 개봉 미전시", desc: "개봉만 함, 부속 완비" },
  { value: "B", label: "B · 전시품", desc: "전시 사용감 있음, 부속 완비" },
  { value: "C", label: "C · 사용감", desc: "하자 있음 — 상세 설명 필수" },
] as const;

// 팩토리 정책 B: 허용하되 강제 구분. 허위 기재 시 영구 정지
export const AUTHENTICITY = [
  { value: "GENUINE", label: "정품", badge: "정품" },
  { value: "FACTORY", label: "팩토리", badge: "팩토리" },
  { value: "UNKNOWN", label: "확인 불가", badge: "미확인" },
] as const;

export const CUSTOM_LEVELS = [
  { value: "NONE", label: "디폴트 (무커스텀)" },
  { value: "PARTIAL", label: "부분 커스텀" },
  { value: "FULL", label: "풀 커스텀" },
] as const;

export const BLYTHE_LINES = [
  { value: "NEO", label: "네오 브라이스 (약 28cm)" },
  { value: "MIDDIE", label: "미디 브라이스 (약 20cm)" },
  { value: "PETITE", label: "쁘띠 브라이스 (약 11cm)" },
  { value: "VINTAGE", label: "빈티지 (켄너)" },
] as const;

// 신고 사유 (M6)
export const REPORT_REASONS = [
  { value: "FAKE_GENUINE", label: "팩토리를 정품으로 기재 (사칭)" },
  { value: "PROHIBITED", label: "짝퉁·금지 품목" },
  { value: "FRAUD", label: "사기 의심" },
  { value: "OFFSITE", label: "외부 거래 유도" },
  { value: "OTHER", label: "기타" },
] as const;

// 상호 평가 태그 (M9)
export const REVIEW_TAGS = [
  "설명과 일치해요",
  "포장이 꼼꼼해요",
  "응답이 빨라요",
  "시간 약속을 지켜요",
] as const;

// 판매 수수료 6% (PLANNING.md §7)
export const FEE_RATE = 0.06;

// 낙찰 후 결제 기한 24시간
export const PAYMENT_DUE_HOURS = 24;

// soft-close: 마감 N분 전 입찰 시 N분 연장
export const SOFT_CLOSE_WINDOW_MS = 5 * 60 * 1000;

// 현재가 구간별 입찰 단위 (PLANNING.md §3.1)
export function bidIncrement(currentPrice: number): number {
  if (currentPrice < 10_000) return 500;
  if (currentPrice < 50_000) return 1_000;
  if (currentPrice < 200_000) return 5_000;
  return 10_000;
}
