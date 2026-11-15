const { chromium } = require("playwright");

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const summary = { widths: [], mobile14: null, falling: null };

  for (const w of WIDTHS) {
    const h = w <= 430 ? 844 : w <= 768 ? 900 : 800;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(m.text());
    });
    await page.goto(`http://localhost:8080/?v=${Date.now()}&w=${w}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForFunction(() => document.body.classList.contains("playback-active"), {
      timeout: 50000,
    });
    await page.waitForTimeout(12000);
    const metrics = await page.evaluate(() => {
      const c = document.getElementById("ichey-canvas");
      return {
        santa: document.body.classList.contains("santa-ready"),
        webgl: document.body.classList.contains("experience-webgl"),
        css: c ? { w: c.clientWidth, h: c.clientHeight, rw: c.width, rh: c.height } : null,
      };
    });
    const dpr = metrics.css ? metrics.css.rw / Math.max(metrics.css.w, 1) : 0;
    summary.widths.push({ w, h, dpr: +dpr.toFixed(2), errs, ...metrics });
    await page.screenshot({ path: `_verify-w${w}.png` });
    await page.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrs = [];
  mobile.on("pageerror", (e) => mobileErrs.push(e.message));
  await mobile.goto(`http://localhost:8080/?t=${Date.now()}`, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => document.body.classList.contains("playback-active"));
  await mobile.waitForTimeout(16000);
  summary.mobile14 = { errs: mobileErrs, santa: await mobile.evaluate(() => document.body.classList.contains("santa-ready")) };

  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desk.goto("http://localhost:8080/", { waitUntil: "networkidle" });
  await desk.waitForTimeout(3500);
  const gift = desk.locator(".falling-gift").first();
  const hasGift = (await gift.count()) > 0;
  if (hasGift) {
    await gift.evaluate((el) => {
      el.style.animationPlayState = "paused";
      el.style.transform = "translate3d(-50%, 120px, 0)";
    });
    await gift.dispatchEvent("click");
    await desk.waitForTimeout(500);
    summary.falling = await gift.evaluate((el) => el.classList.contains("is-opened"));
  } else {
    summary.falling = "no-gift";
  }

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})();