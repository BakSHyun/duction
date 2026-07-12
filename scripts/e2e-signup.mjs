import { chromium } from "playwright-core";

const run = async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const email = `verify-${Date.now()}@duction-test.co`;

  await page.goto("https://duction.co/register", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[name="nickname"]', `검증오리${Date.now() % 10000}`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "VerifyTest1234!");
  await page.click('button:has-text("가입하기")');

  // 성공 = 홈으로 리다이렉트 + 헤더에 로그아웃 노출
  await page.waitForURL("https://duction.co/", { timeout: 30000 });
  const loggedIn = await page.locator('button:has-text("로그아웃")').count();
  const cookies = await page.context().cookies("https://duction.co");
  const session = cookies.find((c) => c.name === "duction_session");

  console.log("EMAIL=" + email);
  console.log("REDIRECTED_HOME=true");
  console.log("LOGOUT_BUTTON=" + (loggedIn > 0));
  console.log("SESSION_COOKIE=" + (session ? "set(httpOnly=" + session.httpOnly + ",secure=" + session.secure + ")" : "MISSING"));
  await browser.close();
};

run().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
