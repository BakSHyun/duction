import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { AUTHENTICITY } from "@/lib/constants";

// 트위터 공유 카드 (M10) — RT 한 번이 곧 광고
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "덕션 경매";

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [auction, font] = await Promise.all([
    prisma.auction.findUnique({
      where: { id },
      include: { item: true },
    }),
    readFile(path.join(process.cwd(), "src", "assets", "noto-sans-kr-700.woff")),
  ]);

  const title = auction?.item.title ?? "브라이스 경매";
  const price = auction ? `${auction.currentPrice.toLocaleString("ko-KR")}원` : "";
  const scheduled = auction?.status === "SCHEDULED";
  const live = auction?.status === "LIVE";
  const dateLabel = auction
    ? `${scheduled ? "시작" : "마감"} ${new Date(scheduled ? auction.startsAt : auction.endsAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : "";
  const authBadge = auction
    ? AUTHENTICITY.find((a) => a.value === auction.item.authenticity)?.badge
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#FCFCFA",
          color: "#26231C",
          fontFamily: "NotoSansKR",
          borderBottom: "16px solid #FFD400",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* 러버덕 마크 */}
            <svg width="64" height="64" viewBox="0 0 32 32">
              <ellipse cx="16.5" cy="21.5" rx="11.5" ry="8" fill="#FFD400" />
              <circle cx="12" cy="10.5" r="7" fill="#FFD400" />
              <ellipse cx="21.5" cy="11.5" rx="4.8" ry="2.6" fill="#C96A0E" />
              <ellipse cx="17" cy="22" rx="4.5" ry="3" fill="#EFC000" />
              <circle cx="14.2" cy="8.6" r="1.5" fill="#26231C" />
            </svg>
            <div style={{ display: "flex", fontSize: 40 }}>덕션</div>
            <div style={{ display: "flex", fontSize: 22, color: "#8A857A", letterSpacing: 4 }}>
              DUCTION · BLYTHE AUCTION
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {authBadge && (
              <div style={{ display: "flex", background: "#FDF6D8", color: "#26231C", borderRadius: 10, padding: "8px 20px", fontSize: 26 }}>
                {authBadge}
              </div>
            )}
            {scheduled && (
              <div style={{ display: "flex", background: "#EFEBF7", color: "#6D5BA8", borderRadius: 10, padding: "8px 20px", fontSize: 26 }}>
                분양 예고
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 54, lineHeight: 1.35, fontWeight: 700 }}>
          {title.length > 40 ? `${title.slice(0, 40)}…` : title}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: "#8A857A" }}>
              {scheduled ? "시작가" : "현재가"}
            </div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#C96A0E" }}>{price}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 28, color: "#8A857A" }}>
            {live && auction && <div style={{ display: "flex" }}>입찰 {auction.bidCount}건</div>}
            <div style={{ display: "flex" }}>{dateLabel}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "NotoSansKR", data: font, weight: 700, style: "normal" }],
    },
  );
}
