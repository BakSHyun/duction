import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { readNotificationAction, readAllNotificationsAction } from "@/app/actions";
import PushToggle from "@/components/PushToggle";

export const metadata = { title: "알림" };

export const dynamic = "force-dynamic";

const TYPE_ICON: Record<string, string> = {
  OUTBID: "⚡",
  WON: "🎉",
  SOLD: "💰",
  UNSOLD: "😢",
  ORDER_CANCELLED: "⚠️",
  PAID: "💳",
  SHIPPED: "📦",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">
          알림 {unread > 0 && <span className="text-sm font-normal text-bill">미읽음 {unread}</span>}
        </h1>
        <div className="flex items-center gap-3">
          <PushToggle />
          {unread > 0 && (
            <form action={readAllNotificationsAction}>
              <button className="text-sm text-mauve underline hover:text-ink">모두 읽음</button>
            </form>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-mauve-light">
          알림이 없습니다. 입찰하거나 경매를 등록하면 여기서 소식을 받아요.
        </p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <form action={readNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  className={`w-full rounded-xl border p-4 text-left transition hover:border-bill/40 ${
                    n.readAt ? "border-line bg-card opacity-60" : "border-bill/25 bg-cream/70"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span className="text-xl">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      {n.body && <span className="mt-0.5 block truncate text-sm text-mauve">{n.body}</span>}
                      <span className="mt-1 block text-xs text-mauve-light">
                        {new Date(n.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </span>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-duck" />}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
