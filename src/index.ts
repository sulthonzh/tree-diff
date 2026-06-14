import { createHash } from "crypto";
import { lstat, readdir, readFile, readlink } from "fs/promises";
import { join, relative, basename } from "path";

export interface TreeEntry {
  path: string;
  type: "file" | "dir" | "symlink" | "other";
  size: number;
  hash?: string; // sha256 for files
  linkTarget?: string;
}

export interface TreeSnapshot {
  root: string;
  entries: Map<string, TreeEntry>;
  timestamp: number;
}

export type ChangeType = "added" | "removed" | "modified" | "type_changed" | "unchanged";

export interface DiffEntry {
  path: string;
  changeType: ChangeType;
  before?: TreeEntry;
  after?: TreeEntry;
  sizeDelta?: number;
}

export interface DiffResult {
  leftRoot: string;
  rightRoot: string;
  entries: DiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    typeChanged: number;
    unchanged: number;
    totalSizeDelta: number;
  };
}

export interface ScanOptions {
  ignore?: string[];
  followSymlinks?: boolean;
  hashFiles?: boolean;
  maxDepth?: number;
}

export interface DiffOptions {
  ignore?: string[];
  hashFiles?: boolean;
  maxDepth?: number;
  contentDiff?: boolean;
}

export interface FormatOptions {
  format?: "text" | "json" | "markdown";
  showUnchanged?: boolean;
  color?: boolean;
}

function shouldIgnore(relPath: string, ignore: string[]): boolean {
  const parts = relPath.split(/[/\\]/);
  for (const pattern of ignore) {
    if (relPath === pattern || parts.includes(pattern) || relPath.startsWith(pattern + "/")) {
      return true;
    }
    // glob-like *.ext
    if (pattern.startsWith("*.") && relPath.endsWith(pattern.slice(1))) {
      return true;
    }
  }
  return false;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function scanTree(root: string, options: ScanOptions = {}): Promise<TreeSnapshot> {
  const { ignore = [], hashFiles = true, maxDepth } = options;
  const entries = new Map<string, TreeEntry>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (maxDepth !== undefined && depth > maxDepth) return;

    let items: string[];
    try {
      items = await readdir(dir);
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = join(dir, item);
      const relPath = relative(root, fullPath);

      if (shouldIgnore(relPath, ignore)) continue;

      let stat;
      try {
        stat = await lstat(fullPath);
      } catch {
        continue;
      }

      let type: TreeEntry["type"] = "other";
      let hash: string | undefined;
      let linkTarget: string | undefined;

      if (stat.isDirectory()) {
        type = "dir";
      } else if (stat.isFile()) {
        type = "file";
        if (hashFiles) {
          try { hash = await hashFile(fullPath); } catch { /* skip */ }
        }
      } else if (stat.isSymbolicLink()) {
        type = "symlink";
        try { linkTarget = await readlink(fullPath); } catch { /* skip */ }
      }

      const entry: TreeEntry = {
        path: relPath,
        type,
        size: stat.size,
        ...(hash && { hash }),
        ...(linkTarget && { linkTarget }),
      };

      entries.set(relPath, entry);

      if (type === "dir") {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(root, 0);

  return { root, entries, timestamp: Date.now() };
}

export function diffTrees(left: TreeSnapshot, right: TreeSnapshot): DiffResult {
  const entries: DiffEntry[] = [];
  const allPaths = new Set([...left.entries.keys(), ...right.entries.keys()]);
  const sortedPaths = [...allPaths].sort();

  let added = 0, removed = 0, modified = 0, typeChanged = 0, unchanged = 0, totalSizeDelta = 0;

  for (const path of sortedPaths) {
    const before = left.entries.get(path);
    const after = right.entries.get(path);

    if (!before && after) {
      added++;
      totalSizeDelta += after.size;
      entries.push({ path, changeType: "added", after, sizeDelta: after.size });
    } else if (before && !after) {
      removed++;
      totalSizeDelta -= before.size;
      entries.push({ path, changeType: "removed", before, sizeDelta: -before.size });
    } else if (before && after) {
      if (before.type !== after.type) {
        typeChanged++;
        const sizeDelta = after.size - before.size;
        totalSizeDelta += sizeDelta;
        entries.push({ path, changeType: "type_changed", before, after, sizeDelta });
      } else if (before.hash && after.hash && before.hash !== after.hash) {
        modified++;
        const sizeDelta = after.size - before.size;
        totalSizeDelta += sizeDelta;
        entries.push({ path, changeType: "modified", before, after, sizeDelta });
      } else if (!before.hash && !after.hash && before.size !== after.size) {
        // no hash but size changed (dirs)
        modified++;
        const sizeDelta = after.size - before.size;
        totalSizeDelta += sizeDelta;
        entries.push({ path, changeType: "modified", before, after, sizeDelta });
      } else if (before.linkTarget !== after.linkTarget) {
        modified++;
        entries.push({ path, changeType: "modified", before, after, sizeDelta: 0 });
      } else {
        unchanged++;
        entries.push({ path, changeType: "unchanged", before, after, sizeDelta: 0 });
      }
    }
  }

  return {
    leftRoot: left.root,
    rightRoot: right.root,
    entries,
    summary: { added, removed, modified, typeChanged, unchanged, totalSizeDelta },
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sign = bytes < 0 ? "-" : "+";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

const CHANGE_SYMBOLS: Record<ChangeType, string> = {
  added: "+",
  removed: "-",
  modified: "~",
  type_changed: "!",
  unchanged: " ",
};

const CHANGE_LABELS: Record<ChangeType, string> = {
  added: "ADDED",
  removed: "REMOVED",
  modified: "MODIFIED",
  type_changed: "TYPE_CHANGED",
  unchanged: "UNCHANGED",
};

export function formatText(result: DiffResult, options: FormatOptions = {}): string {
  const { showUnchanged = false, color = true } = options;
  const lines: string[] = [];

  const reset = color ? "\x1b[0m" : "";
  const green = color ? "\x1b[32m" : "";
  const red = color ? "\x1b[31m" : "";
  const yellow = color ? "\x1b[33m" : "";
  const cyan = color ? "\x1b[36m" : "";
  const dim = color ? "\x1b[2m" : "";

  const colorMap: Record<ChangeType, string> = {
    added: green,
    removed: red,
    modified: yellow,
    type_changed: cyan,
    unchanged: dim,
  };

  lines.push(`Comparing directories:`);
  lines.push(`  left:  ${result.leftRoot}`);
  lines.push(`  right: ${result.rightRoot}`);
  lines.push("");

  for (const entry of result.entries) {
    if (entry.changeType === "unchanged" && !showUnchanged) continue;

    const sym = CHANGE_SYMBOLS[entry.changeType];
    const c = colorMap[entry.changeType];
    let line = `${c}${sym} ${entry.path}${reset}`;

    if (entry.sizeDelta !== undefined && entry.sizeDelta !== 0) {
      line += `  ${dim}(${formatBytes(entry.sizeDelta)})${reset}`;
    }

    if (entry.changeType === "type_changed" && entry.before && entry.after) {
      line += `  ${dim}[${entry.before.type} → ${entry.after.type}]${reset}`;
    }

    lines.push(line);
  }

  lines.push("");
  lines.push("Summary:");
  const s = result.summary;
  if (s.added) lines.push(`  ${green}+ ${s.added} added${reset}`);
  if (s.removed) lines.push(`  ${red}- ${s.removed} removed${reset}`);
  if (s.modified) lines.push(`  ${yellow}~ ${s.modified} modified${reset}`);
  if (s.typeChanged) lines.push(`  ${cyan}! ${s.typeChanged} type changed${reset}`);
  if (s.unchanged) lines.push(`  ${dim}  ${s.unchanged} unchanged${reset}`);
  lines.push(`  Total size delta: ${formatBytes(s.totalSizeDelta)}`);

  return lines.join("\n");
}

export function formatJSON(result: DiffResult, options: FormatOptions = {}): string {
  const { showUnchanged = false } = options;
  const filtered = showUnchanged
    ? result.entries
    : result.entries.filter((e) => e.changeType !== "unchanged");

  return JSON.stringify(
    {
      leftRoot: result.leftRoot,
      rightRoot: result.rightRoot,
      summary: result.summary,
      entries: filtered.map((e) => ({
        path: e.path,
        changeType: e.changeType,
        sizeDelta: e.sizeDelta,
        before: e.before ? { type: e.before.type, size: e.before.size, hash: e.before.hash } : undefined,
        after: e.after ? { type: e.after.type, size: e.after.size, hash: e.after.hash } : undefined,
      })),
    },
    null,
    2
  );
}

export function formatMarkdown(result: DiffResult, options: FormatOptions = {}): string {
  const { showUnchanged = false } = options;
  const lines: string[] = [];

  lines.push("# Tree Diff Report");
  lines.push("");
  lines.push(`| | Left | Right |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **Root** | \`${result.leftRoot}\` | \`${result.rightRoot}\` |`);
  lines.push("");

  const filtered = showUnchanged
    ? result.entries
    : result.entries.filter((e) => e.changeType !== "unchanged");

  if (filtered.length === 0) {
    lines.push("*No differences found.*");
  } else {
    lines.push(`| Status | Path | Size Delta | Details |`);
    lines.push(`|--------|------|------------|---------|`);
    for (const e of filtered) {
      const status = CHANGE_LABELS[e.changeType];
      const delta = e.sizeDelta ? formatBytes(e.sizeDelta) : "—";
      let details = "";
      if (e.changeType === "type_changed" && e.before && e.after) {
        details = `${e.before.type} → ${e.after.type}`;
      }
      lines.push(`| ${status} | \`${e.path}\` | ${delta} | ${details} |`);
    }
  }

  lines.push("");
  lines.push("## Summary");
  const s = result.summary;
  lines.push(`- **Added**: ${s.added}`);
  lines.push(`- **Removed**: ${s.removed}`);
  lines.push(`- **Modified**: ${s.modified}`);
  lines.push(`- **Type Changed**: ${s.typeChanged}`);
  lines.push(`- **Unchanged**: ${s.unchanged}`);
  lines.push(`- **Total Size Delta**: ${formatBytes(s.totalSizeDelta)}`);

  return lines.join("\n");
}

export function formatResult(result: DiffResult, options: FormatOptions = {}): string {
  switch (options.format || "text") {
    case "json":
      return formatJSON(result, options);
    case "markdown":
      return formatMarkdown(result, options);
    default:
      return formatText(result, options);
  }
}
