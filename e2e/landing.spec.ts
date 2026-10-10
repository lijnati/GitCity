import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";
import { liveSnapshot, ndjson } from "./fixtures";

test("landing page communicates the product and shows a live preview", async ({ page }) => {
  const c = watchConsole(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Every codebase is a\s*city\./);
  await expect(page.getByPlaceholder("github.com/owner/repository")).toBeVisible();
  await expect(page.getByRole("button", { name: "Build my city →" })).toBeVisible();
  await expect(page.getByText("Live preview · bundled snapshot")).toBeVisible();
  await expect(page.locator("figure canvas")).toBeVisible();
  await expect(page.getByText(/not a live analysis/)).toBeVisible();
  c.expectClean();
});

test("rejects unsupported URLs with a helpful message", async ({ page }) => {
  await page.goto("/");
  const input = page.getByPlaceholder("github.com/owner/repository");
  await input.fill("https://gitlab.com/foo/bar");
  await page.getByRole("button", { name: "Build my city →" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("github.com");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL("/");
});

test("normalises a GitHub URL and builds the city with real progress stages", async ({ page }) => {
  const c = watchConsole(page);
  await page.route("**/api/analyze?*", async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([
        { type: "stage", stage: "connect" },
        { type: "stage", stage: "structure", detail: "main" },
        { type: "stage", stage: "contents" },
        { type: "stage", stage: "history" },
        { type: "stage", stage: "complete" },
        { type: "result", snapshot: liveSnapshot() },
      ]),
    });
  });
  await page.goto("/");
  await page.getByPlaceholder("github.com/owner/repository").fill("https://github.com/acme/demo.git");
  await page.getByRole("button", { name: "Build my city →" }).click();
  await expect(page).toHaveURL("/city/acme/demo");
  await expect(page.getByRole("banner").getByRole("heading", { level: 1 })).toContainText("acme/demo");
  await expect(page.locator("main canvas")).toBeVisible();
  await expect(page.getByTestId("notices")).toContainText("Opening this link later rebuilds the city");
  c.expectClean();
});

test("shows friendly error states", async ({ page }) => {
  await page.route("**/api/analyze?*", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([{ type: "stage", stage: "connect" }, { type: "error", error: { code: "not_found", message: "Repository not found. It may not exist, or it may be private." } }]),
    }),
  );
  await page.goto("/city/acme/missing");
  const err = page.getByTestId("error-state");
  await expect(err).toContainText("Repository not found");
  await expect(err.getByRole("link", { name: "Explore the sample city" })).toBeVisible();

  await page.route("**/api/analyze?*", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson([{ type: "error", error: { code: "rate_limited", message: "GitHub’s API rate limit for this server has been reached.", retryAt: Date.now() + 600_000 } }]),
    }),
  );
  await page.goto("/city/acme/limited");
  await expect(page.getByTestId("error-state")).toContainText("rate limit");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("invalid city routes 404", async ({ page }) => {
  const res = await page.goto("/city/-bad-/..x");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("No city at this address")).toBeVisible();
});

test.describe("permanent links", () => {
  test.skip(({ isMobile }) => isMobile, "desktop top bar");
  const SHA = "7fcd8a743497f1895b999bb8c8d9c1241662a476";

  test("a live city offers a permanent link to its exact snapshot", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/api/analyze?*", (route) =>
      route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson([{ type: "stage", stage: "complete" }, { type: "result", snapshot: liveSnapshot(), permalink: `/city/acme/demo/${SHA}` }]),
      }),
    );
    await page.goto("/city/acme/demo");
    const button = page.getByRole("button", { name: "Copy a permanent link to this exact snapshot" });
    await expect(button).toBeVisible();
    await button.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/city/acme/demo/${SHA}`);
    await expect(page.getByTestId("notices")).toContainText("Permanent link");
  });

  test("a pinned URL loads the saved snapshot and links to the latest city", async ({ page }) => {
    let requested = "";
    await page.route("**/api/analyze?*", (route) => {
      requested = route.request().url();
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson([{ type: "result", snapshot: liveSnapshot(), permalink: `/city/acme/demo/${SHA}` }]),
      });
    });
    await page.goto(`/city/acme/demo/${SHA}`);
    await expect(page.getByTestId("notices")).toContainText("This link always shows this exact city");
    expect(new URL(requested).searchParams.get("sha")).toBe(SHA);
    await expect(page.getByRole("link", { name: "Latest →" })).toHaveAttribute("href", "/city/acme/demo");
  });

  test("an unknown snapshot explains itself and offers the current city", async ({ page }) => {
    await page.route("**/api/analyze?*", (route) =>
      route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson([{ type: "error", error: { code: "snapshot_not_found", message: "No saved snapshot of acme/demo at 7fcd8a7 exists." } }]),
      }),
    );
    await page.goto(`/city/acme/demo/${SHA}`);
    await expect(page.getByTestId("error-state")).toContainText("No saved snapshot at this commit");
    await expect(page.getByRole("link", { name: "Build the current city" })).toHaveAttribute("href", "/city/acme/demo");
  });

  test("malformed snapshot URLs 404", async ({ page }) => {
    expect((await page.goto("/city/acme/demo/not-a-sha"))?.status()).toBe(404);
  });
});
