import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { checkSource, countConsoleLogs, envFileFindings, isIgnored } from './check.js';
import {
  androidAppGradle,
  androidRes,
  gradleProperties,
  infoPlist,
  iosAppDir,
  pbxproj,
  podfile,
  readText,
  xcworkspace,
} from './native.js';
import { isExpo } from './project.js';
import { readSources } from './sources.js';

// `rn-buddy release`: the pre-release checklist (`release check`), the guided first
// Android release (`release android`) and the iOS checks (`release ios`).
// Rows are env-style: { name, status: 'ok' | 'warn' | 'fail' | 'skip', message, hint? }

export const SIGNING_DOCS = 'https://reactnative.dev/docs/signed-apk-android';
export const AAB_PATH = 'android/app/build/outputs/bundle/release/app-release.aab';
const PLACEHOLDER = 'CHANGE_ME';

// Runs a command. `interactive` hands the terminal to it (keytool asks for passwords,
// gradlew shows its progress). Returns { ok, missing, stdout }; tests pass a fake.
export function runCommand(command, args, { cwd, interactive = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: interactive ? 'inherit' : 'pipe',
    shell: process.platform === 'win32',
  });
  if (result.error) return { ok: false, missing: result.error.code === 'ENOENT', stdout: '' };
  return { ok: result.status === 0, missing: false, stdout: result.stdout ?? '' };
}

export function formatCommand({ command, args, cwd }, root) {
  const line = [command, ...args].join(' ');
  return cwd && cwd !== root ? `(cd ${path.relative(root, cwd)} && ${line})` : line;
}

// ---------------------------------------------------------------------------
// Project facts

// The Expo config from app.json ({} when there is none, or only app.config.js).
export function expoConfig(root) {
  try {
    const json = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
    return json.expo ?? json;
  } catch {
    return null;
  }
}

function buildSetting(root, name) {
  const match = readText(pbxproj(root))?.match(new RegExp(`\\b${name} = "?([^";]+)"?;`));
  return match?.[1] ?? null;
}

// The version users see, per platform: [{ label, version }]
export function appVersions(root, pkg) {
  const versions = [];
  const gradle = readText(androidAppGradle(root));
  const versionName = gradle?.match(/versionName\s*=?\s*["']([^"']+)["']/)?.[1];
  if (versionName) versions.push({ label: 'Android', version: versionName });
  const marketing = buildSetting(root, 'MARKETING_VERSION');
  if (marketing) versions.push({ label: 'iOS', version: marketing });
  if (versions.length === 0) {
    const expo = isExpo(pkg) ? expoConfig(root) : null;
    if (expo?.version) versions.push({ label: 'app.json', version: expo.version });
    else if (pkg.version) versions.push({ label: 'package.json', version: pkg.version });
  }
  return versions;
}

// ---------------------------------------------------------------------------
// release check

export function releaseCheckRows(project, { run = runCommand, sources = readSources(project.root) } = {}) {
  const { root, pkg } = project;
  const expoOnly = isExpo(pkg) && !existsSync(path.join(root, 'android')) && !existsSync(path.join(root, 'ios'));
  return [
    versionRow(project, run),
    ...(isExpo(pkg) ? expoConfigRows(root) : [bundleIdRow(root)]),
    iconRow(root, expoOnly),
    usageStringsRow(project, sources, expoOnly),
    urlRow(sources),
    secretsRow(root, sources),
    hermesRow(root, pkg),
    signingRow(root, pkg),
    consoleLogRow(sources),
  ].filter(Boolean);
}

export function versionRow({ root, pkg }, run = runCommand) {
  const name = 'Version';
  const result = run('git', ['describe', '--tags', '--abbrev=0'], { cwd: root });
  const tag = result.ok ? result.stdout.trim() : '';
  if (!tag) return { name, status: 'skip', message: 'no git tags yet, so nothing to compare with' };
  const tagged = semver.coerce(tag);
  if (!tagged) return { name, status: 'skip', message: `the last tag ${tag} is not a version number` };

  const versions = appVersions(root, pkg).filter((entry) => semver.coerce(entry.version));
  if (versions.length === 0) return { name, status: 'skip', message: 'no app version found' };
  const list = versions.map((entry) => `${entry.label} ${entry.version}`).join(', ');
  const stale = versions.filter((entry) => semver.lte(semver.coerce(entry.version), tagged));
  if (stale.length > 0) {
    return {
      name,
      status: 'warn',
      message: `${list}: not bumped since the last tag ${tag}`,
      hint: 'rn-buddy app version patch. The stores reject a build number they already have',
    };
  }
  return { name, status: 'ok', message: `${list}, newer than the last tag ${tag}` };
}

// The template's bundle ID; App Store Connect needs your own.
export function bundleIdRow(root) {
  const id = buildSetting(root, 'PRODUCT_BUNDLE_IDENTIFIER');
  if (!id) return null;
  if (id.startsWith('org.reactjs.native.example')) {
    return {
      name: 'Bundle ID',
      status: 'fail',
      message: `iOS still uses the template ID ${id.replace(/\$\([^)]*\)/, '<AppName>')}`,
      hint: 'rn-buddy app id com.yourname.app. You can never change it once the app is in the App Store',
    };
  }
  return { name: 'Bundle ID', status: 'ok', message: id };
}

// EAS Build needs these in app.json (it asks for them otherwise).
export function expoConfigRows(root) {
  const config = expoConfig(root);
  if (!config) {
    const dynamic = ['app.config.ts', 'app.config.js'].find((file) => existsSync(path.join(root, file)));
    return dynamic
      ? [{ name: 'Expo config', status: 'skip', message: `${dynamic}: check ios.bundleIdentifier, android.package and version by hand` }]
      : [];
  }
  const missing = [
    !config.ios?.bundleIdentifier && 'ios.bundleIdentifier',
    !config.android?.package && 'android.package',
    !config.version && 'version',
  ].filter(Boolean);
  if (missing.length > 0) {
    return [
      {
        name: 'Expo config',
        status: 'warn',
        message: `app.json has no ${missing.join(', ')}`,
        hint: 'Set them in app.json (e.g. "ios": { "bundleIdentifier": "com.yourname.app" }), then npx eas-cli build',
      },
    ];
  }
  return [
    {
      name: 'Expo config',
      status: 'ok',
      message: `${config.ios.bundleIdentifier} · ${config.android.package} · ${config.version}`,
      hint: 'Build for the stores with npx eas-cli build --platform all',
    },
  ];
}

// SHA-1 of the launcher icons the React Native template ships (unchanged for many versions).
const TEMPLATE_ICONS = new Set([
  'db390841db6f957a841d24d5395bb0050d7c688b',
  '51bb62e7e3e25e2b4497c269b4ee9cb19692c98a',
  'ca824b1bc429582b3814e6bacfdbbd00fdb929f5',
  'cb7670e36f2b0743742f2d650fd9355c745095cc',
  '1a2178504072be1ebf305b98d597c299c4827725',
  '8b1be88dcb4c72de1951f2312234396d23aa06af',
  '82235d26102795c82e23d0aa59c2074009449bcd',
  'ea10093f00fc43f87fd91a5a40693fe7d5abd4c0',
  'd3e63b530ad9354fff71a89829f36ee15e13c1c1',
  '8a2b5e5fca0ded629d094c21376434457a7f3883',
]);

// null when there's no iOS app folder; otherwise whether the AppIcon set has any image.
export function hasIosIcon(root) {
  const dir = iosAppDir(root);
  if (!dir) return null;
  const set = path.join(dir, 'Images.xcassets', 'AppIcon.appiconset');
  return existsSync(set) && readdirSync(set).some((file) => /\.png$/i.test(file));
}

// null without Android res/; true when every ic_launcher.png is the template's.
export function androidTemplateIcon(root, templateHashes = TEMPLATE_ICONS) {
  const res = androidRes(root);
  if (!res) return null;
  const icons = readdirSync(res)
    .filter((dir) => dir.startsWith('mipmap-'))
    .flatMap((dir) => ['ic_launcher.png', 'ic_launcher_round.png'].map((file) => path.join(res, dir, file)))
    .filter((file) => existsSync(file));
  if (icons.length === 0) return null;
  return icons.every((file) => templateHashes.has(createHash('sha1').update(readFileSync(file)).digest('hex')));
}

export function iconRow(root, expoOnly = false) {
  const name = 'App icon';
  const hint = 'rn-buddy app icon ./icon.png (one 1024×1024 PNG makes every size)';
  if (expoOnly) {
    const icon = expoConfig(root)?.icon;
    return icon
      ? { name, status: 'ok', message: `${icon} (app.json)` }
      : { name, status: 'warn', message: 'no "icon" in app.json', hint: 'Add "icon": "./assets/icon.png" (1024×1024) to app.json' };
  }
  const ios = hasIosIcon(root);
  const android = androidTemplateIcon(root);
  if (ios === null && android === null) return { name, status: 'skip', message: 'no android/ or ios/ folder' };
  const problems = [
    ios === false && 'iOS has none, so App Store Connect rejects the upload',
    android === true && 'Android still has the React Native template icon',
  ].filter(Boolean);
  if (problems.length === 0) return { name, status: 'ok', message: 'set' };
  return { name, status: ios === false ? 'fail' : 'warn', message: problems.join('; '), hint };
}

// iOS kills the app when it asks for a permission without a usage string, and App Review
// rejects builds that link those APIs without one. Package → Info.plist keys it needs.
export const USAGE_KEYS = {
  'react-native-vision-camera': ['NSCameraUsageDescription'],
  'react-native-camera': ['NSCameraUsageDescription'],
  'expo-camera': ['NSCameraUsageDescription'],
  'react-native-image-picker': ['NSPhotoLibraryUsageDescription'],
  'react-native-image-crop-picker': ['NSPhotoLibraryUsageDescription'],
  'expo-image-picker': ['NSPhotoLibraryUsageDescription'],
  '@react-native-camera-roll/camera-roll': ['NSPhotoLibraryUsageDescription'],
  'expo-media-library': ['NSPhotoLibraryUsageDescription'],
  '@react-native-community/geolocation': ['NSLocationWhenInUseUsageDescription'],
  'react-native-geolocation-service': ['NSLocationWhenInUseUsageDescription'],
  'expo-location': ['NSLocationWhenInUseUsageDescription'],
  'react-native-contacts': ['NSContactsUsageDescription'],
  'expo-contacts': ['NSContactsUsageDescription'],
  '@react-native-voice/voice': ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'],
  'react-native-audio-recorder-player': ['NSMicrophoneUsageDescription'],
  'react-native-ble-plx': ['NSBluetoothAlwaysUsageDescription'],
  'react-native-ble-manager': ['NSBluetoothAlwaysUsageDescription'],
  'react-native-biometrics': ['NSFaceIDUsageDescription'],
  'expo-local-authentication': ['NSFaceIDUsageDescription'],
  'react-native-tracking-transparency': ['NSUserTrackingUsageDescription'],
  'expo-tracking-transparency': ['NSUserTrackingUsageDescription'],
};

// Some packages only need a key when the code uses a feature: [package, code pattern, key].
const USAGE_BY_CODE = [
  ['react-native-image-picker', /\blaunchCamera\b/, 'NSCameraUsageDescription'],
  ['react-native-image-crop-picker', /\bopenCamera\b/, 'NSCameraUsageDescription'],
  ['react-native-maps', /\bshowsUserLocation\b/, 'NSLocationWhenInUseUsageDescription'],
];

// react-native-permissions: PERMISSIONS.IOS.<NAME> in the code.
const PERMISSIONS_IOS = {
  CAMERA: 'NSCameraUsageDescription',
  PHOTO_LIBRARY: 'NSPhotoLibraryUsageDescription',
  PHOTO_LIBRARY_ADD_ONLY: 'NSPhotoLibraryAddUsageDescription',
  MICROPHONE: 'NSMicrophoneUsageDescription',
  LOCATION_WHEN_IN_USE: 'NSLocationWhenInUseUsageDescription',
  LOCATION_ALWAYS: 'NSLocationAlwaysAndWhenInUseUsageDescription',
  CONTACTS: 'NSContactsUsageDescription',
  CALENDARS: 'NSCalendarsFullAccessUsageDescription',
  CALENDARS_WRITE_ONLY: 'NSCalendarsWriteOnlyAccessUsageDescription',
  REMINDERS: 'NSRemindersFullAccessUsageDescription',
  BLUETOOTH: 'NSBluetoothAlwaysUsageDescription',
  FACE_ID: 'NSFaceIDUsageDescription',
  MEDIA_LIBRARY: 'NSAppleMusicUsageDescription',
  MOTION: 'NSMotionUsageDescription',
  SPEECH_RECOGNITION: 'NSSpeechRecognitionUsageDescription',
  APP_TRACKING_TRANSPARENCY: 'NSUserTrackingUsageDescription',
  SIRI: 'NSSiriUsageDescription',
};

// The Info.plist keys this app needs: Map key → [the packages or code that need it].
export function requiredUsageKeys({ deps }, sources) {
  const needed = new Map();
  const need = (key, reason) => needed.set(key, [...new Set([...(needed.get(key) ?? []), reason])]);
  const names = new Set(deps.filter((dep) => !dep.dev).map((dep) => dep.name));
  const code = sources.map((source) => source.content).join('\n');
  for (const name of names) for (const key of USAGE_KEYS[name] ?? []) need(key, name);
  for (const [name, pattern, key] of USAGE_BY_CODE) if (names.has(name) && pattern.test(code)) need(key, name);
  if (names.has('react-native-permissions')) {
    for (const [, permission] of code.matchAll(/PERMISSIONS\.IOS\.([A-Z_]+)/g)) {
      if (PERMISSIONS_IOS[permission]) need(PERMISSIONS_IOS[permission], `PERMISSIONS.IOS.${permission}`);
    }
  }
  return needed;
}

// A key counts only with a non-empty string: the template ships an empty NSLocationWhenInUseUsageDescription.
export function plistString(plist, key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1].trim() || null;
}

export function usageStringsRow(project, sources, expoOnly = false) {
  const name = 'iOS usage strings';
  const needed = requiredUsageKeys(project, sources);
  if (needed.size === 0) return { name, status: 'ok', message: 'no packages that need permissions' };
  if (expoOnly) {
    return {
      name,
      status: 'ok',
      message: `${[...needed.keys()].join(', ')} come from the config plugins`,
      hint: 'Write your own reason in app.json (each plugin has a permission message option): App Review reads them',
    };
  }
  const file = infoPlist(project.root);
  if (!file) return { name, status: 'skip', message: 'no ios/ Info.plist found' };
  const plist = readFileSync(file, 'utf8');
  const missing = [...needed].filter(([key]) => !plistString(plist, key));
  if (missing.length === 0) return { name, status: 'ok', message: `${[...needed.keys()].join(', ')} set` };
  return {
    name,
    status: 'fail',
    message: `Info.plist is missing ${missing.map(([key, reasons]) => `${key} (${reasons.join(', ')})`).join(', ')}`,
    hint: `Add each key to ${path.relative(project.root, file)} with a sentence saying why. Without it iOS kills the app when it asks, and App Review rejects the build`,
  };
}

export function urlRow(sources) {
  const findings = sources.flatMap((source) => checkSource(source, ['localhost-url', 'cleartext-url']));
  const local = findings.filter((finding) => finding.rule === 'localhost-url');
  const where = (list) => list.slice(0, 3).map((f) => `${f.file}:${f.line}`).join(', ') + (list.length > 3 ? ` +${list.length - 3} more` : '');
  if (local.length > 0) {
    return {
      name: 'URLs',
      status: 'fail',
      message: `localhost URL${local.length === 1 ? '' : 's'} in ${where(local)}`,
      hint: 'localhost on a phone is the phone itself: point the release build at your real server. rn-buddy check shows each one',
    };
  }
  if (findings.length > 0) {
    return {
      name: 'URLs',
      status: 'warn',
      message: `plain http:// in ${where(findings)}`,
      hint: 'Release builds block cleartext HTTP on Android and iOS: use https',
    };
  }
  return { name: 'URLs', status: 'ok', message: 'no localhost or plain http:// URLs' };
}

export function secretsRow(root, sources) {
  const findings = [...sources.flatMap((source) => checkSource(source, ['secrets'])), ...envFileFindings(root)];
  if (findings.length === 0) return { name: 'Secrets', status: 'ok', message: 'nothing that looks like a key or token' };
  const failing = findings.some((finding) => finding.level === 'fail');
  const places = findings.map((f) => (f.line ? `${f.file}:${f.line}` : f.file));
  return {
    name: 'Secrets',
    status: failing ? 'fail' : 'warn',
    message: `${findings.length === 1 ? findings[0].message : `${findings.length} possible secrets`} (${places.slice(0, 3).join(', ')})`,
    hint: 'Everything in your JS ships inside the app and can be read by anyone. rn-buddy check shows each one',
  };
}

export function hermesRow(root, pkg) {
  const name = 'Hermes';
  const off = [];
  if (/^\s*hermesEnabled\s*=\s*false/m.test(readText(gradleProperties(root)) ?? '')) off.push('android/gradle.properties');
  if (/:hermes_enabled\s*=>\s*false/.test(readText(podfile(root)) ?? '')) off.push('ios/Podfile');
  if (isExpo(pkg) && expoConfig(root)?.jsEngine === 'jsc') off.push('app.json');
  if (off.length > 0) {
    return {
      name,
      status: 'warn',
      message: `turned off in ${off.join(', ')}`,
      hint: 'Hermes starts the app faster and uses less memory. Turn it back on unless you have a reason',
    };
  }
  return { name, status: 'ok', message: 'on (the default)' };
}

export function signingRow(root, pkg) {
  const name = 'Android signing';
  const file = androidAppGradle(root);
  if (!file) {
    return isExpo(pkg)
      ? { name, status: 'ok', message: 'EAS Build creates and keeps the keystore for you' }
      : { name, status: 'skip', message: 'no android/ folder' };
  }
  const state = signingState(readFileSync(file, 'utf8'));
  if (state === 'release') return { name, status: 'ok', message: 'release builds use your upload key' };
  if (state === 'debug') {
    return {
      name,
      status: 'fail',
      message: 'release builds are signed with the debug key: Google Play rejects them',
      hint: 'rn-buddy release android sets up an upload key',
    };
  }
  return { name, status: 'skip', message: `can't tell from ${path.basename(file)}: check buildTypes.release.signingConfig by hand` };
}

export function consoleLogRow(sources) {
  const { count, files } = countConsoleLogs(sources);
  if (count === 0) return { name: 'console.log', status: 'ok', message: 'none' };
  return {
    name: 'console.log',
    status: 'warn',
    message: `${count} call${count === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`,
    hint: 'They still run in the release build and slow it down. Remove them, or strip them with babel-plugin-transform-remove-console',
  };
}

// ---------------------------------------------------------------------------
// release android

// Names for the keystore and the Gradle properties, from the app name:
// "ReactNativeDemo" → reactnativedemo-upload.keystore, REACTNATIVEDEMO_UPLOAD_STORE_FILE.
// The prefix is per app, so two apps can share ~/.gradle/gradle.properties.
export function releaseNames({ root, pkg }) {
  const base = (pkg.name ?? path.basename(root)).replace(/^@[^/]+\//, '');
  let slug = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) slug = 'app';
  const prefix = (/^\d/.test(slug) ? `APP${slug}` : slug).toUpperCase();
  return { slug, prefix, keystore: `${slug}-upload.keystore`, alias: `${slug}-upload` };
}

// keytool comes with the JDK. Gradle uses JAVA_HOME, so prefer its keytool.
export function keytoolCommand(root, names, env = process.env) {
  return {
    command: env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', 'keytool') : 'keytool',
    args: [
      '-genkeypair',
      '-v',
      '-storetype',
      'PKCS12',
      '-keystore',
      `android/app/${names.keystore}`,
      '-alias',
      names.alias,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
    ],
    cwd: root,
  };
}

// Gradle reads ~/.gradle/gradle.properties, or the one in GRADLE_USER_HOME when that is set.
export function gradleUserHome(env = process.env, home = os.homedir()) {
  return env.GRADLE_USER_HOME || path.join(home, '.gradle');
}

// The lines for ~/.gradle/gradle.properties. Passwords stay placeholders: the user types
// them into the file, so they never pass through rn-buddy or end up in the project.
export function planGradleProperties({ pkg }, names, gradleHome = gradleUserHome()) {
  const file = path.join(gradleHome, 'gradle.properties');
  const existing = readText(file) ?? '';
  const wanted = [
    [`${names.prefix}_UPLOAD_STORE_FILE`, names.keystore],
    [`${names.prefix}_UPLOAD_KEY_ALIAS`, names.alias],
    [`${names.prefix}_UPLOAD_STORE_PASSWORD`, PLACEHOLDER],
    [`${names.prefix}_UPLOAD_KEY_PASSWORD`, PLACEHOLDER],
  ];
  const missing = wanted.filter(([key]) => !new RegExp(`^\\s*${key}\\s*=`, 'm').test(existing));
  if (missing.length === 0) return { file, status: 'done', lines: [] };
  const lines = [
    `# rn-buddy: release signing for ${pkg.name ?? names.slug} (android/app/${names.keystore})`,
    ...missing.map(([key, value]) => `${key}=${value}`),
  ];
  const separator = existing === '' || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return { file, status: 'apply', lines, content: `${existing}${separator}${lines.join('\n')}\n` };
}

// Whether both passwords in ~/.gradle/gradle.properties have been filled in.
export function passwordsFilled(names, gradleHome = gradleUserHome()) {
  const content = readText(path.join(gradleHome, 'gradle.properties')) ?? '';
  return ['STORE_PASSWORD', 'KEY_PASSWORD'].every((key) => {
    const value = content.match(new RegExp(`^\\s*${names.prefix}_UPLOAD_${key}\\s*=(.*)$`, 'm'))?.[1].trim();
    return Boolean(value) && value !== PLACEHOLDER;
  });
}

// The block that starts at `pattern` (which ends with "{"), as { start, open, close }:
// `open` is the index after "{", `close` the index of the matching "}".
function block(text, pattern, from = 0) {
  const regex = new RegExp(pattern.source, 'g');
  regex.lastIndex = from;
  const match = regex.exec(text);
  if (!match) return null;
  let depth = 1;
  for (let i = match.index + match[0].length; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && --depth === 0) return { start: match.index, open: match.index + match[0].length, close: i };
  }
  return null;
}

// 'release' when release builds use signingConfigs.release, 'debug' when they use the debug
// key (the template), null when the file looks different.
export function signingState(gradle) {
  const types = block(gradle, /\bbuildTypes\s*\{/);
  const release = types && block(gradle.slice(0, types.close), /\brelease\s*\{/, types.open);
  if (!release) return null;
  const body = gradle.slice(release.open, release.close);
  if (/signingConfig\s*=?\s*signingConfigs\.release\b/.test(body)) return 'release';
  if (/signingConfig\s*=?\s*signingConfigs\.debug\b/.test(body)) return 'debug';
  return null;
}

export function signingSnippet(prefix, indent = '        ') {
  const inner = `${indent}    `;
  return [
    `${indent}release {`,
    `${inner}if (project.hasProperty('${prefix}_UPLOAD_STORE_FILE')) {`,
    `${inner}    storeFile file(${prefix}_UPLOAD_STORE_FILE)`,
    `${inner}    storePassword ${prefix}_UPLOAD_STORE_PASSWORD`,
    `${inner}    keyAlias ${prefix}_UPLOAD_KEY_ALIAS`,
    `${inner}    keyPassword ${prefix}_UPLOAD_KEY_PASSWORD`,
    `${inner}}`,
    `${indent}}`,
  ].join('\n');
}

// Adds signingConfigs.release and points buildTypes.release at it, the way the React Native
// docs do. Returns the same content when already done, and null when the file doesn't look
// like the template (the user then edits it by hand).
export function addReleaseSigning(gradle, prefix) {
  if (signingState(gradle) === 'release') return gradle;
  if (signingState(gradle) !== 'debug') return null;
  const configs = block(gradle, /\bsigningConfigs\s*\{/);
  if (!configs || /\brelease\s*\{/.test(gradle.slice(configs.open, configs.close))) return null;

  // 1. buildTypes.release: sign with the release config, and drop the template's "Caution!" comment.
  const types = block(gradle, /\bbuildTypes\s*\{/);
  const release = block(gradle.slice(0, types.close), /\brelease\s*\{/, types.open);
  const body = gradle
    .slice(release.open, release.close)
    .replace(/[ \t]*\/\/ Caution! In production[^\n]*\n[ \t]*\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.?[^\n]*\n/, '')
    .replace(/signingConfig(\s*=?\s*)signingConfigs\.debug\b/, 'signingConfig$1signingConfigs.release');
  let content = gradle.slice(0, release.open) + body + gradle.slice(release.close);

  // 2. signingConfigs: add release after debug, with the same indentation.
  const updated = block(content, /\bsigningConfigs\s*\{/);
  const indent = content.slice(updated.open, updated.close).match(/\n([ \t]*)debug\s*\{/)?.[1] ?? '        ';
  const before = content.slice(0, updated.close).replace(/[ \t]*$/, '');
  const closingIndent = content.slice(0, updated.close).match(/[ \t]*$/)[0];
  content = `${before}${signingSnippet(prefix, indent)}\n${closingIndent}${content.slice(updated.close)}`;
  return content;
}

// What `release android` will do: [{ id, description, status: 'apply' | 'done' | 'manual', ... }]
export function planAndroidRelease(project, { env = process.env, gradleHome = gradleUserHome(env) } = {}) {
  const { root } = project;
  const names = releaseNames(project);
  const keystorePath = path.join(root, 'android', 'app', names.keystore);
  const gradleFile = androidAppGradle(root);
  const steps = [];

  steps.push({
    id: 'keystore',
    file: path.relative(root, keystorePath),
    description: 'create your upload key (keytool asks for a password and your name)',
    status: existsSync(keystorePath) ? 'done' : 'apply',
    command: keytoolCommand(root, names, env),
  });

  const props = planGradleProperties(project, names, gradleHome);
  steps.push({
    id: 'properties',
    file: props.file,
    description: 'keystore name and alias; you fill in the passwords (kept out of the project)',
    ...props,
  });

  const gradle = gradleFile ? readFileSync(gradleFile, 'utf8') : null;
  const signed = gradle && !gradleFile.endsWith('.kts') ? addReleaseSigning(gradle, names.prefix) : null;
  steps.push({
    id: 'gradle',
    file: gradleFile ? path.relative(root, gradleFile) : 'android/app/build.gradle',
    description: 'sign release builds with the upload key instead of the debug key',
    status: signed === null ? 'manual' : signed === gradle ? 'done' : 'apply',
    content: signed,
    manual: `Add to signingConfigs { } in android/app/build.gradle:\n${signingSnippet(names.prefix, '    ')}\nand set signingConfig signingConfigs.release in buildTypes { release { } }. See ${SIGNING_DOCS}`,
  });

  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = readText(gitignorePath);
  const ignored = gitignore !== null && isIgnored(gitignore, `android/app/${names.keystore}`);
  steps.push({
    id: 'gitignore',
    file: '.gitignore',
    description: 'never commit the keystore',
    status: ignored ? 'done' : 'apply',
    content: ignored
      ? null
      : `${gitignore ?? ''}${gitignore && !gitignore.endsWith('\n') ? '\n' : ''}${gitignore ? '\n' : ''}# Release keystore: keep it out of git\n*.keystore\n!debug.keystore\n`,
  });

  return { names, steps, keystorePath, gradleHome };
}

// Runs keytool first: if it fails or is cancelled, nothing else changes.
export function applyAndroidRelease(project, plan, { run = runCommand } = {}) {
  const { root } = project;
  for (const step of plan.steps.filter((s) => s.status === 'apply')) {
    if (step.id === 'keystore') {
      const result = run(step.command.command, step.command.args, { cwd: root, interactive: true });
      if (result.missing) {
        throw new Error('keytool was not found. It comes with the JDK: install JDK 17 and set JAVA_HOME (rn-buddy env checks it).');
      }
      if (!result.ok || !existsSync(plan.keystorePath)) {
        throw new Error('keytool did not create the keystore. Nothing else was changed.');
      }
    } else {
      const target = path.isAbsolute(step.file) ? step.file : path.join(root, step.file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, step.content);
    }
  }
}

export function buildCommand(root, platform = process.platform) {
  return {
    command: platform === 'win32' ? 'gradlew.bat' : './gradlew',
    args: ['bundleRelease'],
    cwd: path.join(root, 'android'),
  };
}

// ---------------------------------------------------------------------------
// release ios

export function iosReleaseRows(project, { run = runCommand, platform = process.platform, sources = readSources(project.root) } = {}) {
  const { root } = project;
  const rows = [];
  if (platform !== 'darwin') {
    rows.push({ name: 'Xcode', status: 'fail', message: 'iOS release builds need a Mac with Xcode', hint: 'Or build in the cloud with EAS Build' });
  } else {
    const xcode = run('xcodebuild', ['-version'], { cwd: root });
    rows.push(
      xcode.ok
        ? { name: 'Xcode', status: 'ok', message: xcode.stdout.split('\n')[0].trim() }
        : { name: 'Xcode', status: 'fail', message: 'not found', hint: 'Install Xcode from the Mac App Store, then run xcode-select -s /Applications/Xcode.app' },
    );
  }

  const workspace = xcworkspace(root);
  rows.push(
    workspace
      ? { name: 'Workspace', status: 'ok', message: path.relative(root, workspace) }
      : { name: 'Workspace', status: 'warn', message: 'no .xcworkspace yet', hint: 'Run (cd ios && bundle exec pod install) first' },
  );

  const bundle = bundleIdRow(root);
  if (bundle) rows.push(bundle);

  const team = buildSetting(root, 'DEVELOPMENT_TEAM');
  rows.push(
    team
      ? { name: 'Team', status: 'ok', message: team }
      : { name: 'Team', status: 'warn', message: 'no signing team set yet', hint: 'Set it in Xcode: Signing & Capabilities → Team (step 2 below)' },
  );

  const version = buildSetting(root, 'MARKETING_VERSION');
  const build = buildSetting(root, 'CURRENT_PROJECT_VERSION');
  if (version || build) {
    rows.push({
      name: 'Version',
      status: 'ok',
      message: `${version ?? '?'} (build ${build ?? '?'})`,
      hint: 'Every upload needs a new build number: rn-buddy app version patch',
    });
  }

  const icon = hasIosIcon(root);
  if (icon !== null) {
    rows.push(
      icon
        ? { name: 'App icon', status: 'ok', message: 'set' }
        : { name: 'App icon', status: 'fail', message: 'none: App Store Connect rejects the upload', hint: 'rn-buddy app icon ./icon.png' },
    );
  }
  rows.push(usageStringsRow(project, sources));
  return rows;
}
