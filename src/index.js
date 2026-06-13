'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Default ignore patterns ──────────────────────────────────────────
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.svn',
  '.hg',
];

// ── Glob-style pattern matching ──────────────────────────────────────
function matchPattern(name, pattern) {
  // Convert glob to regex: * → .*, ? → ., everything else escaped
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^(?:' + regexStr + ')$').test(name);
}

function isIgnored(name, ignorePatterns) {
  for (const p of ignorePatterns) {
    if (matchPattern(name, p)) return true;
  }
  return false;
}

// ── Hash a file (sha256, first 16 hex chars for speed) ───────────────
function hashFile(filePath, buffer) {
  if (buffer !== undefined) {
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  }
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// ── Collect all files in a directory tree ────────────────────────────
function collectTree(dir, options) {
  options = options || {};
  const ignore = options.ignore || DEFAULT_IGNORE;
  const followSymlinks = options.followSymlinks || false;
  const result = {};

  function walk(currentDir, relativeBase) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (isIgnored(entry.name, ignore)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeBase
        ? relativeBase + '/' + entry.name
        : entry.name;

      if (entry.isSymbolicLink() && !followSymlinks) {
        result[relPath] = {
          type: 'symlink',
          size: 0,
          hash: null,
          mtime: 0,
        };
        continue;
      }

      const stat = entry.isSymbolicLink()
        ? fs.statSync(fullPath)
        : fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, relPath);
      } else if (stat.isFile()) {
        result[relPath] = {
          type: 'file',
          size: stat.size,
          hash: hashFile(fullPath),
          mtime: stat.mtimeMs,
        };
      }
    }
  }

  walk(dir, '');
  return result;
}

// ── Compare two trees ────────────────────────────────────────────────
function diffTrees(leftTree, rightTree, options) {
  options = options || {};
  const detectMoves = options.detectMoves !== false; // default true

  const leftPaths = new Set(Object.keys(leftTree));
  const rightPaths = new Set(Object.keys(rightTree));

  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];
  const moved = [];

  // Files in right but not in left → added (or moved)
  const unmatchedRight = [];
  for (const p of rightPaths) {
    if (!leftTree[p]) {
      unmatchedRight.push(p);
    }
  }

  // Files in left but not in right → removed (or moved)
  const unmatchedLeft = [];
  for (const p of leftPaths) {
    if (!rightTree[p]) {
      unmatchedLeft.push(p);
    }
  }

  // Match moved files by hash
  const matchedByMove = new Set();
  if (detectMoves) {
    // Build hash → path maps for unmatched files
    const leftByHash = {};
    for (const p of unmatchedLeft) {
      const h = leftTree[p].hash;
      if (h) {
        if (!leftByHash[h]) leftByHash[h] = [];
        leftByHash[h].push(p);
      }
    }

    for (const p of unmatchedRight) {
      const h = rightTree[p].hash;
      if (h && leftByHash[h] && leftByHash[h].length > 0) {
        const oldPath = leftByHash[h].shift();
        moved.push({
          from: oldPath,
          to: p,
          hash: h,
          size: rightTree[p].size,
        });
        matchedByMove.add(p);
        matchedByMove.add(oldPath);
      }
    }
  }

  // Remaining unmatched → added / removed
  for (const p of unmatchedRight) {
    if (!matchedByMove.has(p)) {
      added.push({
        path: p,
        size: rightTree[p].size,
        hash: rightTree[p].hash,
      });
    }
  }

  for (const p of unmatchedLeft) {
    if (!matchedByMove.has(p)) {
      removed.push({
        path: p,
        size: leftTree[p].size,
        hash: leftTree[p].hash,
      });
    }
  }

  // Files in both → check if modified
  for (const p of leftPaths) {
    if (rightTree[p] && !matchedByMove.has(p)) {
      const lf = leftTree[p];
      const rf = rightTree[p];

      if (lf.hash === rf.hash) {
        unchanged.push({
          path: p,
          size: rf.size,
          hash: rf.hash,
        });
      } else {
        modified.push({
          path: p,
          oldSize: lf.size,
          newSize: rf.size,
          sizeDelta: rf.size - lf.size,
          oldHash: lf.hash,
          newHash: rf.hash,
        });
      }
    }
  }

  return {
    added,
    removed,
    modified,
    moved,
    unchanged,
    summary: {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      moved: moved.length,
      unchanged: unchanged.length,
      totalLeft: leftPaths.size,
      totalRight: rightPaths.size,
    },
  };
}

// ── Filter results by extension or pattern ───────────────────────────
function filterResults(diff, filterFn) {
  const filtered = {};
  for (const key of ['added', 'removed', 'modified', 'moved', 'unchanged']) {
    filtered[key] = diff[key].filter(filterFn);
  }
  filtered.summary = {
    added: filtered.added.length,
    removed: filtered.removed.length,
    modified: filtered.modified.length,
    moved: filtered.moved.length,
    unchanged: filtered.unchanged.length,
    totalLeft: diff.summary.totalLeft,
    totalRight: diff.summary.totalRight,
  };
  return filtered;
}

// ── Main compare function ────────────────────────────────────────────
function compare(leftDir, rightDir, options) {
  options = options || {};

  const leftTree = collectTree(leftDir, options);
  const rightTree = collectTree(rightDir, options);

  let result = diffTrees(leftTree, rightTree, options);

  // Filter by extension
  if (options.ext) {
    const exts = Array.isArray(options.ext) ? options.ext : [options.ext];
    const normExts = exts.map(e => e.startsWith('.') ? e : '.' + e);
    result = filterResults(result, (item) => {
      const p = item.path || item.to || item.from || '';
      return normExts.some(e => p.endsWith(e));
    });
  }

  // Filter by glob pattern
  if (options.pattern) {
    const patterns = Array.isArray(options.pattern) ? options.pattern : [options.pattern];
    result = filterResults(result, (item) => {
      const p = item.path || item.to || item.from || '';
      return patterns.some(pat => matchPattern(p, pat));
    });
  }

  return result;
}

module.exports = {
  collectTree,
  diffTrees,
  compare,
  filterResults,
  matchPattern,
  hashFile,
  DEFAULT_IGNORE,
};
