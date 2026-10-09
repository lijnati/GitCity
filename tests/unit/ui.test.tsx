// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DetailContent } from "@/components/explorer/detail-panel";
import { Sidebar } from "@/components/explorer/sidebar";
import { activeBuildings, directoryTree, languageStats, matchFiles } from "@/components/explorer/model";
import { generateCity } from "@/lib/city/layout";
import type { RepoSnapshot } from "@/lib/types";
import { file } from "../fixtures/files";

function snapshot(files = [file("src/a.ts", 2048, 80), file("src/b.py", 100, null), file("README.md", 300, 12)]): RepoSnapshot {
  return {
    schemaVersion: 1,
    source: "live",
    repo: { owner: "acme", name: "demo", description: null, defaultBranch: "main", htmlUrl: "https://github.com/acme/demo", stars: null },
    revision: { sha: "a".repeat(40), ref: "main", committedAt: null },
    analyzedAt: "2026-01-01T00:00:00Z",
    files,
    excluded: { count: 0, bytes: 0, byReason: {} },
    tree: { truncated: false, entries: files.length },
    lines: { counted: 2, total: 3, stoppedEarly: false },
    activity: null,
    notes: [],
  };
}

describe("DetailContent", () => {
  it("shows exact values, unavailable states and a pinned GitHub link", () => {
    const snap = snapshot();
    snap.files[1]!.linesNote = "budget";
    const city = generateCity(snap.files, { heightMetric: "lines", budget: 100 });
    const b = city.buildings.find((x) => x.path === "src/b.py")!;
    render(<DetailContent snapshot={snap} building={b} fileIndex={null} onClose={() => {}} onFocus={() => {}} onSelectFile={() => {}} />);
    expect(screen.getByRole("heading", { name: "b.py" })).toBeInTheDocument();
    expect(screen.getByText("Analysis budget reached before this file was read")).toBeInTheDocument();
    expect(screen.getAllByText("Commit history unavailable")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /View on GitHub/ })).toHaveAttribute("href", `https://github.com/acme/demo/blob/${"a".repeat(40)}/src/b.py`);
  });

  it("explains aggregated blocks and lists their files", () => {
    const files = Array.from({ length: 30 }, (_, i) => file(`lib/f${String(i).padStart(2, "0")}.ts`, 100 + i, 5));
    const snap = snapshot(files);
    const city = generateCity(files, { heightMetric: "lines", budget: 10 });
    const agg = city.buildings.find((b) => b.kind === "aggregate")!;
    const onSelect = vi.fn();
    render(<DetailContent snapshot={snap} building={agg} fileIndex={null} onClose={() => {}} onFocus={() => {}} onSelectFile={onSelect} />);
    expect(screen.getByText(/rendering budget/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /f\d\d\.ts/ })[0]!);
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("Sidebar", () => {
  it("searches and filters by language", () => {
    const snap = snapshot();
    const onQuery = vi.fn();
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const mask = matchFiles(snap.files, { query: "a.ts", languages: new Set(), dir: null });
    render(
      <Sidebar
        files={snap.files}
        fileMask={mask}
        query="a.ts"
        onQuery={onQuery}
        languages={languageStats(snap.files)}
        enabledLanguages={new Set()}
        onToggleLanguage={onToggle}
        onClearLanguages={() => {}}
        tree={directoryTree(snap.files)}
        focusDir={null}
        onFocusDir={() => {}}
        onSelectFile={onSelect}
        showLabels
        onShowLabels={() => {}}
        heightMetric="lines"
        onHeightMetric={() => {}}
        linesAvailable={false}
      />,
    );
    expect(screen.getByText("1 match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /a\.ts/ }));
    expect(onSelect).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /Python/ }));
    expect(onToggle).toHaveBeenCalledWith("python");
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: "x" } });
    expect(onQuery).toHaveBeenCalledWith("x");
  });
});

describe("filter model", () => {
  it("combines query, language and directory filters; aggregates are active if any file matches", () => {
    const files = [file("src/a.ts"), file("src/b.py"), file("docs/c.md")];
    expect([...matchFiles(files, { query: "", languages: new Set(["python"]), dir: null })]).toEqual([0, 1, 0]);
    expect([...matchFiles(files, { query: "", languages: new Set(), dir: "src" })]).toEqual([1, 1, 0]);
    expect([...matchFiles(files, { query: "C.MD", languages: new Set(), dir: null })]).toEqual([0, 0, 1]);
    const city = generateCity(files, { heightMetric: "lines", budget: 100 });
    const active = activeBuildings(city, matchFiles(files, { query: "b.py", languages: new Set(), dir: null }));
    expect(city.buildings.filter((b) => active[b.id]).map((b) => b.path)).toEqual(["src/b.py"]);
  });
});
