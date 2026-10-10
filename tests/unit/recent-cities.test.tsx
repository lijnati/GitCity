// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CityCard } from "@/components/city-card";
import { RecentCities } from "@/components/landing/recent-cities";
import { MemorySnapshotStore, setSnapshotStore, summarize } from "@/lib/snapshot-store";
import { makeSnapshot } from "../fixtures/snapshot";

afterEach(() => {
  cleanup();
  setSnapshotStore(null);
});

const sha = (n: number) => String(n % 10).repeat(40);

describe("CityCard", () => {
  it("links to the permanent snapshot and loads light and dark cards for that SHA", () => {
    const city = summarize(makeSnapshot({ owner: "acme", name: "demo", sha: sha(7) }), 1);
    render(
      <ul>
        <CityCard city={city} />
      </ul>,
    );
    const card = screen.getByTestId("city-card");
    const [light, dark] = within(card).getAllByRole("img") as HTMLImageElement[];
    expect(light!.getAttribute("src")).toBe(`/api/card/acme/demo?sha=${sha(7)}`);
    expect(light!.className).toContain("dark:hidden");
    expect(dark!.getAttribute("src")).toBe(`/api/card/acme/demo?sha=${sha(7)}&theme=dark`);
    expect(dark!.className).toContain("dark:block");
    expect(within(card).getByRole("link", { name: "acme/demo" })).toHaveAttribute("href", `/city/acme/demo/${sha(7)}`);
    expect(within(card).getByRole("link", { name: "latest →" })).toHaveAttribute("href", "/city/acme/demo");
    // Unknown stars are left out, not shown as zero.
    expect(card).not.toHaveTextContent("★");
  });
});

describe("RecentCities", () => {
  it("renders nothing for an empty in-memory store (no BLOB_READ_WRITE_TOKEN locally)", async () => {
    setSnapshotStore(new MemorySnapshotStore());
    expect(await RecentCities({})).toBeNull();
  });

  it("renders nothing, without throwing, when storage fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await RecentCities({ load: () => Promise.reject(new Error("blob down")) })).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("shows at most six of the newest cities and links to the gallery", async () => {
    const store = new MemorySnapshotStore();
    for (let i = 1; i <= 8; i++) await store.save(makeSnapshot({ owner: "acme", name: `repo${i}`, sha: sha(i) }), {}, i * 1000);
    setSnapshotStore(store);
    render((await RecentCities({}))!);
    const cards = screen.getAllByTestId("city-card");
    expect(cards).toHaveLength(6);
    expect(within(cards[0]!).getByRole("link", { name: "acme/repo8" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recently built" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all →" })).toHaveAttribute("href", "/gallery");
  });
});
