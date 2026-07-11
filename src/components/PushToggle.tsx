"use client";

import { useEffect, useState } from "react";

type PushState = "unsupported" | "off" | "on" | "denied" | "loading";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushToggle() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    (async () => {
      // 네이티브 앱 셸에서는 FCM(NativePush)이 담당 — 웹푸시 토글 숨김
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        setState("unsupported");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setState("unsupported");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  if (state === "unsupported") return null;
  if (state === "denied") {
    return (
      <p className="text-xs text-mauve-light">
        브라우저 알림이 차단되어 있어요 — 주소창의 사이트 설정에서 허용해주세요.
      </p>
    );
  }

  return (
    <button
      onClick={state === "on" ? disable : enable}
      disabled={state === "loading"}
      className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
        state === "on"
          ? "border-line-strong bg-card text-mauve"
          : "border-duck-deep bg-duck text-ink hover:bg-duck-deep"
      }`}
    >
      {state === "loading" ? "…" : state === "on" ? "브라우저 알림 켜짐 ✓" : "브라우저 알림 켜기"}
    </button>
  );
}
