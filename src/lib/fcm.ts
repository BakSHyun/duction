import { prisma } from "./prisma";
import type { NotifyChannel, NotifyPayload } from "./notify-channels";

/**
 * FCM 네이티브 푸시 채널 (M19) — 하이브리드 앱(iOS/Android)용.
 * 활성화: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 →
 *   FCM_SERVICE_ACCOUNT_JSON 에 JSON 원문 또는 base64 를 넣는다.
 * iOS는 APNs 인증 키(.p8)를 Firebase에 등록해야 실제 전달된다 (APP.md §4).
 */

function loadServiceAccount(): object | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text);
  } catch {
    console.error("[fcm] FCM_SERVICE_ACCOUNT_JSON 파싱 실패 — JSON 원문 또는 base64여야 합니다");
    return null;
  }
}

// firebase-admin은 무겁고 env 없이는 불필요 — 첫 발송 때 지연 로드
let messagingPromise: Promise<import("firebase-admin/messaging").Messaging | null> | null = null;

function getMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const account = loadServiceAccount();
      if (!account) return null;
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      const app =
        getApps()[0] ?? initializeApp({ credential: cert(account as Parameters<typeof cert>[0]) });
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

export const fcmChannel: NotifyChannel = {
  name: "fcm",
  enabled: () => !!process.env.FCM_SERVICE_ACCOUNT_JSON,
  types: null, // 무료 채널 — 전 타입 발송
  async send(userId: string, payload: NotifyPayload) {
    const messaging = await getMessaging();
    if (!messaging) return;

    const tokens = await prisma.pushSubscription.findMany({
      where: { userId, kind: "fcm" },
    });
    for (const sub of tokens) {
      try {
        await messaging.send({
          token: sub.endpoint,
          notification: { title: payload.title, body: payload.body },
          data: { link: payload.link, type: payload.type },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        });
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        // 삭제된 앱·만료 토큰 정리
        if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  },
};
