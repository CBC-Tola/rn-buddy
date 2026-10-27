import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

// --offline keeps the tests fast and independent of the network.
function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

const project = makeProject({
  'package.json': {
    name: 'DemoApp',
    dependencies: { 'react-native': '0.88.0', 'react-native-screens': '^4.0.0', 'mystery-lib': '1.0.0' },
    devDependencies: { jest: '^29.0.0' },
  },
  'App.tsx': '',
  'ios/': '',
  'notes.txt': '',
  'node_modules/react-native-screens/RNScreens.podspec': '',
});

test('explain groups packages, tags them, and explains files', () => {
  const { status, stdout } = rnBuddy('explain', '--offline', '--dir', project);
  assert.equal(status, 0);
  assert.match(stdout, /DemoApp · React Native 0\.88\.0/);
  assert.match(stdout, /Navigation\n {2}react-native-screens +Native screen containers.*\[native\]/);
  assert.match(stdout, /Testing\n {2}jest +Test runner.*\[dev\]/);
  assert.match(stdout, /Other\n {2}mystery-lib +No description found/);
  assert.match(stdout, /ios\/ +Native iOS project/);
  assert.match(stdout, /notes\.txt +—/);
  assert.match(stdout, /pod install/);
});

test('explain <package> shows one package', () => {
  const { status, stdout } = rnBuddy('explain', 'react-native-screens', '--offline', '--dir', project);
  assert.equal(status, 0);
  assert.match(stdout, /react-native-screens {2}\^4\.0\.0 · dependency/);
  assert.match(stdout, /Category +Navigation/);
  assert.match(stdout, /Native code +yes/);
});

test('explain <file> explains a file in the project', () => {
  const { status, stdout } = rnBuddy('explain', 'App.tsx', '--offline', '--dir', project);
  assert.equal(status, 0);
  assert.match(stdout, /App\.tsx {2}file/);
  assert.match(stdout, /What it is +Root component/);
  assert.doesNotMatch(stdout, /npmjs\.com/);

  assert.match(rnBuddy('explain', 'notes.txt', '--offline', '--dir', project).stdout, /What it is +No description found/);
});

test('explain <folder> shows its note and what it contains', () => {
  const { stdout } = rnBuddy('explain', 'ios/', '--offline', '--dir', project);
  assert.match(stdout, /ios\/ {2}folder/);
  assert.match(stdout, /What it is +Native iOS project/);
  assert.match(stdout, /Contains +nothing yet/);
});

test('explain <folder> falls back to the folder README', () => {
  const root = makeProject({
    'package.json': {},
    'src/hooks/README.md': '# hooks/\n\nCustom React hooks.\n',
    'src/hooks/useToggle.ts': '',
  });
  const { stdout } = rnBuddy('explain', 'src/hooks', '--offline', '--dir', root);
  assert.match(stdout, /What it is +Custom React hooks\./);
  assert.match(stdout, /Contains +README\.md, useToggle\.ts/);
});

test('a dependency wins over a folder with the same name', () => {
  const root = makeProject({ 'package.json': { dependencies: { jest: '^29.0.0' } }, 'jest/': '' });
  assert.match(rnBuddy('explain', 'jest', '--offline', '--dir', root).stdout, /jest {2}\^29\.0\.0 · dependency/);
});

test('explain <package> works for packages not in the project', () => {
  const { stdout } = rnBuddy('explain', 'zustand', '--offline', '--dir', project);
  assert.match(stdout, /zustand {2}not in this project/);
  assert.match(stdout, /Category +State/);
});

test('env checks tools and lockfiles', () => {
  const ok = makeProject({ 'package.json': { name: 'EnvApp', engines: { node: '>=1' } }, 'package-lock.json': {} });
  const { status, stdout } = rnBuddy('env', '--dir', ok);
  assert.equal(status, 0);
  assert.match(stdout, /Tools\n {2}✔ Node +\d+\.\d+\.\d+ +matches >=1/);
  assert.match(stdout, /Lockfiles\n {2}✔ package-lock\.json/);
  assert.match(stdout, /⚠ node_modules +not installed/);
});

test('env exits with 1 when something must be fixed', () => {
  const old = makeProject({ 'package.json': { engines: { node: '>=999' } } });
  const { status, stdout } = rnBuddy('env', '--dir', old);
  assert.equal(status, 1);
  assert.match(stdout, /✖ Node .*package\.json engines wants >=999/);
});

test('add without a name lists the recipes', () => {
  const { status, stdout } = rnBuddy('add');
  assert.equal(status, 0);
  assert.match(stdout, /navigation +Move between screens/);
  assert.match(stdout, /state +Share state/);
  assert.match(stdout, /api +Load data/);
});

test('add <recipe> --dry-run shows the plan and changes nothing', () => {
  const root = makeProject({ 'package.json': { dependencies: { 'react-native-safe-area-context': '^5.0.0' } } });
  const { status, stdout } = rnBuddy('add', 'navigation', '--dry-run', '--offline', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Install +@react-navigation\/native\n/);
  assert.match(stdout, /\$ npm install @react-navigation\/native @react-navigation\/native-stack react-native-screens/);
  assert.match(stdout, /Installed +react-native-safe-area-context already installed/);
  assert.match(stdout, /Create +src\/navigation\/index\.js/);
  assert.match(stdout, /Dry run: nothing was changed/);
  assert.equal(existsSync(path.join(root, 'src')), false);
});

test('add asks for --yes when it cannot prompt', () => {
  const root = makeProject({ 'package.json': {} });
  const { status, stderr } = rnBuddy('add', 'state', '--offline', '--dir', root);
  assert.equal(status, 1);
  assert.match(stderr, /Add --yes/);
});

test('add <package> that is already installed has nothing to do', () => {
  const root = makeProject({ 'package.json': { dependencies: { zustand: '^5.0.0' } } });
  const { status, stdout } = rnBuddy('add', 'zustand', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Nothing to do: zustand is already installed/);
  assert.match(stdout, /rn-buddy add state/);
});

test('fails with a clear message outside a project', () => {
  const { status, stderr } = rnBuddy('explain', '--offline', '--dir', '/');
  assert.equal(status, 1);
  assert.match(stderr, /No package\.json found/);
});
