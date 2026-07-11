import { AUTHENTICITY, CONDITION_GRADES } from "@/lib/constants";

export function AuthenticityBadge({ value }: { value: string }) {
  const meta = AUTHENTICITY.find((a) => a.value === value);
  if (!meta) return null;
  const styles: Record<string, string> = {
    GENUINE: "bg-ok-soft text-ok",
    FACTORY: "bg-warn-soft text-warn",
    UNKNOWN: "bg-blush text-mauve",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${styles[value]}`}>
      {meta.badge}
    </span>
  );
}

export function GradeBadge({ value }: { value: string }) {
  const meta = CONDITION_GRADES.find((g) => g.value === value);
  if (!meta) return null;
  return (
    <span className="rounded bg-blush px-1.5 py-0.5 text-[11px] font-semibold text-ink/70">
      {meta.label}
    </span>
  );
}
