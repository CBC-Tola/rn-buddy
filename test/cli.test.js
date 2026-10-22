import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('fails with a clear message outside a project', () => {
  const { status, stderr } = rnBuddy('explain', '--offline', '--dir', '/');
  assert.equal(status, 1);
  assert.match(stderr, /No package\.json found/);
});
