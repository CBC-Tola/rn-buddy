import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatCommand, podCommand } from './add.js';
import { derivedDataDirs } from './clean.js';
import { diffFingerprint, expoPlugins, nativeFingerprint, readFingerprint } from './fingerprint.js';
import { hasNodeModules, isExpo, packageManager } from './project.js';

// "Do I need to rebuild?" without the network: compares the time of the last native build
// (the .apk, the .app in DerivedData) with when native packages were installed and native
// files were edited, plus the fingerprint rn-buddy saves (see fingerprint.js).

// Not part of a build's inputs: build output, caches, per-user IDE state.
const SKIP_ANDROID = new Set(['build', '.gradle', '.cxx', '.idea', '.kotlin', 'local.properties', '.DS_Store']);
const SKIP_IOS = new Set(['build', 'Pods', 'xcuserdata', '.xcode.env.local', '.DS_Store']);

const METRO_CONFIGS = [
  'babel.config.js',
  'babel.config.cjs',
  'babel.config.mjs',
  '.babelrc',
  '.babelrc.js',
  'metro.config.js',
  'metro.config.cjs',
  'metro.config.mjs',
];

// Native libraries that Expo Go already includes, besides expo-* packages.
const EXPO_GO = new Set([
  'react-native',
  'expo',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  'react-native-screens',
  'react-native-safe-area-context',
  'react-native-svg',
  'react-native-maps',
  'react-native-webview',
  'react-native-pager-view',
  'react-native-view-shot',
  'react-native-get-random-values',
  'lottie-react-native',
  '@react-native-async-storage/async-storage',
  '@react-native-community/datetimepicker',
  '@react-native-community/netinfo',
  '@react-native-community/slider',
  '@react-native-picker/picker',
  '@react-native-masked-view/masked-view',
  '@shopify/flash-list',
  '@shopify/react-native-skia',
  '@stripe/stripe-react-native',
]);

const DEV_BUILD = 'npx expo run:android / npx expo run:ios, or eas build --profile development';

// Rows like env's: { name, status: 'ok' | 'warn' | 'fail' | 'skip', message, hint? }.
// A row for a platform that was never built also has `never: true`.
export function statusRows(project, options = {}) {
  const context = readContext(project, options);
  const { root, manager } = context;
  if (!hasNodeModules(root)) {
    return [{ name: 'Packages', status: 'warn', message: 'node_modules is missing: nothing is installed yet', hint: `${manager} install` }];
  }

  return [
    missingPackagesRow(context),
    ...(context.managed
      ? [expoGoRow(context), devBuildRow(context)]
      : [platformRow(context, 'android'), platformRow(context, 'ios'), podsRow(context)]),
    pluginsRow(context),
    metroRow(context),
    envRow(context),
  ].filter(Boolean);
}

// `status` saves the fingerprint when it learns the native state of the last build:
// a build newer than the fingerprint, with no native package installed after that build.
// Expo projects without native folders have no build to look at, so each check counts.
export function shouldSaveFingerprint(project, options = {}) {
  const context = readContext(project, options);
  if (!hasNodeModules(context.root)) return false;
  if (!context.fingerprint || context.managed) return true;
  const built = newest(Object.values(context.builds));
  if (!built || built <= context.fingerprint.savedAt) return false;
  return context.native.every((entry) => (context.installed[entry.name] ?? 0) <= built);
}

// When the last Android build finished: the newest .apk, or Gradle's intermediates
// when no .apk was made (e.g. a build that failed halfway). null when never built.
export function androidBuildTime(root) {
  const build = path.join(root, 'android', 'app', 'build');
  const apks = findEntries(path.join(build, 'outputs', 'apk'), (name) => name.endsWith('.apk'), 4);
  if (apks.length > 0) return newest(apks.map((file) => mtime(file)));
  const intermediates = path.join(build, 'intermediates');
  if (!existsSync(intermediates)) return null;
  return newest(readdirSync(intermediates).map((name) => mtime(path.join(intermediates, name)))) ?? mtime(intermediates);
}

// When the last iOS build finished: Xcode touches the .app at the end of every build.
export function iosBuildTime(root, home = os.homedir()) {
  const products = [
    path.join(root, 'ios', 'build', 'Build', 'Products'),
    ...derivedDataDirs(root, home).map((dir) => path.join(dir, 'Build', 'Products')),
  ];
  const apps = products.flatMap((dir) => findEntries(dir, (name) => name.endsWith('.app'), 2));
  return newest(apps.map((app) => mtime(app)));
}

// When Metro last wrote its cache in the temp folder, or null.
export function metroCacheTime(tmpdir = os.tmpdir()) {
  if (!existsSync(tmpdir)) return null;
  const caches = readdirSync(tmpdir)
    .filter((name) => /^(metro-|haste-map-)/.test(name))
    .map((name) => path.join(tmpdir, name));
  return newest(caches.flatMap((dir) => [mtime(dir), ...children(dir).map((child) => mtime(child))]));
}

function readContext(project, options) {
  const { root, pkg } = project;
  const { now = Date.now(), platform = process.platform, home = os.homedir(), tmpdir = os.tmpdir() } = options;
  const expo = isExpo(pkg);
  const android = existsSync(path.join(root, 'android'));
  const ios = existsSync(path.join(root, 'ios'));
  const manager = packageManager(root, pkg);
  const native = hasNodeModules(root) ? nativeFingerprint(root) : [];
  return {
    root,
    pkg,
    now,
    platform,
    tmpdir,
    expo,
    android,
    ios,
    managed: expo && !android && !ios,
    manager,
    native,
    installed: Object.fromEntries(native.map((entry) => [entry.name, installTime(root, entry.name)])),
    fingerprint: readFingerprint(root),
    builds: {
      android: android ? androidBuildTime(root) : null,
      ios: ios && platform === 'darwin' ? iosBuildTime(root, home) : null,
    },
    run: {
      android: expo ? 'npx expo run:android' : `${manager} run android`,
      ios: expo ? 'npx expo run:ios' : `${manager} run ios`,
    },
  };
}

function missingPackagesRow({ root, pkg, manager }) {
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  const missing = names.filter((name) => !existsSync(path.join(root, 'node_modules', name)));
  if (missing.length === 0) return null;
  return {
    name: 'Packages',
    status: 'warn',
    message: `${list(missing)} ${missing.length === 1 ? 'is' : 'are'} in package.json but not installed`,
    hint: `${manager} install, then check this again`,
  };
}

function platformRow(context, platform) {
  const label = platform === 'android' ? 'Android' : 'iOS';
  const name = `${label} build`;
  if (!context[platform]) return null;
  if (platform === 'ios' && context.platform !== 'darwin') {
    return { name, status: 'skip', message: 'iOS apps can only be built on a Mac' };
  }
  const run = context.run[platform];
  const built = context.builds[platform];
  if (!built) {
    return { name, status: 'skip', message: `No ${label} build found yet: the first \`${run}\` builds everything`, never: true };
  }

  const skip = platform === 'android' ? SKIP_ANDROID : SKIP_IOS;
  const files = changedFiles(path.join(context.root, platform), skip, built).map((file) => `${platform}/${file}`);
  const reasons = [...packageReasons(context, built)];
  if (files.length > 0) reasons.push(`${list(files)} changed after the last build`);
  if (reasons.length === 0) {
    return { name, status: 'ok', message: `no native changes since the last build (${ago(built, context.now)})` };
  }
  return { name, status: 'warn', message: `Rebuild needed: ${reasons.join('; ')}`, hint: run };
}

// Native packages added, updated or removed since `built`, from install times and,
// when it was saved after that build, the fingerprint.
function packageReasons({ native, installed, fingerprint }, built) {
  const before = new Set((fingerprint?.packages ?? []).map((entry) => entry.name));
  const fresh = fingerprint && fingerprint.savedAt >= built;
  const diff = fresh ? diffFingerprint(fingerprint.packages, native) : { added: [], removed: [], changed: [] };

  const added = new Set(diff.added.map((entry) => entry.name));
  const changed = new Map(diff.changed.map((entry) => [entry.name, entry]));
  const updated = [];
  for (const { name } of native.filter((entry) => (installed[entry.name] ?? 0) > built)) {
    if (added.has(name) || changed.has(name)) continue;
    if (fingerprint && !before.has(name)) added.add(name);
    else updated.push(name);
  }

  const reasons = [];
  if (added.size > 0) {
    const names = [...added];
    reasons.push(`${list(names)} ${was(names)} added since the last build (${names.length === 1 ? 'it has' : 'they have'} native code)`);
  }
  if (changed.size > 0) {
    const names = [...changed.values()].map((entry) => `${entry.name} (${entry.from} → ${entry.to})`);
    reasons.push(`${list(names)} ${was(names)} updated`);
  }
  if (updated.length > 0) reasons.push(`${list(updated)} ${was(updated)} installed or updated after the last build (native code)`);
  if (diff.removed.length > 0) {
    const names = diff.removed.map((entry) => entry.name);
    reasons.push(`${list(names)} ${was(names)} removed`);
  }
  return reasons;
}

// CocoaPods copies Podfile.lock to Pods/Manifest.lock on every pod install, and every
// autolinked pod appears in Podfile.lock with its node_modules path.
function podsRow(context) {
  const { root, platform } = context;
  if (platform !== 'darwin' || !existsSync(path.join(root, 'ios', 'Podfile'))) return null;
  const name = 'iOS pods';
  const hint = formatCommand(podCommand(root, platform), root);
  const lockFile = path.join(root, 'ios', 'Podfile.lock');
  const lock = readText(lockFile);
  if (lock === null) return { name, status: 'warn', message: 'pod install has not run yet (no ios/Podfile.lock)', hint };

  const reasons = [];
  const manifest = readText(path.join(root, 'ios', 'Pods', 'Manifest.lock'));
  if (manifest === null) reasons.push('ios/Pods is missing');
  else if (manifest !== lock) reasons.push('ios/Pods does not match Podfile.lock');

  const withPods = context.native.filter((entry) => entry.name !== 'react-native' && podspecs(root, entry.name).length > 0);
  const missing = withPods.filter((entry) => !inPodfileLock(lock, entry.name, podspecs(root, entry.name))).map((entry) => entry.name);
  if (missing.length > 0) reasons.push(`${list(missing)} ${missing.length === 1 ? 'is' : 'are'} not in Podfile.lock yet`);

  const installedAt = mtime(lockFile);
  const newer = withPods
    .filter((entry) => !missing.includes(entry.name) && (context.installed[entry.name] ?? 0) > installedAt)
    .map((entry) => entry.name);
  if (newer.length > 0) reasons.push(`${list(newer)} ${was(newer)} installed after the last pod install`);

  if (reasons.length === 0) return { name, status: 'ok', message: 'in sync with your native packages' };
  return { name, status: 'warn', message: `Out of date: ${reasons.join('; ')}`, hint };
}

function expoGoRow({ native, pkg }) {
  if (pkg.dependencies?.['expo-dev-client'] || pkg.devDependencies?.['expo-dev-client']) return null;
  const extra = native
    .map((entry) => entry.name)
    .filter((name) => !EXPO_GO.has(name) && !name.startsWith('expo-') && !name.startsWith('@expo/'));
  if (extra.length === 0) {
    return { name: 'Expo Go', status: 'ok', message: 'no android/ or ios/ folder to rebuild: Expo Go loads every JS change' };
  }
  return {
    name: 'Expo Go',
    status: 'warn',
    message: `${list(extra)} ${extra.length === 1 ? 'has' : 'have'} native code that Expo Go doesn't include: in Expo Go only JS changes apply`,
    hint: `make a development build: ${DEV_BUILD}`,
  };
}

// With expo-dev-client the app is your own development build, so a new native package
// means a new build. Without a build folder to look at, compare with the last check.
function devBuildRow({ native, pkg, fingerprint }) {
  if (!pkg.dependencies?.['expo-dev-client'] && !pkg.devDependencies?.['expo-dev-client']) return null;
  const name = 'Dev build';
  if (!fingerprint) {
    return { name, status: 'skip', message: 'first check: rn-buddy now remembers your native packages to spot changes' };
  }
  const diff = diffFingerprint(fingerprint.packages, native);
  const names = [...diff.added, ...diff.changed, ...diff.removed].map((entry) => entry.name);
  if (names.length === 0) return { name, status: 'ok', message: 'no native packages changed since rn-buddy last checked' };
  return {
    name,
    status: 'warn',
    message: `${list(names)} changed since rn-buddy last checked (native code): Expo Go and your current development build won't have ${names.length === 1 ? 'it' : 'them'}`,
    hint: `make a new development build: ${DEV_BUILD}`,
  };
}

// Config plugins in app.json change native files, which only happens on prebuild or a new build.
function pluginsRow({ root, expo, managed, fingerprint }) {
  if (!expo || !fingerprint || !('plugins' in fingerprint)) return null;
  if (expoPlugins(root) === fingerprint.plugins) return null;
  return {
    name: 'Config plugins',
    status: 'warn',
    message: 'the plugins in app.json changed since rn-buddy last checked: they only apply to a new native build',
    hint: managed ? `make a new development build: ${DEV_BUILD}` : 'npx expo prebuild, then npx expo run:android / npx expo run:ios',
  };
}

// babel.config.js and metro.config.js changes don't invalidate Metro's cache,
// so old transforms keep being served until Metro starts with a clean cache.
function metroRow({ root, pkg, expo, tmpdir }) {
  const cached = metroCacheTime(tmpdir);
  if (!cached) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const files = METRO_CONFIGS.filter((file) => existsSync(path.join(root, file)));
  // react-native-dotenv inlines .env with a Babel plugin, so .env is part of the cache too.
  if (deps['react-native-dotenv']) files.push(...envFiles(root));
  const changed = files.filter((file) => mtime(path.join(root, file)) > cached);
  const name = 'Metro cache';
  if (changed.length === 0) return { name, status: 'ok', message: 'Babel and Metro config unchanged since Metro last ran' };
  return {
    name,
    status: 'warn',
    message: `${list(changed)} changed after Metro last cached your code`,
    hint: `restart Metro with a clean cache: ${expo ? 'npx expo start -c' : 'npx react-native start --reset-cache'}`,
  };
}

// react-native-config reads .env when the app is built, not when Metro reloads.
function envRow(context) {
  const { root, pkg, builds, run } = context;
  if (context.managed || !(pkg.dependencies?.['react-native-config'] ?? pkg.devDependencies?.['react-native-config'])) return null;
  const files = envFiles(root);
  const platforms = Object.keys(builds).filter((key) => builds[key]);
  if (files.length === 0 || platforms.length === 0) return null;
  const affected = platforms.filter((key) => files.some((file) => mtime(path.join(root, file)) > builds[key]));
  if (affected.length === 0) return { name: '.env', status: 'ok', message: 'unchanged since the last build' };
  return {
    name: '.env',
    status: 'warn',
    message: `${list(files)} changed after the last build: react-native-config reads ${files.length === 1 ? 'it' : 'them'} when the app is built`,
    hint: affected.map((key) => run[key]).join(' / '),
  };
}

function envFiles(root) {
  return readdirSync(root).filter((name) => /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template)$/.test(name));
}

// When a package was installed. npm keeps the (old) file times from the package tarball,
// but the package folder itself is created at install time; with pnpm it's a symlink.
function installTime(root, name) {
  const dir = path.join(root, 'node_modules', name);
  return newest([mtime(dir, true), mtime(path.join(dir, 'package.json'))]);
}

function podspecs(root, name) {
  try {
    return readdirSync(path.join(root, 'node_modules', name))
      .filter((file) => file.endsWith('.podspec'))
      .map((file) => file.slice(0, -'.podspec'.length));
  } catch {
    return [];
  }
}

function inPodfileLock(lock, name, pods) {
  if (new RegExp(`node_modules/${escape(name)}["\`'\\s]`).test(lock)) return true;
  return pods.some((pod) => new RegExp(`^\\s*- "?${escape(pod)}(\\s|/|"|$)`, 'm').test(lock));
}

// Files (relative to `dir`) changed after `since`, newest first, skipping build output.
// Capped so a huge folder can't make `status` slow.
function changedFiles(dir, skip, since, limit = 5000) {
  const changed = [];
  const stack = [''];
  let seen = 0;
  while (stack.length > 0 && seen < limit) {
    const relative = stack.pop();
    let entries;
    try {
      entries = readdirSync(path.join(dir, relative), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (skip.has(entry.name)) continue;
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) {
        const time = mtime(path.join(dir, file));
        if (time > since) changed.push({ file: file.split(path.sep).join('/'), time });
      }
    }
  }
  return changed.sort((a, b) => b.time - a.time).map((entry) => entry.file);
}

// Paths of entries whose name matches, up to `depth` folders down (matches aren't entered).
function findEntries(dir, match, depth) {
  const found = [];
  for (const entry of safeEntries(dir)) {
    const full = path.join(dir, entry.name);
    if (match(entry.name)) found.push(full);
    else if (entry.isDirectory() && depth > 1) found.push(...findEntries(full, match, depth - 1));
  }
  return found;
}

function safeEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function children(dir) {
  return safeEntries(dir).map((entry) => path.join(dir, entry.name));
}

function mtime(file, link = false) {
  try {
    return (link ? lstatSync : statSync)(file).mtimeMs;
  } catch {
    return null;
  }
}

function newest(times) {
  const valid = times.filter((time) => typeof time === 'number');
  return valid.length > 0 ? Math.max(...valid) : null;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function was(names) {
  return names.length === 1 ? 'was' : 'were';
}

// "a", "a and b", "a, b and c", "a, b and 3 more".
export function list(names) {
  if (names.length <= 1) return names.join('');
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

// "5 minutes ago", "3 hours ago", "2 days ago".
export function ago(time, now = Date.now()) {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
