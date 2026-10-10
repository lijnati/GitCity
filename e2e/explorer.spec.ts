import { expect, test } from "@playwright/test";
import { selectAnyBuilding, touchDrag, waitForCity, watchConsole } from "./helpers";

test.describe("desktop explorer", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("sample city: search, select, detail panel", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    await expect(page.getByTestId("notices")).toContainText("Bundled snapshot of tauri-apps/tauri");

    await page.keyboard.press("/");
    await expect(page.getByLabel("Search files")).toBeFocused();
    await page.keyboard.type("webview.rs");
    await expect(page.getByText(/\d+ match/)).toBeVisible();
    await page.getByRole("button", { name: /webview\.rs/ }).first().click();

    const panel = page.getByTestId("detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 }).first()).toHaveText("webview.rs");
    await expect(panel).toContainText("Lines");
    await expect(panel).toContainText("exact");
    const link = panel.getByRole("link", { name: /View on GitHub/ });
    await expect(link).toHaveAttribute("href", /^https:\/\/github\.com\/tauri-apps\/tauri\/blob\/[0-9a-f]{40}\/.+webview\.rs$/);

    await page.keyboard.press("Escape"); // clears focus-in-input guard? input has value → stays
    await page.locator("main").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    c.expectClean();
  });

  test("clicking a building opens its details", async ({ page }) => {
    await page.goto("/sample");
    await waitForCity(page);
    await page.getByRole("button", { name: "Hide notes" }).click();
    await selectAnyBuilding(page, "detail-panel");
    await expect(page.getByTestId("detail-panel").getByRole("link", { name: /GitHub/ })).toBeVisible();
  });

  test("language filter and list view", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    const rust = page.getByRole("button", { name: /^Rust\s+\d+/ });
    await rust.click();
    await expect(rust).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "List", exact: true }).click();
    const list = page.getByTestId("file-list");
    await expect(list).toBeVisible();
    const rows = list.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(50);
    // Every visible row is Rust.
    for (const lang of await list.locator("tbody tr td:nth-child(2)").allInnerTexts()) expect(lang.trim()).toBe("Rust");

    await page.getByRole("button", { name: "Show all" }).click();
    await list.getByRole("button", { name: "Lines" }).click();
    await expect(list.locator("thead th").nth(2)).toHaveAttribute("aria-sort", "descending");
    // Switching back re-creates the scene cleanly.
    await page.getByRole("button", { name: "City", exact: true }).click();
    await waitForCity(page);
    await page.goto("/");
    c.expectClean();
  });

  test("camera controls and keyboard shortcuts respond", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    for (const name of ["Zoom in", "Zoom out", "Fit city to view", "Reset camera"]) await page.getByRole("button", { name }).click();
    await page.keyboard.press("l");
    await page.keyboard.press("f");
    await page.getByRole("switch", { name: "Neighborhood labels" }).click();
    await expect(page.getByRole("switch", { name: "Neighborhood labels" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "File size" }).click();
    await expect(page.getByRole("button", { name: "File size" })).toHaveAttribute("aria-pressed", "true");
    c.expectClean();
  });

  test("directory focus", async ({ page }) => {
    await page.goto("/sample");
    await waitForCity(page);
    await page.getByRole("tree").getByRole("button", { name: /^crates\// }).click();
    await expect(page.getByRole("button", { name: "Whole city" })).toBeVisible();
  });
});

test.describe("mobile explorer", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("touch orbit, tap to select, bottom sheet", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    await page.getByRole("button", { name: "Hide notes" }).tap();
    const box = (await page.locator("main canvas").boundingBox())!;
    await touchDrag(page, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.7 }, { x: box.x + box.width * 0.7, y: box.y + box.height * 0.65 });
    await page.getByRole("button", { name: "Reset camera" }).tap();
    await page.waitForTimeout(1200);
    await selectAnyBuilding(page, "detail-sheet", true);
    const sheet = page.getByTestId("detail-sheet");
    await expect(sheet.getByRole("link", { name: /GitHub/ })).toBeVisible();
    await sheet.getByRole("button", { name: "Expand details" }).tap();
    await expect(sheet.getByRole("button", { name: "Collapse details" })).toBeVisible();
    await sheet.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet).toBeHidden();
    c.expectClean();
  });

  test("filters drawer with search selects a file", async ({ page }) => {
    await page.goto("/sample");
    await waitForCity(page);
    await page.getByRole("button", { name: /Filters/ }).tap();
    const drawer = page.getByRole("dialog", { name: "Search and filters" });
    await expect(drawer).toBeVisible();
    await drawer.getByLabel("Search files").fill("Cargo.toml");
    await drawer.getByRole("button", { name: /Cargo\.toml/ }).first().tap();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("detail-sheet")).toContainText("Cargo.toml");
  });

  test("no horizontal overflow on landing or explorer", async ({ page }) => {
    for (const url of ["/", "/sample"]) {
      await page.goto(url);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });
});
