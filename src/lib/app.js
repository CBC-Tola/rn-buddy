import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { installCommands, podCommand } from './add.js';
import { androidAppGradle, androidRes, androidStrings, iosAppDir, infoPlist, mainActivity, pbxproj, readText } from './native.js';
import { plistString, setPlistString } from './plist.js';
import { isExpo, packageManager } from './project.js';

// The ID the React Native template gives iOS apps until you set your own.
export const TEMPLATE_IOS_PREFIX = 'org.reactjs.native.example';
export const BOOTSPLASH_DOCS = 'https://github.com/zoontek/react-native-bootsplash';

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const DYNAMIC_CONFIGS = ['app.config.js', 'app.config.ts', 'app.config.mjs', 'app.config.cjs'];

// Java and Kotlin keywords can't be part of an Android package name.
const KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
    'finally float for goto if implements import instanceof int interface long native new package private protected ' +
    'public return short static strictfp super switch synchronized this throw throws transient try void volatile while ' +
    'true false null as fun in is object typealias typeof val var when'
  ).split(' '),
);

// ---------------------------------------------------------------------------------------------
// Reading the current values

// { android, ios, appJson, expo, packageVersion }: each part is null when the project doesn't have it.
export function readAppInfo(root, pkg) {
  return {
    android: readAndroid(root),
    ios: readIos(root),
    appJson: readJson(path.join(root, 'app.json')),
    expo: expoConfig(root, pkg),
    packageVersion: pkg.version ?? null,
  };
}

// Expo's app config. `dynamic` is app.config.js/ts: code we can't read or edit.
export function expoConfig(root, pkg) {
  if (!isExpo(pkg)) return null;
  const dynamic = DYNAMIC_CONFIGS.find((file) => existsSync(path.join(root, file))) ?? null;
  const json = readJson(path.join(root, 'app.json'));
  if (!dynamic && !json?.expo) return null;
  return { dynamic, config: json?.expo ?? null };
}

function readAndroid(root) {
  const gradleFile = androidAppGradle(root);
  if (!gradleFile) return null;
  const gradle = readFileSync(gradleFile, 'utf8');
  const strings = readText(androidStrings(root));
  return {
    gradleFile: path.relative(root, gradleFile),
    name: strings ? androidAppName(strings) : null,
    applicationId: gradleValue(gradle, 'applicationId'),
    namespace: gradleValue(gradle, 'namespace'),
    versionName: gradleValue(gradle, 'versionName'),
    versionCode: gradleValue(gradle, 'versionCode'),
    package: readText(mainActivity(root))?.match(/^\s*package\s+([\w.]+)/m)?.[1] ?? null,
  };
}

function readIos(root) {
  const pbxFile = pbxproj(root);
  const plistFile = infoPlist(root);
  if (!pbxFile && !plistFile) return null;
  const appName = iosAppDir(root) ? path.basename(iosAppDir(root)) : null;
  const pbx = readText(pbxFile);
  const plist = readText(plistFile);
  const configs = pbx ? appConfigurations(pbx, appName) : [];
  const main = mainConfiguration(configs);
  const settings = { TARGET_NAME: appName, ...(main?.settings ?? {}) };
  const fromPlist = (key) => (plist ? resolveSetting(plistString(plist, key), settings) : null);
  return {
    appName,
    pbxFile: pbxFile && path.relative(root, pbxFile),
    plistFile: plistFile && path.relative(root, plistFile),
    name: fromPlist('CFBundleDisplayName') ?? fromPlist('CFBundleName'),
    bundleIdRaw: main?.settings.PRODUCT_BUNDLE_IDENTIFIER ?? null,
    bundleId: fromPlist('CFBundleIdentifier') ?? resolveSetting(main?.settings.PRODUCT_BUNDLE_IDENTIFIER ?? null, settings),
    version: fromPlist('CFBundleShortVersionString') ?? settings.MARKETING_VERSION ?? null,
    build: fromPlist('CFBundleVersion') ?? settings.CURRENT_PROJECT_VERSION ?? null,
  };
}

// Rows for `rn-buddy app`: { label, android, ios, differs } and plain-English notes.
export function appSummary(info) {
  const rows = [];
  const notes = [];
  const { android: a, ios: i, expo } = info;

  if (expo) {
    const c = expo.config ?? {};
    if (expo.dynamic) {
      notes.push(
        `${expo.dynamic} is a dynamic config (code): rn-buddy can't read it${c ? ', and it may change the values below' : ''}. ` +
          'Run npx expo config to see the final values.',
      );
    }
    if (expo.config) {
      rows.push(row('Name', c.name, c.name));
      rows.push(row('ID', c.android?.package, c.ios?.bundleIdentifier));
      rows.push(row('Version', c.version, c.version));
      rows.push(row('Build', c.android?.versionCode, c.ios?.buildNumber));
      if (!c.android?.package || !c.ios?.bundleIdentifier) {
        notes.push(
          'No android.package / ios.bundleIdentifier yet: Expo asks for them on the first build. ' +
            'Set them with rn-buddy app id com.yourname.app',
        );
      }
    }
    if (a || i) notes.push('android/ and ios/ are made from app.json by npx expo prebuild: change app.json, not the native files.');
    return { rows, notes, source: expo.config ? 'app.json (expo)' : null };
  }

  rows.push(row('Name', a?.name, i?.name));
  rows.push(row('ID', a?.applicationId, i?.bundleId));
  rows.push(row('Version', a?.versionName, i?.version, (x, y) => semver.coerce(x)?.version === semver.coerce(y)?.version));
  rows.push(row('Build', a?.versionCode, i?.build));

  if (a?.namespace && a.namespace !== a.applicationId) {
    notes.push(
      `Android namespace is ${a.namespace} (the Kotlin package of MainActivity). ` +
        'It may differ from applicationId; the stores only see applicationId.',
    );
  }
  if (i?.bundleId?.startsWith(`${TEMPLATE_IOS_PREFIX}.`)) {
    notes.push("iOS still has the template's placeholder ID. Set your own before publishing: rn-buddy app id com.yourname.app");
  }
  if (info.appJson?.displayName && a?.name && info.appJson.displayName !== a.name) {
    notes.push(`app.json displayName is "${info.appJson.displayName}". The name on the phone comes from the native files above.`);
  }
  if (info.packageVersion) {
    notes.push(
      `package.json version is ${info.packageVersion}. The stores only see the native versions; ` +
        'rn-buddy app version keeps all three in step.',
    );
  }
  return { rows, notes, source: null };
}

function row(label, android, ios, same = (x, y) => x === y) {
  const value = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const [left, right] = [value(android), value(ios)];
  return { label, android: left, ios: right, differs: left !== null && right !== null && !same(left, right) };
}

// ---------------------------------------------------------------------------------------------
// android/app/build.gradle (Groovy or Kotlin DSL)

const GRADLE = {
  applicationId: /^(\s*applicationId\s*=?\s*)(["'])([^"']*)\2/m,
  namespace: /^(\s*namespace\s*=?\s*)(["'])([^"']*)\2/m,
  versionName: /^(\s*versionName\s*=?\s*)(["'])([^"']*)\2/m,
  versionCode: /^(\s*versionCode\s*=?\s*)()(\d+)/m,
};

export function gradleValue(content, key) {
  return content.match(GRADLE[key])?.[3] ?? null;
}

export function setGradleValue(content, key, value) {
  if (!GRADLE[key].test(content)) return null;
  return content.replace(GRADLE[key], (all, before, quote) => `${before}${quote}${value}${quote}`);
}

// ---------------------------------------------------------------------------------------------
// android/app/src/main/res/values/strings.xml

const APP_NAME = /(<string\s+name="app_name"[^>]*>)([^<]*)(<\/string>)/;

export function androidAppName(content) {
  const match = content.match(APP_NAME);
  return match ? unescapeAndroid(match[2]) : null;
}

export function setAndroidAppName(content, name) {
  if (!APP_NAME.test(content)) return null;
  return content.replace(APP_NAME, (all, open, old, close) => `${open}${escapeAndroid(name)}${close}`);
}

// Android string resources need ' and " escaped with a backslash, besides the XML escapes.
export function escapeAndroid(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/^([@?])/, '\\$1');
}

export function unescapeAndroid(text) {
  return text
    .replace(/^"(.*)"$/, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\\(.)/g, '$1');
}

// ---------------------------------------------------------------------------------------------
// ios/<App>.xcodeproj/project.pbxproj

// Every XCBuildConfiguration block: { id, name, text, settings }.
export function buildConfigurations(content) {
  const pattern = /^([\t ]*)([0-9A-F]{24}) \/\* ([^*]+?) \*\/ = \{\n[\t ]*isa = XCBuildConfiguration;[\s\S]*?\n\1\};/gm;
  return [...content.matchAll(pattern)].map((match) => ({
    id: match[2],
    name: match[3],
    text: match[0],
    settings: parseSettings(match[0]),
  }));
}

function parseSettings(text) {
  const settings = {};
  for (const [, key, value] of text.matchAll(/^\s*([A-Za-z_]\w*(?:\[[^\]]*\])?) = (.+);$/gm)) {
    if (!value.startsWith('(') && !value.startsWith('{')) settings[key] = unquote(value);
  }
  return settings;
}

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value;
}

// The build configurations (Debug, Release, ...) of the app target: the ones that use the app's
// Info.plist. Test targets have TEST_HOST and their own Info.plist.
export function appConfigurations(content, appName) {
  const configs = buildConfigurations(content).filter(
    (c) => c.settings.PRODUCT_BUNDLE_IDENTIFIER && !c.settings.TEST_HOST && !c.settings.BUNDLE_LOADER,
  );
  if (appName) {
    const byPlist = configs.filter((c) => c.settings.INFOPLIST_FILE?.endsWith(`${appName}/Info.plist`));
    if (byPlist.length > 0) return byPlist;
  }
  return configs.filter((c) => c.settings.ASSETCATALOG_COMPILER_APPICON_NAME);
}

function mainConfiguration(configs) {
  return configs.find((c) => c.name === 'Release') ?? configs[0] ?? null;
}

// Fills in $(VARIABLES) from the build settings, like Xcode does:
// "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)" → "org.reactjs.native.example.DemoApp".
export function resolveSetting(value, settings, depth = 0) {
  if (value === null || value === undefined) return null;
  return value.replace(/\$\(([A-Za-z_]\w*)(?::([\w,]+))?\)|\$\{([A-Za-z_]\w*)\}/g, (all, key, modifier, key2) => {
    let resolved = settings[key ?? key2];
    if (resolved === undefined || resolved === null) return all;
    if (depth < 5) resolved = resolveSetting(resolved, settings, depth + 1);
    if (resolved.includes('$(')) return all;
    return modifier?.includes('rfc1034identifier') ? resolved.replace(/[^A-Za-z0-9-]/g, '-') : resolved;
  });
}

export function setSetting(blockText, key, value) {
  const pattern = new RegExp(`^(\\s*${key} = ).+;$`, 'm');
  if (!pattern.test(blockText)) return null;
  return blockText.replace(pattern, (all, before) => `${before}${pbxValue(value)};`);
}

function pbxValue(value) {
  return /^[A-Za-z0-9_./]+$/.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------------------------
// Checks

export function validateAppId(id, { ios = true } = {}) {
  if (!id) return 'Give the new ID, e.g. rn-buddy app id com.yourname.budget';
  const parts = id.split('.');
  if (parts.length < 2) return `"${id}" needs at least two parts separated by dots, like com.yourname.budget (a reversed domain name).`;
  for (const part of parts) {
    if (!part) return `"${id}" has an empty part: two dots in a row, or a dot at the start or end.`;
    if (!/^[a-zA-Z]/.test(part)) return `"${part}" in "${id}" must start with a letter (an Android rule).`;
    if (!/^[a-zA-Z0-9_]+$/.test(part)) return `"${part}" in "${id}" can only use letters, numbers and _ (no spaces or dashes).`;
    if (KEYWORDS.has(part)) {
      return `"${part}" is a Java/Kotlin keyword, which Android doesn't allow in a package name. Use something else, like ${part}app.`;
    }
  }
  if (ios && id.includes('_')) return `iOS bundle IDs can't contain _. Use letters, numbers and dots, like ${id.replace(/_/g, '')}.`;
  return null;
}

// major/minor/patch from the current version, or an exact version like 1.2.0.
export function bumpVersion(current, kind) {
  const base = semver.coerce(current ?? '0.0.0')?.version ?? '0.0.0';
  if (['major', 'minor', 'patch'].includes(kind)) return semver.inc(base, kind);
  if (/^\d+(\.\d+){0,2}$/.test(kind ?? '')) return kind;
  throw new Error(`"${kind ?? ''}" isn't a version. Use major, minor, patch or a version like 1.2.0.`);
}

// versionCode, CURRENT_PROJECT_VERSION and buildNumber are whole numbers that only go up.
export function nextBuild(value) {
  return /^\d+$/.test(String(value ?? '').trim()) ? String(Number(value) + 1) : null;
}

// Width, height and transparency from a PNG's IHDR header (the first 33 bytes), or null if it's not a PNG.
export function readPngInfo(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 26 || signature.some((byte, i) => buffer[i] !== byte)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  const colorType = buffer[25];
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
}

export function readPngFile(file) {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(33);
    const bytes = readSync(fd, buffer, 0, 33, 0);
    return readPngInfo(buffer.subarray(0, bytes));
  } finally {
    closeSync(fd);
  }
}

// "#fff", "fff", "#FFFFFF" → "#ffffff".
export function normalizeColor(value) {
  const hex = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`.toLowerCase();
  throw new Error(`"${value}" isn't a hex color. Use something like --bg "#1e90ff" or --bg 1e90ff.`);
}

// ---------------------------------------------------------------------------------------------
// Plans. Like `add`, every change is worked out before anything is written:
// {
//   title,
//   edits:    [{ file, status: 'apply' | 'done', content, changes: [{ label, before, after }] }]
//   moves:    [{ from, to, content }]          source files moved to a new package folder
//   copies:   [{ from, to }]                   `from` is absolute, `to` relative to the project
//   resizes:  [{ input, size, file }]          icon sizes made with sips
//   removes:  [file]
//   commands: [{ command, args, cwd, optional? }]
//   manual:   [text]   do by hand
//   warnings: [text]
//   notes:    [text]
//   then:     [text]   what to do afterwards
//   next:     markdown printed after applying
// }

function newPlan(title) {
  const lists = ['edits', 'moves', 'copies', 'resizes', 'removes', 'commands', 'manual', 'warnings', 'notes', 'then'];
  return { title, ...Object.fromEntries(lists.map((key) => [key, []])), next: null };
}

export function hasChanges(plan) {
  return (
    plan.edits.some((edit) => edit.status === 'apply') ||
    ['moves', 'copies', 'resizes', 'removes', 'commands'].some((key) => plan[key].length > 0)
  );
}

function addEdit(plan, root, file, before, after, changes) {
  plan.edits.push({ file: path.relative(root, file), status: after === before ? 'done' : 'apply', content: after, changes });
}

// Edits a JSON file (app.json, package.json) with its own indentation. `change(data, set)`
// calls set(object, key, value, label) for each value to change.
function planJsonEdit(plan, root, file, change) {
  const target = path.join(root, file);
  const text = readFileSync(target, 'utf8');
  const data = JSON.parse(text);
  const changes = [];
  const set = (object, key, value, label = key) => {
    if (object[key] === value) return;
    changes.push({ label, before: object[key] === undefined ? '(not set)' : JSON.stringify(object[key]), after: JSON.stringify(value) });
    object[key] = value;
  };
  change(data, set);
  const indent = text.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
  const after = JSON.stringify(data, null, indent) + (text.endsWith('\n') ? '\n' : '');
  addEdit(plan, root, target, text, changes.length ? after : text, changes);
}

// Expo: changes go to app.json. A dynamic app.config.js can't be edited, so it becomes a manual step.
function planExpo(plan, root, expo, change, manual) {
  if (expo.config) {
    planJsonEdit(plan, root, 'app.json', (data, set) => change(data.expo, set));
    if (expo.dynamic) plan.warnings.push(`${expo.dynamic} can change what app.json says: check that it doesn't set these too.`);
  } else {
    plan.manual.push(`Your app config is ${expo.dynamic} (code), which rn-buddy can't edit: ${manual}`);
  }
  if (existsSync(path.join(root, 'android')) || existsSync(path.join(root, 'ios'))) {
    plan.then.push('npx expo prebuild --clean, to make android/ and ios/ again from app.json');
  }
  plan.then.push('Make a new development build (npx expo run:android / npx expo run:ios, or eas build)');
}

function child(object, key) {
  object[key] ??= {};
  return object[key];
}

function noNativeFolders() {
  return new Error('No android/ or ios/ folder found. Run this in a React Native project folder, or use --dir <path>.');
}

// `app name "Budget Buddy"`
export function planName({ root, pkg }, name) {
  if (!name?.trim()) throw new Error('Give the new name, e.g. rn-buddy app name "Budget Buddy"');
  name = name.trim();
  const info = readAppInfo(root, pkg);
  const plan = newPlan(`app name  ${name}`);
  if (name.length > 12) {
    plan.warnings.push(`iPhones shorten names longer than about 12 characters under the icon ("${name.slice(0, 10)}…").`);
  }

  if (info.expo) {
    planExpo(plan, root, info.expo, (expo, set) => set(expo, 'name', name, 'expo.name'), `set expo.name to "${name}".`);
    plan.notes.push("expo.slug stays the same: it's the project's ID on Expo's servers, not shown to users.");
    return plan;
  }
  if (!info.android && !info.ios) throw noNativeFolders();

  if (info.android) {
    const file = androidStrings(root);
    const before = readText(file);
    const after = before && setAndroidAppName(before, name);
    if (after) addEdit(plan, root, file, before, after, [{ label: 'app_name', before: info.android.name, after: name }]);
    else plan.manual.push(`Set <string name="app_name">${name}</string> in android/app/src/main/res/values/strings.xml`);
    for (const translated of translatedNames(root)) {
      plan.manual.push(`${translated} has a translated app_name: change it there too if needed.`);
    }
  }
  if (info.ios) {
    const file = infoPlist(root);
    const before = readText(file);
    const after = before && setPlistString(before, 'CFBundleDisplayName', name);
    if (after) {
      addEdit(plan, root, file, before, after, [
        { label: 'CFBundleDisplayName', before: plistString(before, 'CFBundleDisplayName') ?? '(not set)', after: name },
      ]);
    } else {
      plan.manual.push(`Set CFBundleDisplayName to "${name}" in ios/<App>/Info.plist (Xcode → target → General → Display Name)`);
    }
  }
  if (info.appJson && existsSync(path.join(root, 'app.json'))) {
    planJsonEdit(plan, root, 'app.json', (data, set) => set(data, 'displayName', name));
  }

  const moduleName = info.appJson?.name ?? info.ios?.appName;
  plan.notes.push(
    `The internal name${moduleName ? ` "${moduleName}"` : ''} stays the same. It is app.json "name", ` +
      'getMainComponentName() in MainActivity and AppRegistry.registerComponent() in index.js: ' +
      'it only connects the native app to your JS, users never see it, ' +
      'and the app shows a red screen if those places stop matching.',
  );
  plan.then.push('Rebuild the app: the name is native, so reloading is not enough');
  return plan;
}

function translatedNames(root) {
  const res = androidRes(root);
  if (!res) return [];
  return readdirSync(res)
    .filter((dir) => dir.startsWith('values-'))
    .map((dir) => path.join(res, dir, 'strings.xml'))
    .filter((file) => APP_NAME.test(readText(file) ?? ''))
    .map((file) => path.relative(root, file));
}

// `app id com.example.budget`
export function planId({ root, pkg }, id) {
  const info = readAppInfo(root, pkg);
  const error = validateAppId(id, { ios: Boolean(info.ios || info.expo) });
  if (error) throw new Error(error);
  const plan = newPlan(`app id  ${id}`);
  if (id !== id.toLowerCase()) plan.warnings.push('IDs are usually all lowercase. Uppercase letters work but are easy to get wrong later.');
  plan.warnings.push(
    'Changing the ID of an app that is already in the App Store or Google Play makes it a different app there: ' +
      'users of the old one get no update. Only do this before publishing.',
  );

  if (info.expo) {
    planExpo(
      plan,
      root,
      info.expo,
      (expo, set) => {
        set(child(expo, 'android'), 'package', id, 'android.package');
        set(child(expo, 'ios'), 'bundleIdentifier', id, 'ios.bundleIdentifier');
      },
      `set android.package and ios.bundleIdentifier to "${id}".`,
    );
    return plan;
  }
  if (!info.android && !info.ios) throw noNativeFolders();
  if (info.android) planAndroidId(plan, root, id);
  if (info.ios) planIosId(plan, root, info.ios, id);
  plan.then.push('rn-buddy clean --android, then rebuild both apps: the old build still has the old ID');
  return plan;
}

function planAndroidId(plan, root, id) {
  const gradleFile = androidAppGradle(root);
  const gradle = readFileSync(gradleFile, 'utf8');
  let content = gradle;
  const changes = [];
  for (const key of ['applicationId', 'namespace']) {
    const before = gradleValue(content, key);
    if (before === null) {
      plan.manual.push(`Set ${key} "${id}" in ${path.relative(root, gradleFile)}`);
    } else if (before !== id) {
      content = setGradleValue(content, key, id);
      changes.push({ label: key, before, after: id });
    }
  }
  addEdit(plan, root, gradleFile, gradle, content, changes);
  planPackageMove(plan, root, id);
}

// The Kotlin/Java package must match the namespace, so MainActivity and MainApplication move to the
// folder of the new package (java/com/demo → java/com/example/budget) with a new `package` line.
export function planPackageMove(plan, root, id) {
  const activity = mainActivity(root);
  const manual = `Move MainActivity and MainApplication to the folder of package ${id} and change their package lines to "package ${id}"`;
  if (!activity) {
    plan.manual.push(manual);
    return;
  }
  const oldPackage = readFileSync(activity, 'utf8').match(/^\s*package\s+([\w.]+)/m)?.[1];
  const from = path.dirname(activity);
  const suffix = oldPackage ? path.join(...oldPackage.split('.')) : null;
  if (!oldPackage || !from.endsWith(path.sep + suffix)) {
    plan.manual.push(`${manual} (MainActivity's folder doesn't match its package line)`);
    return;
  }
  if (oldPackage === id) return;

  const base = from.slice(0, -(suffix.length + 1));
  const to = path.join(base, ...id.split('.'));
  const packageLine = /^(\s*package\s+)([\w.]+)/m;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const file = path.join(from, entry.name);
    if (entry.isDirectory()) {
      plan.manual.push(
        `${path.relative(root, file)}/ is a sub-package (${oldPackage}.${entry.name}): ` +
          `move it under ${path.relative(root, to)}/ and update its package and import lines`,
      );
      continue;
    }
    if (!/\.(kt|java)$/.test(entry.name)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.match(packageLine)?.[2] !== oldPackage) {
      plan.manual.push(`${path.relative(root, file)} has a different package line: move it by hand`);
      continue;
    }
    const target = path.join(to, entry.name);
    if (existsSync(target)) {
      plan.manual.push(`${path.relative(root, target)} already exists: merge ${entry.name} by hand`);
      continue;
    }
    plan.moves.push({
      from: path.relative(root, file),
      to: path.relative(root, target),
      content: text.replace(packageLine, (all, before) => `${before}${id}`),
    });
  }

  // Other code that imports the old package (other source sets, sub-packages) needs a look too.
  const src = path.join(root, 'android', 'app', 'src');
  for (const file of sourceFiles(src)) {
    if (path.dirname(file) === from) continue;
    if (new RegExp(`\\b${oldPackage.replace(/\./g, '\\.')}\\b`).test(readFileSync(file, 'utf8'))) {
      plan.manual.push(`${path.relative(root, file)} mentions ${oldPackage}: change it to ${id}`);
    }
  }
}

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'build' ? [] : sourceFiles(file);
    return /\.(kt|java|xml)$/.test(entry.name) ? [file] : [];
  });
}

function planIosId(plan, root, ios, id) {
  const file = pbxproj(root);
  const pbx = readText(file);
  const app = pbx ? appConfigurations(pbx, ios.appName) : [];
  if (app.length === 0) {
    plan.manual.push(`Set the Bundle Identifier to ${id} in Xcode: target ${ios.appName ?? ''} → Signing & Capabilities`);
    return;
  }
  const main = mainConfiguration(app);
  const appSettings = (c) => ({ TARGET_NAME: ios.appName, ...c.settings });
  const oldId = resolveSetting(main.settings.PRODUCT_BUNDLE_IDENTIFIER, appSettings(main));
  // "org.reactjs.native.example" in "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)".
  const prefix = main.settings.PRODUCT_BUNDLE_IDENTIFIER.match(/^(.+)\.\$\((PRODUCT_NAME|TARGET_NAME)[^)]*\)$/)?.[1];

  let content = pbx;
  const grouped = new Map();
  for (const config of buildConfigurations(pbx)) {
    const raw = config.settings.PRODUCT_BUNDLE_IDENTIFIER;
    if (!raw) continue;
    const isApp = app.some((c) => c.id === config.id);
    const resolved = resolveSetting(raw, isApp ? appSettings(config) : config.settings);
    const target = isApp ? ios.appName : (config.settings.INFOPLIST_FILE?.split('/')[0] ?? 'another target');
    let next = null;
    if (resolved === oldId || resolved.startsWith(`${oldId}.`)) next = id + resolved.slice(oldId.length);
    else if (!isApp && prefix && raw.startsWith(`${prefix}.$(`)) next = id + raw.slice(prefix.length);
    else if (isApp) {
      plan.manual.push(`The ${config.name} configuration has its own ID (${resolved}): change it in Xcode → Signing & Capabilities`);
      continue;
    }
    if (next === null || next === raw) continue;
    content = content.replace(config.text, setSetting(config.text, 'PRODUCT_BUNDLE_IDENTIFIER', next));
    const key = `${target}\n${raw}\n${next}`;
    grouped.set(key, [...(grouped.get(key) ?? []), config.name]);
  }
  // The app target first, then tests and extensions.
  const changes = [...grouped]
    .map(([key, names]) => {
      const [target, before, after] = key.split('\n');
      return { target, label: `PRODUCT_BUNDLE_IDENTIFIER (${target}: ${names.join(', ')})`, before, after };
    })
    .sort((a, b) => Number(b.target === ios.appName) - Number(a.target === ios.appName))
    .map(({ target, ...change }) => change);
  addEdit(plan, root, file, pbx, content, changes);

  // Info.plist normally says $(PRODUCT_BUNDLE_IDENTIFIER); an ID typed in there wins over the build setting.
  const plistFile = infoPlist(root);
  const plist = readText(plistFile);
  const literal = plist && plistString(plist, 'CFBundleIdentifier');
  if (literal && !literal.includes('$(') && literal !== id) {
    const after = setPlistString(plist, 'CFBundleIdentifier', id);
    addEdit(plan, root, plistFile, plist, after, [{ label: 'CFBundleIdentifier', before: literal, after: id }]);
  }
}

// `app version patch` (or major, minor, 1.2.0)
export function planVersion({ root, pkg }, kind) {
  if (!kind) throw new Error('Which version? Use rn-buddy app version patch (or major, minor, or a version like 1.2.0).');
  const info = readAppInfo(root, pkg);

  if (info.expo) {
    const config = info.expo.config ?? {};
    const current = config.version ?? pkg.version ?? null;
    const version = bumpVersion(current, kind);
    const plan = newPlan(`app version  ${current ?? '(none)'} → ${version}`);
    checkHigher(plan, current, version);
    planExpo(
      plan,
      root,
      info.expo,
      (expo, set) => {
        set(expo, 'version', version, 'expo.version');
        const build = nextBuild(expo.ios?.buildNumber);
        if (build) set(expo.ios, 'buildNumber', build, 'ios.buildNumber');
        const code = nextBuild(expo.android?.versionCode);
        if (code) set(expo.android, 'versionCode', Number(code), 'android.versionCode');
        if (!build || !code) {
          plan.notes.push(
            'No ios.buildNumber / android.versionCode in app.json: Expo uses 1, ' +
              'or EAS sets them with "autoIncrement" in eas.json.',
          );
        }
      },
      `set expo.version to "${version}" and increase ios.buildNumber and android.versionCode.`,
    );
    planPackageVersion(plan, root, pkg, version);
    return plan;
  }
  if (!info.android && !info.ios) throw noNativeFolders();

  // The native versions are the ones the stores see, so they decide the current version.
  const native = [info.android?.versionName, info.ios?.version].filter((v) => semver.coerce(v));
  const current = native.sort((a, b) => semver.compare(semver.coerce(b), semver.coerce(a)))[0] ?? pkg.version ?? null;
  const version = bumpVersion(current, kind);
  const plan = newPlan(`app version  ${current ?? '(none)'} → ${version}`);
  checkHigher(plan, current, version);

  if (info.android) {
    const file = androidAppGradle(root);
    const before = readFileSync(file, 'utf8');
    let content = before;
    const changes = [];
    const name = gradleValue(content, 'versionName');
    const code = gradleValue(content, 'versionCode');
    if (name === null) plan.manual.push(`Set versionName "${version}" in ${path.relative(root, file)}`);
    else if (name !== version) {
      content = setGradleValue(content, 'versionName', version);
      changes.push({ label: 'versionName', before: name, after: version });
    }
    if (code === null) plan.manual.push(`Increase versionCode by 1 in ${path.relative(root, file)}`);
    else {
      content = setGradleValue(content, 'versionCode', nextBuild(code));
      changes.push({ label: 'versionCode', before: code, after: nextBuild(code) });
    }
    addEdit(plan, root, file, before, content, changes);
  }
  if (info.ios) planIosVersion(plan, root, info.ios, version);
  planPackageVersion(plan, root, pkg, version);
  plan.then.push('Rebuild the app: version numbers are native, so reloading is not enough');
  return plan;
}

function checkHigher(plan, current, version) {
  const [from, to] = [semver.coerce(current), semver.coerce(version)];
  if (from && to && !semver.gt(to, from)) {
    plan.warnings.push(`${version} is not higher than ${current}: the App Store and Google Play only accept higher versions.`);
  }
}

function planIosVersion(plan, root, ios, version) {
  const file = pbxproj(root);
  const pbx = readText(file);
  const app = pbx ? appConfigurations(pbx, ios.appName) : [];
  let content = pbx;
  const versions = new Map();
  const builds = new Map();
  const note = (map, before, after, name) => map.set(`${before}\n${after}`, [...(map.get(`${before}\n${after}`) ?? []), name]);
  for (const config of app) {
    let text = config.text;
    const marketing = config.settings.MARKETING_VERSION;
    if (marketing !== undefined && marketing !== version) {
      text = setSetting(text, 'MARKETING_VERSION', version);
      note(versions, marketing, version, config.name);
    }
    const build = config.settings.CURRENT_PROJECT_VERSION;
    if (build !== undefined) {
      const next = nextBuild(build);
      if (next) {
        text = setSetting(text, 'CURRENT_PROJECT_VERSION', next);
        note(builds, build, next, config.name);
      } else plan.manual.push(`CURRENT_PROJECT_VERSION is "${build}" in ${config.name}: increase it by hand`);
    }
    content = content.replace(config.text, text);
  }
  const rows = (label, map) =>
    [...map].map(([key, names]) => {
      const [before, after] = key.split('\n');
      return { label: `${label} (${names.join(', ')})`, before, after };
    });
  if (pbx) addEdit(plan, root, file, pbx, content, [...rows('MARKETING_VERSION', versions), ...rows('CURRENT_PROJECT_VERSION', builds)]);

  // Info.plist usually points at the build settings ($(MARKETING_VERSION)); older projects have the numbers in it.
  const plistFile = infoPlist(root);
  const plist = readText(plistFile);
  if (!plist) return;
  let plistContent = plist;
  const changes = [];
  const shortVersion = plistString(plist, 'CFBundleShortVersionString');
  if (shortVersion !== null && !shortVersion.includes('$(') && shortVersion !== version) {
    plistContent = setPlistString(plistContent, 'CFBundleShortVersionString', version);
    changes.push({ label: 'CFBundleShortVersionString', before: shortVersion, after: version });
  }
  const bundleVersion = plistString(plist, 'CFBundleVersion');
  if (bundleVersion !== null && !bundleVersion.includes('$(')) {
    const next = nextBuild(bundleVersion);
    if (next) {
      plistContent = setPlistString(plistContent, 'CFBundleVersion', next);
      changes.push({ label: 'CFBundleVersion', before: bundleVersion, after: next });
    } else plan.manual.push(`CFBundleVersion is "${bundleVersion}" in Info.plist: increase it by hand`);
  }
  if (changes.length > 0) addEdit(plan, root, plistFile, plist, plistContent, changes);
  if (app.length === 0 && changes.length === 0) {
    plan.manual.push(`Set the iOS version to ${version} and increase the build number in Xcode: target → General → Identity`);
  }
}

function planPackageVersion(plan, root, pkg, version) {
  // package.json versions must be full semver: 1.1 → 1.1.0.
  const full = semver.valid(version) ?? semver.coerce(version)?.version ?? version;
  if (pkg.version === undefined || pkg.version === full) return;
  planJsonEdit(plan, root, 'package.json', (data, set) => set(data, 'version', full));
}

// `app icon ./icon.png`
export function planIcon({ root, pkg }, input, { platform = process.platform } = {}) {
  const image = checkImage(input, 'rn-buddy app icon ./icon.png');
  if (!image.png) throw new Error(`${input} is not a PNG file. Export the icon as PNG, 1024×1024 pixels.`);
  if (image.png.width !== image.png.height) {
    throw new Error(`The icon must be square, but ${input} is ${image.png.width}×${image.png.height} pixels.`);
  }
  if (image.png.width < 1024) {
    const size = `${image.png.width}×${image.png.height}`;
    throw new Error(`The icon must be at least 1024×1024 pixels (the App Store size), but ${input} is ${size}.`);
  }
  const info = readAppInfo(root, pkg);
  const plan = newPlan(`app icon  ${path.basename(input)}`);
  if (image.png.alpha) {
    plan.warnings.push(
      'The image has an alpha channel (transparency). The App Store rejects iOS icons with transparency: export it without.',
    );
  }

  if (info.expo) {
    const target = 'assets/icon.png';
    if (path.resolve(input) !== path.join(root, target)) plan.copies.push({ from: path.resolve(input), to: target });
    planExpo(plan, root, info.expo, (expo, set) => set(expo, 'icon', `./${target}`, 'expo.icon'), `set expo.icon to "./${target}".`);
    const adaptive = info.expo.config?.android?.adaptiveIcon?.foregroundImage;
    plan.notes.push(
      `Android uses android.adaptiveIcon.foregroundImage${adaptive ? ` (${adaptive})` : ''} when it's set: a version of the icon ` +
        'with extra space around it, because Android crops it to a circle or other shapes. Expo makes every size when it builds.',
    );
    return plan;
  }
  if (!info.android && !info.ios) throw noNativeFolders();
  if (platform !== 'darwin') {
    throw new Error(
      "Making the icon sizes uses sips, a tool that comes with macOS, and rn-buddy doesn't add an image library for it. " +
        'On Windows or Linux: in Android Studio use File → New → Image Asset, and in Xcode drop the 1024×1024 icon into ' +
        'Images.xcassets → AppIcon. Or run this command on a Mac.',
    );
  }
  const source = path.resolve(input);

  const res = androidRes(root);
  if (info.android && res) {
    for (const [density, size] of Object.entries(DENSITIES)) {
      for (const name of ['ic_launcher', 'ic_launcher_round']) {
        plan.resizes.push({ input: source, size, file: path.relative(root, path.join(res, `mipmap-${density}`, `${name}.png`)) });
        const webp = path.join(res, `mipmap-${density}`, `${name}.webp`);
        // An icon as .webp and .png at once fails the build with "Duplicate resources".
        if (existsSync(webp)) plan.removes.push(path.relative(root, webp));
      }
    }
    plan.notes.push('ic_launcher_round.png is the same image: Android shows it on phones that use round icons.');
    if (existsSync(path.join(res, 'mipmap-anydpi-v26'))) {
      plan.warnings.push(
        'android/app/src/main/res/mipmap-anydpi-v26/ has an adaptive icon, which Android 8+ uses instead of these PNGs. ' +
          'rn-buddy does not make adaptive icons: update it in Android Studio (File → New → Image Asset), or delete that folder.',
      );
    } else {
      plan.notes.push(
        'No adaptive icon (the shaped icons of Android 8+) is made: Android shows this one as it is. ' +
          'Android Studio can make one: File → New → Image Asset.',
      );
    }
  } else if (info.android) {
    plan.manual.push('android/app/src/main/res not found: add the icons with Android Studio (File → New → Image Asset)');
  }

  if (info.ios) planIosIcon(plan, root, source);
  plan.then.push('Rebuild the app. If the old icon still shows, delete the app from the device first');
  return plan;
}

// Xcode 14+ needs one 1024×1024 icon and makes the other sizes when it builds.
function planIosIcon(plan, root, source) {
  const dir = iosAppDir(root);
  const set = dir && path.join(dir, 'Images.xcassets', 'AppIcon.appiconset');
  const file = set && path.join(set, 'Contents.json');
  const before = readText(file);
  let contents = null;
  try {
    contents = before && JSON.parse(before);
  } catch {
    contents = null;
  }
  if (!contents || !Array.isArray(contents.images)) {
    plan.manual.push('ios/<App>/Images.xcassets/AppIcon.appiconset not found: drop the 1024×1024 icon into AppIcon in Xcode');
    return;
  }
  plan.resizes.push({ input: source, size: 1024, file: path.relative(root, path.join(set, 'icon-1024.png')) });
  const after = `${JSON.stringify(
    {
      images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  )}\n`;
  addEdit(plan, root, file, before, after, [
    { label: 'images', before: `${contents.images.length} sizes`, after: 'one 1024×1024 icon (Xcode makes the other sizes)' },
  ]);
  const unused = contents.images.map((image) => image.filename).filter((name) => name && name !== 'icon-1024.png');
  if (unused.length > 0) {
    plan.notes.push(`The old icon files in AppIcon.appiconset (${unused.join(', ')}) are no longer used. You can delete them.`);
  }
}

// `app splash ./logo.png --bg #ffffff`
export function planSplash({ root, pkg, deps = [] }, input, background, { platform = process.platform } = {}) {
  const color = normalizeColor(background);
  const image = checkImage(input, 'rn-buddy app splash ./logo.png');
  if (!image.png && !/\.svg$/i.test(input)) throw new Error(`${input} must be a PNG or SVG file.`);
  const info = readAppInfo(root, pkg);
  const plan = newPlan(`app splash  ${path.basename(input)} on ${color}`);
  const installed = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...deps.map((d) => d.name),
  ]);
  const source = path.resolve(input);
  const inside = !path.relative(root, source).startsWith('..');

  if (info.expo) {
    let logo = `./${path.relative(root, source).split(path.sep).join('/')}`;
    if (!inside) {
      logo = './assets/splash-icon.png';
      plan.copies.push({ from: source, to: 'assets/splash-icon.png' });
    }
    if (!installed.has('expo-splash-screen')) {
      plan.commands.push({ command: 'npx', args: ['expo', 'install', 'expo-splash-screen'], cwd: root });
    }
    const options = { image: logo, backgroundColor: color, imageWidth: 200 };
    planExpo(
      plan,
      root,
      info.expo,
      (expo, set) => {
        const plugins = [...(expo.plugins ?? [])];
        const index = plugins.findIndex((p) => p === 'expo-splash-screen' || (Array.isArray(p) && p[0] === 'expo-splash-screen'));
        const old = index === -1 ? {} : (Array.isArray(plugins[index]) ? plugins[index][1] : {}) ?? {};
        const entry = ['expo-splash-screen', { ...old, ...options }];
        if (index === -1) plugins.push(entry);
        else plugins[index] = entry;
        set(expo, 'plugins', plugins, 'plugins: expo-splash-screen');
      },
      `add ["expo-splash-screen", ${JSON.stringify(options)}] to plugins.`,
    );
    if (info.expo.config?.splash) {
      plan.notes.push('The old "splash" key in app.json is replaced by the expo-splash-screen plugin: you can remove it.');
    }
    plan.notes.push("Expo Go shows its own splash screen: you only see yours in a development or release build.");
    return plan;
  }
  if (!info.android && !info.ios) throw noNativeFolders();

  const manager = packageManager(root, pkg);
  if (!installed.has('react-native-bootsplash')) {
    const install = installCommands({ manager, install: [{ name: 'react-native-bootsplash', dev: false }] });
    plan.commands.push(...install.map((c) => ({ ...c, cwd: root })));
  }
  const platforms = [info.android && 'android', info.ios && 'ios'].filter(Boolean).join(',');
  plan.commands.push({
    command: 'npx',
    args: [
      'react-native-bootsplash',
      'generate',
      inside ? path.relative(root, source) : source,
      `--background=${color}`,
      '--logo-width=100',
      '--assets-output=assets/bootsplash',
      `--platforms=${platforms}`,
    ],
    cwd: root,
  });
  const pods = info.ios ? podCommand(root, platform) : null;
  if (pods) plan.commands.push({ ...pods, optional: true });
  plan.notes.push(
    "react-native-bootsplash's generator makes the logo sizes and edits the native files: res/ and styles.xml on Android, " +
      'a BootSplash.storyboard and Info.plist on iOS. Three code changes are left; they are printed at the end.',
  );
  plan.next = bootsplashSteps(root, info, manager);
  plan.then.push(`Rebuild the app (${manager === 'npm' ? 'npm run' : manager} android / ios): a splash screen is native`);
  return plan;
}

// The code steps from react-native-bootsplash's README that the generator doesn't do.
function bootsplashSteps(root, info, manager) {
  const dir = iosAppDir(root);
  const sceneDelegate = dir && existsSync(path.join(dir, 'SceneDelegate.swift'));
  const steps = [];
  if (info.android) {
    steps.push(
      '1. Android: start the splash screen in MainActivity.kt. If onCreate is already there,',
      '   add only the RNBootSplash.init line, before super.onCreate:',
      '```',
      'import android.os.Bundle',
      'import com.zoontek.rnbootsplash.RNBootSplash',
      '',
      'class MainActivity : ReactActivity() {',
      '  override fun onCreate(savedInstanceState: Bundle?) {',
      '    RNBootSplash.init(this, R.style.BootTheme)',
      '    super.onCreate(savedInstanceState)',
      '  }',
      '}',
      '```',
    );
  }
  if (info.ios) {
    steps.push(
      sceneDelegate
        ? '2. iOS: in SceneDelegate.swift, add to the SceneDelegate class:'
        : '2. iOS: in AppDelegate.swift, add to the ReactNativeDelegate class:',
      '```',
      'import RNBootSplash',
      '',
      '  override func customize(_ rootView: RCTRootView) {',
      '    super.customize(rootView)',
      '    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)',
      '  }',
      '```',
    );
  }
  steps.push(
    '3. JS: hide it when your first screen is ready, e.g. in App.tsx:',
    '```',
    "import BootSplash from 'react-native-bootsplash';",
    '',
    'useEffect(() => {',
    '  BootSplash.hide({ fade: true });',
    '}, []);',
    '```',
    'With React Navigation, hide it in <NavigationContainer onReady={() => BootSplash.hide({ fade: true })}> instead.',
    '',
    `Then rebuild: ${manager === 'npm' ? 'npm run' : manager} android / ios. Docs: ${BOOTSPLASH_DOCS}`,
  );
  return steps.join('\n');
}

function checkImage(input, example) {
  if (!input) throw new Error(`Give the image, e.g. ${example}`);
  if (!existsSync(input)) throw new Error(`Can't find ${input}.`);
  return { png: readPngFile(input) };
}

// ---------------------------------------------------------------------------------------------
// Applying a plan

// `run(command, args, { cwd, quiet })` returns true on success; tests pass a fake one.
// Returns { failed: [command] } for optional commands (pod install) that failed.
export function applyAppPlan(root, plan, { run = runCommand } = {}) {
  const failed = [];
  for (const { from, to } of plan.copies) {
    mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
    copyFileSync(from, path.join(root, to));
  }
  for (const step of plan.commands) {
    if (run(step.command, step.args, { cwd: step.cwd ?? root })) continue;
    if (step.optional) failed.push(step);
    else throw new Error(`\`${[step.command, ...step.args].join(' ')}\` failed. Nothing after it was changed.`);
  }
  if (plan.resizes.length > 0) resizeAll(root, plan.resizes, run);
  for (const edit of plan.edits) {
    if (edit.status === 'apply') writeFileSync(path.join(root, edit.file), edit.content);
  }
  for (const move of plan.moves) {
    const target = path.join(root, move.to);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, move.content);
    unlinkSync(path.join(root, move.from));
    removeEmptyFolders(path.dirname(path.join(root, move.from)));
  }
  for (const file of plan.removes) rmSync(path.join(root, file), { force: true });
  return { failed };
}

// Every size is made in a temporary folder first, so a failing sips changes nothing.
function resizeAll(root, resizes, run) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'rn-buddy-icon-'));
  try {
    const made = new Map();
    for (const { input, size } of resizes) {
      if (made.has(size)) continue;
      const out = path.join(tmp, `${size}.png`);
      if (!run('sips', ['-z', String(size), String(size), input, '--out', out], { cwd: root, quiet: true }) || !existsSync(out)) {
        throw new Error(`sips couldn't resize the image to ${size}×${size}. Nothing was changed.`);
      }
      made.set(size, out);
    }
    for (const { size, file } of resizes) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      copyFileSync(made.get(size), path.join(root, file));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// After a package move: java/com/demo is empty now, and so may be java/com.
function removeEmptyFolders(dir) {
  while (existsSync(dir) && readdirSync(dir).length === 0 && !/^(java|kotlin)$/.test(path.basename(dir))) {
    rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function runCommand(command, args, { cwd, quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
