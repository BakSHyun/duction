import type { MetadataRoute } from "next";

// PWA 설치형 앱 (M17 1단계) — 홈 화면 추가 시 앱처럼 실행
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "덕션 — 브라이스 옥션 하우스",
    short_name: "덕션",
    description: "브라이스 수집가를 위한 안전한 경매. 입찰 기록 공개, 에스크로 안전거래.",
    start_url: "/",
    display: "standalone",
    background_color: "#FCFCFA",
    theme_color: "#FFD400",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
