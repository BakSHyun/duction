# 덕션 앱 — 빌드·스토어 제출 가이드

> 하이브리드(Capacitor) 구성 — 네이티브 셸이 배포된 웹 서비스를 로드한다.
> 서버·웹 코드는 앱을 위해 아무것도 재작성하지 않았다 (ARCHITECTURE.md §4.16 원칙).

## 0. 전제조건 — 스토어 제출에 반드시 필요한 것

| 항목 | 내용 | 상태 |
|---|---|---|
| **실배포 HTTPS 도메인** | 앱이 로드할 주소. `capacitor.config.ts`의 `PROD_URL` 교체 | ❌ **유일한 기술적 블로커** (DEPLOY.md) |
| Apple Developer Program | 연 $99 — App Store 제출용 | ❌ 계정 필요 |
| Google Play Console | 1회 $25 — Play 스토어 제출용 | ❌ 계정 필요 |
| 네이티브 프로젝트 (iOS/Android) | 아이콘·스플래시 포함 | ✅ 완료 |
| Android 빌드 검증 | debug APK 빌드 성공 | ✅ 완료 |

## 1. 로컬에서 앱 실행해보기 (지금 가능)

```bash
# 1) 웹 서버 실행 (docker compose up -d postgres && npm run dev)
# 2) 맥의 LAN IP 확인 (예: 192.168.0.10)
CAP_SERVER_URL=http://192.168.0.10:3000 npx cap sync

# Android — 에뮬레이터/실기기
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npx cap run android

# iOS — 시뮬레이터
npx cap run ios
```
> ⚠ Android 빌드는 **Java 21** 필요 — Android Studio 내장 JBR 사용 (위 JAVA_HOME).

## 2. 스토어용 릴리스 빌드

### 공통 선행 작업
1. 실배포 완료 후 `capacitor.config.ts`의 `PROD_URL`을 실제 도메인으로 교체
2. `npx cap sync` (CAP_SERVER_URL **없이** — cleartext 비활성, https만)

### Android (Play 스토어)
```bash
# 1) 서명 키 생성 (한 번만 — 분실 시 앱 업데이트 불가, 백업 필수!)
keytool -genkey -v -keystore duction-release.keystore -alias duction \
  -keyalg RSA -keysize 2048 -validity 10000

# 2) android/app/build.gradle에 signingConfig 추가 후 AAB 빌드
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab 를 Play Console에 업로드
```

### iOS (App Store)
1. Xcode에서 `ios/App/App.xcodeproj` 열기 → Signing & Capabilities에서 팀 선택 (개발자 계정)
2. Product → Archive → Distribute App → App Store Connect
3. 버전·빌드 번호는 Xcode 프로젝트 설정에서 관리

## 3. 심사 리스크와 대응 (중요)

### Apple 4.2 (Minimum Functionality) — "웹사이트 래퍼" 리젝 위험
순수 웹뷰 래퍼는 리젝될 수 있다. 대응 순서:
1. **네이티브 푸시(FCM/APNs) 추가** — 가장 효과적인 "앱다움". `@capacitor/push-notifications`
   플러그인 + 서버의 `fcmChannel` 어댑터(자리 만들어둠) 구현
2. 스플래시·아이콘·세이프에어리어 ✅ (완료 — 앱스러운 첫인상)
3. 그래도 리젝되면: 생체인증 로그인, 카메라 직접 촬영 등록 등 네이티브 기능 추가
4. **대안 전략**: Android(구글은 웹뷰 앱에 관대)를 먼저 출시하고, iOS는 네이티브 푸시까지
   붙여서 제출하는 순서를 권장

### 심사 제출 정보 준비물
- 심사용 데모 계정 (테스트 로그인 계정 — 시드의 데모 계정 활용 가능)
- 개인정보처리방침 URL (필수), 스크린샷 (6.7"/5.5" iPhone, 태블릿)
- 앱 설명·키워드: BRAND.md 보이스로 작성 ("브라이스 수집가를 위한 안전한 경매")
- 연령 등급: 만 14세+ (거래 서비스)

## 4. 네이티브 푸시 (FCM) — ✅ 코드 완료, Firebase 설정만 남음

구현된 것: 앱 시작 시 토큰 수집·서버 저장(`NativePush`), FCM 발송 채널(`src/lib/fcm.ts`,
firebase-admin), 만료 토큰 자동 정리, 앱에서는 웹푸시 토글 자동 숨김, 알림 탭 → 해당 화면 이동.

**활성화 절차 (계정 생기면 30분):**
1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 (무료)
2. **Android**: 앱 추가(패키지명 `com.duction.app`) → `google-services.json` 다운로드 →
   `android/app/`에 복사 (빌드 스크립트가 파일 존재 시 자동 활성화)
3. **iOS**: 앱 추가(번들ID 동일) → `GoogleService-Info.plist` → Xcode에서 App 타깃에 추가.
   Apple Developer 콘솔에서 APNs 인증 키(.p8) 생성 → Firebase 프로젝트 설정에 업로드.
   Xcode → Signing & Capabilities → **Push Notifications** capability 추가
4. **서버**: Firebase 프로젝트 설정 → 서비스 계정 → 새 비공개 키 →
   `.env`의 `FCM_SERVICE_ACCOUNT_JSON`에 JSON(원문 또는 base64) 설정 — 즉시 발송 활성화

## 5. 버전·업데이트 전략

- 웹이 본체이므로 **대부분의 기능 업데이트는 앱 심사 없이 즉시 반영**된다 (하이브리드의 최대 장점)
- 네이티브 셸 변경(플러그인 추가 등)이 있을 때만 스토어 업데이트 제출
- `appId: com.duction.app` — 한 번 제출하면 변경 불가. 도메인 확정 후 바꾸려면 지금이 마지막 기회
