# tree-diff

Compare two directory trees and see what changed — added, removed, modified, and moved files. Zero dependencies.

## Why

Ever needed to verify that a build produced the same output? Or check what changed between two snapshots of a project? `tree-diff` gives you a clean diff of two directory trees with content hashing, move detection, and CI integration.

## Install

```bash
npm install -g tree-diff
```

Or just use it directly with `npx`:

```bash
npx tree-diff dist/ dist-old/
```

## Usage

```
tree-diff <dir1> <dir2> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--ext <list>` | Filter by extension (comma-separated, e.g. `.js,.ts`) |
| `--ignore <list>` | Override default ignore patterns |
| `--pattern <list>` | Glob patterns to include |
| `--json` | Output as JSON |
| `--ci` | Exit code 1 if any changes (for CI pipelines) |
| `--stat` | Show size statistics |
| `--no-moves` | Disable move detection |
| `--follow-symlinks` | Follow symlinks instead of treating them as links |
| `-q, --quiet` | Suppress output |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

### Examples

**Basic comparison:**
```bash
tree-diff dist/ dist-old/
```

**Filter by extension:**
```bash
tree-diff build/ prod/ --ext .js,.css
```

**CI mode (exit 1 on any change):**
```bash
tree-diff expected/ actual/ --ci
```

**JSON output for scripting:**
```bash
tree-diff v1/ v2/ --json | jq '.summary'
```

**Custom ignore patterns:**
```bash
tree-diff src/ src-refactored/ --ignore "*.test.js,coverage"
```

**With size stats:**
```bash
tree-diff build-1/ build-2/ --stat
```

## How It Works

1. Walks both directory trees recursively
2. Hashes each file with SHA-256 (first 16 hex chars)
3. Compares hashes to classify each file as:
   - **Unchanged** — same path, same content
   - **Modified** — same path, different content
   - **Added** — exists only in the right tree
   - **Removed** — exists only in the left tree
   - **Moved** — different path, same content (detected by hash matching)
4. Default ignores: `node_modules`, `.git`, `.DS_Store`, `.svn`, `.hg`, `Thumbs.db`

## Default Ignore Patterns

```
node_modules, .git, .DS_Store, Thumbs.db, .svn, .hg
```

Override with `--ignore` (replaces defaults).

## API

```js
const { compare, collectTree, diffTrees } = require('tree-diff');

// Full comparison
const diff = compare('./dir1', './dir2', {
  ext: ['.js', '.ts'],
  ignore: ['node_modules', '*.test.js'],
  detectMoves: true,
});

// Access results
console.log(diff.summary);
// { added: 3, removed: 1, modified: 2, moved: 1, unchanged: 15, ... }

console.log(diff.added);
// [{ path: 'new.js', size: 1024, hash: 'a1b2c3...' }]

console.log(diff.modified);
// [{ path: 'app.js', oldSize: 100, newSize: 200, sizeDelta: 100, ... }]

console.log(diff.moved);
// [{ from: 'old.js', to: 'new.js', hash: 'abc123...', size: 512 }]
```

## Use Cases

- **Build verification** — compare build outputs across commits
- **Deployment checks** — verify what changed between deploys
- **Refactoring audits** — see exactly what moved where
- **CI gates** — fail builds if unexpected files changed
- **Monorepo diffs** — compare package outputs across versions

## License

MIT