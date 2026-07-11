// 덕션 서비스 워커 — 웹푸시 수신 (M13)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "덕션", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "덕션", {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { link: payload.link || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return clients.openWindow(link);
    }),
  );
});
