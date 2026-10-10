import { ImageResponse } from "next/og";
import { generateCity } from "@/lib/city/layout";
import { compact, formatDate, formatNumber, shortSha } from "@/lib/format";
import { languageInfo } from "@/lib/repo/languages";
import type { RepoSnapshot } from "@/lib/types";
import { renderIsoCitySvg } from "./iso-city";
import { PALETTES } from "@/lib/city/palette";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "A GitHub repository drawn as a 3D city by GitCity";

/** Preview images stay light: far fewer buildings than the interactive scene. */
const OG_BUDGET = 1500;
const CARD_THEMES = {
  light: { ink: "#151515", muted: "#66635d", paper: "#f3f1ec", line: "#d9d5cc", accent: "#d6401f", lot: "#e9e5dc", lotEdge: "#b9b4a9" },
  dark: { ink: "#edebe6", muted: "#9d998f", paper: "#141413", line: "#2f2e2b", accent: "#ee6a45", lot: "#292825", lotEdge: "#4a4843" },
} as const;
export type CardTheme = keyof typeof CARD_THEMES;

type Kind = "live" | "saved" | "sample";

/**
 * Card for a city. With a snapshot it draws the real layout; without one
 * (never analyzed, or storage unavailable) it renders a plain title card and
 * never claims to show a city that doesn't exist.
 */
export function cityCard(
  input: { owner: string; repo: string; snapshot: RepoSnapshot | null; kind: Kind; theme?: CardTheme },
  headers: Record<string, string>,
): ImageResponse {
  const { owner, repo, snapshot, kind, theme = "light" } = input;
  const { ink: INK, muted: MUTED, paper: PAPER, line: LINE, accent: ACCENT } = CARD_THEMES[theme];
  const art = snapshot ? cityArt(snapshot, theme) : null;
  const langs = snapshot ? topLanguages(snapshot, 4) : [];
  const lines = snapshot ? snapshot.files.reduce((s, f) => s + (f.lines ?? 0), 0) : 0;
  const caption = !snapshot
    ? "Explore this repository as a 3D city"
    : kind === "sample"
      ? `Bundled snapshot @ ${shortSha(snapshot.revision.sha)}`
      : kind === "saved"
        ? `Saved snapshot @ ${shortSha(snapshot.revision.sha)} · ${formatDate(snapshot.analyzedAt)}`
        : `${snapshot.revision.ref} @ ${shortSha(snapshot.revision.sha)} · analyzed ${formatDate(snapshot.analyzedAt)}`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, color: INK, fontSize: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470, padding: "56px 0 52px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 26, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 11, width: 11, height: 15, background: INK }} />
              <div style={{ position: "absolute", left: 14, top: 0, width: 11, height: 26, background: ACCENT }} />
            </div>
            <div style={{ fontSize: 26, letterSpacing: -0.5 }}>GitCity</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: MUTED }}>{`${owner} /`}</div>
            <div style={{ fontSize: titleSize(repo), lineHeight: 1.02, letterSpacing: -2, marginTop: 4, wordBreak: "break-all" }}>{repo}</div>
            <div style={{ fontSize: 20, color: MUTED, marginTop: 18 }}>{caption}</div>
          </div>
          {snapshot ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 28, borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
                <Stat value={formatNumber(snapshot.files.length)} label="files" muted={MUTED} />
                <Stat value={compact(lines)} label="lines" muted={MUTED} />
                <Stat value={String(new Set(snapshot.files.map((f) => f.language)).size)} label="languages" muted={MUTED} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {langs.map((l) => (
                  <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, color: MUTED }}>
                    <div style={{ width: 12, height: 12, background: l.color }} />
                    {l.name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 20, color: MUTED }}>Files become buildings. Directories become neighborhoods.</div>
          )}
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} width={700} height={630} alt="" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emptyLot(theme)} width={520} height={300} alt="" />
              <div style={{ fontSize: 20, color: MUTED }}>Not built yet</div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, headers },
  );
}

/** Shrink long names to fit the 400px column (Geist averages ~0.56em per glyph); break only as a last resort. */
function titleSize(name: string): number {
  return Math.round(Math.max(34, Math.min(68, 400 / (name.length * 0.56))));
}

/** An empty, dashed isometric lot: honest placeholder when no city has been built. */
function emptyLot(theme: CardTheme): string {
  const t = CARD_THEMES[theme];
  return `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">` +
      `<polygon points="260,20 500,150 260,280 20,150" fill="${t.lot}"/>` +
      `<polygon points="260,20 500,150 260,280 20,150" fill="none" stroke="${t.lotEdge}" stroke-width="2" stroke-dasharray="10 8"/>` +
      `</svg>`,
  ).toString("base64")}`;
}

function Stat({ value, label, muted }: { value: string; label: string; muted: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <div style={{ fontSize: 30 }}>{value}</div>
      <div style={{ fontSize: 18, color: muted }}>{label}</div>
    </div>
  );
}

function cityArt(snapshot: RepoSnapshot, theme: CardTheme): string | null {
  if (snapshot.files.length === 0) return null;
  const layout = generateCity(snapshot.files, { heightMetric: "lines", budget: OG_BUDGET });
  const svg = renderIsoCitySvg(layout, { width: 700, height: 630, padding: 28, palette: PALETTES[theme] });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function topLanguages(snapshot: RepoSnapshot, n: number) {
  const counts = new Map<string, number>();
  for (const f of snapshot.files) counts.set(f.language, (counts.get(f.language) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([id]) => languageInfo(id));
}

export const CACHE = {
  /** A saved snapshot never changes. */
  immutable: { "Cache-Control": "public, max-age=31536000, immutable" },
  /** The latest city changes as the repository does. */
  latest: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  /** Nothing analyzed yet: check again soon. */
  missing: { "Cache-Control": "public, max-age=0, s-maxage=300" },
};
