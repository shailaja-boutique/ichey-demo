const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });

  try {
    await page.goto("https://ichey.in/?visual-check=" + Date.now(), {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: "_live-stage-01.png" });

    await page.waitForTimeout(5000);
    await page.screenshot({ path: "_live-stage-06.png" });

    await page.waitForTimeout(8000);
    await page.screenshot({ path: "_live-stage-14.png" });

    console.log("Screenshots saved:");
    console.log("_live-stage-01.png");
    console.log("_live-stage-06.png");
    console.log("_live-stage-14.png");
  } catch (error) {
    console.log("Screenshot error:", error.message);
  } finally {
    await browser.close();
  }
})();
