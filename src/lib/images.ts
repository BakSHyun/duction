import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * 이미지 업로드 파이프라인 (M23 → M25 R2 지원)
 * 원본을 그대로 저장하지 않는다 — 최대 1600px 리사이징 + WebP 변환으로
 * 용량을 1/5~1/10로 줄인다.
 *
 * 저장소 (env로 자동 전환):
 * - R2_* env 설정 시 → Cloudflare R2 (운영 — Cloud Run은 파일시스템이 휘발성)
 * - 미설정 시 → 로컬 public/uploads (개발)
 */

const r2Configured =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET &&
  !!process.env.R2_PUBLIC_URL;

async function getR2() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function processAndSaveImage(file: File): Promise<string> {
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());

  const processed = await sharp(input, { failOn: "error" })
    .rotate() // EXIF 회전 보정 (폰 사진 필수)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const name = `${randomBytes(8).toString("hex")}.webp`;

  if (r2Configured) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getR2();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: `uploads/${name}`,
        Body: processed,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/uploads/${name}`;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, name), processed);
  return `/uploads/${name}`;
}
