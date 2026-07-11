#!/usr/bin/env bash
# 덕션 GCP 프로젝트 셋업 (M25) — Arcaddy와 분리된 새 프로젝트.
# 전제: gcloud auth login 완료. 실행: bash scripts/setup-gcp.sh
set -euo pipefail

PROJECT_ID="${DUCTION_PROJECT_ID:-duction-app}"
REGION="asia-northeast3"
REPO="BakSHyun/duction"
SA_NAME="github-deployer"

echo "== 1/6 프로젝트 생성: $PROJECT_ID"
gcloud projects create "$PROJECT_ID" --name="Duction" 2>/dev/null || echo "  (이미 존재 — 계속)"

echo "== 2/6 결제 계정 연결 (Arcaddy와 같은 계정)"
BILLING=$(gcloud billing accounts list --format="value(name)" --filter="open=true" | head -1)
[ -z "$BILLING" ] && { echo "열린 결제 계정 없음 — 콘솔에서 확인 필요"; exit 1; }
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING"

echo "== 3/6 API 활성화"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com --project "$PROJECT_ID"

echo "== 4/6 배포 서비스 계정 + Workload Identity Federation ($REPO)"
gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" 2>/dev/null || true
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin \
            roles/artifactregistry.admin roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role="$ROLE" --condition=None --quiet > /dev/null
done

gcloud iam workload-identity-pools create github-pool --project "$PROJECT_ID" \
  --location=global --display-name="GitHub Actions" 2>/dev/null || true
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project "$PROJECT_ID" --location=global --workload-identity-pool=github-pool \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO'" 2>/dev/null || true

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$REPO" --quiet > /dev/null

echo "== 5/6 GitHub 리포 Variables 등록 (Actions 배포 활성화)"
gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "$WIF_PROVIDER"
gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$SA_EMAIL"

echo "== 6/6 완료"
echo "PROJECT_ID=$PROJECT_ID"
echo "WIF_PROVIDER=$WIF_PROVIDER"
echo "SA=$SA_EMAIL"
echo "다음: 최초 배포는 로컬에서 'gcloud run deploy duction-web --source . --region $REGION --project $PROJECT_ID' 또는 GitHub Actions 재실행"
