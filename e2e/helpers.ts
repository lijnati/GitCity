import { expect, type Page } from "@playwright/test";

/** Collect console errors / page errors, ignoring known third-party deprecation warnings. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return {
    errors,
    expectClean: () => expect(errors, errors.join("\n")).toEqual([]),
  };
}

/** Wait until the WebGL canvas exists and the rise-in animation has settled. */
export async function waitForCity(page: Page) {
  await expect(page.locator("main canvas")).toBeVisible();
  await page.waitForTimeout(2500);
}

/**
 * Click/tap points on a grid over the canvas until a building is selected.
 * (Building positions are deterministic but depend on viewport; scanning keeps the test robust.)
 */
export async function selectAnyBuilding(page: Page, detailTestId: string, touch = false) {
  const box = (await page.locator("main canvas").boundingBox())!;
  const detail = page.getByTestId(detailTestId);
  for (const fy of [0.45, 0.5, 0.4, 0.55, 0.35, 0.6]) {
    for (const fx of [0.5, 0.42, 0.58, 0.35, 0.65, 0.3, 0.7]) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      if (await detail.isVisible().catch(() => false)) return;
      await page.waitForTimeout(80);
    }
  }
  throw new Error("No building found under the scanned points");
}

/** Synthesised one-finger drag via CDP touch events. */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 10; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
