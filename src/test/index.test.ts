import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanTree, diffTrees, formatResult } from "../index.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, "__test_tmp__");

async function setupDir(name: string, files: Record<string, string>) {
  const dir = join(TMP, name);
  await rm(dir, { recursive: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  for (const [fp, content] of Object.entries(files)) {
    const filePath = join(dir, fp);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, content);
  }
  return dir;
}

describe("tree-diff", () => {
  it("scans an empty directory", async () => {
    const dir = await setupDir("empty", {});
    const tree = await scanTree(dir);
    assert.equal(tree.entries.size, 0);
    await rm(TMP, { recursive: true });
  });

  it("scans files with hashes", async () => {
    const dir = await setupDir("hash", { "a.txt": "hello", "b.txt": "world" });
    const tree = await scanTree(dir);
    assert.equal(tree.entries.size, 2);
    const a = tree.entries.get("a.txt")!;
    assert.equal(a.type, "file");
    assert.ok(a.hash);
    assert.equal(a.size, 5);
    await rm(TMP, { recursive: true });
  });

  it("respects ignore patterns", async () => {
    const dir = await setupDir("ignore", { "a.txt": "x", "node_modules/b.txt": "y" });
    const tree = await scanTree(dir, { ignore: ["node_modules"] });
    assert.equal(tree.entries.size, 1);
    await rm(TMP, { recursive: true });
  });

  it("respects maxDepth", async () => {
    const dir = await setupDir("depth", { "a.txt": "x", "sub/b.txt": "y", "sub/deep/c.txt": "z" });
    const tree = await scanTree(dir, { maxDepth: 1 });
    assert.ok(tree.entries.has("a.txt"));
    assert.ok(tree.entries.has("sub"));
    assert.ok(tree.entries.has("sub/b.txt"));
    // sub/deep is listed as a dir but its contents aren't walked
    assert.ok(!tree.entries.has("sub/deep/c.txt"));
    await rm(TMP, { recursive: true });
  });

  it("detects added files", async () => {
    const dir1 = await setupDir("left1", { "a.txt": "hello" });
    const dir2 = await setupDir("right1", { "a.txt": "hello", "b.txt": "world" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    assert.equal(diff.summary.added, 1);
    assert.equal(diff.summary.unchanged, 1);
    await rm(TMP, { recursive: true });
  });

  it("detects removed files", async () => {
    const dir1 = await setupDir("left2", { "a.txt": "hello", "b.txt": "world" });
    const dir2 = await setupDir("right2", { "a.txt": "hello" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    assert.equal(diff.summary.removed, 1);
    await rm(TMP, { recursive: true });
  });

  it("detects modified files", async () => {
    const dir1 = await setupDir("left3", { "a.txt": "hello" });
    const dir2 = await setupDir("right3", { "a.txt": "hello world" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    assert.equal(diff.summary.modified, 1);
    assert.equal(diff.entries[0].sizeDelta, 6);
    await rm(TMP, { recursive: true });
  });

  it("detects unchanged files", async () => {
    const dir1 = await setupDir("left4", { "a.txt": "hello" });
    const dir2 = await setupDir("right4", { "a.txt": "hello" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    assert.equal(diff.summary.unchanged, 1);
    assert.equal(diff.summary.added + diff.summary.removed + diff.summary.modified, 0);
    await rm(TMP, { recursive: true });
  });

  it("formats as text", async () => {
    const dir1 = await setupDir("left5", { "a.txt": "hello" });
    const dir2 = await setupDir("right5", { "a.txt": "hello world" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    const text = formatResult(diff, { format: "text", color: false });
    assert.ok(text.includes("~ a.txt"));
    assert.ok(text.includes("Summary:"));
    await rm(TMP, { recursive: true });
  });

  it("formats as JSON", async () => {
    const dir1 = await setupDir("left6", { "a.txt": "hello" });
    const dir2 = await setupDir("right6", { "a.txt": "hello world" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    const json = formatResult(diff, { format: "json" });
    const parsed = JSON.parse(json);
    assert.equal(parsed.summary.modified, 1);
    await rm(TMP, { recursive: true });
  });

  it("formats as markdown", async () => {
    const dir1 = await setupDir("left7", { "a.txt": "hello" });
    const dir2 = await setupDir("right7", { "a.txt": "hello world" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    const md = formatResult(diff, { format: "markdown" });
    assert.ok(md.includes("# Tree Diff Report"));
    assert.ok(md.includes("MODIFIED"));
    await rm(TMP, { recursive: true });
  });

  it("calculates total size delta", async () => {
    const dir1 = await setupDir("left8", { "a.txt": "hi", "b.txt": "world" });
    const dir2 = await setupDir("right8", { "a.txt": "hello there" });
    const left = await scanTree(dir1);
    const right = await scanTree(dir2);
    const diff = diffTrees(left, right);
    // a.txt: 2→11 (+9), b.txt removed (-5), total: +4
    assert.equal(diff.summary.totalSizeDelta, 4);
    await rm(TMP, { recursive: true });
  });

  it("handles glob ignore patterns", async () => {
    const dir = await setupDir("glob", { "a.ts": "x", "b.js": "y", "c.ts": "z" });
    const tree = await scanTree(dir, { ignore: ["*.ts"] });
    assert.equal(tree.entries.size, 1);
    assert.ok(tree.entries.has("b.js"));
    await rm(TMP, { recursive: true });
  });

  it("scans nested directories", async () => {
    const dir = await setupDir("nested", {
      "src/index.ts": "code",
      "src/utils/helpers.ts": "util",
      "test/app.test.ts": "test",
      "README.md": "docs",
    });
    const tree = await scanTree(dir);
    assert.ok(tree.entries.has("src"));
    assert.ok(tree.entries.has("src/index.ts"));
    assert.ok(tree.entries.has("src/utils/helpers.ts"));
    await rm(TMP, { recursive: true });
  });
});
