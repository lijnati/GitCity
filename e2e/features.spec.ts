import { expect, test } from "@playwright/test";
import type { RepoFile } from "../src/lib/types";
import { liveSnapshot, ndjson } from "./fixtures";
import { waitForCity, watchConsole } from "./helpers";

test.describe("colour views, dependency arcs, theme", () => {
  test.skip(({ isMobile }) => isMobile, "sidebar controls are desktop; mobile covered via drawer below");

  test("colour view switches the legend and notes", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    await page.getByTestId("color-modes").getByRole("button", { name: "Activity" }).click();
    await expect(page.getByTestId("color-legend")).toContainText("commits in the last 30");
    await expect(page.getByTestId("notices")).toContainText("Commits touching each file");
    await page.getByTestId("color-modes").getByRole("button", { name: "Complexity" }).click();
    await expect(page.getByTestId("color-legend")).toContainText("unavailable");
    c.expectClean();
  });

  test("dependency arcs: toggle, then a file's imports in the detail panel", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/sample");
    await waitForCity(page);
    await expect(page.getByTestId("deps-summary")).toContainText("import links");
    await page.getByRole("switch", { name: "Dependency arcs" }).click();
    await expect(page.getByTestId("notices")).toContainText("Dependency arcs:");
    await page.getByLabel("Search files").fill("packages/api/src/window.ts");
    await page.getByRole("button", { name: /window\.ts/ }).first().click();
    const panel = page.getByTestId("detail-panel");
    await expect(panel.getByTestId("deps-imports")).toContainText("core.ts");
    await panel.getByTestId("deps-imports").getByRole("button", { name: /core\.ts/ }).click();
    await expect(panel.getByRole("heading", { level: 2 }).first()).toHaveText("core.ts");
    await expect(panel.getByTestId("deps-imported-by")).toContainText("window.ts");
    c.expectClean();
  });

  test("theme toggle switches to dark and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.goto("/sample");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await waitForCity(page);
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("compare", () => {
  const base = "1".repeat(40);
  const head = "2".repeat(40);

  test("two commits on one plan with a change list", async ({ page, isMobile }) => {
    const c = watchConsole(page);
    await page.route("**/api/analyze?**", async (route) => {
      const ref = new URL(route.request().url()).searchParams.get("ref");
      const snap = ref === base ? liveSnapshot("acme", "demo", { sha: base, drop: ["packages/api/src/tray.ts"] }) : liveSnapshot("acme", "demo", { sha: head });
      if (ref === base) {
        const files = snap.files as RepoFile[];
        snap.files = files.map((f) => (f.path === "packages/api/src/core.ts" ? { ...f, size: f.size - 100, lines: (f.lines ?? 0) - 3, blob: "0".repeat(40) } : f)) as typeof snap.files;
      }
      await route.fulfill({ contentType: "application/x-ndjson", body: ndjson([{ type: "stage", stage: "complete" }, { type: "result", snapshot: snap, permalink: null }]) });
    });
    await page.goto(`/compare/acme/demo?base=${base}&head=${head}`);
    await expect(page.locator("main canvas")).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Changes", exact: true }).last().click();
    const summary = page.getByTestId("compare-summary");
    await expect(summary).toContainText("Added");
    await expect(summary.locator("dd").nth(0)).toHaveText("1");
    await expect(summary.locator("dd").nth(2)).toHaveText("1");
    await page.getByTestId("compare-list").getByRole("button", { name: /core\.ts/ }).click();
    await expect(page.getByTestId("compare-detail")).toContainText("Modified");
    await page.getByRole("button", { name: /^Base / }).click();
    await page.getByRole("button", { name: /^Head / }).click();
    c.expectClean();
  });

  test("invalid refs are refused before any request", async ({ page }) => {
    let requested = false;
    await page.route("**/api/analyze?**", (route) => {
      requested = true;
      return route.abort();
    });
    await page.goto("/compare/acme/demo");
    await page.getByRole("textbox", { name: "Base" }).fill("../etc");
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(page.getByText("Use a branch, tag or commit SHA.")).toBeVisible();
    expect(requested).toBe(false);
  });
});

test.describe("gallery and embeds", () => {
  test("gallery page renders", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { name: "Recently built cities" })).toBeVisible();
  });

  test("embed menu offers README markdown with light and dark cards", async ({ page, isMobile }) => {
    test.skip(isMobile, "top-bar menus are desktop");
    await page.route("**/api/analyze?**", (route) =>
      route.fulfill({ contentType: "application/x-ndjson", body: ndjson([{ type: "result", snapshot: liveSnapshot(), permalink: null }]) }),
    );
    await page.goto("/city/acme/demo");
    await waitForCity(page);
    await page.getByTestId("embed-menu").click();
    const md = page.getByTestId("embed-markdown");
    await expect(md).toContainText("/api/card/acme/demo?theme=dark");
    await expect(md).toContainText("prefers-color-scheme: dark");
    await page.getByRole("tab", { name: /iframe/ }).click();
    await expect(page.getByTestId("embed-iframe")).toContainText("/embed/acme/demo");
  });

  test("iframe embed page may be framed; other pages may not", async ({ request }) => {
    const embed = await request.get("/embed/acme/demo");
    expect(embed.headers()["content-security-policy"]).toBe("frame-ancestors *");
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
    expect((await request.get("/")).headers()["x-frame-options"]).toBe("DENY");
  });
});

test.describe("mobile compare and embed sheet", () => {
  test.skip(({ isMobile }) => !isMobile, "the More button is the phone entry point; desktop uses the top-bar menus");

  test("More opens Compare and Embed: invalid refs are refused, the README snippet copies, Escape and outside taps close", async ({ page, context }) => {
    const c = watchConsole(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/analyze?**", (route) =>
      route.fulfill({ contentType: "application/x-ndjson", body: ndjson([{ type: "result", snapshot: liveSnapshot(), permalink: null }]) }),
    );
    const navigations: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/compare/")) navigations.push(r.url());
    });
    await page.goto("/city/acme/demo");
    await waitForCity(page);

    const more = page.getByTestId("more-menu");
    // The 36px button's hit area is 44px: its ::after measures 44 and a tap just outside the border lands on it.
    const hit = await more.evaluate((el) => {
      const cs = getComputedStyle(el, "::after");
      return { width: cs.width, height: cs.height };
    });
    expect(parseFloat(hit.width)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(hit.height)).toBeGreaterThanOrEqual(44);
    const mb = (await more.boundingBox())!;
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid=more-menu]") !== null, [mb.x + mb.width + 3, mb.y + mb.height / 2])).toBe(true);
    await more.tap();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();

    // Touch targets inside the sheet are at least 44px tall.
    for (const target of [
      sheet.getByRole("textbox", { name: /Base/ }),
      sheet.getByRole("button", { name: "Compare", exact: true }),
      sheet.getByRole("tab", { name: "README image" }),
      sheet.getByRole("button", { name: "Copy" }),
      sheet.getByRole("button", { name: "Close", exact: true }),
    ]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    // An invalid ref is refused client-side: no navigation to /compare.
    await sheet.getByRole("textbox", { name: /Base/ }).fill("../etc");
    await sheet.getByRole("button", { name: "Compare", exact: true }).tap();
    await expect(sheet.getByRole("alert")).toHaveText("Use a branch, tag or commit SHA.");
    expect(navigations).toEqual([]);
    await expect(page).toHaveURL(/\/city\/acme\/demo$/);

    // Copy the README snippet.
    await sheet.getByRole("button", { name: "Copy" }).tap();
    await expect(sheet.getByRole("button", { name: "Copied" })).toBeVisible();
    // The Windows clipboard stores CRLF line endings; compare the text itself.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
    expect(copied).toBe(await sheet.getByTestId("embed-markdown").textContent());
    expect(copied).toContain("/api/card/acme/demo?theme=dark");
    expect(copied).toContain("<picture>");

    // No horizontal overflow at 390px, with the sheet open.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    // Escape closes and returns focus to the More button.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    // Tapping outside the sheet closes it too.
    await more.tap();
    await expect(sheet).toBeVisible();
    await page.touchscreen.tap(195, 40);
    await expect(sheet).toBeHidden();
    c.expectClean();
  });
});
