# tree-diff

Compare two directory trees. See what was added, removed, modified — with content hashes and size deltas.

**Why?** Because sometimes you need to know *exactly* what changed between two directories. Not a diff of file contents (that's what `diff -r` does) — but a structural comparison: which files appeared, which disappeared, which changed, and by how much.

## Install

```bash
npm install -g tree-diff
```

## CLI

```bash
# Basic comparison
tree-diff ./build-v1 ./build-v2

# JSON output for scripts
tree-diff ./before ./after --format json

# Markdown report
tree-diff ./staging ./production --format markdown

# Ignore patterns (comma-separated)
tree-diff ./a ./b --ignore "node_modules,.git,dist"

# Skip hashing (faster, size-only comparison)
tree-diff ./a ./b --no-hash

# Limit depth
tree-diff ./a ./b --max-depth 3

# Show unchanged files too
tree-diff ./a ./b --show-unchanged

# No colors
tree-diff ./a ./b --no-color
```

## Output

### Text (default)

```
Comparing directories:
  left:  /path/to/v1
  right: /path/to/v2

+ new-feature.js  (+1.2 KB)
~ index.js        (+256 B)
- legacy.js       (-3.4 KB)
! config.json     [file → dir]

Summary:
  + 1 added
  - 1 removed
  ~ 1 modified
  ! 1 type changed
    42 unchanged
  Total size delta: -1.9 KB
```

### JSON

Structured output with full details — before/after types, sizes, hashes, size deltas.

### Markdown

Table-based report suitable for PRs or documentation.

## API

```typescript
import { scanTree, diffTrees, formatResult } from "tree-diff";

// Scan a directory
const tree = await scanTree("./my-dir", {
  ignore: ["node_modules", ".git"],
  hashFiles: true,    // sha256 content hashes
  maxDepth: 5,
});

// Compare two scans
const diff = diffTrees(leftTree, rightTree);
// diff.summary.added / .removed / .modified / .typeChanged / .unchanged
// diff.entries[] — each with path, changeType, sizeDelta, before/after

// Format output
console.log(formatResult(diff, { format: "text", color: true }));
```

## Features

- **Content hashing** — SHA-256 based change detection (not just size)
- **Symlink tracking** — detects symlink target changes
- **Type changes** — file→dir, dir→symlink, etc.
- **Ignore patterns** — glob-style (*.log), directory names, paths
- **Depth control** — limit recursion depth
- **Size deltas** — per-file and total size changes
- **Zero dependencies**

## Exit Codes

- `0` — directories are identical
- `1` — differences found
- `2` — error

## License

MIT
