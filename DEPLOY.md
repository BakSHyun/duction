# 덕션 배포 가이드

> ⚡ **2026-07-12 실배포 진행됨 (M25)** — Arcaddy 스택 편입 구성:
> GCP `duction-app`(Cloud Run duction-web, 서울) + Supabase `duction`(xttkbkprmbktqzbmpnur, 서울)
> + Cloudflare R2 `duction-media`(r2.dev 공개 URL) + duction.co(프록시 워커 deploy/duction-proxy).
> 아래 Vercel 가이드는 대안 경로로 보존.

> 대상: 첫 실서비스 배포 (베타 오픈 수준).
> 권장 조합: **Vercel(앱) + Neon 또는 Supabase(PostgreSQL) + Cloudflare R2(이미지)** — 전부 무료 티어로 시작 가능.

---

## 1. PostgreSQL 전환 — ✅ 완료 (2026-07-11)

- provider `postgresql` + `DATABASE_URL` env — 적용됨 (로컬은 docker compose의 Postgres)
- `FOR UPDATE` row lock — `placeBid`·`buyNow`·`settleExpired`에 적용됨 (`scripts/test-concurrency.ts`로 검증)
- 배포 시 남은 일: Neon/Supabase에 DB 생성 → 운영 `DATABASE_URL` 설정 → `npx prisma migrate deploy`
- (선택) 상태값 String → Postgres enum 전환은 이후 리팩토링으로

---

## 2. Vercel 배포

1. GitHub 리포지토리에 push
2. Vercel에서 Import → 프레임워크 자동 감지(Next.js)
3. 환경변수 등록: `DATABASE_URL`
4. Build Command 기본값 사용. `postinstall`에 `prisma generate` 추가:
   ```json
   "scripts": { "postinstall": "prisma generate" }
   ```
5. 배포 후 마이그레이션은 로컬에서 운영 DB를 향해 실행:
   ```bash
   DATABASE_URL="<운영DB>" npx prisma migrate deploy
   ```

---

## 3. 이미지 스토리지 전환 (R2)

현재 `src/app/actions.ts`의 `createListingAction`이 `public/uploads`에 로컬 저장한다.
**Vercel은 파일시스템이 휘발성이라 이대로 배포하면 업로드 이미지가 사라진다. 배포 전 필수 전환.**

1. Cloudflare R2 버킷 생성 + 공개 도메인(또는 커스텀 도메인) 연결
2. `@aws-sdk/client-s3` 설치 (R2는 S3 호환)
3. `actions.ts`의 `writeFile(...)` 부분을 S3 `PutObjectCommand`로 교체, URL을 R2 공개 URL로 저장
4. 환경변수: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`

---

## 4. 경매 마감 처리 전환

현재는 페이지 조회 시 `settleExpired()`를 호출하는 lazy 방식 — 트래픽이 있으면 사실상 실시간이지만, 새벽 등 무트래픽 구간에서 마감 처리가 지연된다 (결제 기한 24시간이 조회 시점부터 시작되므로 치명적이진 않음).

**1단계 (간단)**: Vercel Cron으로 1분마다 정산 엔드포인트 호출
```json
// vercel.json
{ "crons": [{ "path": "/api/cron/settle", "schedule": "* * * * *" }] }
```
`/api/cron/settle` 라우트를 만들어 `settleExpired()` 호출 + `CRON_SECRET` 헤더 검증.

**2단계 (규모 확대 시)**: Redis + BullMQ 지연 잡 — 경매별 정확한 마감 시각에 처리, soft-close 연장 시 잡 재스케줄.

---

## 5. 환경변수·시크릿 목록

| 변수 | 용도 | 시점 |
|---|---|---|
| `DATABASE_URL` | Postgres | 필수 |
| `CRON_SECRET` | 정산 크론 보호 | 크론 도입 시 |
| `R2_*` (5개) | 이미지 스토리지 | 배포 전 필수 |
| `TOSS_SECRET_KEY` 등 | 에스크로 결제 | PG 계약 후 |

---

## 6. 실서비스 오픈 전 체크리스트

**기술**
- [ ] Postgres 전환 + `FOR UPDATE` 락 (§1)
- [ ] R2 이미지 전환 (§3) — Vercel 배포 시 필수
- [ ] 정산 크론 (§4)
- [ ] 입찰/로그인 rate limit (Upstash Ratelimit 등)
- [ ] 이미지 리사이징 (`next/image` + R2 로더) — 현재 `<img>` 태그 사용 중
- [ ] DB 백업 설정 (Neon/Supabase 자동 백업 확인)
- [ ] 에러 트래킹 (Sentry)
- [ ] OG 카드 (경매별 대표 이미지 + 현재가) — 트위터 공유 최적화

**비즈니스·법률 (PLANNING.md §8)**
- [ ] 사업자등록 + 통신판매중개업 신고
- [ ] 토스페이먼츠/포트원 에스크로 심사 → 모의 결제를 실결제로 교체
- [ ] 휴대폰 본인인증 도입 (현재 이메일 가입은 데모용)
- [ ] 이용약관·개인정보처리방침 (팩토리 정책 §13.4 명문화 포함)
- [ ] 만 14세 미만 가입 제한

**운영**
- [ ] 어드민 페이지 (신고 처리, 유저 제재) — 오픈 전 필수
- [ ] 신고 접수 채널 (초기엔 이메일/폼으로 시작 가능)
