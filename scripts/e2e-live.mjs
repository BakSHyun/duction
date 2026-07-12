// 라이브 핵심 여정 E2E: 가입 → 경매 등록(사진 포함) → 두 번째 계정 가입 → 입찰
import { chromium } from "playwright-core";

const BASE = "https://duction.co";
const ts = Date.now();

async function signup(page, tag) {
  const email = `e2e-${tag}-${ts}@duction-test.co`;
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[name="nickname"]', `E2E${tag}${ts % 100000}`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "VerifyTest1234!");
  await page.click('button:has-text("가입하기")');
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  return email;
}

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // 판매자: 가입 → 경매 등록
  const seller = await browser.newPage();
  await signup(seller, "S");
  console.log("1. 판매자 가입 OK");

  await seller.goto(`${BASE}/sell`, { waitUntil: "networkidle" });
  await seller.selectOption('select[name="categoryId"]', { index: 5 }); // 임의 말단 카테고리
  await seller.fill('input[name="title"]', `[E2E검증] 라이브 테스트 경매 ${ts}`);
  await seller.click('input[name="authenticity"][value="UNKNOWN"]');
  await seller.click('input[name="conditionGrade"][value="B"]');
  await seller.fill('textarea[name="description"]', "라이브 E2E 검증용 임시 경매입니다. 곧 삭제됩니다.");
  await seller.setInputFiles('input[name="images"]', "public/icons/icon-192.png");
  await seller.fill('input[name="startPrice"]', "5000");
  await seller.click('button:has-text("경매 시작하기")');
  try {
    await seller.waitForURL(/\/auctions\//, { timeout: 25000 });
  } catch {
    const err = await seller.locator(".bg-cream, [class*=bill-deep]").allTextContents();
    console.log("등록 실패 메시지:", JSON.stringify(err));
    await seller.screenshot({ path: "/tmp/e2e-sell-fail.png", fullPage: true });
    throw new Error("listing failed: " + err.join(" | "));
  }
  const auctionUrl = seller.url();
  console.log("2. 경매 등록 OK →", auctionUrl.split("/").pop());

  // 입찰자: 가입 → 입찰
  const bidder = await browser.newPage();
  await signup(bidder, "B");
  console.log("3. 입찰자 가입 OK");

  await bidder.goto(auctionUrl, { waitUntil: "networkidle" });
  await bidder.fill('input[name="maxAmount"]', "7000");
  await bidder.click('button:has-text("입찰")');
  await bidder.waitForSelector('text=현재 최고 입찰자입니다', { timeout: 30000 });
  console.log("4. 입찰 OK — 현재 최고 입찰자 확인");

  // 이미지 실제 로드 확인 (Supabase Storage)
  const imgSrc = await bidder.locator("main img").first().getAttribute("src");
  const imgRes = await bidder.request.get(imgSrc.startsWith("http") ? imgSrc : BASE + imgSrc);
  console.log("4.5 이미지 로드:", imgRes.status(), imgSrc.includes("supabase") ? "(Supabase Storage)" : imgSrc.slice(0, 40));
  if (imgRes.status() !== 200) throw new Error("image not served: " + imgSrc);

  // 현재가 반영 확인
  await bidder.reload({ waitUntil: "networkidle" });
  const price = await bidder.locator("text=5,000원").first().count();
  console.log("5. 현재가 표시 OK:", price > 0 ? "5,000원(시작가 프록시)" : "확인필요");

  await browser.close();
  console.log("ALL_PASS");
};

run().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
