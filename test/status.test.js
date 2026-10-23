import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { diffFingerprint, nativeFingerprint, readFingerprint, saveFingerprint } from '../src/lib/fingerprint.js';
import { readProject } from '../src/lib/project.js';
import { ago, list, shouldSaveFingerprint, statusRows } from '../src/lib/status.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

const HOUR = 60 * 60 * 1000;
const NOW = Date.now();
// Fake times: the project was set up two days ago, the last build was a day ago.
const SETUP = NOW - 48 * HOUR;
const BUILT = NOW - 24 * HOUR;

const PODFILE = `require_relative '../node_modules/react-native/scripts/react_native_pods'

platform :ios, min_ios_version_supported
prepare_react_native_project!

target 'DemoApp' do
  config = use_native_modules!
  use_react_native!(:path => config[:reactNativePath])
end
`;

const PODFILE_LOCK = `PODS:
  - boost (1.84.0)
  - React-Core (0.88.0)
  - RNScreens (4.0.0):
    - React-Core

DEPENDENCIES:
  - React-Core (from \`../node_modules/react-native/\`)
  - RNScreens (from \`../node_modules/react-native-screens\`)

EXTERNAL SOURCES:
  React-Core:
    :path: "../node_modules/react-native/"
  RNScreens:
    :path: "../node_modules/react-native-screens"

PODFILE CHECKSUM: 6b8a3e8f0e1c2b4c9b1d4a2e7f9c0b1a2d3e4f5a

COCOAPODS: 1.15.2
`;

const BUILD_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

android {
    namespace "com.demoapp"
    defaultConfig {
        applicationId "com.demoapp"
        versionCode 1
        versionName "1.0"
    }
}
`;

const BASE = {
  'package.json': {
    name: 'DemoApp',
    dependencies: { react: '19.1.0', 'react-native': '0.88.0', 'react-native-screens': '^4.0.0', dayjs: '^1.11.0' },
  },
  'node_modules/react/package.json': { name: 'react', version: '19.1.0' },
  'node_modules/react-native/package.json': { name: 'react-native', version: '0.88.0' },
  'node_modules/react-native/React-Core.podspec': '',
  'node_modules/react-native/android/': '',
  'node_modules/react-native-screens/package.json': { name: 'react-native-screens', version: '4.0.0' },
  'node_modules/react-native-screens/RNScreens.podspec': '',
  'node_modules/react-native-screens/android/': '',
  'node_modules/dayjs/package.json': { name: 'dayjs', version: '1.11.0' },
  'android/app/build.gradle': BUILD_GRADLE,
  'android/app/src/main/java/com/demoapp/MainActivity.kt': 'package com.demoapp\n',
  'android/app/build/outputs/apk/debug/app-debug.apk': 'apk',
  'ios/Podfile': PODFILE,
  'ios/Podfile.lock': PODFILE_LOCK,
  'ios/Pods/Manifest.lock': PODFILE_LOCK,
  'ios/DemoApp/AppDelegate.swift': 'import UIKit\n',
  'ios/DemoApp.xcworkspace/contents.xcworkspacedata': '<Workspace version = "1.0"></Workspace>\n',
  'ios/build/Build/Products/Debug-iphonesimulator/DemoApp.app/Info.plist': '',
};

// A project where every file is from the setup, and the builds from a day ago.
function setup(files = {}, { builds = true } = {}) {
  const all = { ...BASE, ...files };
  if (!builds) {
    delete all['android/app/build/outputs/apk/debug/app-debug.apk'];
    delete all['ios/build/Build/Products/Debug-iphonesimulator/DemoApp.app/Info.plist'];
  }
  const root = makeProject(all);
  touchAll(root, SETUP);
  if (builds) {
    touch(root, 'android/app/build/outputs/apk/debug/app-debug.apk', BUILT);
    touch(root, 'ios/build/Build/Products/Debug-iphonesimulator/DemoApp.app', BUILT);
    touch(root, 'ios/Podfile.lock', BUILT - HOUR);
  }
  return root;
}

function touch(root, file, time) {
  const date = new Date(time);
  utimesSync(path.join(root, file), date, date);
}

// Every file and folder under `dir`, deepest first.
function touchAll(dir, time) {
  const date = new Date(time);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) touchAll(full, time);
    else utimesSync(full, date, date);
  }
  utimesSync(dir, date, date);
}

// Installs a fake native package at `time`.
function install(root, name, version, time, { podspec } = {}) {
  const dir = path.join(root, 'node_modules', name);
  mkdirSync(path.join(dir, 'android'), { recursive: true });
  const files = { [`node_modules/${name}/package.json`]: { name, version } };
  if (podspec) files[`node_modules/${name}/${podspec}.podspec`] = '';
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeJson(path.join(root, file), content);
  }
  touchAll(dir, time);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.dependencies[name] = `^${version}`;
  writeJson(path.join(root, 'package.json'), pkg);
}

function writeJson(file, content) {
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

const emptyTmp = () => mkdtempSync(path.join(os.tmpdir(), 'rn-buddy-tmp-'));
const options = (extra = {}) => ({ now: NOW, platform: 'darwin', home: emptyTmp(), tmpdir: emptyTmp(), ...extra });
const row = (rows, name) => rows.find((r) => r.name === name);

test('nativeFingerprint lists installed packages with native code, sorted', () => {
  const root = setup();
  assert.deepEqual(nativeFingerprint(root), [
    { name: 'react-native', version: '0.88.0' },
    { name: 'react-native-screens', version: '4.0.0' },
  ]);
});

test('saveFingerprint and readFingerprint round-trip in node_modules/.cache/rn-buddy', () => {
  const root = setup();
  assert.equal(readFingerprint(root), null);
  const saved = saveFingerprint(root, { now: 123 });
  assert.equal(saved.savedAt, 123);
  assert.ok(existsSync(path.join(root, 'node_modules/.cache/rn-buddy/native.json')));
  assert.deepEqual(readFingerprint(root), saved);

  assert.equal(saveFingerprint(makeProject({ 'package.json': {} })), null, 'no node_modules: nothing saved');
});

test('diffFingerprint finds added, removed and changed packages', () => {
  const diff = diffFingerprint(
    [
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '1.0.0' },
    ],
    [
      { name: 'b', version: '2.0.0' },
      { name: 'c', version: '1.0.0' },
    ],
  );
  assert.deepEqual(diff.added, [{ name: 'c', version: '1.0.0' }]);
  assert.deepEqual(diff.removed, [{ name: 'a', version: '1.0.0' }]);
  assert.deepEqual(diff.changed, [{ name: 'b', from: '1.0.0', to: '2.0.0' }]);
});

test('nothing to do: builds and pods are up to date', () => {
  const root = setup();
  const rows = statusRows(readProject(root), options());
  assert.deepEqual(
    rows.map((r) => [r.name, r.status]),
    [
      ['Android build', 'ok'],
      ['iOS build', 'ok'],
      ['iOS pods', 'ok'],
    ],
  );
  assert.match(row(rows, 'Android build').message, /no native changes since the last build \(1 day ago\)/);
});

test('never built: says so instead of guessing', () => {
  const root = setup({}, { builds: false });
  const rows = statusRows(readProject(root), options());
  const android = row(rows, 'Android build');
  assert.equal(android.status, 'skip');
  assert.equal(android.never, true);
  assert.equal(android.message, 'No Android build found yet: the first `npm run android` builds everything');
  assert.match(row(rows, 'iOS build').message, /No iOS build found yet: the first `npm run ios`/);
});

test('a native package installed after the build needs a rebuild and pod install', () => {
  const root = setup();
  install(root, 'react-native-mmkv', '3.0.0', NOW - HOUR, { podspec: 'react-native-mmkv' });
  const rows = statusRows(readProject(root), options());

  const android = row(rows, 'Android build');
  assert.equal(android.status, 'warn');
  assert.match(android.message, /react-native-mmkv was installed or updated after the last build/);
  assert.equal(android.hint, 'npm run android');
  assert.equal(row(rows, 'iOS build').hint, 'npm run ios');

  const pods = row(rows, 'iOS pods');
  assert.equal(pods.status, 'warn');
  assert.match(pods.message, /react-native-mmkv is not in Podfile\.lock yet/);
  assert.equal(pods.hint, '(cd ios && pod install)');
});

test('fingerprint diff: added, updated and removed since the last build', () => {
  const root = setup();
  saveFingerprint(root, { now: BUILT + HOUR }); // saved after the build: it knows the built state
  install(root, 'react-native-mmkv', '3.0.0', NOW - HOUR);
  // react-native-screens updated, with npm's old file times (the folder time is all that changes)
  writeJson(path.join(root, 'node_modules/react-native-screens/package.json'), { name: 'react-native-screens', version: '4.1.0' });
  touch(root, 'node_modules/react-native-screens/package.json', SETUP);

  const android = row(statusRows(readProject(root), options()), 'Android build');
  assert.equal(android.status, 'warn');
  assert.match(android.message, /Rebuild needed: react-native-mmkv was added since the last build \(it has native code\)/);
  assert.match(android.message, /react-native-screens \(4\.0\.0 → 4\.1\.0\) was updated/);
});

test('fingerprint diff: a removed native package needs a rebuild', () => {
  const root = setup();
  install(root, 'react-native-mmkv', '3.0.0', SETUP);
  saveFingerprint(root, { now: BUILT + HOUR });
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  delete pkg.dependencies['react-native-mmkv'];
  writeJson(path.join(root, 'package.json'), pkg);

  const android = row(statusRows(readProject(root), options()), 'Android build');
  assert.match(android.message, /react-native-mmkv was removed/);
});

test('an old fingerprint (saved before the build) is not used', () => {
  const root = setup();
  saveFingerprint(root, { now: SETUP });
  const fingerprint = JSON.parse(readFileSync(path.join(root, 'node_modules/.cache/rn-buddy/native.json'), 'utf8'));
  fingerprint.packages = fingerprint.packages.filter((entry) => entry.name !== 'react-native-screens');
  writeJson(path.join(root, 'node_modules/.cache/rn-buddy/native.json'), fingerprint);

  assert.equal(row(statusRows(readProject(root), options()), 'Android build').status, 'ok');
  assert.equal(shouldSaveFingerprint(readProject(root), options()), true, 'the build is newer: learn it');
});

test('shouldSaveFingerprint waits while a package is newer than the build', () => {
  const root = setup();
  saveFingerprint(root, { now: SETUP });
  install(root, 'react-native-mmkv', '3.0.0', NOW - HOUR);
  assert.equal(shouldSaveFingerprint(readProject(root), options()), false);
});

test('edits in android/ and ios/ after the build need a rebuild', () => {
  const root = setup();
  touch(root, 'android/app/build.gradle', NOW - HOUR);
  touch(root, 'ios/DemoApp/AppDelegate.swift', NOW - HOUR);
  const rows = statusRows(readProject(root), options());
  assert.match(row(rows, 'Android build').message, /android\/app\/build\.gradle changed after the last build/);
  assert.match(row(rows, 'iOS build').message, /ios\/DemoApp\/AppDelegate\.swift changed after the last build/);
});

test('build output and Gradle caches are not edits', () => {
  const root = setup({ 'android/.gradle/8.0/checksums.bin': '', 'android/app/build/intermediates/x.txt': '' });
  touch(root, 'android/.gradle/8.0/checksums.bin', NOW);
  touch(root, 'android/app/build/intermediates/x.txt', NOW);
  assert.equal(row(statusRows(readProject(root), options()), 'Android build').status, 'ok');
});

test('the newest DerivedData build of this app counts for iOS', () => {
  const home = emptyTmp();
  const root = setup({}, { builds: false });
  const app = path.join(home, 'Library/Developer/Xcode/DerivedData/DemoApp-abcdefghijklmnopqrstuvwxyzab/Build/Products/Debug-iphonesimulator/DemoApp.app');
  mkdirSync(app, { recursive: true });
  utimesSync(app, new Date(BUILT), new Date(BUILT));
  writeFileSync(
    path.join(home, 'Library/Developer/Xcode/DerivedData/DemoApp-abcdefghijklmnopqrstuvwxyzab/info.plist'),
    `<plist version="1.0">\n<dict>\n\t<key>WorkspacePath</key>\n\t<string>${path.join(root, 'ios/DemoApp.xcworkspace')}</string>\n</dict>\n</plist>\n`,
  );
  const ios = row(statusRows(readProject(root), options({ home })), 'iOS build');
  assert.equal(ios.status, 'ok');
});

test('pods out of sync: Manifest.lock differs from Podfile.lock', () => {
  const root = setup({ 'ios/Pods/Manifest.lock': PODFILE_LOCK.replace('4.0.0', '3.9.0') });
  const pods = row(statusRows(readProject(root), options()), 'iOS pods');
  assert.equal(pods.status, 'warn');
  assert.match(pods.message, /ios\/Pods does not match Podfile\.lock/);
});

test('pods: no Podfile.lock means pod install never ran; Gemfile means bundle exec', () => {
  const root = setup({ Gemfile: "source 'https://rubygems.org'\ngem 'cocoapods'\n" });
  rmSync(path.join(root, 'ios/Podfile.lock'));
  const pods = row(statusRows(readProject(root), options()), 'iOS pods');
  assert.match(pods.message, /pod install has not run yet/);
  assert.equal(pods.hint, '(cd ios && bundle exec pod install)');
});

test('pods are skipped and iOS is marked Mac-only on Linux', () => {
  const root = setup();
  const rows = statusRows(readProject(root), options({ platform: 'linux' }));
  assert.equal(row(rows, 'iOS pods'), undefined);
  assert.equal(row(rows, 'iOS build').status, 'skip');
});

test('Metro cache: babel.config.js changed after Metro last ran', () => {
  const tmpdir = emptyTmp();
  mkdirSync(path.join(tmpdir, 'metro-cache/ab'), { recursive: true });
  utimesSync(path.join(tmpdir, 'metro-cache/ab'), new Date(BUILT), new Date(BUILT));
  utimesSync(path.join(tmpdir, 'metro-cache'), new Date(BUILT), new Date(BUILT));
  const root = setup({ 'babel.config.js': "module.exports = { presets: ['module:@react-native/babel-preset'] };\n" });
  touch(root, 'babel.config.js', NOW - HOUR);

  const metro = row(statusRows(readProject(root), options({ tmpdir })), 'Metro cache');
  assert.equal(metro.status, 'warn');
  assert.match(metro.message, /babel\.config\.js changed after Metro last cached your code/);
  assert.match(metro.hint, /npx react-native start --reset-cache/);

  touch(root, 'babel.config.js', SETUP);
  assert.equal(row(statusRows(readProject(root), options({ tmpdir })), 'Metro cache').status, 'ok');
});

test('.env changed after the build with react-native-config needs a rebuild', () => {
  const root = setup({ '.env': 'API_URL=https://example.com\n', '.env.example': 'API_URL=\n' });
  install(root, 'react-native-config', '1.5.0', SETUP);
  touch(root, '.env', NOW - HOUR);
  const env = row(statusRows(readProject(root), options()), '.env');
  assert.equal(env.status, 'warn');
  assert.match(env.message, /^\.env changed after the last build/);
  assert.equal(env.hint, 'npm run android / npm run ios');
});

test('package.json lists a package that is not installed', () => {
  const root = setup();
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.dependencies['react-native-svg'] = '^15.0.0';
  writeJson(path.join(root, 'package.json'), pkg);
  const packages = row(statusRows(readProject(root), options()), 'Packages');
  assert.match(packages.message, /react-native-svg is in package.json but not installed/);
});

test('no node_modules: one row asking to install', () => {
  const root = makeProject({ 'package.json': { dependencies: { 'react-native': '0.88.0' } }, 'yarn.lock': '' });
  assert.deepEqual(statusRows(readProject(root), options()), [
    { name: 'Packages', status: 'warn', message: 'node_modules is missing: nothing is installed yet', hint: 'yarn install' },
  ]);
});

const EXPO = {
  'package.json': { name: 'ExpoApp', dependencies: { expo: '~54.0.0', 'react-native': '0.81.0', 'expo-camera': '~17.0.0' } },
  'app.json': { expo: { name: 'ExpoApp', plugins: ['expo-camera'] } },
  'node_modules/expo/package.json': { version: '54.0.0' },
  'node_modules/expo/android/': '',
  'node_modules/react-native/package.json': { version: '0.81.0' },
  'node_modules/react-native/android/': '',
  'node_modules/expo-camera/package.json': { version: '17.0.0' },
  'node_modules/expo-camera/android/': '',
};

test('Expo Go: only JS changes apply, packages outside Expo Go need a development build', () => {
  const root = makeProject(EXPO);
  let rows = statusRows(readProject(root), options());
  assert.deepEqual(rows.map((r) => [r.name, r.status]), [['Expo Go', 'ok']]);
  assert.match(rows[0].message, /Expo Go loads every JS change/);

  install(root, 'react-native-mmkv', '3.0.0', NOW);
  rows = statusRows(readProject(root), options());
  assert.equal(rows[0].status, 'warn');
  assert.match(rows[0].message, /react-native-mmkv has native code that Expo Go doesn't include/);
  assert.match(rows[0].hint, /npx expo run:android/);
  assert.equal(shouldSaveFingerprint(readProject(root), options()), true);
});

test('Expo with a development build: native package and plugin changes need a new build', () => {
  const root = makeProject({
    ...EXPO,
    'package.json': { ...EXPO['package.json'], dependencies: { ...EXPO['package.json'].dependencies, 'expo-dev-client': '~6.0.0' } },
  });
  assert.equal(row(statusRows(readProject(root), options()), 'Dev build').status, 'skip');

  saveFingerprint(root);
  install(root, 'react-native-mmkv', '3.0.0', NOW);
  writeJson(path.join(root, 'app.json'), { expo: { name: 'ExpoApp', plugins: ['expo-camera', 'expo-font'] } });
  const rows = statusRows(readProject(root), options());
  assert.match(row(rows, 'Dev build').message, /react-native-mmkv changed since rn-buddy last checked/);
  assert.match(row(rows, 'Config plugins').message, /plugins in app\.json changed/);
});

test('Expo after prebuild uses npx expo run:android', () => {
  const root = makeProject({ ...EXPO, 'android/app/build.gradle': BUILD_GRADLE });
  assert.equal(
    row(statusRows(readProject(root), options()), 'Android build').message,
    'No Android build found yet: the first `npx expo run:android` builds everything',
  );
});

test('list and ago read naturally', () => {
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b']), 'a and b');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(list(['a', 'b', 'c', 'd', 'e']), 'a, b and 3 more');
  assert.equal(ago(NOW - 5 * 60000, NOW), '5 minutes ago');
  assert.equal(ago(NOW - 3 * HOUR, NOW), '3 hours ago');
  assert.equal(ago(NOW + HOUR, NOW), 'just now');
});

function rnBuddy(...args) {
  const tmp = emptyTmp();
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', TMPDIR: tmp, HOME: tmp },
  });
}

test('rn-buddy status shows what to rebuild, then saves the fingerprint', () => {
  const root = setup();
  install(root, 'react-native-mmkv', '3.0.0', NOW - HOUR, { podspec: 'react-native-mmkv' });
  const { status, stdout } = rnBuddy('status', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /DemoApp · React Native 0\.88\.0/);
  assert.match(stdout, /⚠ Android build +Rebuild needed: react-native-mmkv was installed or updated after the last build/);
  assert.match(stdout, /→ npm run android/);
  assert.match(stdout, /✔ JS changes only otherwise: reload with r in Metro/);
  assert.ok(readFingerprint(root), 'first run saves a fingerprint');
});

test('rn-buddy status with nothing to do', () => {
  const root = setup();
  const { status, stdout } = rnBuddy('status', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /✔ Android build +no native changes since the last build/);
  assert.match(stdout, /✔ JS changes only: reload with r in Metro, no rebuild needed/);
});
