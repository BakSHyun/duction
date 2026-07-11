import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { krw } from "@/lib/format";
import { AUCTION_STATUS, REPORT_REASONS } from "@/lib/constants";
import Link from "next/link";
import {
  dismissReportAction,
  cancelAuctionAction,
  sanctionUserAction,
  toggleArtistVerifyAction,
  resolveDisputeAction,
  settleSettlementAction,
  createNoticeAction,
  answerInquiryAction,
} from "./actions";

export const metadata = { title: "운영 콘솔" };

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const [userCount, liveCount, openReports, recentOrders, reports, artists, disputes] = await Promise.all([
    prisma.user.count(),
    prisma.auction.count({ where: { status: AUCTION_STATUS.LIVE } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { auction: { include: { item: { select: { title: true } } } } },
    }),
    prisma.report.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.user.findMany({
      where: { isArtist: true },
      select: { id: true, nickname: true, artistVerified: true, _count: { select: { followers: true } } },
      orderBy: { followers: { _count: "desc" } },
    }),
    prisma.order.findMany({
      where: { status: "DISPUTED" },
      orderBy: { updatedAt: "asc" },
      include: {
        auction: { include: { item: { select: { title: true } } } },
        buyer: { select: { nickname: true } },
        seller: { select: { nickname: true } },
      },
    }),
  ]);

  // KPI (M21) — PLANNING.md §11의 북극성·보조 지표
  const week = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const month = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [weekSold, weekEnded, monthOrders, monthDisputes, pendingSettlements, inquiries, auditLogs] =
    await Promise.all([
      prisma.auction.findMany({
        where: { status: "ENDED_SOLD", endsAt: { gte: week } },
        select: { currentPrice: true },
      }),
      prisma.auction.count({
        where: { status: { in: ["ENDED_SOLD", "ENDED_UNSOLD"] }, endsAt: { gte: week } },
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: month }, isSecondChance: false },
        select: { status: true },
      }),
      prisma.order.count({ where: { status: "DISPUTED" } }),
      prisma.settlement.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
      prisma.inquiry.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 10 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
  const gmv = weekSold.reduce((s, a) => s + a.currentPrice, 0);
  const feeRevenue = Math.round(gmv * 0.06);
  const unsoldRate = weekEnded > 0 ? Math.round(((weekEnded - weekSold.length) / weekEnded) * 100) : 0;
  const paidish = monthOrders.filter((o) => !["PENDING_PAYMENT", "CANCELLED"].includes(o.status)).length;
  const payRate = monthOrders.length > 0 ? Math.round((paidish / monthOrders.length) * 100) : 100;
  const settlementSellers = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: pendingSettlements.map((st) => st.sellerId) } },
        select: { id: true, nickname: true },
      })
    ).map((u) => [u.id, u.nickname]),
  );
  const inquiryUsers = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: inquiries.map((i) => i.userId) } },
        select: { id: true, nickname: true },
      })
    ).map((u) => [u.id, u.nickname]),
  );

  // 신고 대상 경매·판매자 정보 로드
  const auctionIds = [...new Set(reports.map((r) => r.targetId))];
  const targetAuctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds } },
    include: { item: { include: { seller: { select: { id: true, nickname: true, penaltyLevel: true } } } } },
  });
  const auctionMap = new Map(targetAuctions.map((a) => [a.id, a]));

  const btn = "rounded-lg px-3 py-1 text-xs font-bold";

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">운영 콘솔</h1>

      <Link href="/admin/users" className="inline-block rounded-full border border-line-strong bg-card px-4 py-1.5 text-sm font-semibold hover:border-bill/40">
        유저 관리 →
      </Link>

      {/* 대시보드 — KPI (M21) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["주간 낙찰", `${weekSold.length}건`],
          ["주간 GMV", `${gmv.toLocaleString()}원`],
          ["주간 수수료 수익", `${feeRevenue.toLocaleString()}원`],
          ["주간 유찰률", `${unsoldRate}%`],
          ["30일 결제 완료율", `${payRate}%`],
          ["전체 유저", userCount],
          ["진행 중 경매", liveCount],
          ["미처리 신고", openReports],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-card p-4 text-center">
            <p className="text-xs text-mauve-light">{label}</p>
            <p className={`text-2xl font-extrabold ${label === "미처리 신고" && Number(value) > 0 ? "text-bill" : ""}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* 신고 처리 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">신고 목록</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-mauve-light">접수된 신고가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => {
              const auction = auctionMap.get(r.targetId);
              const open = r.status === "OPEN";
              return (
                <li key={r.id} className={`rounded-xl border p-4 text-sm ${open ? "border-bill/25 bg-cream/60" : "border-line bg-card opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${open ? "bg-cream text-bill-deep" : "bg-blush text-mauve"}`}>
                      {open ? "미처리" : r.resolution}
                    </span>
                    <span className="font-semibold">
                      {REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}
                    </span>
                    <span className="text-xs text-mauve-light">
                      {new Date(r.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  {r.detail && <p className="mt-1 text-ink/70">{r.detail}</p>}
                  {auction && (
                    <p className="mt-1">
                      대상:{" "}
                      <Link href={`/auctions/${auction.id}`} className="text-bill underline underline-offset-2">
                        {auction.item.title}
                      </Link>{" "}
                      <span className="text-xs text-mauve">
                        (판매자 {auction.item.seller.nickname} · 페널티 {auction.item.seller.penaltyLevel}단계 · {auction.status})
                      </span>
                    </p>
                  )}
                  {open && auction && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={dismissReportAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <button className={`${btn} border border-line-strong text-ink/70`}>기각</button>
                      </form>
                      <form action={cancelAuctionAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="auctionId" value={auction.id} />
                        <button className={`${btn} bg-warn text-white`}>경매 취소</button>
                      </form>
                      <form action={sanctionUserAction} className="flex items-center gap-1">
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="userId" value={auction.item.seller.id} />
                        <select name="level" defaultValue="1" className="rounded-lg border border-line-strong px-2 py-1 text-xs">
                          <option value="1">1단계 경고</option>
                          <option value="2">2단계 7일 정지</option>
                          <option value="3">3단계 영구 정지</option>
                        </select>
                        <button className={`${btn} bg-duck text-ink`}>판매자 제재</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 분쟁 중재 (M12) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          분쟁 중재 {disputes.length > 0 && <span className="text-sm text-warn">({disputes.length}건 대기)</span>}
        </h2>
        {disputes.length === 0 ? (
          <p className="text-sm text-mauve-light">중재 대기 중인 분쟁이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {disputes.map((d) => (
              <li key={d.id} className="rounded-xl border border-warn/30 bg-warn-soft/40 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/auctions/${d.auctionId}`} className="font-semibold hover:text-bill">
                    {d.auction.item.title}
                  </Link>
                  <span className="num font-semibold">{krw(d.amount)}</span>
                  <span className="text-xs text-mauve">
                    구매자 {d.buyer.nickname} · 판매자 {d.seller.nickname}
                  </span>
                </div>
                <p className="mt-1 text-ink/80">신고 사유: {d.disputeReason}</p>
                <div className="mt-3 flex gap-2">
                  <form action={resolveDisputeAction}>
                    <input type="hidden" name="orderId" value={d.id} />
                    <input type="hidden" name="resolution" value="refund" />
                    <button className={`${btn} bg-ok text-white`}>환불 처리</button>
                  </form>
                  <form action={resolveDisputeAction}>
                    <input type="hidden" name="orderId" value={d.id} />
                    <input type="hidden" name="resolution" value="dismiss" />
                    <button className={`${btn} border border-line-strong text-ink/70`}>기각 (배송 복귀)</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 작가 인증 (M8) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">작가 인증 관리</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {artists.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <Link href={`/artists/${a.id}`} className="font-medium hover:text-bill">
                {a.nickname}
                {a.artistVerified && (
                  <span className="ml-1.5 rounded bg-verdigris-soft px-1.5 py-0.5 text-[11px] font-semibold text-verdigris">
                    인증 ✓
                  </span>
                )}
              </Link>
              <span className="text-xs text-mauve-light">팔로워 {a._count.followers}</span>
              <form action={toggleArtistVerifyAction}>
                <input type="hidden" name="userId" value={a.id} />
                <button className={`${btn} ${a.artistVerified ? "border border-line-strong text-mauve" : "bg-verdigris text-white"}`}>
                  {a.artistVerified ? "인증 해제" : "인증 부여"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {/* 정산 대기 (M21) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          정산 대기 {pendingSettlements.length > 0 && <span className="text-sm text-warn">({pendingSettlements.length}건)</span>}
        </h2>
        {pendingSettlements.length === 0 ? (
          <p className="text-sm text-mauve-light">대기 중인 정산이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {pendingSettlements.map((st) => (
              <li key={st.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="font-medium">{settlementSellers.get(st.sellerId) ?? st.sellerId}</span>
                <span className="num font-bold text-bill">{krw(st.amount)}</span>
                <span className="text-xs text-mauve-light">수수료 {krw(st.fee)} · {new Date(st.createdAt).toLocaleDateString("ko-KR")}</span>
                <form action={settleSettlementAction}>
                  <input type="hidden" name="settlementId" value={st.id} />
                  <button className={`${btn} bg-ok text-white`}>정산 완료</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 1:1 문의 (M21) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          미답변 문의 {inquiries.length > 0 && <span className="text-sm text-warn">({inquiries.length}건)</span>}
        </h2>
        {inquiries.length === 0 ? (
          <p className="text-sm text-mauve-light">미답변 문의가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {inquiries.map((inq) => (
              <li key={inq.id} className="rounded-xl border border-line bg-card p-4 text-sm">
                <p className="font-semibold">{inq.subject} <span className="text-xs font-normal text-mauve-light">{inquiryUsers.get(inq.userId) ?? ""} · {new Date(inq.createdAt).toLocaleString("ko-KR")}</span></p>
                <p className="mt-1 whitespace-pre-wrap text-ink/80">{inq.body}</p>
                <form action={answerInquiryAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="inquiryId" value={inq.id} />
                  <input name="answer" required placeholder="답변 입력" className="flex-1 rounded-lg border border-line-strong px-2 py-1.5 text-xs" />
                  <button className={`${btn} bg-duck text-ink`}>답변</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 공지 작성 (M21) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">공지 작성</h2>
        <form action={createNoticeAction} className="space-y-2 rounded-xl border border-line bg-card p-4 text-sm">
          <input name="title" required placeholder="공지 제목" className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm" />
          <textarea name="body" required rows={3} placeholder="내용" className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="pinned" className="accent-bill" /> 홈 배너에 고정</label>
            <button className={`${btn} bg-duck text-ink`}>게시</button>
          </div>
        </form>
      </section>

      {/* 감사 로그 (M21) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">최근 운영 기록</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-card text-xs">
          {auditLogs.length === 0 ? (
            <li className="p-3 text-mauve-light">기록 없음</li>
          ) : (
            auditLogs.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-2 p-2.5">
                <span className="font-semibold">{log.action}</span>
                <span className="text-mauve">{log.targetType} · {log.detail ?? log.targetId.slice(-8)}</span>
                <span className="text-mauve-light">{new Date(log.createdAt).toLocaleString("ko-KR")}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* 최근 주문 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">최근 주문</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {recentOrders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{o.auction.item.title}</span>
              <span className="font-semibold">{krw(o.amount)}</span>
              <span className="text-xs text-mauve-light">{o.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
