// Cloud Run은 자신의 *.run.app 호스트가 아니면 요청을 거부하므로
// duction.co 요청의 Host를 Cloud Run URL로 재작성해 전달한다 (Arcaddy 패턴).
const ORIGIN = "duction-web-948368048688.asia-northeast3.run.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const originalHost = url.hostname;
    url.protocol = "https:";
    url.hostname = ORIGIN;
    const headers = new Headers(request.headers);
    // Next.js 서버 액션 CSRF 검증이 origin과 대조하는 값 — 원래 도메인 유지
    headers.set("x-forwarded-host", originalHost);
    headers.set("x-forwarded-proto", "https");
    return fetch(new Request(url, new Request(request, { headers })));
  },
};
