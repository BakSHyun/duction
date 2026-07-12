import Link from "next/link";
import { krw } from "@/lib/format";
import { AuthenticityBadge, GradeBadge } from "./Badges";
import Countdown from "./Countdown";

type AuctionCardProps = {
  auction: {
    id: string;
    currentPrice: number;
    buyNowPrice: number | null;
    bidCount: number;
    startsAt: Date;
    endsAt: Date;
    status: string;
    item: {
      title: string;
      conditionGrade: string;
      authenticity: string;
      customLevel?: string;
      customArtist?: string | null;
      images: { url: string }[];
    };
  };
};

export default function AuctionCard({ auction }: AuctionCardProps) {
  const img = auction.item.images[0]?.url;
  const scheduled = auction.status === "SCHEDULED";
  const ended = auction.status !== "LIVE" && !scheduled;
  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_0_rgba(38,35,28,0.03)] transition duration-300 hover:-translate-y-1 hover:border-bill/25 hover:shadow-[0_18px_40px_rgba(43,33,38,0.10)]"
    >
      <div className="relative aspect-square overflow-hidden bg-blush">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={auction.item.title}
            className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${ended ? "opacity-50" : ""}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mauve-light">no image</div>
        )}
        {ended && (
          <span className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
            {auction.status === "ENDED_SOLD" ? "낙찰" : "유찰"}
          </span>
        )}
        {scheduled && (
          <span className="absolute left-2 top-2 rounded bg-wisteria/90 px-2 py-0.5 text-xs font-semibold text-white">
            예고
          </span>
        )}
      </div>
      <div className="space-y-2 p-3.5 sm:p-4">
        <div className="flex flex-wrap gap-1">
          {auction.item.customLevel === "FULL" && auction.item.customArtist && (
            <span className="rounded bg-wisteria-soft px-1.5 py-0.5 text-[11px] font-semibold text-wisteria">
              분양
            </span>
          )}
          <AuthenticityBadge value={auction.item.authenticity} />
          <GradeBadge value={auction.item.conditionGrade} />
        </div>
        <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug tracking-[-0.01em]">{auction.item.title}</p>
        <p className="num font-display text-lg font-extrabold tracking-[-0.03em] text-ink">{krw(auction.currentPrice)}</p>
        <div className="flex items-center justify-between text-xs text-mauve">
          <span>입찰 {auction.bidCount}건</span>
          {ended ? (
            <span>종료</span>
          ) : scheduled ? (
            <span className="font-semibold text-wisteria">
              시작까지 <Countdown endsAt={auction.startsAt.toISOString()} overText="곧 시작" />
            </span>
          ) : (
            <Countdown endsAt={auction.endsAt.toISOString()} />
          )}
        </div>
      </div>
    </Link>
  );
}
