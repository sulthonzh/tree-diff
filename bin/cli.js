#!/usr/bin/env node
'use strict';

const path = require('path');
const { compare } = require('../src/index');

// ── Arg parsing ──────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [], json: false, ci: false, quiet: false, ext: null, ignore: null, noMoves: false, followSymlinks: false, pattern: null, stat: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--ci') { args.ci = true; continue; }
    if (arg === '--quiet' || arg === '-q') { args.quiet = true; continue; }
    if (arg === '--stat') { args.stat = true; continue; }
    if (arg === '--no-moves') { args.noMoves = true; continue; }
    if (arg === '--follow-symlinks') { args.followSymlinks = true; continue; }

    if ((arg === '--ext' || arg === '-e') && i + 1 < argv.length) {
      args.ext = argv[++i].split(',').map(e => e.trim());
      continue;
    }

    if (arg === '--ignore' && i + 1 < argv.length) {
      args.ignore = argv[++i].split(',').map(s => s.trim());
      continue;
    }

    if (arg === '--pattern' && i + 1 < argv.length) {
      args.pattern = argv[++i].split(',').map(s => s.trim());
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--version' || arg === '-V') {
      args.version = true;
      continue;
    }

    if (arg.startsWith('--ext=')) {
      args.ext = arg.slice(6).split(',').map(e => e.trim());
      continue;
    }
    if (arg.startsWith('--ignore=')) {
      args.ignore = arg.slice(9).split(',').map(s => s.trim());
      continue;
    }
    if (arg.startsWith('--pattern=')) {
      args.pattern = arg.slice(10).split(',').map(s => s.trim());
      continue;
    }

    positional.push(arg);
  }

  return { args, positional };
}

function showHelp() {
  console.log(`
tree-diff — Compare two directory trees

USAGE
  tree-diff <dir1> <dir2> [options]

OPTIONS
  --ext <list>        Filter by extension (comma-separated, e.g. .js,.ts)
  --ignore <list>     Comma-separated ignore patterns (default: node_modules,.git,.DS_Store)
  --pattern <list>    Glob patterns to include (comma-separated)
  --json              Output as JSON
  --ci                Exit 1 if any changes detected (for CI pipelines)
  --stat              Show size statistics
  --no-moves          Disable move detection
  --follow-symlinks   Follow symlinks instead of marking them
  -q, --quiet         Suppress output (useful with --ci)
  -h, --help          Show this help
  -V, --version       Show version

EXAMPLES
  tree-diff dist/ dist-old/
  tree-diff build/ prod/ --ext .js,.css --json
  tree-diff src/ src-refactored/ --ci
`);
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(abs) / Math.log(1024));
  const val = abs / Math.pow(1024, i);
  return sign + val.toFixed(1) + ' ' + units[i];
}

function formatOutput(diff) {
  const lines = [];
  const s = diff.summary;

  if (s.added === 0 && s.removed === 0 && s.modified === 0 && s.moved === 0) {
    lines.push('No differences found — trees are identical.');
    return lines.join('\n');
  }

  if (diff.added.length > 0) {
    lines.push('── Added (' + diff.added.length + ') ' + '─'.repeat(Math.max(0, 40 - diff.added.length.toString().length)));
    for (const f of diff.added) {
      lines.push('  + ' + f.path + '  (' + formatSize(f.size) + ')');
    }
  }

  if (diff.removed.length > 0) {
    lines.push('');
    lines.push('── Removed (' + diff.removed.length + ') ' + '─'.repeat(Math.max(0, 38 - diff.removed.length.toString().length)));
    for (const f of diff.removed) {
      lines.push('  - ' + f.path + '  (' + formatSize(f.size) + ')');
    }
  }

  if (diff.modified.length > 0) {
    lines.push('');
    lines.push('── Modified (' + diff.modified.length + ') ' + '─'.repeat(Math.max(0, 37 - diff.modified.length.toString().length)));
    for (const f of diff.modified) {
      const delta = f.sizeDelta >= 0 ? '+' : '';
      lines.push('  ~ ' + f.path + '  (' + delta + formatSize(f.sizeDelta) + ')');
    }
  }

  if (diff.moved.length > 0) {
    lines.push('');
    lines.push('── Moved (' + diff.moved.length + ') ' + '─'.repeat(Math.max(0, 40 - diff.moved.length.toString().length)));
    for (const f of diff.moved) {
      lines.push('  → ' + f.from + ' → ' + f.to);
    }
  }

  lines.push('');
  lines.push('── Summary ' + '─'.repeat(40));
  lines.push('  Added: ' + s.added + ' | Removed: ' + s.removed + ' | Modified: ' + s.modified + ' | Moved: ' + s.moved + ' | Unchanged: ' + s.unchanged);

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  const { args, positional } = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    const pkg = require('../package.json');
    console.log(pkg.name + ' v' + pkg.version);
    process.exit(0);
  }

  if (positional.length < 2) {
    console.error('Error: two directory paths required.');
    console.error('Usage: tree-diff <dir1> <dir2> [options]');
    console.error('Run "tree-diff --help" for more info.');
    process.exit(2);
  }

  const leftDir = path.resolve(positional[0]);
  const rightDir = path.resolve(positional[1]);

  const fs = require('fs');
  if (!fs.existsSync(leftDir) || !fs.statSync(leftDir).isDirectory()) {
    console.error('Error: "' + positional[0] + '" is not a valid directory.');
    process.exit(2);
  }
  if (!fs.existsSync(rightDir) || !fs.statSync(rightDir).isDirectory()) {
    console.error('Error: "' + positional[1] + '" is not a valid directory.');
    process.exit(2);
  }

  const options = {
    ext: args.ext,
    ignore: args.ignore,
    pattern: args.pattern,
    detectMoves: !args.noMoves,
    followSymlinks: args.followSymlinks,
  };

  const diff = compare(leftDir, rightDir, options);

  if (args.json) {
    if (args.stat) {
      // Include size stats in JSON
      const totalAdded = diff.added.reduce((a, f) => a + f.size, 0);
      const totalRemoved = diff.removed.reduce((a, f) => a + f.size, 0);
      const totalSizeDelta = diff.modified.reduce((a, f) => a + f.sizeDelta, 0);
      diff.stat = {
        totalAddedSize: totalAdded,
        totalRemovedSize: totalRemoved,
        totalSizeDelta: totalSizeDelta,
      };
    }
    console.log(JSON.stringify(diff, null, 2));
  } else if (!args.quiet) {
    console.log(formatOutput(diff));
    if (args.stat) {
      const totalAdded = diff.added.reduce((a, f) => a + f.size, 0);
      const totalRemoved = diff.removed.reduce((a, f) => a + f.size, 0);
      const totalSizeDelta = diff.modified.reduce((a, f) => a + f.sizeDelta, 0);
      console.log('\n── Size Stats ' + '─'.repeat(36));
      console.log('  Added: ' + formatSize(totalAdded) + ' | Removed: ' + formatSize(totalRemoved) + ' | Delta: ' + (totalSizeDelta >= 0 ? '+' : '') + formatSize(totalSizeDelta));
    }
  }

  // CI mode: exit 1 if any changes
  if (args.ci) {
    const hasChanges = diff.summary.added > 0 || diff.summary.removed > 0 || diff.summary.modified > 0 || diff.summary.moved > 0;
    process.exit(hasChanges ? 1 : 0);
  }
}

main();
