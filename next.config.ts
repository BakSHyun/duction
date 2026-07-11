import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 컨테이너용 최소 런타임 (ARCHITECTURE.md §4)
  output: "standalone",
  outputFileTracingIncludes: {
    // 동적 OG 이미지의 한글 폰트 — 경로가 동적이라 트레이싱이 놓치므로 명시
    "/auctions/[id]/opengraph-image": ["./src/assets/**"],
  },
};

export default nextConfig;
