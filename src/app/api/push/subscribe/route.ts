import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// 푸시 구독 등록/해지 — 웹푸시(M13) + FCM 네이티브 토큰(M19)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);

  // FCM 네이티브 토큰 (하이브리드 앱)
  if (body?.kind === "fcm") {
    if (typeof body.token !== "string" || body.token.length < 10)
      return NextResponse.json({ error: "invalid token" }, { status: 400 });
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.token },
      update: { userId: user.id, kind: "fcm" },
      create: { userId: user.id, kind: "fcm", endpoint: body.token },
    });
    return NextResponse.json({ ok: true });
  }

  // 웹푸시 구독
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string")
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, kind: "webpush", p256dh, auth },
    create: { userId: user.id, kind: "webpush", endpoint, p256dh, auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = body?.kind === "fcm" ? body?.token : body?.endpoint;
  if (typeof endpoint !== "string")
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });
  return NextResponse.json({ ok: true });
}
