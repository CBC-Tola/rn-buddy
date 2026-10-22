import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkLockfiles, checkTools, gemfileRuby } from '../src/lib/env.js';
import { readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

const TOOLS = { node: '22.12.0', java: '17.0.10', javaHome: '/jdk', ruby: '3.3.0' };

function tools(files, installed = {}, platform = 'darwin') {
  const rows = checkTools(readProject(makeProject(files)), { ...TOOLS, ...installed }, platform);
  return Object.fromEntries(rows.map((row) => [row.name, row]));
}

function lockfiles(files, platform = 'darwin') {
  const rows = checkLockfiles(readProject(makeProject({ 'package.json': {}, ...files })), platform);
  return Object.fromEntries(rows.map((row) => [row.name, row]));
}

test('turns the Gemfile ruby line into a semver range', () => {
  assert.equal(gemfileRuby(makeProject({ Gemfile: 'ruby ">= 2.6.10"\ngem "cocoapods"' })), '>=2.6.10');
  assert.equal(gemfileRuby(makeProject({ Gemfile: "ruby '~> 3.2'" })), '^3.2');
  assert.equal(gemfileRuby(makeProject({ Gemfile: 'ruby "~> 3.2.1"' })), '~3.2.1');
  assert.equal(gemfileRuby(makeProject({ Gemfile: 'ruby ">= 3.0", "< 4"' })), '>=3.0 <4');
  assert.equal(gemfileRuby(makeProject({ Gemfile: 'gem "cocoapods"' })), null);
});

test('Node: engines mismatch fails, .nvmrc mismatch only warns', () => {
  assert.equal(tools({ 'package.json': { engines: { node: '>=22.11.0' } } }).Node.status, 'ok');

  const engines = tools({ 'package.json': { engines: { node: '>=24' } } }).Node;
  assert.equal(engines.status, 'fail');
  assert.match(engines.hint, /nvm install 24/);

  const nvmrc = tools({ 'package.json': {}, '.nvmrc': '20\n' }).Node;
  assert.equal(nvmrc.status, 'warn');
  assert.match(nvmrc.message, /\.nvmrc wants 20/);
});

test('Node: also checks the engines of the installed react-native', () => {
  const row = tools({
    'package.json': {},
    'node_modules/react-native/package.json': { engines: { node: '>=24' } },
  }).Node;
  assert.equal(row.status, 'fail');
  assert.match(row.message, /react-native wants >=24/);
});

test('Java: only checked when there is an android folder', () => {
  assert.equal(tools({ 'package.json': {} }).Java, undefined);
  assert.equal(tools({ 'package.json': {}, 'android/': '' }).Java.status, 'ok');
});

test('Java: compares the major version with .java-version or JDK 17', () => {
  const files = { 'package.json': {}, 'android/': '' };
  assert.equal(tools(files, { java: '11.0.2' }).Java.status, 'fail');
  assert.equal(tools(files, { java: '1.8.0' }).Java.status, 'fail');
  assert.equal(tools(files, { java: null }).Java.status, 'fail');

  const newer = tools({ ...files, '.java-version': '17' }, { java: '21.0.1' }).Java;
  assert.equal(newer.status, 'warn');
  assert.match(newer.message, /\.java-version wants 17, JAVA_HOME is newer/);

  assert.equal(tools({ ...files, '.java-version': '21' }, { java: '21.0.1' }).Java.status, 'ok');
});

test('Ruby: checks the Gemfile on macOS and skips elsewhere', () => {
  const files = { 'package.json': {}, Gemfile: 'ruby ">= 3.4"' };
  assert.equal(tools(files).Ruby.status, 'fail');
  assert.equal(tools(files, { ruby: '3.4.1' }).Ruby.status, 'ok');
  assert.equal(tools(files, {}, 'linux').Ruby.status, 'skip');
  assert.equal(tools({ 'package.json': {} }).Ruby, undefined);
});

test('lockfiles: warns when there is none, fails when there are two', () => {
  assert.equal(lockfiles({})['JS lockfile'].status, 'warn');
  assert.equal(lockfiles({ 'yarn.lock': '', 'package-lock.json': {} })['package-lock.json, yarn.lock'].status, 'fail');
});

test('lockfiles: warns when package-lock.json is out of date', () => {
  const lock = (dependencies) => ({ lockfileVersion: 3, packages: { '': { dependencies } } });
  const pkg = { dependencies: { react: '19.0.0' } };

  const synced = lockfiles({ 'package.json': pkg, 'package-lock.json': lock({ react: '19.0.0' }) });
  assert.equal(synced['package-lock.json'].status, 'ok');

  const stale = lockfiles({ 'package.json': pkg, 'package-lock.json': lock({ react: '18.0.0' }) });
  assert.equal(stale['package-lock.json'].status, 'warn');
  assert.match(stale['package-lock.json'].hint, /npm install/);
});

test('lockfiles: warns when packageManager does not match the lockfile', () => {
  const rows = lockfiles({ 'package.json': { packageManager: 'yarn@4.5.0' }, 'package-lock.json': {} });
  assert.equal(rows['package-lock.json'].status, 'warn');
  assert.match(rows['package-lock.json'].message, /says yarn/);
});

test('lockfiles: checks Gemfile.lock, node_modules and pods', () => {
  const missing = lockfiles({ Gemfile: '', 'ios/Podfile': '' });
  assert.equal(missing['Gemfile.lock'].status, 'warn');
  assert.equal(missing.node_modules.status, 'warn');
  assert.equal(missing['ios/Podfile.lock'].status, 'warn');

  const pods = { 'ios/Podfile': '', 'ios/Podfile.lock': 'PODS: a' };
  assert.equal(lockfiles({ ...pods, 'ios/Pods/Manifest.lock': 'PODS: a' })['ios/Podfile.lock'].status, 'ok');
  assert.equal(lockfiles({ ...pods, 'ios/Pods/Manifest.lock': 'PODS: b' })['ios/Podfile.lock'].status, 'warn');
  assert.equal(lockfiles(pods, 'linux')['ios/Podfile.lock'].status, 'skip');
});
