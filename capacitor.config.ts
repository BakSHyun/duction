import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 덕션 하이브리드 앱 (M18) — 네이티브 셸이 배포된 웹 서비스를 로드한다.
 * 서버(경매 엔진)는 재작성하지 않는다 — ARCHITECTURE.md §4.16 원칙.
 *
 * - 개발:   CAP_SERVER_URL=http://<맥의 LAN IP>:3000 npx cap sync
 * - 운영:   실배포 후 아래 PROD_URL을 실제 도메인으로 교체 (스토어 제출의 전제조건)
 */
const PROD_URL = "https://duction.co";

const devUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.duction.app",
  appName: "덕션",
  // webDir는 오프라인 폴백 셸 — 실제 앱은 server.url에서 로드
  webDir: "app-shell",
  server: {
    url: devUrl ?? PROD_URL,
    // 개발 편의: LAN http 허용 (운영 빌드에서는 devUrl 미지정 → https만)
    cleartext: !!devUrl,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#FFD400",
      launchShowDuration: 800,
      launchAutoHide: true,
    },
  },
};

export default config;
