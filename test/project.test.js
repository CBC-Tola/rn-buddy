import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { findProjectRoot, hasNativeCode, hasNodeModules, readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

test('finds the project root from a nested folder', () => {
  const root = makeProject({ 'package.json': {}, 'src/screens/': '' });
  assert.equal(findProjectRoot(path.join(root, 'src', 'screens')), root);
});

test('lists dependencies and marks devDependencies', () => {
  const root = makeProject({
    'package.json': { dependencies: { react: '19.0.0' }, devDependencies: { jest: '^29.0.0' } },
  });
  const { deps } = readProject(root);
  assert.deepEqual(deps, [
    { name: 'react', version: '19.0.0', dev: false },
    { name: 'jest', version: '^29.0.0', dev: true },
  ]);
});

test('handles a package.json without dependencies', () => {
  const root = makeProject({ 'package.json': { name: 'empty' } });
  assert.deepEqual(readProject(root).deps, []);
});

test('detects native code from a podspec or an android folder', () => {
  const root = makeProject({
    'package.json': {},
    'node_modules/ios-lib/ios-lib.podspec': '',
    'node_modules/@scope/android-lib/android/': '',
    'node_modules/js-lib/index.js': '',
  });
  assert.equal(hasNativeCode(root, 'ios-lib'), true);
  assert.equal(hasNativeCode(root, '@scope/android-lib'), true);
  assert.equal(hasNativeCode(root, 'js-lib'), false);
  assert.equal(hasNativeCode(root, 'not-installed'), null);
});

test('reports whether node_modules exists', () => {
  assert.equal(hasNodeModules(makeProject({ 'package.json': {}, 'node_modules/': '' })), true);
  assert.equal(hasNodeModules(makeProject({ 'package.json': {} })), false);
});
