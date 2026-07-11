import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 컨테이너 헬스체크 — DB 연결까지 확인 (ARCHITECTURE.md §5-5)
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "db" }, { status: 503 });
  }
}
