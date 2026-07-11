import webpush from "web-push";
import { prisma } from "./prisma";
import { smsChannel, alimtalkChannel, type NotifyChannel, type NotifyPayload } from "./notify-channels";
import { fcmChannel } from "./fcm";

/**
 * 알림 발송 파이프라인 (M13→M17 채널화) — ARCHITECTURE.md §5-3
 * 외부 발송은 트랜잭션 밖, 워커에서. Notification.pushedAt이 null인 건을
 * 집어 활성 채널 전부로 발송하고 마킹한다 (DB를 큐로 — 규모 커지면 BullMQ).
 * 어떤 채널이 실패해도 입찰·결제에 영향 없고, 인앱 알림이 항상 원본이다.
 */

const webpushConfigured = !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

if (webpushConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@duction.local",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

const webpushChannel: NotifyChannel = {
  name: "webpush",
  enabled: () => webpushConfigured,
  types: null, // 무료 채널 — 전 타입 발송
  async send(userId: string, payload: NotifyPayload) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId, kind: "webpush" } });
    for (const sub of subs) {
      try {
        if (!sub.p256dh || !sub.auth) continue;
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, link: payload.link }),
          { TTL: 3600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 만료·해지된 구독은 정리 (404/410). 그 외 실패는 포기 — 인앱 알림이 원본
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  },
};

const CHANNELS: NotifyChannel[] = [webpushChannel, fcmChannel, smsChannel, alimtalkChannel];

export async function sendPendingNotifications(batchSize = 50): Promise<number> {
  const active = CHANNELS.filter((c) => c.enabled());
  if (active.length === 0) return 0;

  const pending = await prisma.notification.findMany({
    where: { pushedAt: null },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });
  if (pending.length === 0) return 0;

  // 유저별 푸시 옵트아웃 (M22) — 인앱 알림은 이미 생성돼 있고, 외부 발송만 거른다
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(pending.map((n) => n.userId))] } },
    select: { id: true, pushOptOut: true },
  });
  const optOutByUser = new Map(
    users.map((u) => [u.id, new Set<string>(u.pushOptOut ? JSON.parse(u.pushOptOut) : [])]),
  );

  let attempted = 0;
  for (const n of pending) {
    if (optOutByUser.get(n.userId)?.has(n.type)) continue;
    const payload: NotifyPayload = {
      type: n.type,
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? "/notifications",
    };
    for (const channel of active) {
      if (channel.types && !channel.types.includes(n.type)) continue;
      attempted += 1;
      await channel.send(n.userId, payload).catch((err) => {
        console.error(`[notify:${channel.name}] 발송 실패:`, (err as Error).message);
      });
    }
  }

  // 시도한 알림은 성공 여부와 무관하게 마킹 — 재시도 폭풍 방지 (인앱 알림이 원본)
  await prisma.notification.updateMany({
    where: { id: { in: pending.map((n) => n.id) } },
    data: { pushedAt: new Date() },
  });
  return attempted;
}

/** @deprecated M17에서 채널화 — sendPendingNotifications 사용 */
export const sendPendingPushes = sendPendingNotifications;
