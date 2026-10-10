import { describe, expect, it } from "vitest";
import { extractSpecifiers, ImportCollector, normalizePath, parseJsonc, stripJsComments } from "@/lib/repo/imports";
import { file } from "../fixtures/files";

function graph(sources: Record<string, string>) {
  const paths = Object.keys(sources).sort((a, b) => (a < b ? -1 : 1));
  const files = paths.map((p) => file(p));
  const c = new ImportCollector();
  for (const f of files) c.consider(f.path, f.language, sources[f.path]!);
  const g = c.finish(files);
  return { ...g, named: g.edges.map(([a, b]) => `${paths[a]} -> ${paths[b]}`) };
}

describe("extractSpecifiers (JS/TS)", () => {
  it("reads every import form and ignores comments", () => {
    const src = `
      import a from "./a";
      import { b, c as d } from './b';
      import type { T } from "./types";
      import * as ns from "./ns";
      import "./side-effect.css";
      import {
        x,
        y,
      } from "./multi";
      export * from "./re";
      export { z } from "./re2";
      const r = require("./req");
      const lazy = await import("./lazy");
      // import nope from "./commented";
      /* import nope2 from "./block"; */
      const s = "http://example.com"; import last from "./last";
    `;
    expect(extractSpecifiers(src, "js").sort()).toEqual(
      ["./a", "./b", "./types", "./ns", "./side-effect.css", "./multi", "./re", "./re2", "./req", "./lazy", "./last"].sort(),
    );
  });

  it("keeps strings that look like comments", () => {
    expect(stripJsComments(`const u = "a//b"; // gone`)).toContain(`"a//b"`);
    expect(stripJsComments(`const u = "a//b"; // gone`)).not.toContain("gone");
  });
});

describe("extractSpecifiers (Python)", () => {
  it("reads import and from-import, including multi-line and relative forms", () => {
    const src = [
      "import os, sys as system",
      "import pkg.mod",
      "from . import sibling",
      "from ..parent import thing as t, other",
      "from pkg import (",
      "    alpha,",
      "    beta,",
      ")",
      "# import commented",
      '"""',
      "import in_docstring",
      '"""',
    ].join("\n");
    expect(extractSpecifiers(src, "python")).toEqual(["os", "sys", "pkg.mod", "from:.:sibling", "from:..parent:thing,other", "from:pkg:alpha,beta"]);
  });
});

describe("resolution", () => {
  it("resolves relative JS imports with extension, index and .js → .ts probing", () => {
    const g = graph({
      "src/app.ts": `import a from "./lib/a"; import b from "./lib"; import c from "./c.js"; import x from "react"; import m from "./missing";`,
      "src/lib/a.ts": "",
      "src/lib/index.tsx": "",
      "src/c.ts": "",
    });
    expect(g.named).toEqual(["src/app.ts -> src/c.ts", "src/app.ts -> src/lib/a.ts", "src/app.ts -> src/lib/index.tsx"]);
    expect(g.external).toBe(1);
    expect(g.unresolved).toBe(1);
    expect(g.resolved).toBe(3);
  });

  it("resolves tsconfig paths aliases and workspace packages", () => {
    const g = graph({
      "tsconfig.json": `{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] }, }, }`,
      "src/page.tsx": `import { util } from "@/lib/util"; import { api } from "@acme/api"; import { sub } from "@acme/api/sub";`,
      "src/lib/util.ts": "",
      "packages/api/package.json": `{ "name": "@acme/api", "main": "dist/index.js", "source": "src/index.ts" }`,
      "packages/api/src/index.ts": "",
      "packages/api/src/sub.ts": "",
    });
    expect(g.named).toEqual(["src/page.tsx -> packages/api/src/index.ts", "src/page.tsx -> packages/api/src/sub.ts", "src/page.tsx -> src/lib/util.ts"]);
  });

  it("resolves Python absolute and relative imports and counts the rest as external", () => {
    const g = graph({
      "src/app/__init__.py": "",
      "src/app/main.py": "import os\nfrom app import models\nfrom .views import render\nfrom app.utils.text import slug\n",
      "src/app/models.py": "",
      "src/app/views.py": "from . import models\n",
      "src/app/utils/__init__.py": "",
      "src/app/utils/text.py": "",
    });
    expect(g.named).toEqual([
      "src/app/main.py -> src/app/models.py",
      "src/app/main.py -> src/app/utils/text.py",
      "src/app/main.py -> src/app/views.py",
      "src/app/views.py -> src/app/models.py",
    ]);
    expect(g.external).toBe(1);
  });

  it("drops self-edges and duplicates, and is deterministic", () => {
    const src = { "a.ts": `import "./b"; import "./b"; import "./a";`, "b.ts": `import "./a";` };
    const g1 = graph(src);
    expect(g1.named).toEqual(["a.ts -> b.ts", "b.ts -> a.ts"]);
    expect(graph(src).edges).toEqual(g1.edges);
  });

  it("normalizes paths and refuses to escape the repository", () => {
    expect(normalizePath("a/./b/../c")).toBe("a/c");
    expect(normalizePath("../x")).toBeNull();
    expect(parseJsonc("{ broken")).toBeNull();
  });
});
