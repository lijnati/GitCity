import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/layout";
import { renderIsoCitySvg, shade } from "@/lib/og/iso-city";
import { syntheticRepo } from "../fixtures/files";

const W = 700;
const H = 630;

describe("renderIsoCitySvg", () => {
  const layout = generateCity(syntheticRepo(400, 3), { heightMetric: "lines", budget: 1500 });
  const svg = renderIsoCitySvg(layout, { width: W, height: H, padding: 20 });

  it("is deterministic", () => {
    expect(renderIsoCitySvg(layout, { width: W, height: H, padding: 20 })).toBe(svg);
  });

  it("draws ground, every plinth and three faces per building", () => {
    const polygons = svg.match(/<polygon /g)?.length ?? 0;
    expect(polygons).toBe(1 + layout.blocks.length + 3 * layout.buildings.length);
  });

  it("fits every vertex inside the viewport", () => {
    const coords = [...svg.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(coords.length).toBeGreaterThan(0);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(-0.1);
      expect(x).toBeLessThanOrEqual(W + 0.1);
      expect(y).toBeGreaterThanOrEqual(-0.1);
      expect(y).toBeLessThanOrEqual(H + 0.1);
    }
  });

  it("handles an empty city", () => {
    const empty = renderIsoCitySvg(generateCity([], { heightMetric: "lines", budget: 10 }), { width: W, height: H });
    expect(empty).toContain("<svg");
  });
});

describe("shade", () => {
  it("darkens and lightens within range", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#808080", 1)).toBe("#808080");
    expect(shade("#000000", 2)).toBe("#ffffff");
  });
});
