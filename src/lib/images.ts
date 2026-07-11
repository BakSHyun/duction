import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * 이미지 업로드 파이프라인 (M23)
 * 원본을 그대로 저장하지 않는다 — 최대 1600px 리사이징 + WebP 변환으로
 * 용량을 1/5~1/10로 줄인다 (사진 위주 서비스의 트래픽·스토리지 비용 직결).
 * 저장소는 로컬 public/uploads — 운영 전환 시 이 함수만 R2 업로드로 교체 (DEPLOY.md §3).
 */
export async function processAndSaveImage(file: File): Promise<string> {
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());

  const processed = await sharp(input, { failOn: "error" })
    .rotate() // EXIF 회전 보정 (폰 사진 필수)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const name = `${randomBytes(8).toString("hex")}.webp`;
  await writeFile(path.join(uploadDir, name), processed);
  return `/uploads/${name}`;
}
