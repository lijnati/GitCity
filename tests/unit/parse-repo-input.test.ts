import { describe, expect, it } from "vitest";
import { parseRepoInput } from "@/lib/repo/parse-repo-input";

describe("parseRepoInput", () => {
  it.each([
    ["https://github.com/facebook/react", "facebook", "react"],
    ["http://github.com/facebook/react", "facebook", "react"],
    ["github.com/vercel/next.js", "vercel", "next.js"],
    ["www.github.com/vercel/next.js/", "vercel", "next.js"],
    ["facebook/react", "facebook", "react"],
    ["  facebook/react  ", "facebook", "react"],
    ["https://github.com/facebook/react.git", "facebook", "react"],
    ["https://github.com/facebook/react/tree/main/packages", "facebook", "react"],
    ["https://github.com/facebook/react?tab=readme#top", "facebook", "react"],
    ["GitHub.com/Owner-1/repo_name", "Owner-1", "repo_name"],
  ])("accepts %s", (input, owner, repo) => {
    expect(parseRepoInput(input)).toEqual({ ok: true, value: { owner, repo } });
  });

  it.each([
    "",
    "   ",
    "react",
    "https://gitlab.com/foo/bar",
    "https://github.com.evil.com/foo/bar",
    "https://evil.com/github.com/foo/bar",
    "https://user:pass@github.com/foo/bar",
    "github.com:8080/foo/bar",
    "git@github.com:foo/bar.git",
    "ftp://github.com/foo/bar",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "foo/..",
    "../..",
    "-foo/bar",
    "foo-/bar",
    "fo--o/bar",
    "foo/bar baz",
    "foo/b%2e%2e",
    "foo\\bar",
    "foo/bar\u0000",
    "settings/profile",
    "https://github.com/orgs/vercel",
    "a".repeat(40) + "/repo",
    "owner/" + "r".repeat(101),
    "x".repeat(300),
  ])("rejects %j", (input) => {
    const result = parseRepoInput(input);
    expect(result.ok).toBe(false);
  });

  it("returns a helpful message", () => {
    const r = parseRepoInput("https://gitlab.com/a/b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/github\.com/);
  });
});
