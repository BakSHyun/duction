import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleExpired } from "@/lib/bidding";

// 입찰 패널 폴링용 — 운영 전환 시 WebSocket/SSE로 교체
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleExpired();
  const auction = await prisma.auction.findUnique({
    where: { id },
    select: {
      currentPrice: true,
      startsAt: true,
      endsAt: true,
      bidCount: true,
      status: true,
      extendedCount: true,
      reservePrice: true,
    },
  });
  if (!auction) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { reservePrice, ...rest } = auction;
  return NextResponse.json({
    ...rest,
    startsAt: auction.startsAt.toISOString(),
    endsAt: auction.endsAt.toISOString(),
    // 금액은 비공개 — 설정 여부와 도달 상태만 노출
    reserveSet: reservePrice != null,
    reserveMet: reservePrice != null ? auction.currentPrice >= reservePrice : null,
  });
}
