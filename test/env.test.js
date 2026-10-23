import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyFixes,
  checkLockfiles,
  checkTools,
  detectToolchain,
  detectTools,
  envJson,
  envReport,
  envSections,
  gemfileRuby,
  planFixes,
  shortenHome,
} from '../src/lib/env.js';
import { readProject } from '../src/lib/project.js';
import {
  gradleSetting,
  localSdkDir,
  parseAvds,
  parseDevices,
  parseRuntimes,
  xcodeMinimum,
} from '../src/lib/toolchain.js';
import { makeProject } from './helpers.js';

const TOOLS = { node: '22.12.0', java: '17.0.10', javaHome: '/jdk', ruby: '3.3.0' };

function tools(files, installed = {}, platform = 'darwin') {
  const rows = checkTools(readProject(makeProject(files)), { ...TOOLS, ...installed }, platform);
  return Object.fromEntries(rows.map((row) => [row.name, row]));
}

function lockfiles(files, platform = 'darwin', installed = {}) {
  const rows = checkLockfiles(readProject(makeProject({ 'package.json': {}, ...files })), platform, installed);
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

test('lockfiles: Gemfile.lock made with Bundler 1.x fails on Ruby 3.2+', () => {
  const files = { Gemfile: '', 'Gemfile.lock': 'GEM\n\nBUNDLED WITH\n   1.17.2\n' };
  const row = lockfiles(files, 'darwin', { ruby: '4.0.7', bundler: '4.0.20' })['Gemfile.lock'];
  assert.equal(row.status, 'fail');
  assert.match(row.hint, /bundle update --bundler=4\.0\.20/);
  assert.equal(lockfiles(files, 'darwin', { ruby: '3.1.0' })['Gemfile.lock'].status, 'ok');
});

test('lockfiles: warns when the Ruby gems are not installed', () => {
  const files = { Gemfile: '', 'Gemfile.lock': 'BUNDLED WITH\n   2.5.0\n' };
  assert.equal(lockfiles(files, 'darwin', { gemsInstalled: false })['Ruby gems'].status, 'warn');
  assert.equal(lockfiles(files, 'darwin', { gemsInstalled: true })['Ruby gems'], undefined);
});

// ---- env v2: toolchain ----

// A fake runner: maps "command args" (command without its folder) to the output.
// A string is a successful run, an object is { status, stdout, stderr }, a missing key is "command not found".
function fakeRun(outputs = {}) {
  const run = (command, args) => {
    const key = [path.basename(command), ...args].join(' ');
    run.calls.push(key);
    const output = outputs[key];
    if (output === undefined || output === null) return null;
    return typeof output === 'string' ? { status: 0, stdout: output, stderr: '' } : { stdout: '', stderr: '', ...output };
  };
  run.calls = [];
  return run;
}

const ROOT_GRADLE = `buildscript {
    ext {
        buildToolsVersion = "36.0.0"
        minSdkVersion = 24
        compileSdkVersion = 36
        targetSdkVersion = 36
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.1.20"
    }
    repositories {
        google()
        mavenCentral()
    }
}
`;

const APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace "com.demoapp"
    defaultConfig {
        applicationId "com.demoapp"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
}
`;

const RN_PACKAGE = { name: 'DemoApp', dependencies: { 'react-native': '0.81.0', react: '19.1.0' } };

const ANDROID = {
  'package.json': RN_PACKAGE,
  'android/build.gradle': ROOT_GRADLE,
  'android/app/build.gradle': APP_GRADLE,
  'android/gradle.properties': 'newArchEnabled=true\nhermesEnabled=true\n',
};

// An Android SDK folder inside the fake project, with the given packages.
function sdkFiles(prefix, { platform = true, buildTools = true, ndk = false, adb = true, emulator = true } = {}) {
  return {
    ...(platform && { [`${prefix}/platforms/android-36/android.jar`]: '' }),
    ...(buildTools && { [`${prefix}/build-tools/36.0.0/aapt2`]: '' }),
    ...(ndk && { [`${prefix}/ndk/27.1.12297006/source.properties`]: '' }),
    ...(adb && { [`${prefix}/platform-tools/adb`]: '' }),
    ...(emulator && { [`${prefix}/emulator/emulator`]: '' }),
  };
}

async function inspect(files, { platform = 'linux', outputs = {}, env, home = '/nowhere', port = 'free', tools = {}, report } = {}) {
  const root = makeProject(files);
  const project = readProject(root);
  const run = fakeRun(outputs);
  const installed = { ...TOOLS, gemsInstalled: null, ...tools };
  const toolchain = await detectToolchain(project, installed, {
    env: env?.(root) ?? {},
    run,
    platform,
    home: typeof home === 'function' ? home(root) : home,
    probe: async () => port,
    report,
  });
  const all = { ...installed, ...toolchain };
  const sections = envSections(project, all, platform);
  const rows = Object.fromEntries(sections.flatMap(([, list]) => list).map((row) => [row.name, row]));
  return { root, project, run, tools: all, sections, rows, titles: sections.map(([title]) => title) };
}

test('detectTools: reads versions through the runner', () => {
  const root = makeProject({ 'package.json': {}, Gemfile: '' });
  const run = fakeRun({
    'java -version': { status: 0, stderr: 'openjdk version "17.0.10" 2024-01-16\nOpenJDK Runtime Environment' },
    'ruby -v': 'ruby 3.3.0 (2023-12-25 revision 5124f9ac75) [arm64-darwin23]',
    'bundle -v': 'Bundler version 2.5.6',
    'bundle check': { status: 1, stdout: 'The following gems are missing' },
  });
  const tools = detectTools(root, { JAVA_HOME: '/jdk' }, run);
  assert.equal(tools.java, '17.0.10');
  assert.equal(tools.javaHome, '/jdk');
  assert.equal(tools.ruby, '3.3.0');
  assert.equal(tools.bundler, '2.5.6');
  assert.equal(tools.gemsInstalled, false);

  assert.equal(detectTools(root, {}, fakeRun()).java, null);
  assert.equal(detectTools(root, {}, fakeRun()).gemsInstalled, null);
});

test('gradleSetting: reads the React Native template, Kotlin DSL and Expo styles', () => {
  const template = makeProject(ANDROID);
  assert.equal(gradleSetting(template, ['compileSdkVersion', 'compileSdk']), '36');
  assert.equal(gradleSetting(template, ['buildToolsVersion']), '36.0.0');
  assert.equal(gradleSetting(template, ['ndkVersion']), '27.1.12297006');

  const kotlin = makeProject({ 'android/app/build.gradle.kts': 'android {\n    compileSdk = 35\n}\n' });
  assert.equal(gradleSetting(kotlin, ['compileSdkVersion', 'compileSdk']), '35');

  const expoGradle = `ext {
    buildToolsVersion = findProperty('android.buildToolsVersion') ?: '35.0.0'
    compileSdkVersion = Integer.parseInt(findProperty('android.compileSdkVersion') ?: '35')
  }`;
  const expo = makeProject({ 'android/build.gradle': expoGradle, 'android/gradle.properties': 'android.compileSdkVersion=36\n' });
  assert.equal(gradleSetting(expo, ['compileSdkVersion']), '36');
  assert.equal(gradleSetting(expo, ['buildToolsVersion']), '35.0.0');
  assert.equal(gradleSetting(expo, ['ndkVersion']), null);
});

test('localSdkDir: unescapes Windows paths', () => {
  const root = makeProject({ 'android/local.properties': 'sdk.dir=C\\:\\\\Users\\\\me\\\\AppData\\\\Local\\\\Android\\\\Sdk\n' });
  assert.equal(localSdkDir(root), 'C:\\Users\\me\\AppData\\Local\\Android\\Sdk');
});

test('parses adb devices, AVDs and simulator runtimes', () => {
  assert.deepEqual(parseDevices('List of devices attached\nemulator-5554\tdevice\nR58M\tunauthorized\n\n'), [
    { id: 'emulator-5554', state: 'device' },
    { id: 'R58M', state: 'unauthorized' },
  ]);
  assert.deepEqual(parseAvds('INFO    | Storing crashdata in: /tmp\nPixel_8_API_36\nMedium_Phone\n'), ['Pixel_8_API_36', 'Medium_Phone']);
  assert.deepEqual(
    parseRuntimes(
      '== Runtimes ==\niOS 18.2 (18.2 - 22C150) - com.apple.CoreSimulator.SimRuntime.iOS-18-2\n' +
        'watchOS 11.2 (11.2 - 22S99) - com.apple.CoreSimulator.SimRuntime.watchOS-11-2\n' +
        'iOS 17.0 (17.0 - 21A328) - com.apple.CoreSimulator.SimRuntime.iOS-17-0 (unavailable, runtime not found)\n',
    ),
    ['18.2'],
  );
});

test('Android: checks the SDK, platform, build tools, NDK, adb and emulators', async () => {
  const { rows, titles } = await inspect(
    { ...ANDROID, ...sdkFiles('sdk') },
    {
      env: (root) => ({ ANDROID_HOME: path.join(root, 'sdk') }),
      outputs: { 'adb devices': 'List of devices attached\nemulator-5554\tdevice\n', 'emulator -list-avds': 'Pixel_8\n' },
    },
  );
  assert.deepEqual(titles, ['Tools', 'Android', 'Lockfiles']);
  assert.equal(rows['Android SDK'].status, 'ok');
  assert.match(rows['Android SDK'].message, /from ANDROID_HOME/);
  assert.equal(rows['SDK Platform'].status, 'ok');
  assert.equal(rows['SDK Platform'].version, 'android-36');
  assert.equal(rows['Build tools'].status, 'ok');
  assert.equal(rows.NDK.status, 'warn');
  assert.match(rows.NDK.hint, /sdkmanager" "ndk;27\.1\.12297006"/);
  assert.equal(rows.adb.status, 'ok');
  assert.match(rows.Devices.message, /emulator-5554/);
  assert.equal(rows.Emulators.message, 'Pixel_8');
});

test('Android: accepts android-37.0 platform folders and warns about missing packages', async () => {
  const files = {
    ...ANDROID,
    'android/build.gradle': ROOT_GRADLE.replace('compileSdkVersion = 36', 'compileSdkVersion = 37'),
    'sdk/platforms/android-37.0/android.jar': '',
  };
  const { rows } = await inspect(files, { env: (root) => ({ ANDROID_SDK_ROOT: path.join(root, 'sdk') }) });
  assert.equal(rows['SDK Platform'].status, 'ok');
  assert.equal(rows['Build tools'].status, 'warn');
  assert.match(rows['Build tools'].hint, /build-tools;36\.0\.0/);
  assert.equal(rows.adb.status, 'fail');
  assert.equal(rows.Emulators.status, 'warn');
});

test('Android: devices and emulators', async () => {
  const env = (root) => ({ ANDROID_HOME: path.join(root, 'sdk') });
  const none = await inspect({ ...ANDROID, ...sdkFiles('sdk') }, { env, outputs: { 'adb devices': 'List of devices attached\n', 'emulator -list-avds': '' } });
  assert.equal(none.rows.Devices.status, 'warn');
  assert.equal(none.rows.Emulators.status, 'warn');

  const phone = await inspect({ ...ANDROID, ...sdkFiles('sdk') }, { env, outputs: { 'adb devices': 'R58M\tdevice\n', 'emulator -list-avds': '' } });
  assert.equal(phone.rows.Devices.status, 'ok');
  assert.equal(phone.rows.Emulators.status, 'skip');

  const locked = await inspect({ ...ANDROID, ...sdkFiles('sdk') }, { env, outputs: { 'adb devices': 'R58M\tunauthorized\n' } });
  assert.equal(locked.rows.Devices.status, 'warn');
  assert.match(locked.rows.Devices.hint, /Allow USB debugging/);
});

test('Android SDK: fails when the configured folder is missing or nothing is configured', async () => {
  const broken = await inspect(ANDROID, { env: () => ({ ANDROID_HOME: '/no/such/sdk' }) });
  assert.equal(broken.rows['Android SDK'].status, 'fail');
  assert.match(broken.rows['Android SDK'].message, /ANDROID_HOME points at \/no\/such\/sdk/);
  assert.equal(broken.rows['SDK Platform'], undefined);

  const missing = await inspect(ANDROID, { platform: 'darwin', home: '/Users/me' });
  assert.equal(missing.rows['Android SDK'].status, 'fail');
  assert.match(missing.rows['Android SDK'].hint, /\/Users\/me\/Library\/Android\/sdk/);
  assert.equal(missing.rows['Android SDK'].fix, undefined);
});

test('env --fix: writes android/local.properties when the SDK is at the default location', async () => {
  const files = { ...ANDROID, ...sdkFiles('home/Android/Sdk'), 'node_modules/': '', 'package-lock.json': {}, 'android/local.properties': '# keep me\nfoo=bar' };
  const home = (root) => path.join(root, 'home');
  const before = await inspect(files, { home, outputs: { 'adb devices': 'List of devices attached\n' } });
  assert.equal(before.rows['Android SDK'].status, 'fail');
  assert.equal(before.rows['Android SDK'].fix, 'local.properties');
  assert.equal(before.rows['SDK Platform'].status, 'ok', 'still checks the SDK it found');

  const rows = before.sections.flatMap(([, list]) => list);
  const plan = planFixes(before.project, rows, before.tools, 'linux');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, 'write');
  assert.equal(plan[0].line, `sdk.dir=${path.join(before.root, 'home', 'Android', 'Sdk')}`);

  const run = fakeRun();
  applyFixes(plan, { run });
  const written = readFileSync(path.join(before.root, 'android', 'local.properties'), 'utf8');
  assert.match(written, /^# keep me\nfoo=bar\nsdk\.dir=/);
  assert.equal(localSdkDir(before.root), path.join(before.root, 'home', 'Android', 'Sdk'));

  const toolchain = await detectToolchain(before.project, TOOLS, {
    env: {},
    run,
    platform: 'linux',
    home: home(before.root),
    probe: async () => 'free',
  });
  const after = envSections(before.project, { ...TOOLS, ...toolchain }, 'linux');
  const sdkRow = after.flatMap(([, list]) => list).find((row) => row.name === 'Android SDK');
  assert.equal(sdkRow.status, 'ok');
  assert.match(sdkRow.message, /from android\/local\.properties/);
});

test('env --fix: installs node_modules, gems and pods in order', async () => {
  const files = {
    'package.json': RN_PACKAGE,
    'yarn.lock': '',
    Gemfile: "source 'https://rubygems.org'\ngem 'cocoapods', '>= 1.13'",
    'Gemfile.lock': 'GEM\n  specs:\n    cocoapods (1.15.2)\n\nBUNDLED WITH\n   2.5.6\n',
    'ios/Podfile': "require_relative '../node_modules/react-native/scripts/react_native_pods'",
  };
  const { project, sections, tools } = await inspect(files, { platform: 'darwin', tools: { gemsInstalled: false } });
  const plan = planFixes(project, sections.flatMap(([, list]) => list), tools, 'darwin');
  assert.deepEqual(
    plan.map((step) => [step.command, ...step.args].join(' ')),
    ['yarn install', 'bundle install', 'bundle exec pod install'],
  );
  assert.equal(plan[2].cwd, path.join(project.root, 'ios'));

  const calls = [];
  const results = applyFixes(plan, { run: (command, args) => calls.push(command) && command !== 'bundle' });
  assert.deepEqual(calls, ['yarn', 'bundle'], 'stops after the first failure');
  assert.equal(results.at(-1).ok, false);
});

test('iOS: checks Xcode, xcode-select, simulators and CocoaPods on macOS', async () => {
  const files = {
    'package.json': RN_PACKAGE,
    Gemfile: "gem 'cocoapods', '>= 1.13'",
    'Gemfile.lock': 'GEM\n  specs:\n    cocoapods (1.15.2)\n      cocoapods-core (= 1.15.2)\n\nDEPENDENCIES\n  cocoapods (>= 1.13, != 1.15.1)\n',
    'ios/Podfile': '',
    'ios/Podfile.lock': 'PODS:\n  - hermes-engine (0.81.0)\n\nCOCOAPODS: 1.15.2\n',
    'ios/Pods/Manifest.lock': 'PODS:\n  - hermes-engine (0.81.0)\n\nCOCOAPODS: 1.15.2\n',
  };
  const outputs = {
    'xcode-select -p': '/Applications/Xcode.app/Contents/Developer\n',
    'xcodebuild -version': 'Xcode 16.2\nBuild version 16C5032a\n',
    'xcrun simctl list runtimes': '== Runtimes ==\niOS 18.2 (18.2 - 22C150) - com.apple.CoreSimulator.SimRuntime.iOS-18-2\n',
    'bundle exec pod --version': '1.15.2\n',
  };
  const good = await inspect(files, { platform: 'darwin', outputs, tools: { gemsInstalled: true } });
  assert.deepEqual(good.titles, ['Tools', 'iOS', 'Lockfiles']);
  assert.equal(good.rows.Xcode.status, 'ok');
  assert.equal(good.rows.Xcode.version, '16.2 (16C5032a)');
  assert.match(good.rows.Xcode.message, /16\.1\+ for React Native 0\.81/);
  assert.equal(good.rows.Simulators.message, 'iOS 18.2');
  assert.equal(good.rows.CocoaPods.status, 'ok');
  assert.equal(good.rows.CocoaPods.message, 'matches Gemfile.lock');

  const old = await inspect(files, { platform: 'darwin', outputs: { ...outputs, 'xcodebuild -version': 'Xcode 15.4\n' } });
  assert.equal(old.rows.Xcode.status, 'fail');
  assert.match(old.rows.Xcode.message, /needs Xcode 16\.1/);

  const clt = await inspect(files, {
    platform: 'darwin',
    outputs: { ...outputs, 'xcode-select -p': '/Library/Developer/CommandLineTools\n', 'xcodebuild -version': { status: 1 } },
  });
  assert.equal(clt.rows.Xcode.status, 'fail');
  assert.match(clt.rows.Xcode.hint, /sudo xcode-select -s \/Applications\/Xcode\.app/);
  assert.equal(clt.rows.Simulators, undefined);
  assert.ok(!clt.run.calls.includes('xcrun simctl list runtimes'));

  const noSims = await inspect(files, { platform: 'darwin', outputs: { ...outputs, 'xcrun simctl list runtimes': '== Runtimes ==\n' } });
  assert.equal(noSims.rows.Simulators.status, 'warn');

  const podfileLock = await inspect(
    { ...files, 'ios/Podfile.lock': 'PODS:\n\nCOCOAPODS: 1.14.3\n' },
    { platform: 'darwin', outputs },
  );
  assert.equal(podfileLock.rows.CocoaPods.status, 'warn');
  assert.match(podfileLock.rows.CocoaPods.message, /made with CocoaPods 1\.14\.3/);

  const noGems = await inspect(files, { platform: 'darwin', outputs, tools: { gemsInstalled: false } });
  assert.equal(noGems.rows.CocoaPods.status, 'warn');
  assert.equal(noGems.rows.CocoaPods.fix, 'bundle install');
  assert.ok(!noGems.run.calls.includes('bundle exec pod --version'), "doesn't run pod when the gems are missing");

  const linux = await inspect(files, { platform: 'linux', outputs });
  assert.deepEqual(linux.titles, ['Tools', 'Lockfiles']);
  assert.ok(!linux.run.calls.some((call) => call.startsWith('xc')));
});

test('xcodeMinimum: by React Native version, 16.1 when unknown', () => {
  assert.equal(xcodeMinimum('0.76.9'), '15.1');
  assert.equal(xcodeMinimum('0.79.2'), '15.1');
  assert.equal(xcodeMinimum('0.80.0'), '16.1');
  assert.equal(xcodeMinimum('0.81.4'), '16.1');
  assert.equal(xcodeMinimum(null), '16.1');
});

test('Tools: Watchman and port 8081', async () => {
  const files = { 'package.json': RN_PACKAGE };
  const missing = await inspect(files, { platform: 'darwin' });
  assert.equal(missing.rows.Watchman.status, 'warn');
  assert.equal(missing.rows.Watchman.hint, 'brew install watchman');
  assert.equal(missing.rows['Port 8081'].status, 'ok');

  const installed = await inspect(files, { outputs: { 'watchman --version': '2025.01.06.00\n' } });
  assert.equal(installed.rows.Watchman.version, '2025.01.06.00');

  const windows = await inspect(files, { platform: 'win32' });
  assert.equal(windows.rows.Watchman, undefined);
  assert.ok(!windows.run.calls.includes('watchman --version'));

  assert.equal((await inspect(files, { port: 'metro' })).rows['Port 8081'].message, 'Metro is running');
  const busy = (await inspect(files, { port: 'other' })).rows['Port 8081'];
  assert.equal(busy.status, 'fail');
  assert.match(busy.hint, /lsof -i :8081/);
  assert.match(busy.hint, /--port/);
});

test('only runs the commands a project needs', async () => {
  const { run } = await inspect({ 'package.json': RN_PACKAGE }, { platform: 'darwin' });
  assert.deepEqual(run.calls, ['watchman --version']);
});

test('Expo: skips Ruby, Android and iOS checks without native folders', async () => {
  const files = { 'package.json': { dependencies: { expo: '~54.0.0', 'react-native': '0.81.4' } }, Gemfile: 'ruby ">= 9"' };
  const { rows, titles, run } = await inspect(files, { platform: 'darwin' });
  assert.deepEqual(titles, ['Tools', 'Lockfiles']);
  assert.equal(rows.Ruby, undefined);
  assert.equal(rows.Expo.status, 'skip');
  assert.match(rows.Expo.message, /Expo Go/);
  assert.match(rows.Expo.hint, /development build/);
  assert.deepEqual(run.calls, ['watchman --version']);

  const prebuilt = await inspect({ ...files, ...ANDROID, 'package.json': files['package.json'] });
  assert.ok(prebuilt.titles.includes('Android'));
  assert.equal(prebuilt.rows.Expo, undefined);
});

test('envJson: project, platform and rows with their section', async () => {
  const { project, sections } = await inspect({ 'package.json': RN_PACKAGE }, { port: 'other' });
  const json = envJson(project, sections, 'linux');
  assert.deepEqual(json.project, { name: 'DemoApp', root: project.root, reactNative: '0.81.0', expo: null });
  assert.equal(json.platform, 'linux');
  assert.ok(json.rows.every((row) => row.section && row.name && row.status && row.message));
  assert.deepEqual(json.rows.find((row) => row.name === 'Port 8081').section, 'Tools');
});

test('envReport: a fenced block with versions, problems and ~ for the home folder', async () => {
  const home = (root) => path.join(root, 'home');
  const files = { ...ANDROID, ...sdkFiles('home/Android/Sdk'), 'node_modules/react-native/package.json': { version: '0.81.4' } };
  const { project, tools, sections, root } = await inspect(files, {
    home,
    report: true,
    outputs: { 'npm -v': '10.9.2\n', 'yarn -v': '1.22.22\n', 'adb devices': 'List of devices attached\n' },
  });
  const report = envReport(project, tools, sections, { home: home(root) });
  const lines = report.split('\n');
  assert.equal(lines[0], '```');
  assert.equal(lines.at(-1), '```');
  assert.match(report, /^DemoApp \(rn-buddy env --report\)$/m);
  assert.match(report, /^OS +Linux /m);
  assert.match(report, /^Package manager +npm \(installed: npm 10\.9\.2, yarn 1\.22\.22\)$/m);
  assert.match(report, /^Java +17\.0\.10$/m);
  assert.match(report, /^Android SDK +~\/Android\/Sdk · platforms 36 · build-tools 36\.0\.0$/m);
  assert.match(report, /^react-native +0\.81\.4$/m);
  assert.match(report, /^Hermes +true$/m);
  assert.match(report, /^New Arch +true$/m);
  assert.match(report, /^✖ Android › Android SDK: found at ~\/Android\/Sdk/m);
  assert.match(report, /^⚠ Android › Devices: /m);
  assert.ok(!report.includes(home(root)));
});

test('shortenHome replaces every occurrence', () => {
  assert.equal(shortenHome('/Users/me/a and /Users/me/b', '/Users/me'), '~/a and ~/b');
  assert.equal(shortenHome('/a', '/'), '/a');
});

// ---- CLI ----

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('CLI: env --json prints the rows as JSON with the same exit code', () => {
  const dir = makeProject({ 'package.json': { name: 'JsonApp', engines: { node: '>=999' } } });
  const result = rnBuddy('env', '--json', '--dir', dir);
  const json = JSON.parse(result.stdout);
  assert.equal(json.project.name, 'JsonApp');
  assert.equal(json.platform, process.platform);
  const node = json.rows.find((row) => row.name === 'Node');
  assert.equal(node.section, 'Tools');
  assert.equal(node.status, 'fail');
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('\u001b['), 'no colors');
});

test('CLI: env --report prints a fenced block', () => {
  const dir = makeProject({ 'package.json': { name: 'ReportApp', dependencies: { 'react-native': '0.81.0' } } });
  const result = rnBuddy('env', '--report', '--dir', dir);
  assert.match(result.stdout, /^```\nReportApp \(rn-buddy env --report\)\n/);
  assert.match(result.stdout, /^Node +\d+\.\d+\.\d+$/m);
  assert.match(result.stdout, /```\n$/);
});

test('CLI: env prints sections and --fix refuses --json', () => {
  const dir = makeProject({ 'package.json': { name: 'PlainApp' }, 'package-lock.json': {} });
  const result = rnBuddy('env', '--dir', dir);
  assert.match(result.stdout, /^PlainApp\n/);
  assert.match(result.stdout, /^Tools$/m);
  assert.match(result.stdout, /✔ \d+ ok/);

  const fix = rnBuddy('env', '--fix', '--json', '--dir', dir);
  assert.equal(fix.status, 1);
  assert.match(fix.stderr, /--fix/);
});
