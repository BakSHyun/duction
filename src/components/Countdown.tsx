"use client";

import { useEffect, useState } from "react";
import { timeRemaining } from "@/lib/format";

export default function Countdown({
  endsAt,
  className = "",
  overText = "마감",
}: {
  endsAt: string;
  className?: string;
  overText?: string;
}) {
  const [state, setState] = useState(() => timeRemaining(endsAt));

  useEffect(() => {
    const t = setInterval(() => setState(timeRemaining(endsAt)), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  return (
    <span className={`num ${state.over ? "text-mauve-light" : state.urgent ? "font-bold text-bill" : ""} ${className}`}>
      {state.over ? overText : `${state.text} 남음`}
    </span>
  );
}
