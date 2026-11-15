const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("requestfailed", req => {
    errors.push("REQUEST FAILED: " + req.url());
  });

  try {
    await page.goto("https://ichey.in/?diagnostic=1", {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(8000);

    const result = await page.evaluate(() => {
      const canvas = document.querySelector("#ichey-canvas");
      const fallback = document.querySelector("#experience-fallback");

      return {
        title: document.title,
        canvasExists: !!canvas,
        canvasSize: canvas
          ? `${canvas.clientWidth}x${canvas.clientHeight}`
          : "missing",
        webglActive: document.body.classList.contains("experience-webgl"),
        santaReady: document.body.classList.contains("santa-ready"),
        playbackActive: document.body.classList.contains("playback-active"),
        fallbackDisplay: fallback
          ? getComputedStyle(fallback).display
          : "missing"
      };
    });

    console.log("LIVE WEBSITE DIAGNOSTIC:");
    console.log(JSON.stringify(result, null, 2));
    console.log("BROWSER ERRORS:");
    console.log(JSON.stringify(errors, null, 2));
  } catch (e) {
    console.log("DIAGNOSTIC FAILED:", e.message);
  } finally {
    await browser.close();
  }
})();
