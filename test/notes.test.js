import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  categories,
  currentVersion,
  explainSettings,
  formatValue,
  importedFiles,
  lookupFile,
  lookupPackage,
  lookupPath,
  lookupSetting,
  parseAppJson,
  parseGradle,
  parsePlist,
  parseProperties,
  planOutdated,
  resolveImport,
  settingsKind,
  sourcePackages,
  updateKind,
} from '../src/lib/notes.js';
import { makeProject } from './helpers.js';

test('finds a package by exact name', () => {
  assert.equal(lookupPackage('react-native-screens').category, 'Navigation');
});

test('wildcard entries fill in {rest} everywhere', () => {
  const entry = lookupPackage('@react-native-community/cli-platform-ios');
  assert.equal(entry.note, 'Adds ios commands to the CLI (`npm run ios`)');
  assert.equal(lookupPackage('@types/react').note, 'TypeScript type definitions for react');
});

test('exact name wins over a matching wildcard', () => {
  assert.equal(lookupPackage('@react-native-community/cli').category, 'CLI & Native tooling');
  assert.match(lookupPackage('@react-native-community/cli').note, /react-native` command/);
});

test('unknown packages and files return null', () => {
  assert.equal(lookupPackage('some-unknown-package'), null);
  assert.equal(lookupFile('mystery.txt'), null);
});

test('finds file notes', () => {
  assert.match(lookupFile('Gemfile'), /CocoaPods/);
});

test('every package entry uses a known category', () => {
  const data = JSON.parse(readFileSync(new URL('../src/data/explain.json', import.meta.url), 'utf8'));
  for (const [name, entry] of Object.entries(data.packages)) {
    assert.ok(categories.includes(entry.category), `${name} has unknown category "${entry.category}"`);
    assert.ok(entry.note, `${name} has no note`);
  }
});

test('nested paths match whatever the app name is', () => {
  assert.match(lookupPath('android/app/src/main/java/com/demoapp/MainApplication.kt'), /Starts React Native/);
  assert.match(lookupPath('android/app/src/main/java/com/acme/shop/MainActivity.java'), /getMainComponentName/);
  assert.match(lookupPath('ios/ShopApp/AppDelegate.swift'), /Starts the app on iOS/);
  assert.match(lookupPath('ios/ShopApp/Info.plist'), /permission messages/);
  assert.match(lookupPath('ios/ShopApp.xcodeproj'), /open the \.xcworkspace instead/);
  assert.match(lookupPath('ios/ShopApp.xcworkspace/'), /Open this one in Xcode/);
  assert.match(lookupPath('ios/ShopAppTests'), /unit tests/);
  assert.match(lookupPath('android/app/src/main/res/mipmap-xxhdpi'), /Launcher icons/);
  assert.match(lookupPath('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png'), /launcher icon image/);
  assert.match(lookupPath('./src/screens'), /One component per screen/);
  assert.match(lookupPath('src/features/auth'), /One feature of the app/);
});

test('the most specific path note wins', () => {
  assert.match(lookupPath('ios/Pods'), /installed by `pod install`/);
  assert.match(lookupPath('ios/Podfile'), /CocoaPods/);
  assert.match(lookupPath('ios/.xcode.env.local'), /not committed/);
  assert.match(lookupPath('android/app/debug.keystore'), /debug signing key/);
  assert.match(lookupPath('android/app/release.keystore'), /backed up/);
  assert.equal(lookupPath('android/app/src/main/java/com/demoapp/Helpers.kt'), null);
});

test('Expo projects get their own notes for root files and app/ routes', () => {
  assert.match(lookupFile('app.json'), /used by the native projects/);
  assert.match(lookupFile('app.json', { expo: true }), /Expo config/);
  assert.match(lookupPath('ios', { expo: true }), /npx expo prebuild/);
  assert.match(lookupPath('eas.json'), /EAS Build/);
  assert.equal(lookupPath('app/_layout.tsx'), null);
  assert.match(lookupPath('app/_layout.tsx', { expo: true }), /Layout for the routes/);
  assert.match(lookupPath('app/(tabs)/_layout.tsx', { expo: true }), /Layout for the routes/);
  assert.match(lookupPath('app/(tabs)', { expo: true }), /route group/);
  assert.match(lookupPath('app/+not-found.tsx', { expo: true }), /doesn't exist/);
  assert.match(lookupPath('app/user/[id].tsx', { expo: true }), /dynamic route/);
  assert.match(lookupPath('app/(tabs)/explore.tsx', { expo: true }), /A screen/);
});

test('expo packages have notes, unknown expo-* modules get a generic one', () => {
  for (const name of ['expo', 'expo-router', 'expo-status-bar', 'expo-constants', 'expo-linking', 'expo-font', 'expo-splash-screen',
    'expo-image', 'expo-dev-client', 'expo-updates', 'expo-camera', 'expo-location', 'expo-notifications', 'expo-secure-store',
    'expo-haptics', 'expo-system-ui', 'expo-web-browser']) {
    assert.ok(lookupPackage(name) && !lookupPackage(name).note.includes('npx expo install expo-'), `${name} has no own note`);
  }
  assert.match(lookupPackage('expo-brightness').note, /npx expo install expo-brightness/);
});

test('packages the recipes install have notes', () => {
  for (const name of ['react-native-permissions', '@react-native-vector-icons/ionicons', 'react-native-svg-transformer',
    'react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler', 'react-native-mmkv',
    'react-native-nitro-modules', 'react-native-config', '@react-navigation/bottom-tabs', '@react-navigation/drawer',
    'babel-plugin-module-resolver', '@testing-library/react-native', 'react-native-asset', 'react-native-bootsplash']) {
    assert.ok(lookupPackage(name), `${name} has no note`);
  }
});

test('settingsKind knows which config files can be explained line by line', () => {
  assert.equal(settingsKind('android/gradle.properties'), 'gradle.properties');
  assert.equal(settingsKind('android/app/build.gradle'), 'build.gradle');
  assert.equal(settingsKind('android/build.gradle'), 'build.gradle');
  assert.equal(settingsKind('android/gradle/wrapper/gradle-wrapper.properties'), 'gradle-wrapper.properties');
  assert.equal(settingsKind('ios/DemoApp/Info.plist'), 'Info.plist');
  assert.equal(settingsKind('app.json'), 'app.json');
  assert.equal(settingsKind('src/app.json'), null);
  assert.equal(settingsKind('App.tsx'), null);
});

test('setting notes: exact keys and wildcards with {rest} in words', () => {
  assert.match(lookupSetting('gradle.properties', 'newArchEnabled'), /New Architecture/);
  assert.match(lookupSetting('Info.plist', 'NSPhotoLibraryUsageDescription'), /asks for photo library permission/);
  assert.match(lookupSetting('gradle.properties', 'MYAPP_UPLOAD_STORE_PASSWORD'), /keystore password/);
  assert.match(lookupSetting('gradle.properties', 'expo.useLegacyPackaging'), /Expo setting \(use legacy packaging\)/);
  assert.equal(lookupSetting('gradle.properties', 'somethingElse'), null);
});

test('parseProperties skips comments and keeps line numbers', () => {
  assert.deepEqual(parseProperties('# comment\n\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nnewArchEnabled = true\n'), [
    { key: 'org.gradle.jvmargs', value: '-Xmx2048m -Dfile.encoding=UTF-8', line: 3 },
    { key: 'newArchEnabled', value: 'true', line: 4 },
  ]);
});

test('parseGradle finds the known lines and their values', () => {
  const rows = parseGradle(
    [
      'buildscript {',
      '    ext {',
      '        minSdkVersion = 24',
      '        kotlinVersion = "2.1.20"',
      '    }',
      '    dependencies {',
      '        classpath("com.facebook.react:react-native-gradle-plugin")',
      '    }',
      '}',
      '// versionCode 3 in a comment',
      'apply plugin: "com.facebook.react.rootproject"',
    ].join('\n'),
  );
  assert.deepEqual(
    rows.map(({ key, value, line }) => [key, value, line]),
    [
      ['minSdkVersion', '24', 3],
      ['kotlinVersion', '"2.1.20"', 4],
      ['com.facebook.react:react-native-gradle-plugin', 'classpath("com.facebook.react:react-native-gradle-plugin")', 7],
      ['com.facebook.react.rootproject', 'apply plugin: "com.facebook.react.rootproject"', 11],
    ],
  );
});

test('parsePlist reads the top-level dict', () => {
  const plist = parsePlist(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Tom &amp; Jerry</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>UIAppFonts</key>
  <array><string>Inter.ttf</string></array>
  <key>Empty</key>
  <string></string>
  <key>Count</key>
  <integer>2</integer>
</dict>
</plist>`);
  assert.deepEqual(plist, {
    CFBundleDisplayName: 'Tom & Jerry',
    NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    UIAppFonts: ['Inter.ttf'],
    Empty: '',
    Count: 2,
  });
  assert.deepEqual(parsePlist('not a plist'), {});
});

test('parseAppJson opens objects only where there are notes inside', () => {
  const rows = parseAppJson(JSON.stringify({ expo: { name: 'A', splash: { image: './s.png' }, ios: { bundleIdentifier: 'com.a' } } }));
  assert.deepEqual(rows, [
    { key: 'expo.name', value: 'A' },
    { key: 'expo.splash', value: '{ image }' },
    { key: 'expo.ios.bundleIdentifier', value: 'com.a' },
  ]);
  assert.deepEqual(parseAppJson('{ broken'), []);
});

test('explainSettings adds notes, null for unknown keys', () => {
  const rows = explainSettings('gradle.properties', 'hermesEnabled=true\nfoo=bar\n');
  assert.match(rows[0].note, /Hermes/);
  assert.equal(rows[1].note, null);
});

test('formatValue keeps values short', () => {
  assert.equal(formatValue(['expo-router', ['expo-font', {}]]), '[expo-router, expo-font]');
  assert.equal(formatValue({ a: 1, b: 2 }), '{ a, b }');
  assert.equal(formatValue(''), '""');
  assert.equal(formatValue('x'.repeat(100)).length, 60);
});

test('importedFiles and sourcePackages split files from packages', () => {
  const content = [
    "import React from 'react';",
    "import Button from '../components/Button';",
    "import { colors } from '@/theme';",
    "export { api } from './api';",
    "const icon = require('~/assets/icon.png');",
    "import { Pressable } from 'react-native';",
  ].join('\n');
  assert.deepEqual(importedFiles(content), ['../components/Button', '@/theme', './api', '~/assets/icon.png']);
  assert.deepEqual(sourcePackages(content), ['react', 'react-native']);
});

test('resolveImport finds files, index files and @/ aliases', () => {
  const root = makeProject({
    'src/components/Button.tsx': '',
    'src/theme/index.ts': '',
    'src/screens/Home.tsx': '',
  });
  assert.equal(resolveImport(root, 'src/screens/Home.tsx', '../components/Button'), 'src/components/Button.tsx');
  assert.equal(resolveImport(root, 'src/screens/Home.tsx', '../theme'), 'src/theme/index.ts');
  assert.equal(resolveImport(root, 'src/screens/Home.tsx', '@/theme'), 'src/theme/index.ts');
  assert.equal(resolveImport(root, 'src/screens/Home.tsx', './Missing'), null);
});

test('currentVersion prefers the installed version, else the lowest the range allows', () => {
  assert.equal(currentVersion('^5.0.0', '5.0.3'), '5.0.3');
  assert.equal(currentVersion('^5.0.0', null), '5.0.0');
  assert.equal(currentVersion('~0.81.4', null), '0.81.4');
  assert.equal(currentVersion('*', null), null);
  assert.equal(currentVersion('github:user/repo', null), null);
});

test('updateKind: patch, minor, major, and 0.x minors count as major', () => {
  assert.equal(updateKind('1.2.3', '1.2.3'), 'current');
  assert.equal(updateKind('1.2.3', '1.2.4'), 'patch');
  assert.equal(updateKind('1.2.3', '1.4.0'), 'minor');
  assert.equal(updateKind('1.2.3', '2.0.0'), 'major');
  assert.equal(updateKind('0.80.1', '0.81.0'), 'major');
  assert.equal(updateKind('2.0.0', '1.9.0'), 'current');
  assert.equal(updateKind('nope', '1.0.0'), null);
});

test('planOutdated marks safe updates and points native/core packages to the right tool', () => {
  const deps = [
    { name: 'zustand', version: '^5.0.0', dev: false },
    { name: 'react-native', version: '0.80.0', dev: false },
    { name: 'react', version: '19.0.0', dev: false },
    { name: '@react-native/babel-preset', version: '0.80.0', dev: true },
    { name: 'react-native-mmkv', version: '^2.12.0', dev: false },
    { name: '@react-native-async-storage/async-storage', version: '^1.0.0', dev: false },
    { name: 'axios', version: '^0.30.0', dev: false },
    { name: 'left-pad', version: '1.3.0', dev: false },
    { name: 'private-lib', version: '1.0.0', dev: false },
  ];
  const latest = {
    zustand: '5.0.8',
    'react-native': '0.82.0',
    react: '19.1.0',
    '@react-native/babel-preset': '0.82.0',
    'react-native-mmkv': '3.3.0',
    '@react-native-async-storage/async-storage': '2.2.0',
    axios: '1.12.0',
    'left-pad': '1.3.0',
  };
  const rows = Object.fromEntries(
    planOutdated(deps, {
      installed: (name) => (name === 'zustand' ? '5.0.2' : null),
      latest,
      native: (name) => name === '@react-native-async-storage/async-storage',
    }).map((row) => [row.name, row]),
  );
  assert.deepEqual([rows.zustand.current, rows.zustand.kind, rows.zustand.safe, rows.zustand.advice], ['5.0.2', 'patch', true, 'safe to update']);
  assert.equal(rows['react-native'].safe, false);
  assert.match(rows['react-native'].hint, /rn-buddy upgrade/);
  assert.equal(rows.react.kind, 'minor');
  assert.equal(rows.react.safe, false);
  assert.match(rows['@react-native/babel-preset'].hint, /rn-buddy upgrade/);
  assert.match(rows['react-native-mmkv'].hint, /native changes/);
  assert.match(rows['@react-native-async-storage/async-storage'].hint, /native changes/);
  assert.equal(rows.axios.kind, 'major');
  assert.match(rows.axios.hint, /release notes/);
  assert.equal(rows['left-pad'].kind, 'current');
  assert.equal(rows['private-lib'].kind, null);
});

test('planOutdated in an Expo project sends SDK packages to npx expo install', () => {
  const deps = [
    { name: 'expo', version: '~53.0.0', dev: false },
    { name: 'expo-camera', version: '~16.1.0', dev: false },
    { name: 'react-native', version: '0.79.5', dev: false },
    { name: 'zustand', version: '^5.0.0', dev: false },
  ];
  const latest = { expo: '54.0.0', 'expo-camera': '17.0.0', 'react-native': '0.81.0', zustand: '5.1.0' };
  const [expo, camera, reactNative, zustand] = planOutdated(deps, { latest, expo: true });
  assert.match(expo.hint, /npx expo install expo@latest --fix/);
  assert.match(camera.hint, /npx expo install --check/);
  assert.match(reactNative.hint, /npx expo install --check/);
  assert.equal(zustand.safe, true);
});

test('every path and setting note is a non-empty string', () => {
  const data = JSON.parse(readFileSync(new URL('../src/data/explain.json', import.meta.url), 'utf8'));
  const notes = [data.files, data.expoFiles, data.paths, data.expoPaths, ...Object.values(data.settings)].flatMap(Object.entries);
  for (const [key, note] of notes) assert.ok(typeof note === 'string' && note.length > 0, `${key} has no note`);
});
