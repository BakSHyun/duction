import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * 이미지 업로드 파이프라인 (M23 → M25 R2 지원)
 * 원본을 그대로 저장하지 않는다 — 최대 1600px 리사이징 + WebP 변환으로
 * 용량을 1/5~1/10로 줄인다.
 *
 * 저장소 (env로 자동 전환, 우선순위):
 * 1. R2_* env → Cloudflare R2
 * 2. SUPABASE_URL + SUPABASE_SERVICE_KEY → Supabase Storage (현 운영 — M25)
 * 3. 로컬 public/uploads (개발 전용 — Cloud Run에서는 서빙 불가)
 */

const supabaseConfigured =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;

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

  if (supabaseConfigured) {
    const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
    const key = `uploads/${name}`;
    const res = await fetch(`${base}/storage/v1/object/media/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(processed),
    });
    if (!res.ok) throw new Error(`storage upload failed: ${res.status} ${await res.text()}`);
    return `${base}/storage/v1/object/public/media/${key}`;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, name), processed);
  return `/uploads/${name}`;
}
