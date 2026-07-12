import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 컨테이너용 최소 런타임 (ARCHITECTURE.md §4)
  output: "standalone",
  // duction.co → Cloudflare Worker 프록시 → Cloud Run 구조에서
  // Host 재작성 때문에 서버 액션 CSRF 검증(origin vs x-forwarded-host)이 어긋난다 (M25)
  experimental: {
    serverActions: {
      allowedOrigins: ["duction.co", "www.duction.co"],
    },
  },
  outputFileTracingIncludes: {
    // 동적 OG 이미지의 한글 폰트 — 경로가 동적이라 트레이싱이 놓치므로 명시
    "/auctions/[id]/opengraph-image": ["./src/assets/**"],
  },
};

export default nextConfig;
