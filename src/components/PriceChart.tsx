import { krw } from "@/lib/format";

/**
 * 모델 시세 라인 차트 (M22) — 단일 시리즈(무커스텀 낙찰가), 시간축.
 * dataviz 원칙: 단일 시리즈라 범례 없음(제목이 명명), 마크는 얇게(2px 라인·r4 점),
 * 그리드는 후퇴색, 값 텍스트는 잉크 토큰, 시리즈 컬러는 bill(#C96A0E — 검증 통과).
 * 상세 수치 테이블은 바로 아래 낙찰 히스토리가 담당한다.
 */
export default function PriceChart({
  points,
}: {
  points: { date: Date; price: number }[];
}) {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  const W = 640;
  const H = 200;
  const PAD = { top: 18, right: 76, bottom: 26, left: 10 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const prices = sorted.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = maxP - minP || maxP * 0.1 || 1;
  const yMin = Math.max(0, minP - span * 0.15);
  const yMax = maxP + span * 0.15;

  const t0 = sorted[0].date.getTime();
  const t1 = sorted[sorted.length - 1].date.getTime();
  const tSpan = t1 - t0 || 1;

  const x = (d: Date) => PAD.left + ((d.getTime() - t0) / tSpan) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const path = sorted.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const last = sorted[sorted.length - 1];
  const gridYs = [0.25, 0.5, 0.75].map((f) => PAD.top + innerH * f);
  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="무커스텀 낙찰가 추이">
        {gridYs.map((gy) => (
          <line key={gy} x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#EAE8E1" strokeWidth="1" />
        ))}
        <path d={path} fill="none" stroke="#C96A0E" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {sorted.map((p, i) => (
          <g key={i}>
            {/* 히트 타깃은 마크보다 크게 — 네이티브 툴팁 */}
            <circle cx={x(p.date)} cy={y(p.price)} r="12" fill="transparent">
              <title>{`${p.date.toLocaleDateString("ko-KR")} · ${krw(p.price)}`}</title>
            </circle>
            <circle cx={x(p.date)} cy={y(p.price)} r="4" fill="#C96A0E" stroke="#FFFFFF" strokeWidth="2" />
          </g>
        ))}
        {/* 마지막 점만 직접 라벨 — 텍스트는 잉크 토큰 */}
        <text x={x(last.date) + 10} y={y(last.price) + 4} fontSize="12" fontWeight="700" fill="#26231C" className="num">
          {krw(last.price)}
        </text>
        <text x={PAD.left} y={H - 6} fontSize="10" fill="#8A857A">{fmtDate(sorted[0].date)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="#8A857A" textAnchor="end">{fmtDate(last.date)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-mauve-light">
        무커스텀 정품 낙찰가 추이 · 점에 마우스를 올리면 상세가 보여요
      </figcaption>
    </figure>
  );
}
