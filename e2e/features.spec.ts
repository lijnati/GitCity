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
