"use client";

import { useEffect } from "react";

/**
 * 하이브리드 앱 네이티브 푸시 등록 (M19).
 * Capacitor 셸 안에서만 동작 — 일반 브라우저에서는 즉시 종료.
 * 로그인 상태에서 FCM 토큰을 수집해 서버에 저장하고, 알림 탭 시 해당 화면으로 이동한다.
 */
export default function NativePush({ isLoggedIn }: { isLoggedIn: boolean }) {
  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.addListener("registration", async (token) => {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "fcm", token: token.value }),
        }).catch(() => {});
      });

      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const link = action.notification.data?.link;
        if (typeof link === "string" && link.startsWith("/")) window.location.href = link;
      });

      await PushNotifications.register();
    })().catch(() => {
      // 네이티브 푸시 실패는 치명적이지 않음 — 인앱 알림이 원본
    });
  }, [isLoggedIn]);

  return null;
}
