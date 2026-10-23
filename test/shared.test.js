import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { androidAppGradle, iosAppDir, infoPlist, mainActivity, pbxproj, xcworkspace } from '../src/lib/native.js';
import { isExpo } from '../src/lib/project.js';
import { importedPackages, lineOf, listSourceFiles } from '../src/lib/sources.js';
import { formatBytes, summarize } from '../src/lib/ui.js';
import { makeProject } from './helpers.js';

test('native: finds the template files whatever the app is called', () => {
  const root = makeProject({
    'android/app/build.gradle': '',
    'android/app/src/main/java/com/budget/MainActivity.kt': '',
    'android/app/build/generated/MainActivity.kt': '',
    'ios/Budget/Info.plist': '',
    'ios/BudgetTests/Info.plist': '',
    'ios/Budget.xcodeproj/project.pbxproj': '',
    'ios/Budget.xcworkspace/': '',
  });
  assert.equal(androidAppGradle(root), path.join(root, 'android/app/build.gradle'));
  assert.equal(mainActivity(root), path.join(root, 'android/app/src/main/java/com/budget/MainActivity.kt'));
  assert.equal(iosAppDir(root), path.join(root, 'ios/Budget'));
  assert.equal(infoPlist(root), path.join(root, 'ios/Budget/Info.plist'));
  assert.equal(pbxproj(root), path.join(root, 'ios/Budget.xcodeproj/project.pbxproj'));
  assert.equal(xcworkspace(root), path.join(root, 'ios/Budget.xcworkspace'));
});

test('native: returns null when the project has no native folders', () => {
  const root = makeProject({ 'package.json': {} });
  assert.equal(androidAppGradle(root), null);
  assert.equal(mainActivity(root), null);
  assert.equal(infoPlist(root), null);
  assert.equal(pbxproj(root), null);
});

test('sources: lists app code and skips native folders, tests and node_modules', () => {
  const root = makeProject({
    'App.tsx': '',
    'index.js': '',
    'src/screens/Home.tsx': '',
    'src/utils/format.ts': '',
    'src/types/env.d.ts': '',
    'src/screens/Home.test.tsx': '',
    'src/README.md': '',
    'app/_layout.tsx': '',
    'node_modules/x/index.js': '',
    'android/app/x.js': '',
  });
  assert.deepEqual(listSourceFiles(root).sort(), ['App.tsx', 'app/_layout.tsx', 'index.js', 'src/screens/Home.tsx', 'src/utils/format.ts']);
});

test('sources: finds imported packages, not relative files', () => {
  const code = `
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from '@react-native-vector-icons/ionicons/static';
import './polyfills';
import type { Props } from '../types';
const lodash = require('lodash/fp');
const Lazy = React.lazy(() => import('react-native-svg'));
`;
  assert.deepEqual(importedPackages(code), [
    'react',
    'react-native',
    '@react-navigation/native',
    '@react-native-vector-icons/ionicons',
    'lodash',
    'react-native-svg',
  ]);
});

test('sources: line numbers', () => {
  const code = 'a\nb\nfetch("http://localhost")';
  assert.equal(lineOf(code, code.indexOf('fetch')), 3);
});

test('project: detects Expo projects', () => {
  assert.equal(isExpo({ dependencies: { expo: '~54.0.0' } }), true);
  assert.equal(isExpo({ dependencies: { 'react-native': '0.81.0' } }), false);
});

test('ui: summary counts and sizes', () => {
  const rows = [{ status: 'ok' }, { status: 'ok' }, { status: 'warn' }, { status: 'fail' }];
  assert.match(summarize(rows), /2 ok .*1 to check .*1 to fix/);
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(250 * 1024 * 1024), '250 MB');
});
