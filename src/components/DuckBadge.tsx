import { duckTier } from "@/lib/duckpower";

const TIER_STYLES: Record<string, string> = {
  gold: "bg-duck text-ink",
  teal: "bg-verdigris-soft text-verdigris",
  yellow: "bg-cream text-bill-deep",
  cream: "bg-blush text-ink/70",
  stone: "bg-blush text-mauve",
};

/** 덕력 등급 배지 (M14) — 신뢰의 단일 수치 */
export default function DuckBadge({
  power,
  showPower = true,
  size = "sm",
}: {
  power: number;
  showPower?: boolean;
  size?: "sm" | "md";
}) {
  const tier = duckTier(power);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${TIER_STYLES[tier.color]} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"
      }`}
      title={`덕력 ${power.toLocaleString()}`}
    >
      {tier.name}
      {showPower && <span className="num font-bold">{power.toLocaleString()}</span>}
    </span>
  );
}
