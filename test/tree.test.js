import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildTree, countTree, renderTree } from '../src/lib/tree.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

const project = () =>
  makeProject({
    'package.json': { name: 'DemoApp' },
    'App.tsx': '',
    'index.js': '',
    '.git/HEAD': '',
    '.DS_Store': '',
    'node_modules/react/index.js': '',
    'ios/Podfile': '',
    'ios/Pods/Pods.xcodeproj': '',
    'src/screens/Home.tsx': '',
    'src/screens/README.md': 'One component per screen.\n',
    'src/components/Button.tsx': '',
    'src/components/deep/er/Too.tsx': '',
  });

test('folders come first, then files, each sorted', () => {
  const root = project();
  const lines = renderTree(buildTree(root, { depth: 2 }));
  const top = lines.filter((line) => /^[├└]/.test(line)).map((line) => line.slice(4).split('  ')[0]);
  assert.deepEqual(top, ['ios/', 'node_modules/', 'src/', 'App.tsx', 'index.js', 'package.json']);
});

test('.git and .DS_Store are never shown; node_modules and Pods are listed but not opened', () => {
  const text = renderTree(buildTree(project(), { depth: 5 })).join('\n');
  assert.doesNotMatch(text, /\.git|\.DS_Store/);
  assert.match(text, /node_modules\//);
  assert.doesNotMatch(text, /react\/|index\.js\n.*react/);
  assert.match(text, /Pods\//);
  assert.doesNotMatch(text, /Pods\.xcodeproj/);
});

test('depth limits how far folders open and counts what is inside', () => {
  const root = project();
  const text = renderTree(buildTree(root, { depth: 1 })).join('\n');
  assert.match(text, /src\/ +Your app code +\(2 inside\)/);
  assert.doesNotMatch(text, /screens/);
  const deeper = renderTree(buildTree(root, { depth: 3 })).join('\n');
  assert.match(deeper, /deep\/ +\(1 inside\)/);
  assert.doesNotMatch(deeper, /Too\.tsx/);
  assert.match(renderTree(buildTree(root, { depth: 5 })).join('\n'), /Too\.tsx/);
});

test('notes come from a folder README, then from rn-buddy; only the first sentence', () => {
  const text = renderTree(buildTree(project(), { depth: 3 })).join('\n');
  assert.match(text, /screens\/ +One component per screen\n/);
  assert.match(text, /App\.tsx +Root component\n/);
  assert.doesNotMatch(text, /first screen of your app/);
});

test('folders only leaves out files', () => {
  const tree = buildTree(project(), { depth: 3, folders: true });
  const text = renderTree(tree).join('\n');
  assert.doesNotMatch(text, /App\.tsx|Home\.tsx/);
  assert.match(text, /screens\//);
  assert.equal(countTree(tree).files, 0);
});

test('a long folder is cut off with a count', () => {
  const files = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`assets/img${String(i).padStart(2, '0')}.png`, '']));
  const lines = renderTree(buildTree(makeProject({ 'package.json': {}, ...files }), { depth: 3 }));
  assert.match(lines.join('\n'), /… and 5 more/);
});

test('a symlink to a folder is shown but not followed', () => {
  const root = makeProject({ 'package.json': {}, 'real/a.txt': '' });
  symlinkSync(path.join(root, 'real'), path.join(root, 'link'));
  const text = renderTree(buildTree(root, { depth: 3 })).join('\n');
  assert.match(text, /link\//);
  assert.equal(text.match(/a\.txt/g).length, 1);
});

test('CLI: rn-buddy structure prints the tree and a summary', () => {
  const { status, stdout } = rnBuddy('structure', '--dir', project());
  assert.equal(status, 0);
  assert.match(stdout, /DemoApp/);
  assert.match(stdout, /├── ios\//);
  assert.match(stdout, /│ +└── screens\/ +One component per screen/);
  assert.match(stdout, /└── package\.json/);
  assert.match(stdout, /\d+ folders, \d+ files · 3 levels deep/);
  assert.match(stdout, /--depth 5/);
});

test('CLI: rn-buddy structure src --depth 1 shows one folder', () => {
  const { status, stdout } = rnBuddy('structure', 'src', '--depth', '1', '--dir', project());
  assert.equal(status, 0);
  assert.match(stdout, /^src\/$/m);
  assert.match(stdout, /components\/ +Reusable UI pieces +\(2 inside\)/);
  assert.doesNotMatch(stdout, /App\.tsx|--depth 5/);
});

test('CLI: rn-buddy structure explains bad input', () => {
  const root = project();
  assert.match(rnBuddy('structure', 'nope', '--dir', root).stderr, /There is no nope\/ in this project/);
  assert.match(rnBuddy('structure', 'App.tsx', '--dir', root).stderr, /App\.tsx is a file, not a folder/);
  assert.match(rnBuddy('structure', '../..', '--dir', root).stderr, /outside the project/);
  assert.match(rnBuddy('structure', '--depth', '0', '--dir', root).stderr, /"0" is not a depth/);
});
