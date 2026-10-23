import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { androidAppGradle, androidRootGradle, gradleProperties, readText } from './native.js';
import { installedVersion, isExpo } from './project.js';

// The Android SDK, Xcode, CocoaPods, simulators, Watchman and the Metro port.
// Detection (runs commands) is separate from the checks (pure), so tests can fake every tool.

// A runner returns { status, stdout, stderr }, or null when the command doesn't exist.
// The async one lets independent commands run at the same time, so `env` stays fast.
export function runSync(command, args, { cwd } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 20_000, shell: process.platform === 'win32' });
  if (result.error) return null;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function runAsync(command, args, { cwd } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));
    child.on('error', () => resolve(null));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// Everything the command printed, or null when it is missing or failed.
export function outputOf(result) {
  return result && result.status === 0 ? `${result.stdout}${result.stderr}` : null;
}

// Where Android Studio installs the SDK by default.
export function defaultSdkPath(platform, home, env = {}) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Android', 'sdk');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
  return path.join(home, 'Android', 'Sdk');
}

// Gradle looks for the SDK in android/local.properties first, then ANDROID_HOME, then ANDROID_SDK_ROOT.
export function androidSdk(root, env, platform, home) {
  const sdkDir = localSdkDir(root);
  const configured = [
    ['android/local.properties', sdkDir],
    ['ANDROID_HOME', env.ANDROID_HOME],
    ['ANDROID_SDK_ROOT', env.ANDROID_SDK_ROOT],
  ].find(([, value]) => value);
  const defaultPath = defaultSdkPath(platform, home, env);
  return {
    path: configured?.[1] ?? null,
    source: configured?.[0] ?? null,
    exists: Boolean(configured && existsSync(configured[1])),
    defaultPath,
    defaultExists: existsSync(defaultPath),
  };
}

// The SDK folder to look in: the configured one, else the default one if Android Studio installed it there.
export function sdkFolder(sdk) {
  if (!sdk) return null;
  if (sdk.exists) return sdk.path;
  return sdk.defaultExists ? sdk.defaultPath : null;
}

// sdk.dir from android/local.properties. Java properties escape ":" and "\" (C\:\\Users\\...).
export function localSdkDir(root) {
  const line = readText(path.join(root, 'android', 'local.properties'))?.match(/^\s*sdk\.dir\s*[=:]\s*(.*?)\s*$/m)?.[1];
  return line ? line.replace(/\\(.)/g, '$1') : null;
}

export function propertiesPath(file) {
  return file.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

// A setting such as compileSdkVersion, from android/app/build.gradle, then android/build.gradle.
// Handles `compileSdkVersion = 36`, `compileSdk 36`, `ndkVersion = "27.1.12297006"` and the Expo style
// `Integer.parseInt(findProperty('android.compileSdkVersion') ?: '35')`, read from gradle.properties.
export function gradleSetting(root, names) {
  const properties = readProperties(readText(gradleProperties(root)));
  for (const file of [androidAppGradle(root), androidRootGradle(root)]) {
    const text = readText(file);
    if (!text) continue;
    for (const name of names) {
      for (const [, expression] of text.matchAll(new RegExp(`^\\s*(?:ext\\.)?${name}\\s*(?:=\\s*)?(.+?)\\s*$`, 'gm'))) {
        const value = gradleValue(expression, properties);
        if (value) return value;
      }
    }
  }
  return null;
}

function gradleValue(expression, properties) {
  const property = expression.match(/(?:findProperty|gradleProperty|properties\[)\(?\s*['"]([^'"]+)['"]/)?.[1];
  if (property) {
    return properties[property] ?? expression.match(/\?:\s*['"]?([\w.-]+)['"]?/)?.[1] ?? null;
  }
  return expression.match(/^(\d+)$/)?.[1] ?? expression.match(/^["']([\w.-]+)["']$/)?.[1] ?? null;
}

export function readProperties(text) {
  const properties = {};
  for (const line of (text ?? '').split('\n')) {
    const match = line.match(/^\s*([^#!\s][^=:\s]*)\s*[=:]\s*(.*?)\s*$/);
    if (match) properties[match[1]] = match[2];
  }
  return properties;
}

// The Xcode React Native needs, by React Native minor version (newest first).
// https://github.com/facebook/react-native/blob/main/CHANGELOG.md
export const XCODE_MINIMUM = [
  ['0.80', '16.1'],
  ['0.76', '15.1'],
  ['0.73', '14.1'],
];

export function xcodeMinimum(reactNative) {
  const version = semver.coerce(reactNative);
  if (!version) return XCODE_MINIMUM[0][1];
  const found = XCODE_MINIMUM.find(([since]) => semver.gte(version, `${since}.0`));
  return (found ?? XCODE_MINIMUM.at(-1))[1];
}

export function reactNativeVersion({ root, pkg }) {
  const range = pkg.dependencies?.['react-native'];
  return installedVersion(root, 'react-native') ?? (semver.validRange(range) ? semver.minVersion(range)?.version : null) ?? null;
}

// Runs only the commands this project needs, in parallel. `report` also collects
// versions for `env --report` (OS, package managers, Xcode even without an ios/ folder).
export async function detectToolchain({ root }, tools = {}, options = {}) {
  const {
    env = process.env,
    run = runAsync,
    platform = process.platform,
    home = os.homedir(),
    probe = probePort,
    report = false,
  } = options;
  const hasAndroid = existsSync(path.join(root, 'android'));
  const hasIos = existsSync(path.join(root, 'ios'));
  const exec = async (command, args, cwd = root) => run(command, args, { cwd });
  const text = async (command, args, cwd) => outputOf(await exec(command, args, cwd));

  const android = async () => {
    if (!hasAndroid && !report) return null;
    const sdk = androidSdk(root, env, platform, home);
    if (!hasAndroid) return { sdk };
    const folder = sdkFolder(sdk);
    const exe = platform === 'win32' ? '.exe' : '';
    const sdkAdb = folder && path.join(folder, 'platform-tools', `adb${exe}`);
    const adb = sdkAdb && existsSync(sdkAdb) ? sdkAdb : 'adb';
    const emulator = folder && path.join(folder, 'emulator', `emulator${exe}`);
    const [devices, avds] = await Promise.all([
      text(adb, ['devices']),
      emulator && existsSync(emulator) ? text(emulator, ['-list-avds']) : null,
    ]);
    return {
      sdk,
      adb: devices === null ? null : { path: adb, fromSdk: adb !== 'adb', devices: parseDevices(devices) },
      emulator: emulator && existsSync(emulator) ? { avds: avds === null ? null : parseAvds(avds) } : null,
    };
  };

  const ios = async () => {
    if (platform !== 'darwin' || (!hasIos && !report)) return null;
    const [select, xcodebuild] = await Promise.all([text('xcode-select', ['-p']), text('xcodebuild', ['-version'])]);
    const xcode = {
      selectPath: select?.trim() || null,
      version: xcodebuild?.match(/Xcode\s+([\d.]+)/)?.[1] ?? null,
      build: xcodebuild?.match(/Build version\s+(\S+)/)?.[1] ?? null,
    };
    if (!hasIos) return { xcode };
    const gemfile = existsSync(path.join(root, 'Gemfile'));
    const [runtimes, pod] = await Promise.all([
      xcode.version ? text('xcrun', ['simctl', 'list', 'runtimes']) : null,
      gemfile && tools.gemsInstalled === false
        ? null
        : gemfile
          ? text('bundle', ['exec', 'pod', '--version'])
          : text('pod', ['--version']),
    ]);
    return {
      xcode,
      runtimes: runtimes === null ? null : parseRuntimes(runtimes),
      cocoapods: semver.coerce(pod)?.version ?? null,
      podRunner: gemfile ? 'bundle exec pod' : 'pod',
    };
  };

  const watchman = async () => {
    if (platform === 'win32') return null;
    return (await text('watchman', ['--version']))?.trim() || null;
  };

  const extras = async () => {
    if (!report) return {};
    const [osVersion, npm, yarn, pnpm] = await Promise.all([
      platform === 'darwin' ? text('sw_vers', ['-productVersion']) : null,
      text('npm', ['-v']),
      text('yarn', ['-v']),
      text('pnpm', ['-v']),
    ]);
    return {
      os: { platform, version: osVersion?.trim() || linuxRelease(platform) || os.release(), arch: os.arch() },
      managers: { npm: npm?.trim() || null, yarn: yarn?.trim() || null, pnpm: pnpm?.trim() || null },
    };
  };

  const [androidInfo, iosInfo, watchmanVersion, port, more] = await Promise.all([
    android(),
    ios(),
    watchman(),
    probe(8081),
    extras(),
  ]);
  return { android: androidInfo, ios: iosInfo, watchman: watchmanVersion, port, ...more };
}

function linuxRelease(platform) {
  if (platform !== 'linux') return null;
  return readText('/etc/os-release')?.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1] ?? null;
}

// `adb devices`: "emulator-5554\tdevice", "R58M\tunauthorized", ...
export function parseDevices(text) {
  return text
    .split('\n')
    .map((line) => line.trim().match(/^(\S+)\s+(device|unauthorized|offline|no permissions.*)$/))
    .filter(Boolean)
    .map(([, id, state]) => ({ id, state }));
}

// `emulator -list-avds` prints one AVD name per line; newer emulators add "INFO | ..." lines.
export function parseAvds(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[\w.-]+$/.test(line) && line !== 'INFO');
}

// `xcrun simctl list runtimes`: "iOS 18.2 (18.2 - 22C150) - com.apple.CoreSimulator.SimRuntime.iOS-18-2"
export function parseRuntimes(text) {
  return text
    .split('\n')
    .filter((line) => /^iOS\s/.test(line) && !/unavailable/i.test(line))
    .map((line) => line.match(/^iOS\s+([\d.]+)/)[1]);
}

// 'free', 'metro' (Metro answers /status) or 'other' (something else listens on the port).
export async function probePort(port) {
  const open = await new Promise((resolve) => {
    const socket = net.connect({ port, host: 'localhost' });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
  if (!open) return 'free';
  try {
    const response = await fetch(`http://localhost:${port}/status`, { signal: AbortSignal.timeout(2000) });
    return (await response.text()).includes('packager-status:running') ? 'metro' : 'other';
  } catch {
    return 'other';
  }
}

// ---- Checks: each returns rows { name, status, message, version?, hint?, fix? } ----

// Extra rows of the "Tools" section.
export function checkMachine(project, toolchain, platform) {
  return [checkWatchman(toolchain.watchman, platform), checkPort(toolchain.port), expoNote(project)].filter(Boolean);
}

function checkWatchman(version, platform) {
  if (platform === 'win32') return null;
  if (version) return { name: 'Watchman', version, status: 'ok', message: 'installed' };
  return {
    name: 'Watchman',
    status: 'warn',
    message: 'not installed (optional: Metro watches files faster with it)',
    hint: platform === 'darwin' ? 'brew install watchman' : 'https://facebook.github.io/watchman/docs/install',
  };
}

function checkPort(state) {
  if (!state) return null;
  if (state === 'free') return { name: 'Port 8081', status: 'ok', message: 'free for Metro' };
  if (state === 'metro') return { name: 'Port 8081', status: 'ok', message: 'Metro is running' };
  return {
    name: 'Port 8081',
    status: 'fail',
    message: 'used by another program, so Metro cannot start',
    hint: 'Find it with lsof -i :8081 and close it, or start Metro on another port: npx react-native start --port 8088',
  };
}

// Expo Go runs the app without native tools: say so instead of failing on missing SDKs.
function expoNote({ root, pkg }) {
  if (!isExpo(pkg)) return null;
  if (existsSync(path.join(root, 'android')) || existsSync(path.join(root, 'ios'))) return null;
  return {
    name: 'Expo',
    status: 'skip',
    message: 'no android/ or ios/ folder: with Expo Go you need neither Android Studio nor Xcode',
    hint: 'You need them once you make a development build (npx expo run:android, npx expo run:ios)',
  };
}

export function checkAndroid({ root }, toolchain, platform) {
  const info = toolchain.android;
  if (!info || !existsSync(path.join(root, 'android'))) return [];
  const rows = [checkSdk(info.sdk, platform)];
  const folder = sdkFolder(info.sdk);
  if (folder) {
    const manager = `"${path.join(folder, 'cmdline-tools', 'latest', 'bin', 'sdkmanager')}"`;
    rows.push(
      sdkPackage(root, folder, {
        name: 'SDK Platform',
        settings: ['compileSdkVersion', 'compileSdk'],
        // Newer SDKs name the folder android-37.0 (minor API levels), older ones android-36.
        dir: (value) => [path.join('platforms', `android-${value}`), path.join('platforms', `android-${value}.0`)],
        label: (value) => `android-${value}`,
        install: (value) => `${manager} "platforms;android-${value}", or Android Studio → SDK Manager → SDK Platforms`,
      }),
      sdkPackage(root, folder, {
        name: 'Build tools',
        settings: ['buildToolsVersion'],
        dir: (value) => path.join('build-tools', value),
        label: (value) => value,
        install: (value) => `${manager} "build-tools;${value}", or Android Studio → SDK Manager → SDK Tools`,
      }),
      sdkPackage(root, folder, {
        name: 'NDK',
        settings: ['ndkVersion'],
        dir: (value) => path.join('ndk', value),
        label: (value) => value,
        install: (value) =>
          `${manager} "ndk;${value}", or Android Studio → SDK Manager → SDK Tools → ` +
          'NDK (Side by side), with "Show Package Details" on',
      }),
    );
  }
  rows.push(...checkDevices(info, folder));
  return rows.filter(Boolean);
}

function checkSdk(sdk, platform) {
  const setHome =
    platform === 'win32'
      ? `setx ANDROID_HOME "${sdk.defaultPath}"`
      : `add export ANDROID_HOME="${sdk.defaultPath}" to your shell profile (~/.zshrc or ~/.bashrc)`;
  if (sdk.exists) return { name: 'Android SDK', status: 'ok', message: `${sdk.path} (from ${sdk.source})` };
  if (sdk.path) {
    return {
      name: 'Android SDK',
      status: 'fail',
      message: `${sdk.source} points at ${sdk.path}, which doesn't exist`,
      hint: sdk.defaultExists
        ? `The SDK is at ${sdk.defaultPath}. Fix ${sdk.source}, or run rn-buddy env --fix`
        : `Fix ${sdk.source} to point at your Android SDK (Android Studio → Settings → Android SDK shows where it is)`,
      ...(sdk.defaultExists && sdk.source === 'android/local.properties' && { fix: 'local.properties' }),
    };
  }
  if (sdk.defaultExists) {
    return {
      name: 'Android SDK',
      status: 'fail',
      message: `found at ${sdk.defaultPath}, but Gradle won't find it ("SDK location not found")`,
      hint: `Run rn-buddy env --fix to write android/local.properties, or ${setHome}`,
      fix: 'local.properties',
    };
  }
  return {
    name: 'Android SDK',
    status: 'fail',
    message: 'not found (ANDROID_HOME is not set)',
    hint: `Install Android Studio, open SDK Manager once, then ${setHome}: https://reactnative.dev/docs/set-up-your-environment`,
  };
}

function sdkPackage(root, folder, { name, settings, dir, label, install }) {
  const value = gradleSetting(root, settings);
  if (!value) return null; // not set: the Android Gradle plugin picks its default
  if ([dir(value)].flat().some((candidate) => existsSync(path.join(folder, candidate)))) {
    return { name, version: label(value), status: 'ok', message: 'installed' };
  }
  return {
    name,
    version: label(value),
    status: 'warn',
    message:
      name === 'NDK'
        ? 'not installed. Gradle tries to download it, which fails offline or before you accept the SDK licenses'
        : 'not installed. Gradle tries to download it on the first build',
    hint: install(value),
  };
}

function checkDevices({ adb, emulator }, folder) {
  const rows = [];
  if (!adb) {
    rows.push({
      name: 'adb',
      status: 'fail',
      message: 'not found, so npm run android cannot install the app',
      hint: 'Install "Android SDK Platform-Tools" in Android Studio → SDK Manager → SDK Tools',
    });
  } else {
    rows.push({
      name: 'adb',
      status: 'ok',
      message: adb.fromSdk ? 'found in the SDK platform-tools' : 'found on PATH',
    });
    const ready = adb.devices.filter((device) => device.state === 'device');
    const unauthorized = adb.devices.filter((device) => device.state === 'unauthorized');
    if (ready.length > 0) {
      rows.push({ name: 'Devices', status: 'ok', message: `${ready.length} connected: ${ready.map((d) => d.id).join(', ')}` });
    } else if (unauthorized.length > 0) {
      rows.push({
        name: 'Devices',
        status: 'warn',
        message: `${unauthorized.map((d) => d.id).join(', ')} is not authorized`,
        hint: 'Unlock the phone and accept the "Allow USB debugging?" prompt',
      });
    } else {
      rows.push({
        name: 'Devices',
        status: 'warn',
        message: 'no device or emulator connected',
        hint: 'Start an emulator from Android Studio → Device Manager, or plug in a phone with USB debugging on',
      });
    }
  }

  if (!folder) return rows;
  const connected = adb?.devices.some((device) => device.state === 'device');
  if (!emulator) {
    rows.push({
      name: 'Emulators',
      status: connected ? 'skip' : 'warn',
      message: 'the Android Emulator is not installed',
      hint: 'Install "Android Emulator" in Android Studio → SDK Manager → SDK Tools',
    });
  } else if (emulator.avds?.length) {
    rows.push({ name: 'Emulators', status: 'ok', message: emulator.avds.join(', ') });
  } else {
    rows.push({
      name: 'Emulators',
      status: connected ? 'skip' : 'warn',
      message: 'none created yet',
      hint: 'Android Studio → Device Manager → Create Virtual Device',
    });
  }
  return rows;
}

export function checkIos(project, toolchain, platform) {
  const { root } = project;
  const info = toolchain.ios;
  if (platform !== 'darwin' || !info || !existsSync(path.join(root, 'ios'))) return [];
  const xcode = checkXcode(info.xcode, reactNativeVersion(project));
  const rows = [xcode];
  if (xcode.status !== 'fail') rows.push(checkSimulators(info.runtimes));
  if (existsSync(path.join(root, 'ios', 'Podfile'))) rows.push(checkCocoaPods(root, info));
  return rows;
}

function checkXcode({ selectPath, version, build }, reactNative) {
  const select = 'sudo xcode-select -s /Applications/Xcode.app';
  if (selectPath?.includes('CommandLineTools')) {
    return {
      name: 'Xcode',
      status: 'fail',
      message: 'xcode-select points at the Command Line Tools, not Xcode',
      hint: `Install Xcode from the App Store if you haven't, then run ${select}`,
    };
  }
  if (!version) {
    return {
      name: 'Xcode',
      status: 'fail',
      message: 'not found',
      hint: `Install Xcode from the App Store, open it once, then run ${select}`,
    };
  }
  const minimum = xcodeMinimum(reactNative);
  const forRn = reactNative ? `React Native ${semver.major(reactNative)}.${semver.minor(reactNative)}` : 'React Native';
  const label = build ? `${version} (${build})` : version;
  if (semver.lt(semver.coerce(version), semver.coerce(minimum))) {
    return {
      name: 'Xcode',
      version: label,
      status: 'fail',
      message: `${forRn} needs Xcode ${minimum} or newer`,
      hint: 'Update Xcode from the App Store, then open it once to install its components',
    };
  }
  return { name: 'Xcode', version: label, status: 'ok', message: `meets ${minimum}+ for ${forRn}` };
}

function checkSimulators(runtimes) {
  if (runtimes === null) {
    return { name: 'Simulators', status: 'warn', message: 'could not list them (xcrun simctl failed)', hint: 'Open Xcode once' };
  }
  if (runtimes.length === 0) {
    return {
      name: 'Simulators',
      status: 'warn',
      message: 'no iOS simulator runtime installed',
      hint: 'Xcode → Settings → Components, or run xcodebuild -downloadPlatform iOS',
    };
  }
  return { name: 'Simulators', status: 'ok', message: `iOS ${runtimes.join(', ')}` };
}

function checkCocoaPods(root, { cocoapods, podRunner }) {
  const gemfile = existsSync(path.join(root, 'Gemfile'));
  const locked = readText(path.join(root, 'Gemfile.lock'))?.match(/^ {4}cocoapods \((\d[^)]*)\)/m)?.[1] ?? null;
  const podfileLock = readText(path.join(root, 'ios', 'Podfile.lock'))?.match(/^COCOAPODS:\s*(\S+)/m)?.[1] ?? null;

  if (!cocoapods) {
    return gemfile
      ? {
          name: 'CocoaPods',
          status: 'warn',
          message: `${podRunner} doesn't run: the gems from the Gemfile are not installed`,
          hint: 'Run bundle install',
          fix: 'bundle install',
        }
      : { name: 'CocoaPods', status: 'fail', message: 'not found', hint: 'brew install cocoapods' };
  }
  if (locked && locked !== cocoapods) {
    return {
      name: 'CocoaPods',
      version: cocoapods,
      status: 'warn',
      message: `Gemfile.lock wants ${locked}, ${podRunner} runs ${cocoapods}`,
      hint: 'Run bundle install, and use bundle exec pod install',
      fix: 'bundle install',
    };
  }
  if (podfileLock && podfileLock !== cocoapods) {
    return {
      name: 'CocoaPods',
      version: cocoapods,
      status: 'warn',
      message: `ios/Podfile.lock was made with CocoaPods ${podfileLock}`,
      hint: gemfile
        ? 'Use bundle exec pod install, so everyone runs the CocoaPods version from Gemfile.lock'
        : `Install CocoaPods ${podfileLock}, or commit the Podfile.lock your version writes`,
    };
  }
  const source = locked ? 'matches Gemfile.lock' : gemfile ? 'from the Gemfile (bundle exec pod)' : 'pod on PATH';
  return { name: 'CocoaPods', version: cocoapods, status: 'ok', message: source };
}
