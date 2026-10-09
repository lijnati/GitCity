import { expect, test } from "@playwright/test";
import { waitForCity, watchConsole } from "./helpers";
import { liveSnapshot, ndjson } from "./fixtures";

test("the sample time-lapse plays and scrubs through real history", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/sample");
  await waitForCity(page);
  await page.getByRole("button", { name: /Time-lapse/ }).click();
  const bar = page.getByTestId("timelapse-bar");
  await expect(bar).toBeVisible();
  const label = page.getByTestId("timelapse-label");
  await expect(label).toContainText("files");
  await expect(page.getByTestId("notices")).toContainText("Heights show file size during the time-lapse");

  // Autoplay advances frames.
  const first = await label.innerText();
  await expect(label).not.toHaveText(first, { timeout: 10_000 });

  // Scrubbing jumps to a frame; the first frame is the repository's first commit.
  await page.getByRole("button", { name: "Pause time-lapse" }).click();
  const slider = page.getByRole("slider", { name: "Time-lapse frame" });
  await slider.fill("0");
  await expect(label).toContainText("1 files");
  await slider.fill("15");
  await expect(label).toContainText("965 files");

  await page.getByRole("button", { name: "Exit time-lapse" }).click();
  await expect(bar).toBeHidden();
  c.expectClean();
});

test("keyboard steps through frames", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.goto("/sample?timelapse=1");
  await waitForCity(page);
  await expect(page.getByTestId("timelapse-label")).toBeVisible();
  await page.keyboard.press(" "); // pause autoplay
  const slider = page.getByRole("slider", { name: "Time-lapse frame" });
  await slider.fill("3");
  await page.locator("main").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("4");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("2");
});

test("live cities explain when a time-lapse is unavailable", async ({ page }) => {
  await page.route("**/api/analyze?*", (route) =>
    route.fulfill({ contentType: "application/x-ndjson", body: ndjson([{ type: "result", snapshot: liveSnapshot(), permalink: null }]) }),
  );
  let requested = "";
  await page.route("**/api/timelapse?*", (route) => {
    requested = route.request().url();
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([{ type: "error", error: { code: "timelapse_unavailable", message: "Time-lapse needs a GitHub token on the server." } }]),
    });
  });
  await page.goto("/city/acme/demo?timelapse=1");
  await expect(page.getByTestId("timelapse-bar")).toContainText("needs a GitHub token");
  // Pinned to the exact commit on screen.
  expect(new URL(requested).searchParams.get("sha")).toBe(liveSnapshot().revision.sha);
});

test("no horizontal overflow during the time-lapse", async ({ page }) => {
  await page.goto("/sample?timelapse=1");
  await expect(page.getByTestId("timelapse-label")).toBeVisible({ timeout: 20_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
