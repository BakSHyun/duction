export function krw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function timeRemaining(endsAt: Date | string): { text: string; urgent: boolean; over: boolean } {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return { text: "마감", urgent: false, over: true };
  const m = Math.floor(diff / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return { text: `${d}일 ${h}시간`, urgent: false, over: false };
  if (h > 0) return { text: `${h}시간 ${mm}분`, urgent: h < 1, over: false };
  const s = Math.floor((diff % 60000) / 1000);
  return { text: `${mm}분 ${s}초`, urgent: true, over: false };
}
