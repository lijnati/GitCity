import raw from "@/data/sample-city.json";
import { parseSnapshot } from "./snapshot-schema";
import type { RepoSnapshot } from "./types";

/** The bundled sample city (a real repository captured with `pnpm sample`). */
export const sampleSnapshot: RepoSnapshot = parseSnapshot(raw);
