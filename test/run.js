'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { collectTree, diffTrees, compare, filterResults, matchPattern, hashFile, DEFAULT_IGNORE } = require('../src/index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('✗ ' + name + ': ' + e.message);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('✗ ' + name + ': ' + e.message);
  }
}

// ── Test helpers ─────────────────────────────────────────────────────
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tree-diff-test-'));
}

function makeDir(base, rel) {
  const full = path.join(base, rel);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

function writeFile(base, rel, content) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function rmTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── matchPattern tests ───────────────────────────────────────────────
test('matchPattern: exact match', () => {
  assert.strictEqual(matchPattern('file.js', 'file.js'), true);
  assert.strictEqual(matchPattern('file.ts', 'file.js'), false);
});

test('matchPattern: wildcard *', () => {
  assert.strictEqual(matchPattern('test.js', '*.js'), true);
  assert.strictEqual(matchPattern('test.ts', '*.js'), false);
});

test('matchPattern: wildcard ?', () => {
  assert.strictEqual(matchPattern('file.js', 'fil?.js'), true);
  assert.strictEqual(matchPattern('files.js', 'fil?.js'), false);
});

test('matchPattern: multiple patterns', () => {
  assert.strictEqual(matchPattern('a/b.js', '*/b.js'), true);
  assert.strictEqual(matchPattern('a/c.js', '*/b.js'), false);
});

// ── hashFile tests ───────────────────────────────────────────────────
test('hashFile: consistent hashes', () => {
  const buf = Buffer.from('hello world');
  const h1 = hashFile(null, buf);
  const h2 = hashFile(null, buf);
  assert.strictEqual(h1, h2);
});

test('hashFile: different content → different hash', () => {
  const h1 = hashFile(null, Buffer.from('hello'));
  const h2 = hashFile(null, Buffer.from('world'));
  assert.notStrictEqual(h1, h2);
});

test('hashFile: hash length is 16', () => {
  const h = hashFile(null, Buffer.from('test'));
  assert.strictEqual(h.length, 16);
});

// ── collectTree tests ────────────────────────────────────────────────
test('collectTree: empty directory', () => {
  const dir = makeTempDir();
  const tree = collectTree(dir);
  assert.strictEqual(Object.keys(tree).length, 0);
  rmTempDir(dir);
});

test('collectTree: flat files', () => {
  const dir = makeTempDir();
  writeFile(dir, 'a.js', 'a');
  writeFile(dir, 'b.js', 'b');
  const tree = collectTree(dir);
  assert.strictEqual(Object.keys(tree).length, 2);
  assert.ok(tree['a.js']);
  assert.ok(tree['b.js']);
  rmTempDir(dir);
});

test('collectTree: nested directories', () => {
  const dir = makeTempDir();
  writeFile(dir, 'src/index.js', 'code');
  writeFile(dir, 'src/utils/helper.js', 'code2');
  writeFile(dir, 'README.md', 'readme');
  const tree = collectTree(dir);
  assert.strictEqual(Object.keys(tree).length, 3);
  assert.ok(tree['src/index.js']);
  assert.ok(tree['src/utils/helper.js']);
  assert.ok(tree['README.md']);
  rmTempDir(dir);
});

test('collectTree: ignores default patterns', () => {
  const dir = makeTempDir();
  writeFile(dir, 'a.js', 'a');
  writeFile(dir, 'node_modules/pkg/index.js', 'pkg');
  writeFile(dir, '.git/config', 'config');
  const tree = collectTree(dir);
  assert.strictEqual(Object.keys(tree).length, 1);
  assert.ok(tree['a.js']);
  rmTempDir(dir);
});

test('collectTree: custom ignore patterns', () => {
  const dir = makeTempDir();
  writeFile(dir, 'a.js', 'a');
  writeFile(dir, 'b.js', 'b');
  writeFile(dir, 'c.js', 'c');
  const tree = collectTree(dir, { ignore: ['b.js'] });
  assert.strictEqual(Object.keys(tree).length, 2);
  assert.ok(tree['a.js']);
  assert.ok(tree['c.js']);
  rmTempDir(dir);
});

test('collectTree: file metadata', () => {
  const dir = makeTempDir();
  writeFile(dir, 'test.js', 'hello world');
  const tree = collectTree(dir);
  assert.strictEqual(tree['test.js'].type, 'file');
  assert.strictEqual(tree['test.js'].size, 11);
  assert.ok(tree['test.js'].hash);
  assert.ok(tree['test.js'].mtime > 0);
  rmTempDir(dir);
});

test('collectTree: glob ignore patterns', () => {
  const dir = makeTempDir();
  writeFile(dir, 'app.js', 'a');
  writeFile(dir, 'app.test.js', 't');
  writeFile(dir, 'app.spec.js', 's');
  const tree = collectTree(dir, { ignore: ['*.test.js', '*.spec.js'] });
  assert.strictEqual(Object.keys(tree).length, 1);
  assert.ok(tree['app.js']);
  rmTempDir(dir);
});

// ── diffTrees tests ──────────────────────────────────────────────────
test('diffTrees: identical trees → all unchanged', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'same');
  writeFile(dir2, 'a.js', 'same');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.unchanged, 1);
  assert.strictEqual(diff.summary.added, 0);
  assert.strictEqual(diff.summary.removed, 0);
  assert.strictEqual(diff.summary.modified, 0);

  rmTempDir(dir1);
  rmTempDir(dir2);
});

test('diffTrees: added files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'a');
  writeFile(dir2, 'a.js', 'a');
  writeFile(dir2, 'b.js', 'b');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.added, 1);
  assert.strictEqual(diff.added[0].path, 'b.js');
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: removed files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'a');
  writeFile(dir1, 'b.js', 'b');
  writeFile(dir2, 'a.js', 'a');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.removed, 1);
  assert.strictEqual(diff.removed[0].path, 'b.js');
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: modified files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'original');
  writeFile(dir2, 'a.js', 'modified');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.modified, 1);
  assert.strictEqual(diff.modified[0].path, 'a.js');
  assert.notStrictEqual(diff.modified[0].oldHash, diff.modified[0].newHash);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: size delta in modified', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'f.txt', 'short');
  writeFile(dir2, 'f.txt', 'much longer content here');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.modified, 1);
  assert.ok(diff.modified[0].sizeDelta > 0);
  assert.strictEqual(diff.modified[0].oldSize, 5);
  assert.strictEqual(diff.modified[0].newSize, 24);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: negative size delta', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'f.txt', 'much longer content here');
  writeFile(dir2, 'f.txt', 'short');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.modified[0].sizeDelta, -19);
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Move detection tests ─────────────────────────────────────────────
test('diffTrees: detect moved file (same content, different path)', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'old.js', 'same content here');
  writeFile(dir2, 'new.js', 'same content here');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.moved, 1);
  assert.strictEqual(diff.moved[0].from, 'old.js');
  assert.strictEqual(diff.moved[0].to, 'new.js');
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: move detection disabled', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'old.js', 'same content');
  writeFile(dir2, 'new.js', 'same content');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2, { detectMoves: false });

  assert.strictEqual(diff.summary.moved, 0);
  assert.strictEqual(diff.summary.added, 1);
  assert.strictEqual(diff.summary.removed, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: moved file with size info', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'src/a.js', 'hello world');
  writeFile(dir2, 'lib/a.js', 'hello world');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.moved, 1);
  assert.strictEqual(diff.moved[0].from, 'src/a.js');
  assert.strictEqual(diff.moved[0].to, 'lib/a.js');
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── compare (end-to-end) tests ───────────────────────────────────────
test('compare: end-to-end identical', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'x');
  writeFile(dir2, 'a.js', 'x');

  const diff = compare(dir1, dir2);

  assert.strictEqual(diff.summary.added, 0);
  assert.strictEqual(diff.summary.removed, 0);
  assert.strictEqual(diff.summary.modified, 0);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('compare: end-to-end complex', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  // Same file
  writeFile(dir1, 'same.js', 'identical');
  writeFile(dir2, 'same.js', 'identical');

  // Modified file
  writeFile(dir1, 'changed.js', 'v1');
  writeFile(dir2, 'changed.js', 'v2');

  // Removed file
  writeFile(dir1, 'gone.js', 'removed');

  // Added file
  writeFile(dir2, 'new.js', 'added');

  // Moved file
  writeFile(dir1, 'moved.js', 'moved content');
  writeFile(dir2, 'relocated.js', 'moved content');

  const diff = compare(dir1, dir2);

  assert.strictEqual(diff.summary.unchanged, 1);
  assert.strictEqual(diff.summary.modified, 1);
  assert.strictEqual(diff.summary.removed, 1);
  assert.strictEqual(diff.summary.added, 1);
  assert.strictEqual(diff.summary.moved, 1);

  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Extension filter tests ───────────────────────────────────────────
test('compare: filter by extension', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'a.js', 'js1');
  writeFile(dir2, 'a.js', 'js2');
  writeFile(dir1, 'b.css', 'css1');
  writeFile(dir2, 'b.css', 'css2');

  const diff = compare(dir1, dir2, { ext: '.js' });

  assert.strictEqual(diff.summary.modified, 1);
  assert.strictEqual(diff.summary.unchanged, 0);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('compare: filter by multiple extensions', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'a.js', 'old');
  writeFile(dir2, 'a.js', 'new');
  writeFile(dir1, 'b.css', 'old');
  writeFile(dir2, 'b.css', 'new');
  writeFile(dir1, 'c.md', 'old');
  writeFile(dir2, 'c.md', 'new');

  const diff = compare(dir1, dir2, { ext: ['.js', '.css'] });

  assert.strictEqual(diff.summary.modified, 2);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('compare: extension with and without dot', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'x.js', 'a');
  writeFile(dir2, 'x.js', 'b');

  const diff1 = compare(dir1, dir2, { ext: 'js' });
  const diff2 = compare(dir1, dir2, { ext: '.js' });

  assert.strictEqual(diff1.summary.modified, 1);
  assert.strictEqual(diff2.summary.modified, 1);

  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Pattern filter tests ─────────────────────────────────────────────
test('compare: pattern filter', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'src/a.js', 'x');
  writeFile(dir2, 'src/a.js', 'y');
  writeFile(dir1, 'test/b.js', 'x');
  writeFile(dir2, 'test/b.js', 'y');

  const diff = compare(dir1, dir2, { pattern: 'src/*' });

  assert.strictEqual(diff.summary.modified, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── filterResults tests ──────────────────────────────────────────────
test('filterResults: custom filter', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'a.js', 'x');
  writeFile(dir2, 'a.js', 'y');
  writeFile(dir1, 'b.js', 'x');
  writeFile(dir2, 'b.js', 'y');

  const tree1 = collectTree(dir1);
  const tree2 = collectTree(dir2);
  const raw = diffTrees(tree1, tree2);
  const filtered = filterResults(raw, (item) => {
    const p = item.path || item.to || '';
    return p === 'a.js';
  });

  assert.strictEqual(filtered.summary.modified, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Summary accuracy tests ───────────────────────────────────────────
test('summary: totalLeft and totalRight counts', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'a.js', 'x');
  writeFile(dir1, 'b.js', 'x');
  writeFile(dir1, 'c.js', 'x');
  writeFile(dir2, 'a.js', 'x');
  writeFile(dir2, 'b.js', 'x');

  const diff = compare(dir1, dir2);

  assert.strictEqual(diff.summary.totalLeft, 3);
  assert.strictEqual(diff.summary.totalRight, 2);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('summary: all categories add up', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();

  writeFile(dir1, 'keep.js', 'same');
  writeFile(dir2, 'keep.js', 'same');
  writeFile(dir1, 'remove.js', 'gone');
  writeFile(dir2, 'add.js', 'new');
  writeFile(dir1, 'mod.js', 'old');
  writeFile(dir2, 'mod.js', 'new');

  const diff = compare(dir1, dir2);
  const total = diff.summary.added + diff.summary.removed + diff.summary.modified + diff.summary.moved + diff.summary.unchanged;

  // totalLeft counts keep.js, remove.js, mod.js = 3
  // totalRight counts keep.js, add.js, mod.js = 3
  // unchanged (keep.js) + modified (mod.js) = 2 files in both
  // removed (remove.js) = 1
  // added (add.js) = 1
  assert.strictEqual(diff.summary.added, 1);
  assert.strictEqual(diff.summary.removed, 1);
  assert.strictEqual(diff.summary.modified, 1);
  assert.strictEqual(diff.summary.unchanged, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Edge cases ───────────────────────────────────────────────────────
test('diffTrees: both empty trees', () => {
  const diff = diffTrees({}, {});
  assert.strictEqual(diff.summary.added, 0);
  assert.strictEqual(diff.summary.removed, 0);
  assert.strictEqual(diff.summary.modified, 0);
  assert.strictEqual(diff.summary.unchanged, 0);
});

test('diffTrees: left empty, right has files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir2, 'a.js', 'a');
  writeFile(dir2, 'b.js', 'b');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.added, 2);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('diffTrees: right empty, left has files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a.js', 'a');

  const t1 = collectTree(dir1);
  const t2 = collectTree(dir2);
  const diff = diffTrees(t1, t2);

  assert.strictEqual(diff.summary.removed, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('DEFAULT_IGNORE contains common patterns', () => {
  assert.ok(DEFAULT_IGNORE.includes('node_modules'));
  assert.ok(DEFAULT_IGNORE.includes('.git'));
  assert.ok(DEFAULT_IGNORE.includes('.DS_Store'));
});

test('compare: deeply nested files', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a/b/c/d/e/f.js', 'deep');
  writeFile(dir2, 'a/b/c/d/e/f.js', 'deep');

  const diff = compare(dir1, dir2);
  assert.strictEqual(diff.summary.unchanged, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

test('compare: same content different name not counted as modified', () => {
  const dir1 = makeTempDir();
  const dir2 = makeTempDir();
  writeFile(dir1, 'a/x.js', 'same');
  writeFile(dir2, 'b/x.js', 'same');

  const diff = compare(dir1, dir2);
  // a/x.js removed, b/x.js added, but also detected as moved
  assert.strictEqual(diff.summary.moved, 1);
  rmTempDir(dir1); rmTempDir(dir2);
});

// ── Run ──────────────────────────────────────────────────────────────
console.log('Running tree-diff tests...\n');

setTimeout(() => {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}, 500);
