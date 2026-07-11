import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

// 데모용 SVG 플레이스홀더 이미지 생성
async function createPlaceholders() {
  const dir = path.join(process.cwd(), "public", "seed");
  await mkdir(dir, { recursive: true });
  const palettes = [
    ["#fda4af", "#fb7185"],
    ["#f9a8d4", "#f472b6"],
    ["#c4b5fd", "#a78bfa"],
    ["#fcd34d", "#fbbf24"],
    ["#a5f3fc", "#67e8f9"],
    ["#bbf7d0", "#86efac"],
  ];
  for (let i = 0; i < palettes.length; i++) {
    const [c1, c2] = palettes[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
</linearGradient></defs>
<rect width="600" height="600" fill="url(#g)"/>
<circle cx="300" cy="240" r="110" fill="#fff" opacity="0.85"/>
<circle cx="260" cy="225" r="22" fill="#57534e"/>
<circle cx="340" cy="225" r="22" fill="#57534e"/>
<circle cx="267" cy="218" r="7" fill="#fff"/>
<circle cx="347" cy="218" r="7" fill="#fff"/>
<path d="M280 285 Q300 300 320 285" stroke="#57534e" stroke-width="6" fill="none" stroke-linecap="round"/>
<rect x="240" y="360" width="120" height="140" rx="24" fill="#fff" opacity="0.85"/>
<text x="300" y="560" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#fff" font-weight="bold">Blythe Sample ${i + 1}</text>
</svg>`;
    await writeFile(path.join(dir, `doll-${i + 1}.svg`), svg);
  }
}

// 운영 시드 가드 (M25): SEED_DEMO=1 일 때만 데모 유저·경매 생성.
// 운영 DB에는 카테고리·모델 도감만 들어간다 (데모 계정의 약한 비밀번호 유출 방지).
const SEED_DEMO = process.env.SEED_DEMO === "1";

async function main() {
  if (SEED_DEMO) await createPlaceholders();

  // ---------- 카테고리 ----------
  const cat = async (name: string, slug: string, sortOrder: number, parentId?: string) =>
    prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, sortOrder, parentId },
    });

  const body = await cat("인형 본체", "body", 0);
  const neo = await cat("네오 브라이스", "neo", 0, body.id);
  await cat("미디 브라이스", "middie", 1, body.id);
  await cat("쁘띠 브라이스", "petite", 2, body.id);
  await cat("빈티지 (켄너)", "vintage", 3, body.id);
  const customFull = await cat("커스텀 브라이스", "custom-full", 1);
  const parts = await cat("커스텀 소재·부속", "parts", 2);
  const eyechips = await cat("아이칩", "eyechips", 0, parts.id);
  await cat("스칼프·가발", "scalp", 1, parts.id);
  await cat("페이스플레이트·돔", "faceplate", 2, parts.id);
  await cat("교체 바디", "body-parts", 3, parts.id);
  const outfit = await cat("아웃핏", "outfit", 3);
  const outfitHandmade = await cat("작가제 아웃핏", "outfit-handmade", 0, outfit.id);
  await cat("기성품 아웃핏", "outfit-official", 1, outfit.id);
  await cat("슈즈·소품", "accessories", 4);

  // ---------- 브라이스 모델 도감 (초기 시드 — 계속 확충) ----------
  const models: [string, string, number][] = [
    ["Parco Limited Edition", "NEO", 2001],
    ["Holly Wood", "NEO", 2001],
    ["Sunday Best", "NEO", 2001],
    ["All Gold In One", "NEO", 2001],
    ["Rosie Red", "NEO", 2002],
    ["Mondrian", "NEO", 2002],
    ["Kozy Kape", "NEO", 2002],
    ["Cinnamon Girl", "NEO", 2003],
    ["Red Delicious", "NEO", 2006],
    ["Cherry Beach Sunset", "NEO", 2007],
    ["Simply Chocolate", "NEO", 2009],
    ["Simply Vanilla", "NEO", 2009],
    ["Yellow Marshmallow", "MIDDIE", 2010],
    ["Jackie Ramone", "MIDDIE", 2013],
    ["Kenner Blythe", "VINTAGE", 1972],
  ];
  for (const [name, line, releaseYear] of models) {
    await prisma.blytheModel.upsert({
      where: { name_line: { name, line } },
      update: {},
      create: { name, line, releaseYear },
    });
  }
  const holly = await prisma.blytheModel.findUniqueOrThrow({
    where: { name_line: { name: "Holly Wood", line: "NEO" } },
  });
  const chocolate = await prisma.blytheModel.findUniqueOrThrow({
    where: { name_line: { name: "Simply Chocolate", line: "NEO" } },
  });

  if (!SEED_DEMO) {
    console.log("운영 시드 완료: 카테고리 + 모델 도감만 생성 (SEED_DEMO=1 로 데모 데이터 포함 가능)");
    return;
  }

  // ---------- 데모 유저 ----------
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = async (email: string, nickname: string, extra = {}) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, nickname, passwordHash, ...extra },
    });
  const seller1 = await user("seller@duction.kr", "브라이스집사", { salesCount: 12, ratingAvg: 4.9, ratingCount: 12 });
  const artist = await user("artist@duction.kr", "달빛공방", { salesCount: 34, ratingAvg: 5.0, ratingCount: 30 });
  const bidder1 = await user("bidder1@duction.kr", "홀리우드덕후");
  const bidder2 = await user("bidder2@duction.kr", "솜사탕");
  await user("admin@duction.kr", "덕션운영팀", { isAdmin: true });
  // 기존 DB 재실행 대비 — 어드민 플래그 보장
  await prisma.user.update({ where: { email: "admin@duction.kr" }, data: { isAdmin: true } });

  // 덕력 데모 백필 (M14) — 로그 합계 == duckPower 불변식 유지
  const duckBackfill: [string, number][] = [
    [artist.id, 2350], // 황금오리
    [seller1.id, 940], // 청둥오리
    [bidder1.id, 320], // 노랑오리
    [bidder2.id, 120], // 아기오리
  ];
  for (const [userId, power] of duckBackfill) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.duckPower === 0) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { duckPower: power } }),
        prisma.duckPowerLog.create({
          data: { userId, amount: power, reason: "과거 거래 이력 반영 (데모)" },
        }),
      ]);
    }
  }

  // 작가 프로필 + 팔로우 데모 (M5)
  await prisma.user.update({
    where: { id: artist.id },
    data: {
      isArtist: true,
      artistBio:
        "2021년부터 활동 중인 커스텀 공방입니다. 내추럴 페이스업과 수제 아이칩이 주력이고, 분양 이력 30회+ 전량 무사고 거래입니다.",
      artistSns: "https://twitter.com/moonlight_atelier",
    },
  });
  for (const followerId of [bidder1.id, bidder2.id]) {
    await prisma.artistFollow.upsert({
      where: { followerId_artistId: { followerId, artistId: artist.id } },
      update: {},
      create: { followerId, artistId: artist.id },
    });
  }

  const h = 3600 * 1000;
  const now = Date.now();

  // 낙찰 히스토리 데모 (도감 시세용) — 자체 가드로 1회만 생성
  const soldHistoryExists = await prisma.item.count({ where: { title: { startsWith: "[시세데모]" } } });
  if (soldHistoryExists === 0) {
    const soldDemo: [number, number, string, string][] = [
      // [낙찰가, 며칠 전 종료, 상태등급, 커스텀레벨]
      [385_000, 30, "B", "NONE"],
      [420_000, 14, "A", "NONE"],
      [710_000, 7, "A", "FULL"], // 커스텀 — 기본 시세에서 제외되는 것 확인용
    ];
    for (const [price, daysAgo, grade, customLevel] of soldDemo) {
      await prisma.item.create({
        data: {
          sellerId: seller1.id,
          categoryId: neo.id,
          title: `[시세데모] 홀리우드 낙찰 기록 (${grade}급)`,
          description: "시세 히스토리 데모 데이터입니다.",
          conditionGrade: grade,
          authenticity: "GENUINE",
          blytheModelId: holly.id,
          customLevel,
          customArtist: customLevel === "FULL" ? "달빛공방" : null,
          images: { create: [{ url: "/seed/doll-1.svg", isProofShot: true }] },
          auction: {
            create: {
              startPrice: 200_000,
              currentPrice: price,
              endsAt: new Date(now - daysAgo * 24 * h),
              status: "ENDED_SOLD",
              winnerId: bidder2.id,
              bidCount: 5,
            },
          },
        },
      });
    }
    console.log("낙찰 히스토리 데모 3건 생성 (홀리우드)");
  }

  // 분양 예고(SCHEDULED) 데모 — 자체 가드
  const scheduledExists = await prisma.auction.count({ where: { status: "SCHEDULED" } });
  if (scheduledExists === 0) {
    await prisma.item.create({
      data: {
        sellerId: artist.id,
        categoryId: customFull.id,
        title: "[달빛공방 분양 예고] 풀커스텀 브라이스 '오로라' — 내일 저녁 8시 오픈",
        description:
          "홀리우드 베이스 풀커스텀 예고입니다.\n- 글리터 페이스업, 오로라 아이칩 4종\n- 시작 전까지 입찰이 잠겨 있어요. 찜하고 기다려주세요!",
        conditionGrade: "A",
        authenticity: "GENUINE",
        customLevel: "FULL",
        customArtist: "달빛공방",
        customDetails: "글리터 페이스업, 오로라 아이칩 4종, 오비츠24 바디",
        images: { create: [{ url: "/seed/doll-2.svg", isProofShot: true }] },
        auction: {
          create: {
            startPrice: 400_000,
            currentPrice: 400_000,
            reservePrice: 600_000,
            startsAt: new Date(now + 28 * h),
            endsAt: new Date(now + (28 + 72) * h),
            status: "SCHEDULED",
          },
        },
      },
    });
    console.log("분양 예고 데모 1건 생성");
  }

  // 데모 경매 재실행 시 중복 방지
  const existing = await prisma.auction.count({ where: { status: "LIVE" } });
  if (existing > 0) {
    console.log("이미 경매 데이터가 있어 데모 경매 생성을 건너뜁니다.");
    return;
  }

  // ---------- 데모 경매 ----------
  // 1. 홀리우드 풀셋 — 입찰 경쟁 중 (마감 임박)
  const a1 = await prisma.item.create({
    data: {
      sellerId: seller1.id,
      categoryId: neo.id,
      title: "네오 브라이스 홀리우드 풀셋 (2001) — 헤어 원상태",
      description:
        "2001년 홀리우드입니다. 박스, 증지, 스탠드, 기본 아웃핏 모두 있습니다.\n헤어 컷팅·리루팅 이력 없고 아이 메커니즘 4방향 모두 정상 작동합니다.\n페이스 기스 없음, 20년 된 제품 특성상 미세한 변색은 감안해주세요.",
      conditionGrade: "B",
      authenticity: "GENUINE",
      blytheModelId: holly.id,
      fullSetBox: true,
      fullSetCert: true,
      fullSetStand: true,
      fullSetOutfit: true,
      images: { create: [{ url: "/seed/doll-1.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 300_000,
          currentPrice: 415_000,
          buyNowPrice: 650_000,
          endsAt: new Date(now + 3 * h),
          bidCount: 3,
        },
      },
    },
    include: { auction: true },
  });
  await prisma.bid.createMany({
    data: [
      { auctionId: a1.auction!.id, bidderId: bidder1.id, amount: 300_000, maxProxyAmount: 350_000, status: "OUTBID", createdAt: new Date(now - 20 * h) },
      { auctionId: a1.auction!.id, bidderId: bidder2.id, amount: 360_000, maxProxyAmount: 400_000, status: "OUTBID", isAuto: true, createdAt: new Date(now - 10 * h) },
      { auctionId: a1.auction!.id, bidderId: bidder1.id, amount: 415_000, maxProxyAmount: 500_000, status: "ACTIVE", createdAt: new Date(now - 2 * h) },
    ],
  });

  // 2. 작가 커스텀 분양
  await prisma.item.create({
    data: {
      sellerId: artist.id,
      categoryId: customFull.id,
      title: "[달빛공방 분양] 풀커스텀 브라이스 '루나' — 페이스업·카빙·아이칩 4종",
      description:
        "심플리 초콜릿 베이스 풀커스텀입니다.\n- 페이스업 (매트 마감)\n- 입술·코 카빙\n- 수제 아이칩 4종 교체\n- 오비츠24 바디 교체\n- 수제 원피스 1벌 포함\n\n분양 후 커스텀 관련 A/S 1회 가능합니다.",
      conditionGrade: "A",
      authenticity: "GENUINE",
      blytheModelId: chocolate.id,
      customLevel: "FULL",
      customArtist: "달빛공방",
      customDetails: "페이스업, 입술·코 카빙, 수제 아이칩 4종, 오비츠24 바디",
      images: { create: [{ url: "/seed/doll-2.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 500_000,
          currentPrice: 500_000,
          endsAt: new Date(now + 72 * h),
          bidCount: 0,
        },
      },
    },
  });

  // 3. 팩토리 — 강제 구분 표시 데모
  await prisma.item.create({
    data: {
      sellerId: seller1.id,
      categoryId: neo.id,
      title: "팩토리 브라이스 — 커스텀 베이스용 (RBL 타입)",
      description:
        "커스텀 연습·베이스용 팩토리돌입니다. 팩토리 제품임을 명확히 고지합니다.\n아이 메커니즘 정상, 바디 기스 약간 있습니다.",
      conditionGrade: "B",
      authenticity: "FACTORY",
      images: { create: [{ url: "/seed/doll-3.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 40_000,
          currentPrice: 52_000,
          buyNowPrice: 90_000,
          endsAt: new Date(now + 30 * h),
          bidCount: 2,
        },
      },
    },
  });

  // 4. 작가제 아웃핏
  await prisma.item.create({
    data: {
      sellerId: artist.id,
      categoryId: outfitHandmade.id,
      title: "[핸드메이드] 네오 브라이스 빅토리안 드레스 세트 (모자 포함)",
      description: "네오 사이즈 빅토리안 드레스 + 보닛 세트입니다. 시착만 했습니다.",
      conditionGrade: "A",
      authenticity: "GENUINE",
      images: { create: [{ url: "/seed/doll-4.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 30_000,
          currentPrice: 41_000,
          endsAt: new Date(now + 8 * h),
          bidCount: 4,
        },
      },
    },
  });

  // 5. 아이칩
  await prisma.item.create({
    data: {
      sellerId: seller1.id,
      categoryId: eyechips.id,
      title: "수제 아이칩 2종 세트 — 오로라 그린 / 스모키 브라운 (14mm)",
      description: "레진 수제 아이칩 2종입니다. 네오 브라이스 호환 14mm.",
      conditionGrade: "S",
      authenticity: "GENUINE",
      images: { create: [{ url: "/seed/doll-5.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 15_000,
          currentPrice: 15_000,
          buyNowPrice: 35_000,
          endsAt: new Date(now + 50 * h),
          bidCount: 0,
        },
      },
    },
  });

  // 6. 미개봉 신품
  await prisma.item.create({
    data: {
      sellerId: seller1.id,
      categoryId: neo.id,
      title: "네오 브라이스 심플리 바닐라 미개봉 (2009)",
      description: "미개봉 신품입니다. 박스 모서리 눌림 약간 있습니다 (사진 참조).",
      conditionGrade: "S",
      authenticity: "GENUINE",
      fullSetBox: true,
      fullSetCert: true,
      images: { create: [{ url: "/seed/doll-6.svg", isProofShot: true }] },
      auction: {
        create: {
          startPrice: 180_000,
          currentPrice: 180_000,
          buyNowPrice: 280_000,
          endsAt: new Date(now + 120 * h),
          bidCount: 0,
        },
      },
    },
  });

  console.log("시드 완료: 카테고리 14개, 모델 도감 15개, 유저 4명, 데모 경매 6건");
  console.log("데모 계정: seller@duction.kr / artist@duction.kr / bidder1@duction.kr / bidder2@duction.kr (비밀번호 공통: password123)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
