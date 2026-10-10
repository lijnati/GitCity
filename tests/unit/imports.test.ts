import { describe, expect, it } from "vitest";
import { extractSpecifiers, ImportCollector, normalizePath, parseCargoPackageName, parseGoModule, parseJsonc, stripJsComments } from "@/lib/repo/imports";
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

  it("drops self-edges from Rust `use self::…` without counting them as external", () => {
    const g = graph({ "Cargo.toml": `[package]\nname = "x"`, "src/lib.rs": "enum E { A }\nuse self::E::*;\nuse E::A;\n" });
    expect(g.edges).toEqual([]);
    expect(g.resolved).toBe(2);
    expect(g.external).toBe(0);
  });

  it("normalizes paths and refuses to escape the repository", () => {
    expect(normalizePath("a/./b/../c")).toBe("a/c");
    expect(normalizePath("../x")).toBeNull();
    expect(parseJsonc("{ broken")).toBeNull();
  });
});

describe("extractSpecifiers (Rust)", () => {
  it("reads mod declarations, use trees and extern crates, ignoring comments and strings", () => {
    const src = [
      "//! crate docs: use fake::Thing;",
      "#[cfg(test)] mod tests;",
      "pub(crate) mod config;",
      "mod inline { fn f() {} }",
      "pub use crate::{",
      "    a::B,",
      "    c::{self, d::E as F},",
      "    g::*,",
      "};",
      "use super::super::x;",
      "use ::serde::Serialize;",
      "extern crate alloc;",
      "/* outer /* nested use nope::X; */ still comment; use nope2::Y; */",
      'const S: &str = "use quoted::Q;";',
      'const R: &str = r#"use raw::R; "quoted""#;',
      "fn lt<'a>(x: &'a str) -> char { 'x' }",
      "macro_rules! m { () => { use $crate::inner::M; } }",
    ].join("\n");
    expect(extractSpecifiers(src, "rust")).toEqual([
      "mod:tests",
      "mod:config",
      "use:alloc",
      "use:crate::a::B",
      "use:crate::c",
      "use:crate::c::d::E",
      "use:crate::g",
      "use:super::super::x",
      "use:::serde::Serialize",
    ]);
  });

  it("keeps `use super::*` inside an inline test module pointing at this file", () => {
    const src = "use super::outer;\nmod tests {\n  use super::*;\n  use super::super::up;\n  use self::helpers::h;\n}\n";
    expect(extractSpecifiers(src, "rust")).toEqual(["use:super::outer", "use:self", "use:super::up"]);
  });
});

describe("extractSpecifiers (Go)", () => {
  it("reads single, aliased and grouped imports, ignoring comments", () => {
    const src = [
      "package main",
      'import "fmt"',
      'import str "strings"',
      "import (",
      '\t"os"',
      '\t_ "embed"',
      "\tm `example.com/app/internal/model`",
      '\t// "commented/out"',
      ")",
      '/* import "nope" */',
    ].join("\n");
    expect(extractSpecifiers(src, "go").sort()).toEqual(["embed", "example.com/app/internal/model", "fmt", "os", "strings"]);
  });
});

describe("Rust resolution", () => {
  it("resolves mod declarations in both file layouts, relative to the declaring file", () => {
    const g = graph({
      "Cargo.toml": `[package]\nname = "app"\nversion = "0.1.0"`,
      "src/lib.rs": "mod flat;\nmod nested;\nmod missing;\n",
      "src/flat.rs": "mod child;\n",
      "src/flat/child.rs": "",
      "src/nested/mod.rs": "mod leaf;\n",
      "src/nested/leaf.rs": "",
    });
    expect(g.named).toEqual([
      "src/flat.rs -> src/flat/child.rs",
      "src/lib.rs -> src/flat.rs",
      "src/lib.rs -> src/nested/mod.rs",
      "src/nested/mod.rs -> src/nested/leaf.rs",
    ]);
    expect(g.unresolved).toBe(1);
  });

  it("resolves crate::, super:: and self:: through the module tree to the deepest module file", () => {
    const g = graph({
      "Cargo.toml": `[package]\nname = "app"`,
      "src/main.rs": "mod a;\nmod b;\nuse crate::a::Thing;\nuse crate::Root;\n",
      "src/a.rs": "mod inner;\nuse self::inner::Deep;\nuse super::b::{self, Item};\n",
      "src/a/inner.rs": "use super::super::b::Item;\nuse crate::b::sub::Sub;\n",
      "src/b/mod.rs": "mod sub;\n",
      "src/b/sub.rs": "",
    });
    expect(g.named).toEqual([
      "src/a.rs -> src/a/inner.rs",
      "src/a.rs -> src/b/mod.rs",
      "src/a/inner.rs -> src/b/mod.rs",
      "src/a/inner.rs -> src/b/sub.rs",
      "src/b/mod.rs -> src/b/sub.rs",
      "src/main.rs -> src/a.rs",
      "src/main.rs -> src/b/mod.rs",
    ]);
    // `use crate::Root` names an item in main.rs itself: resolved, but no self-edge.
    expect(g.unresolved).toBe(0);
    expect(g.external).toBe(0);
  });

  it("resolves workspace crates by [package] name with - → _, and counts everything else as external", () => {
    const g = graph({
      "Cargo.toml": `[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nname = "not-a-crate"`,
      "crates/my-utils/Cargo.toml": `# utils\n[package]\nname = "my-utils" # inline comment\n\n[dependencies]\nname = "ignored"`,
      "crates/my-utils/src/lib.rs": "pub mod config;\n",
      "crates/my-utils/src/config.rs": "",
      "crates/app/Cargo.toml": `[package]\nname = 'app'`,
      "crates/app/src/main.rs": [
        "use my_utils::config::Config;",
        "use ::my_utils::Root;",
        "use std::collections::HashMap;",
        "use serde::Serialize;",
        "use ::core::fmt;",
        "extern crate my_utils;",
      ].join("\n"),
    });
    expect(g.named).toEqual(["crates/app/src/main.rs -> crates/my-utils/src/config.rs", "crates/app/src/main.rs -> crates/my-utils/src/lib.rs", "crates/my-utils/src/lib.rs -> crates/my-utils/src/config.rs"]);
    expect(g.external).toBe(3);
    expect(parseCargoPackageName(`[package]\nversion = "1"`)).toBeNull();
  });

  it("treats Cargo target files (tests/, examples/, benches/, src/bin/, build.rs) as crate roots for mod lookup", () => {
    const g = graph({
      "Cargo.toml": `[package]\nname = "app"`,
      "src/lib.rs": "",
      "src/bin/tool.rs": "mod shared;\n",
      "src/bin/shared.rs": "",
      "tests/test_a.rs": "mod common;\n",
      "tests/common/mod.rs": "",
      "examples/demo.rs": "mod util;\n",
      "examples/util.rs": "",
      "build.rs": "mod gen;\n",
      "gen.rs": "",
      // Not a Cargo target directory: the usual dir/<stem>/ rule applies.
      "docs/tests/x.rs": "mod y;\n",
      "docs/tests/y.rs": "",
    });
    expect(g.named).toEqual(["build.rs -> gen.rs", "examples/demo.rs -> examples/util.rs", "src/bin/tool.rs -> src/bin/shared.rs", "tests/test_a.rs -> tests/common/mod.rs"]);
    expect(g.unresolved).toBe(1);
  });

  it("leaves crate:: unresolved without a Cargo.toml crate root", () => {
    const g = graph({ "scripts/tool.rs": "use crate::x::Y;\nuse super::z;\n" });
    expect(g.unresolved).toBe(2);
    expect(g.edges).toEqual([]);
  });
});

describe("Go resolution", () => {
  it("resolves module-prefixed imports to every non-test file of the package, once per import", () => {
    const g = graph({
      "go.mod": "// root module\nmodule example.com/app\n\ngo 1.22\n",
      "cmd/app/main.go": 'package main\nimport (\n\t"fmt"\n\t"example.com/app/internal/model"\n\t"example.com/app/internal/empty"\n\t"github.com/x/y"\n)\n',
      "internal/model/a.go": 'package model\nimport "example.com/app/internal/model/sub"',
      "internal/model/b.go": "package model",
      "internal/model/b_test.go": "package model",
      "internal/model/sub/s.go": "package sub",
      "internal/empty/only_test.go": "package empty",
    });
    expect(g.named).toEqual([
      "cmd/app/main.go -> internal/model/a.go",
      "cmd/app/main.go -> internal/model/b.go",
      "internal/model/a.go -> internal/model/sub/s.go",
    ]);
    expect(g.resolved).toBe(2);
    expect(g.external).toBe(2);
    expect(g.unresolved).toBe(1);
  });

  it("uses the longest module prefix when a repository holds several modules", () => {
    const g = graph({
      "go.mod": "module example.com/app",
      "tools/go.mod": 'module "example.com/app/tools"',
      "tools/gen/gen.go": 'package gen\nimport "example.com/app/tools/lib"',
      "tools/lib/lib.go": "package lib",
      "lib/lib.go": "package lib",
    });
    expect(g.named).toEqual(["tools/gen/gen.go -> tools/lib/lib.go"]);
    expect(parseGoModule("go 1.21\n")).toBeNull();
  });
});
