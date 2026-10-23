import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyClean,
  derivedDataDirs,
  hasWork,
  isSafeToDelete,
  nextSteps,
  parseChoice,
  planClean,
  targetsFromOptions,
  totalSize,
} from '../src/lib/clean.js';
import { readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

const PODFILE = `require_relative '../node_modules/react-native/scripts/react_native_pods'

platform :ios, min_ios_version_supported
prepare_react_native_project!

target 'DemoApp' do
  config = use_native_modules!
  use_react_native!(:path => config[:reactNativePath])
end
`;

const BARE = {
  'package.json': { name: 'DemoApp', dependencies: { react: '19.1.0', 'react-native': '0.88.0' } },
  'package-lock.json': '{}',
  Gemfile: "source 'https://rubygems.org'\ngem 'cocoapods', '>= 1.13'\n",
  'node_modules/react-native/package.json': { version: '0.88.0' },
  'node_modules/.cache/babel-loader/a.json': '{}',
  'node_modules/.cache/rn-buddy/native.json': '{}',
  'android/app/build.gradle': 'android {\n    namespace "com.demoapp"\n}\n',
  'android/app/build/outputs/apk/debug/app-debug.apk': 'x'.repeat(2048),
  'android/.gradle/8.14/checksums/checksums.lock': '',
  'android/build/generated/autolinking/autolinking.json': '{}',
  'ios/Podfile': PODFILE,
  'ios/Podfile.lock': 'PODS:\n  - React-Core (0.88.0)\n',
  'ios/Pods/Manifest.lock': 'PODS:\n  - React-Core (0.88.0)\n',
  'ios/DemoApp.xcworkspace/contents.xcworkspacedata': '',
  'ios/DemoApp.xcodeproj/project.pbxproj': '',
  'ios/build/Build/Products/Debug-iphonesimulator/DemoApp.app/DemoApp': 'bin',
};

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'rn-buddy-clean-'));

// A fake home with Xcode DerivedData for this app, for another project with the same
// app name, and for other apps. Xcode's info.plist in each folder names its workspace.
function fakeHome(root = '/somewhere/DemoApp') {
  const home = tmp();
  const derived = path.join(home, 'Library/Developer/Xcode/DerivedData');
  const folder = (name, workspace) => {
    mkdirSync(path.join(derived, name, 'Build'), { recursive: true });
    writeFileSync(
      path.join(derived, name, 'info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>WorkspacePath</key>\n\t<string>${workspace}</string>\n</dict>\n</plist>\n`,
    );
  };
  folder('DemoApp-bcdefghijklmnopqrstuvwxyzabc', path.join(root, 'ios/DemoApp.xcworkspace'));
  folder('DemoApp-cdefghijklmnopqrstuvwxyzabcd', '/another/project/DemoApp/ios/DemoApp.xcworkspace');
  folder('OtherApp-abcdefghijklmnopqrstuvwxyzab', '/another/project/OtherApp/ios/OtherApp.xcworkspace');
  folder('DemoAppTwo-abcdefghijklmnopqrstuvwxyzab', path.join(root, 'ios/DemoAppTwo.xcworkspace'));
  return home;
}

// A fake temp folder with Metro caches and something else that must stay.
function fakeTmp() {
  const dir = tmp();
  mkdirSync(path.join(dir, 'metro-cache/ab'), { recursive: true });
  writeFileSync(path.join(dir, 'metro-cache/ab/cd'), 'cached');
  mkdirSync(path.join(dir, 'haste-map-abc'));
  mkdirSync(path.join(dir, 'some-other-app'));
  return dir;
}

const options = (extra = {}) => ({ platform: 'darwin', home: fakeHome(), tmpdir: fakeTmp(), hasWatchman: true, ...extra });
const paths = (plan, target) => plan.deletions.filter((d) => d.target === target && d.exists).map((d) => d.display);

function fakeRun(failing = []) {
  const calls = [];
  const run = (command, args, cwd) => {
    calls.push([command, ...args].join(' '));
    return !failing.includes([command, ...args].join(' '));
  };
  return { run, calls };
}

test('targetsFromOptions keeps the light-to-heavy order; --all is everything', () => {
  assert.deepEqual(targetsFromOptions({ deps: true, metro: true }), ['metro', 'deps']);
  assert.deepEqual(targetsFromOptions({ all: true }), ['metro', 'watchman', 'android', 'ios', 'pods', 'deps']);
  assert.deepEqual(targetsFromOptions({ dryRun: true }), []);
});

test('parseChoice accepts "1,3", "1 3" and "a"', () => {
  assert.deepEqual(parseChoice('1,3'), ['metro', 'android']);
  assert.deepEqual(parseChoice(' 3 1 '), ['metro', 'android']);
  assert.deepEqual(parseChoice('6, 5'), ['pods', 'deps']);
  assert.equal(parseChoice('a').length, 6);
  assert.deepEqual(parseChoice(''), []);
  assert.throws(() => parseChoice('7'), /"7" is not on the list/);
  assert.throws(() => parseChoice('x'), /Choose numbers from 1 to 6/);
});

test('android: the build folders, sized, missing ones listed as nothing to clean', () => {
  const root = makeProject(BARE);
  const plan = planClean(readProject(root), ['android'], options());
  assert.deepEqual(paths(plan, 'android'), ['android/build', 'android/app/build', 'android/.gradle']);
  assert.deepEqual(
    plan.deletions.filter((d) => !d.exists).map((d) => d.display),
    ['android/.cxx', 'android/app/.cxx'],
  );
  assert.ok(totalSize(plan) >= 2048);
  assert.deepEqual(plan.commands, []);
});

test("ios: ios/build and only this project's DerivedData, not another project with the same name", () => {
  const root = makeProject(BARE);
  const home = fakeHome(root);
  assert.equal(derivedDataDirs(root, home).length, 1);
  const plan = planClean(readProject(root), ['ios'], options({ home }));
  assert.deepEqual(paths(plan, 'ios'), [
    'ios/build',
    path.join('~', 'Library/Developer/Xcode/DerivedData/DemoApp-bcdefghijklmnopqrstuvwxyzabc'),
  ]);
});

test('ios on Linux: no DerivedData, with a note; pods skipped', () => {
  const root = makeProject(BARE);
  const plan = planClean(readProject(root), ['ios', 'pods'], options({ platform: 'linux' }));
  assert.deepEqual(paths(plan, 'ios'), ['ios/build']);
  assert.deepEqual(paths(plan, 'pods'), []);
  assert.deepEqual(plan.commands, []);
  assert.ok(plan.notes.some((note) => /DerivedData only exists on macOS/.test(note)));
  assert.ok(plan.notes.some((note) => /CocoaPods only runs on macOS/.test(note)));
});

test('metro: temp caches and node_modules/.cache, keeping rn-buddy and other temp folders', () => {
  const root = makeProject(BARE);
  const tmpdir = fakeTmp();
  const plan = planClean(readProject(root), ['metro'], options({ tmpdir }));
  const deleted = plan.deletions.map((d) => d.path);
  assert.ok(deleted.includes(path.join(tmpdir, 'metro-cache')));
  assert.ok(deleted.includes(path.join(tmpdir, 'haste-map-abc')));
  assert.ok(deleted.includes(path.join(root, 'node_modules/.cache/babel-loader')));
  assert.ok(!deleted.some((file) => ['rn-buddy', 'some-other-app'].includes(path.basename(file))));
  assert.ok(plan.deletions.find((d) => d.path.endsWith('metro-cache')).display.startsWith('$TMPDIR/'));
});

test('pods: delete ios/Pods, keep Podfile.lock, then bundle exec pod install', () => {
  const root = makeProject(BARE);
  const plan = planClean(readProject(root), ['pods'], options());
  assert.deepEqual(paths(plan, 'pods'), ['ios/Pods']);
  assert.deepEqual(
    plan.commands.map((c) => [c.command, ...c.args].join(' ')),
    ['bundle exec pod install'],
  );
});

test('deps: delete node_modules, keep the lockfile, reinstall with the project package manager', () => {
  const { 'package-lock.json': _npm, ...files } = BARE;
  const root = makeProject({ ...files, 'yarn.lock': '' });
  const plan = planClean(readProject(root), ['deps', 'pods'], options());
  assert.deepEqual(paths(plan, 'deps'), ['node_modules']);
  // node_modules first, then pods: the Podfile reads node_modules
  assert.deepEqual(
    plan.commands.map((c) => [c.command, ...c.args].join(' ')),
    ['yarn install', 'bundle exec pod install'],
  );
});

test('--lockfiles also deletes the lockfiles, with a warning', () => {
  const root = makeProject(BARE);
  const plan = planClean(readProject(root), ['pods', 'deps'], options({ lockfiles: true }));
  const lockfiles = plan.deletions.filter((d) => d.lockfile);
  assert.deepEqual(lockfiles.map((d) => d.display), ['ios/Podfile.lock', 'package-lock.json']);
  assert.ok(lockfiles.every((d) => /pins/.test(d.warning)));

  const metroOnly = planClean(readProject(root), ['metro'], options({ lockfiles: true }));
  assert.ok(metroOnly.notes.some((note) => /--lockfiles only applies/.test(note)));
});

test('watchman: watch-del then watch-project, or a note when not installed', () => {
  const root = makeProject(BARE);
  const plan = planClean(readProject(root), ['watchman'], options());
  assert.deepEqual(
    plan.commands.map((c) => [c.command, ...c.args].join(' ')),
    [`watchman watch-del ${root}`, `watchman watch-project ${root}`],
  );
  const missing = planClean(readProject(root), ['watchman'], options({ hasWatchman: false }));
  assert.equal(hasWork(missing), false);
  assert.match(missing.notes[0], /Watchman is not installed/);
});

test('Expo without native folders: nothing to clean for android, deps still reinstall', () => {
  const root = makeProject({ 'package.json': { dependencies: { expo: '~54.0.0' } }, 'node_modules/expo/package.json': {} });
  const plan = planClean(readProject(root), ['android', 'deps'], options());
  assert.match(plan.notes[0], /No android\/ folder.*npx expo prebuild/);
  assert.deepEqual(plan.commands.map((c) => c.command), ['npm']);
  assert.deepEqual(nextSteps(readProject(root), ['android', 'deps'], 'darwin'), [
    'Start the app again with a clean cache: npx expo start -c',
  ]);
});

test('isSafeToDelete refuses anything outside the project, Metro caches and DerivedData', () => {
  const root = makeProject(BARE);
  assert.equal(isSafeToDelete(root, { path: path.join(root, 'android/build'), kind: 'project' }), true);
  assert.equal(isSafeToDelete(root, { path: root, kind: 'project' }), false);
  assert.equal(isSafeToDelete(root, { path: path.join(root, '../elsewhere'), kind: 'project' }), false);
  assert.equal(isSafeToDelete(root, { path: '/tmp/metro-cache', kind: 'metro' }), true);
  assert.equal(isSafeToDelete(root, { path: '/tmp/important', kind: 'metro' }), false);
  assert.equal(
    isSafeToDelete(root, { path: '/Users/me/Library/Developer/Xcode/DerivedData/DemoApp-abc', kind: 'derivedData' }),
    true,
  );
  assert.equal(isSafeToDelete(root, { path: '/Users/me/Documents', kind: 'derivedData' }), false);
});

test('applyClean deletes, then runs the reinstalls in order', () => {
  const root = makeProject(BARE);
  const project = readProject(root);
  const plan = planClean(project, ['android', 'pods', 'deps'], options());
  const { run, calls } = fakeRun();
  const result = applyClean(project, plan, { run });

  assert.ok(!existsSync(path.join(root, 'android/app/build')));
  assert.ok(!existsSync(path.join(root, 'ios/Pods')));
  assert.ok(!existsSync(path.join(root, 'node_modules')));
  assert.ok(existsSync(path.join(root, 'ios/Podfile.lock')), 'Podfile.lock is kept');
  assert.ok(existsSync(path.join(root, 'package-lock.json')), 'the lockfile is kept');
  assert.ok(existsSync(path.join(root, 'android/app/build.gradle')));
  assert.equal(result.failed.length, 0);
  assert.deepEqual(calls, ['npm install', 'bundle check', 'bundle exec pod install']);
  assert.ok(result.steps.every((step) => step.ok));
});

test('applyClean stops after a failed install, and refuses unsafe paths', () => {
  const root = makeProject(BARE);
  const project = readProject(root);
  const plan = planClean(project, ['pods', 'deps'], options());
  plan.deletions.push({ target: 'deps', path: os.homedir(), display: '~', exists: true, size: 0, kind: 'project' });
  const removed = [];
  const { run, calls } = fakeRun(['npm install']);
  const result = applyClean(project, plan, { run, remove: (file) => removed.push(file) });

  assert.ok(!removed.includes(os.homedir()));
  assert.equal(result.failed[0].error, 'outside the project, refused');
  assert.deepEqual(calls, ['npm install']);
  assert.deepEqual(result.steps.map((step) => step.ok), [false, null]);
});

test('nextSteps: rebuild what was cleaned, and restart Metro', () => {
  const project = readProject(makeProject(BARE));
  assert.deepEqual(nextSteps(project, ['android'], 'darwin'), [
    'Rebuild the app: npm run android. The first build after a clean takes longer.',
  ]);
  assert.deepEqual(nextSteps(project, ['metro'], 'darwin'), ['Start Metro with a clean cache: npx react-native start --reset-cache']);
  assert.match(nextSteps(project, ['deps'], 'darwin')[0], /npm run android \/ npm run ios/);
  assert.match(nextSteps(project, ['deps'], 'linux')[0], /Rebuild the app: npm run android\. /);

  const expo = readProject(makeProject({ 'package.json': { dependencies: { expo: '~54.0.0' } }, 'android/': '' }));
  assert.match(nextSteps(expo, ['android', 'metro'], 'darwin').join('\n'), /npx expo run:android[\s\S]*npx expo start -c/);
});

function rnBuddy(...args) {
  const dir = tmp();
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    input: '',
    env: { ...process.env, NO_COLOR: '1', TMPDIR: dir, HOME: dir },
  });
}

test('rn-buddy clean --android --dry-run shows the plan and deletes nothing', () => {
  const root = makeProject(BARE);
  const { status, stdout } = rnBuddy('clean', '--android', '--dry-run', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /clean android/);
  assert.match(stdout, /Delete +android\/build +\d+ B/);
  assert.match(stdout, /Skip +android\/\.cxx +nothing to clean/);
  assert.match(stdout, /Total +\d/);
  assert.match(stdout, /Dry run: nothing was deleted\./);
  assert.ok(existsSync(path.join(root, 'android/app/build')));
});

test('rn-buddy clean --android --yes deletes and says what to run next', () => {
  const root = makeProject(BARE);
  const { status, stdout } = rnBuddy('clean', '--android', '--yes', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /✔ Deleted android\/build, android\/app\/build, android\/\.gradle/);
  assert.match(stdout, /→ Rebuild the app: npm run android/);
  assert.ok(!existsSync(path.join(root, 'android/app/build')));
  assert.ok(existsSync(path.join(root, 'android/app/build.gradle')));
});

test('rn-buddy clean --deps --lockfiles --dry-run warns about the lockfile', () => {
  const root = makeProject(BARE);
  const { stdout } = rnBuddy('clean', '--deps', '--lockfiles', '--dry-run', '--dir', root);
  assert.match(stdout, /Lockfile +package-lock\.json .*usually a bad idea/);
  assert.match(stdout, /Then +\$ npm install/);
});

test('rn-buddy clean without a flag outside a terminal asks for one', () => {
  const root = makeProject(BARE);
  const { status, stderr } = rnBuddy('clean', '--dir', root);
  assert.equal(status, 1);
  assert.match(stderr, /Choose what to clean: --metro, --watchman, --android/);
});

test('rn-buddy clean with nothing there says so', () => {
  const root = makeProject({ 'package.json': { name: 'Empty' }, 'android/': '' });
  const { status, stdout } = rnBuddy('clean', '--android', '--yes', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Nothing to clean\./);
});
