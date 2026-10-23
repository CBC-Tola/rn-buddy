import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDiff } from '../src/lib/diff.js';
import {
  applyExpo,
  applyUpgrade,
  checkLibraries,
  describeChange,
  libraryRow,
  mapDiff,
  mapPath,
  mapText,
  nextMinorAdvice,
  packageJsonChanges,
  planExpo,
  planFiles,
  planPackages,
  planUpgrade,
  projectNames,
  resolveVersion,
  templateVersion,
  updatePackageJson,
} from '../src/lib/upgrade.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

const versions = (list) => Object.fromEntries(list.map((version) => [version, {}]));

const RN_PACKUMENT = {
  'dist-tags': { latest: '0.88.1', next: '0.89.0-rc.1' },
  versions: versions(['0.85.0', '0.85.3', '0.86.0', '0.86.3', '0.87.0', '0.87.1', '0.88.0', '0.88.1', '0.89.0-rc.1']),
};
const EXPO_PACKUMENT = {
  'dist-tags': { latest: '55.0.4' },
  versions: versions(['52.0.40', '53.0.0', '53.0.20', '54.0.0', '54.0.12', '55.0.0', '55.0.4']),
};
const RELEASES = ['0.88.0', '0.87.1', '0.87.0', '0.86.0', '0.85.0'];

// What rn-diff-purge publishes for 0.87.1..0.88.0, cut down to the interesting parts.
const DIFF = `diff --git a/RnDiffApp/App.tsx b/RnDiffApp/App.tsx
index 1111111111..2222222222 100644
--- a/RnDiffApp/App.tsx
+++ b/RnDiffApp/App.tsx
@@ -1,3 +1,3 @@
 import { NewAppScreen } from '@react-native/new-app-screen';
-import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
+import { StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
 import {
diff --git a/RnDiffApp/android/app/build.gradle b/RnDiffApp/android/app/build.gradle
index f7c3220de8..2594ac4043 100644
--- a/RnDiffApp/android/app/build.gradle
+++ b/RnDiffApp/android/app/build.gradle
@@ -80,7 +80,8 @@ android {
         applicationId "com.rndiffapp"
         minSdkVersion rootProject.ext.minSdkVersion
         targetSdkVersion rootProject.ext.targetSdkVersion
         versionCode 1
         versionName "1.0"
+        buildConfigField "boolean", "IS_NEW_ARCH", "true"
     }

diff --git a/RnDiffApp/android/app/src/main/java/com/rndiffapp/MainApplication.kt b/RnDiffApp/android/app/src/main/java/com/rndiffapp/MainApplication.kt
index 3333333333..4444444444 100644
--- a/RnDiffApp/android/app/src/main/java/com/rndiffapp/MainApplication.kt
+++ b/RnDiffApp/android/app/src/main/java/com/rndiffapp/MainApplication.kt
@@ -1,6 +1,7 @@
 package com.rndiffapp

 import android.app.Application
+import com.facebook.react.common.ReleaseLevel
 import com.facebook.react.PackageList
 import com.facebook.react.ReactApplication
 import com.facebook.react.ReactHost
diff --git a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar
index 8bdaf60c75ab801e22807dde59e12a8735a34077..61285a659d17295f1de7c53e24fdf13ad755c379 100644
GIT binary patch
delta 36855
zcmXVWV|bkZ_jDR#W81c!G\`4NqPNQwKF*ml&#<uOo+1O5#wn_W%_xC(6KJV}Anz_%+

diff --git a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
index 2a84e188b8..37f78a6af8 100644
--- a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
+++ b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
@@ -1,6 +1,6 @@
 distributionBase=GRADLE_USER_HOME
 distributionPath=wrapper/dists
-distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip
+distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip
 networkTimeout=10000
 validateDistributionUrl=true
 zipStoreBase=GRADLE_USER_HOME
diff --git a/RnDiffApp/ios/RnDiffApp/AppDelegate.swift b/RnDiffApp/ios/RnDiffApp/AppDelegate.swift
index 9f18a6865c..0d14d1b0ac 100644
--- a/RnDiffApp/ios/RnDiffApp/AppDelegate.swift
+++ b/RnDiffApp/ios/RnDiffApp/AppDelegate.swift
@@ -26,7 +26,8 @@ class AppDelegate: UIResponder, UIApplicationDelegate {
     factory.startReactNative(
       withModuleName: "RnDiffApp",
       in: window,
-      launchOptions: launchOptions
+      launchOptions: launchOptions,
+      initialProperties: nil
     )

     return true
diff --git a/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift b/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift
new file mode 100644
index 0000000000..ab19528eac
--- /dev/null
+++ b/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift
@@ -0,0 +1,4 @@
+import UIKit
+
+// Starts "RnDiffApp" in a window scene.
+class SceneDelegate: UIResponder, UIWindowSceneDelegate {}
diff --git a/RnDiffApp/package.json b/RnDiffApp/package.json
index 14373a091b..7f53c531b2 100644
--- a/RnDiffApp/package.json
+++ b/RnDiffApp/package.json
@@ -10,9 +10,9 @@
     "test": "jest"
   },
   "dependencies": {
-    "react": "19.2.3",
-    "react-native": "0.87.1",
-    "@react-native/new-app-screen": "0.87.1",
+    "react": "19.3.0",
+    "react-native": "0.88.0",
+    "@react-native/new-app-screen": "0.88.0",
     "react-native-safe-area-context": "^5.5.2"
   },
   "devDependencies": {
@@ -20,10 +20,11 @@
     "@babel/core": "^7.25.2",
-    "@react-native-community/cli": "20.1.0",
-    "@react-native/babel-preset": "0.87.1",
-    "@react-native/metro-config": "0.87.1",
+    "@react-native-community/cli": "20.2.0",
+    "@react-native/babel-preset": "0.88.0",
+    "@react-native/jest-preset": "0.88.0",
+    "@react-native/metro-config": "0.88.0",
     "prettier": "2.8.8",
-    "typescript": "^5.8.3"
+    "typescript": "^6.0.3"
   },
   "engines": {
-    "node": ">=20"
+    "node": ">= 22.11.0"
   }
diff --git a/RnDiffApp/yarn.lock b/RnDiffApp/yarn.lock
index 5555555555..6666666666 100644
--- a/RnDiffApp/yarn.lock
+++ b/RnDiffApp/yarn.lock
@@ -1,1 +1,1 @@
-old
+new
`;

const MAIN_APPLICATION = `package com.demoapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

const APP_DELEGATE = `import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "DemoApp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}
`;

// The app's build.gradle, with versionCode changed by the user (so the template hunk can't apply).
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
        versionCode 5
        versionName "1.2.0"
    }
}
`;

const WRAPPER = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

const PACKAGE_JSON = {
  name: 'DemoApp',
  version: '0.0.1',
  private: true,
  dependencies: {
    react: '19.2.3',
    'react-native': '0.87.1',
    'react-native-screens': '^4.0.0',
    'react-native-old-lib': '1.0.0',
    'react-native-mmkv': '^2.0.0',
    lodash: '^4.17.21',
  },
  devDependencies: {
    '@react-native-community/cli': '20.1.0',
    '@react-native/babel-preset': '0.87.1',
    '@react-native/eslint-config': '0.87.1',
    '@react-native/metro-config': '0.87.1',
    typescript: '^6.1.0',
  },
  engines: { node: '>=20' },
};

function demoProject(extra = {}) {
  return makeProject({
    'package.json': `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`,
    'package-lock.json': '{}',
    'app.json': { name: 'DemoApp', displayName: 'DemoApp' },
    'App.tsx': "import { Text } from 'react-native';\nexport default function App() { return <Text>Mine</Text>; }\n",
    'android/app/build.gradle': APP_GRADLE,
    'android/app/src/main/java/com/demoapp/MainApplication.kt': MAIN_APPLICATION,
    'android/gradle/wrapper/gradle-wrapper.properties': WRAPPER,
    'ios/Podfile': "platform :ios, min_ios_version_supported\ntarget 'DemoApp' do\nend\n",
    'ios/DemoApp/Info.plist': '<plist></plist>\n',
    'ios/DemoApp/AppDelegate.swift': APP_DELEGATE,
    'ios/DemoApp.xcodeproj/project.pbxproj': '// !$*UTF8*$!\n',
    'node_modules/react-native/package.json': { version: '0.87.1' },
    'node_modules/react-native-screens/android/': '',
    'node_modules/react-native-old-lib/RNOldLib.podspec': '',
    'node_modules/lodash/package.json': { version: '4.17.21' },
    ...extra,
  });
}

const LATEST = {
  'react-native-screens': { version: '4.18.0', peerDependencies: { react: '*', 'react-native': '>=0.80.0' } },
  'react-native-old-lib': { version: '1.2.0', peerDependencies: { 'react-native': '>=0.70 <0.85' } },
  'react-native-mmkv': { version: '3.0.0', peerDependencies: { 'react-native': '*' } },
};
const DIRECTORY = {
  'react-native-screens': { newArchitecture: 'supported' },
  'react-native-mmkv': { newArchitecture: 'supported' },
  'react-native-old-lib': { newArchitecture: 'unsupported', unmaintained: true },
};

function fakeFetcher({ offline = false } = {}) {
  return {
    packument: async (name) => (offline ? null : { 'react-native': RN_PACKUMENT, expo: EXPO_PACKUMENT }[name] ?? null),
    releases: async () => (offline ? null : RELEASES),
    diff: async (from, to) => (from === '0.87.1' && to === '0.88.0' ? DIFF : null),
    latest: async (name) => LATEST[name] ?? null,
    directory: async (names) => Object.fromEntries(names.filter((name) => DIRECTORY[name]).map((name) => [name, DIRECTORY[name]])),
  };
}

// Records the commands instead of running them.
function fakeRun(fail = []) {
  const calls = [];
  const run = (command, args, cwd) => {
    const line = [command, ...args].join(' ');
    calls.push({ line, cwd });
    return !fail.includes(line);
  };
  return { run, calls };
}

test('resolveVersion: latest, a minor, an exact version and dist-tags', () => {
  assert.equal(resolveVersion(undefined, RN_PACKUMENT), '0.88.1');
  assert.equal(resolveVersion('0.87', RN_PACKUMENT), '0.87.1');
  assert.equal(resolveVersion('v0.86', RN_PACKUMENT), '0.86.3');
  assert.equal(resolveVersion('0.88.0', RN_PACKUMENT), '0.88.0');
  assert.equal(resolveVersion('next', RN_PACKUMENT), '0.89.0-rc.1');
  assert.equal(resolveVersion('0.89.0-rc.1', RN_PACKUMENT), '0.89.0-rc.1');
  assert.throws(() => resolveVersion('0.99', RN_PACKUMENT), /React Native 0\.99 doesn't exist \(yet\)\. The latest version is 0\.88\.1/);
  assert.throws(() => resolveVersion('0.88.7', RN_PACKUMENT), /0\.88\.7 doesn't exist\. Use a version like 0\.88 or 0\.88\.1/);
});

test('nextMinorAdvice recommends one minor version at a time', () => {
  assert.deepEqual(nextMinorAdvice('0.85.0', '0.88.1', RN_PACKUMENT), { minors: 3, next: '0.86.3' });
  assert.equal(nextMinorAdvice('0.87.1', '0.88.1', RN_PACKUMENT), null);
  assert.equal(nextMinorAdvice('0.88.0', '0.88.1', RN_PACKUMENT), null);
});

test('templateVersion picks the closest rn-diff-purge template', () => {
  assert.equal(templateVersion('0.87.1', RELEASES), '0.87.1');
  assert.equal(templateVersion('0.88.1', RELEASES), '0.88.0');
  assert.equal(templateVersion('0.86.3', RELEASES), '0.86.0');
  assert.equal(templateVersion('0.84.0', RELEASES), null);
});

test('RnDiffApp paths and text map to the project names', () => {
  const root = demoProject();
  const names = projectNames(root, PACKAGE_JSON);
  assert.deepEqual(names, { appName: 'DemoApp', iosName: 'DemoApp', xcodeName: 'DemoApp', androidPackage: 'com.demoapp' });

  assert.equal(mapPath('RnDiffApp/ios/RnDiffApp/AppDelegate.swift', names), 'ios/DemoApp/AppDelegate.swift');
  assert.equal(mapPath('RnDiffApp/ios/RnDiffApp.xcodeproj/project.pbxproj', names), 'ios/DemoApp.xcodeproj/project.pbxproj');
  assert.equal(mapPath('RnDiffApp/ios/RnDiffAppTests/Info.plist', names), 'ios/DemoAppTests/Info.plist');
  assert.equal(
    mapPath('RnDiffApp/android/app/src/main/java/com/rndiffapp/MainActivity.kt', names),
    'android/app/src/main/java/com/demoapp/MainActivity.kt',
  );

  assert.equal(mapText('package com.rndiffapp', names, 'android/app/x.kt'), 'package com.demoapp');
  assert.equal(mapText('withModuleName: "RnDiffApp",', names, 'ios/DemoApp/AppDelegate.swift'), 'withModuleName: "DemoApp",');

  // The iOS target can differ from the app name: the Xcode project uses the target name.
  const other = { ...names, iosName: 'Demo' };
  assert.equal(mapText('PRODUCT_NAME = RnDiffApp;', other, 'ios/Demo.xcodeproj/project.pbxproj'), 'PRODUCT_NAME = Demo;');
  assert.equal(mapText('withModuleName: "RnDiffApp",', other, 'ios/Demo/AppDelegate.swift'), 'withModuleName: "DemoApp",');
});

test('projectNames falls back to applicationId and the package name', () => {
  const root = makeProject({
    'package.json': { name: 'shop' },
    'android/app/build.gradle': 'android {\n    defaultConfig {\n        applicationId = "com.example.shop"\n    }\n}\n',
  });
  assert.deepEqual(projectNames(root, { name: 'shop' }), {
    appName: 'shop',
    iosName: 'shop',
    xcodeName: 'shop',
    androidPackage: 'com.example.shop',
  });
});

test('package.json: React Native packages go to the target, tooling follows the template', () => {
  const pkgDiff = parseDiff(DIFF).find((file) => file.newPath === 'RnDiffApp/package.json');
  const changes = packageJsonChanges(pkgDiff);
  assert.deepEqual(changes.engines, { from: '>=20', to: '>= 22.11.0' });
  assert.deepEqual(changes.bumps['@react-native/jest-preset'], { from: null, to: '0.88.0', dev: true });
  assert.deepEqual(changes.bumps.typescript, { from: '^5.8.3', to: '^6.0.3', dev: true });

  // 0.88.1 has no template of its own, so the 0.88.0 diff is used and react-native goes to 0.88.1.
  const packages = planPackages(PACKAGE_JSON, changes, '0.88.1');
  assert.deepEqual(packages, [
    { name: 'react', from: '19.2.3', to: '19.3.0', dev: false },
    { name: 'react-native', from: '0.87.1', to: '0.88.1', dev: false },
    { name: '@react-native-community/cli', from: '20.1.0', to: '20.2.0', dev: true },
    { name: '@react-native/babel-preset', from: '0.87.1', to: '0.88.1', dev: true },
    { name: '@react-native/eslint-config', from: '0.87.1', to: '0.88.1', dev: true },
    { name: '@react-native/metro-config', from: '0.87.1', to: '0.88.1', dev: true },
    { name: '@react-native/jest-preset', from: null, to: '0.88.1', dev: true },
  ]);
  // typescript ^6.1.0 is already newer than the template's ^6.0.3; new-app-screen and libraries aren't touched.
  assert.ok(!packages.some((p) => ['typescript', '@react-native/new-app-screen', 'react-native-safe-area-context'].includes(p.name)));

  const text = `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`;
  const updated = updatePackageJson(text, packages, changes.engines);
  const json = JSON.parse(updated);
  assert.equal(json.dependencies['react-native'], '0.88.1');
  assert.equal(json.devDependencies['@react-native/jest-preset'], '0.88.1');
  assert.equal(json.devDependencies.typescript, '^6.1.0');
  assert.equal(json.engines.node, '>= 22.11.0');
  assert.ok(updated.endsWith('}\n'));
  assert.match(updated, /^ {2}"name"/m);
});

test('libraryRow: supports, no version yet, unknown, unmaintained', () => {
  assert.deepEqual(libraryRow('a', LATEST['react-native-screens'], DIRECTORY['react-native-screens'], '0.88.1', '^4.0.0'), {
    name: 'a',
    status: 'ok',
    message: '4.18.0 supports 0.88',
    hint: undefined,
  });
  const old = libraryRow('b', { version: '1.2.0', peerDependencies: { 'react-native': '>=0.70 <0.85' } }, null, '0.88.1', '1.0.0');
  assert.equal(old.status, 'warn');
  assert.equal(old.message, 'no version supports 0.88 yet (1.2.0 needs react-native >=0.70 <0.85)');
  assert.equal(libraryRow('c', { version: '1.0.0' }, null, '0.88.1', '1.0.0').status, 'warn');
  assert.match(libraryRow('c', { version: '1.0.0' }, null, '0.88.1', '1.0.0').message, /^unknown/);
  assert.match(libraryRow('d', null, null, '0.88.1', '1.0.0').message, /couldn't check/);
  // A prerelease target still satisfies ranges like >=0.80.0.
  assert.equal(libraryRow('e', LATEST['react-native-screens'], null, '0.89.0-rc.1', '^4.0.0').status, 'ok');
  const mmkv = libraryRow('f', LATEST['react-native-mmkv'], { unmaintained: true }, '0.88.1', '^2.0.0');
  assert.equal(mmkv.status, 'warn');
  assert.equal(mmkv.message, '3.0.0 allows any React Native version');
  assert.equal(mmkv.hint, 'marked unmaintained on React Native Directory: look for an alternative; update it to 3.0.0 too');
});

test('checkLibraries checks native libraries and React Native Directory packages only', async () => {
  const root = demoProject();
  const rows = await checkLibraries({ root, pkg: PACKAGE_JSON }, '0.88.1', fakeFetcher());
  assert.deepEqual(
    rows.map((row) => [row.name, row.status]),
    [
      ['react-native-mmkv', 'ok'],
      ['react-native-old-lib', 'warn'],
      ['react-native-screens', 'ok'],
    ],
  );
  assert.equal(rows[0].hint, 'update it to 3.0.0 too');
  assert.match(rows[1].message, /^no version supports 0\.88 yet/);
  assert.match(rows[1].hint, /unmaintained.*New Architecture/);
});

test('planUpgrade: packages, libraries and what to do with each file', async () => {
  const root = demoProject();
  const plan = await planUpgrade({ root, pkg: PACKAGE_JSON }, '0.88', { fetcher: fakeFetcher() });
  assert.equal(plan.from, '0.87.1');
  assert.equal(plan.to, '0.88.1');
  assert.equal(plan.fromTemplate, '0.87.1');
  assert.equal(plan.toTemplate, '0.88.0');
  assert.equal(plan.advice, null);
  assert.equal(plan.manager, 'npm');
  assert.equal(plan.helper, 'https://react-native-community.github.io/upgrade-helper/?from=0.87.1&to=0.88.0');
  assert.deepEqual(plan.engines, { from: '>=20', to: '>= 22.11.0' });
  assert.equal(plan.libraries.length, 3);

  const files = Object.fromEntries(plan.files.map((file) => [file.file, file]));
  assert.deepEqual(
    plan.files.map((file) => [file.file, file.action, file.status]),
    [
      ['App.tsx', 'modify', 'skip'],
      ['android/app/build.gradle', 'modify', 'manual'],
      ['android/app/src/main/java/com/demoapp/MainApplication.kt', 'modify', 'apply'],
      ['android/gradle/wrapper/gradle-wrapper.jar', 'modify', 'manual'],
      ['android/gradle/wrapper/gradle-wrapper.properties', 'modify', 'apply'],
      ['ios/DemoApp/AppDelegate.swift', 'modify', 'apply'],
      ['ios/DemoApp/SceneDelegate.swift', 'create', 'apply'],
    ],
  );
  assert.equal(files['android/app/build.gradle'].reason, 'you changed this file: do by hand');
  assert.equal(files['android/gradle/wrapper/gradle-wrapper.properties'].note, 'Gradle 9.0.0 → 9.3.1');
  assert.match(files['android/gradle/wrapper/gradle-wrapper.jar'].reason, /cd android && \.\/gradlew wrapper --gradle-version 9\.3\.1/);
  assert.match(files['ios/DemoApp/AppDelegate.swift'].content, /withModuleName: "DemoApp",\n {6}in: window,\n {6}launchOptions: launchOptions,\n {6}initialProperties: nil/);
  assert.match(files['android/app/src/main/java/com/demoapp/MainApplication.kt'].content, /^package com\.demoapp\n\nimport android\.app\.Application\nimport com\.facebook\.react\.common\.ReleaseLevel\n/);
  assert.equal(files['ios/DemoApp/SceneDelegate.swift'].content, 'import UIKit\n\n// Starts "DemoApp" in a window scene.\nclass SceneDelegate: UIResponder, UIWindowSceneDelegate {}\n');
});

test('planUpgrade gives advice for big jumps, and refuses downgrades', async () => {
  const pkg = { ...PACKAGE_JSON, dependencies: { ...PACKAGE_JSON.dependencies, 'react-native': '^0.85.0' } };
  const root = makeProject({ 'package.json': pkg });
  const plan = await planUpgrade({ root, pkg }, undefined, { fetcher: fakeFetcher() });
  assert.deepEqual(plan.advice, { minors: 3, next: '0.86.3' });
  // No diff published for 0.85.0..0.88.0 in the fake: the plan says so instead of failing.
  assert.equal(plan.diffMissing, true);
  assert.deepEqual(plan.files, []);

  await assert.rejects(planUpgrade({ root: demoProject(), pkg: PACKAGE_JSON }, '0.86', { fetcher: fakeFetcher() }), /doesn't downgrade/);
});

test('planUpgrade: already up to date, offline, not React Native', async () => {
  const pkg = { dependencies: { 'react-native': '0.88.1' } };
  const root = makeProject({ 'package.json': pkg });
  const plan = await planUpgrade({ root, pkg }, undefined, { fetcher: fakeFetcher() });
  assert.equal(plan.upToDate, true);

  await assert.rejects(planUpgrade({ root, pkg }, undefined, { fetcher: fakeFetcher({ offline: true }) }), /needs the internet/);
  await assert.rejects(planUpgrade({ root, pkg: { dependencies: {} } }, undefined, { fetcher: fakeFetcher() }), /nothing to upgrade/);
});

test('planFiles: deleted and renamed files, missing platforms', () => {
  const root = makeProject({
    'package.json': {},
    '.buckconfig': '[android]\n  target = Google Inc.:Google APIs:23\n',
    '.flowconfig': '[ignore]\nmine\n',
    'old.txt': 'keep\nold\n',
  });
  const diff = parseDiff(`diff --git a/.buckconfig b/.buckconfig
deleted file mode 100644
--- a/.buckconfig
+++ /dev/null
@@ -1,2 +0,0 @@
-[android]
-  target = Google Inc.:Google APIs:23
diff --git a/.flowconfig b/.flowconfig
deleted file mode 100644
--- a/.flowconfig
+++ /dev/null
@@ -1,1 +0,0 @@
-[ignore]
diff --git a/old.txt b/new.txt
similarity index 80%
rename from old.txt
rename to new.txt
--- a/old.txt
+++ b/new.txt
@@ -1,2 +1,2 @@
 keep
-old
+new
diff --git a/ios/RnDiffApp/Info.plist b/ios/RnDiffApp/Info.plist
--- a/ios/RnDiffApp/Info.plist
+++ b/ios/RnDiffApp/Info.plist
@@ -1,1 +1,1 @@
-a
+b
`);
  const files = planFiles(root, diff, { to: '0.88.0' });
  assert.deepEqual(
    files.map((file) => [file.file, file.action, file.status]),
    [
      ['.buckconfig', 'delete', 'apply'],
      ['.flowconfig', 'delete', 'manual'],
      ['new.txt', 'rename', 'apply'],
      ['ios/RnDiffApp/Info.plist', 'modify', 'skip'],
    ],
  );
  assert.equal(files[2].from, 'old.txt');
  assert.equal(files[2].content, 'keep\nnew\n');
  assert.equal(files[3].reason, 'no ios/ folder');
});

test('describeChange explains notable files', () => {
  const [gradle, podfile] = parseDiff(`diff --git a/android/build.gradle b/android/build.gradle
--- a/android/build.gradle
+++ b/android/build.gradle
@@ -1,4 +1,4 @@
 buildscript {
     ext {
-        compileSdkVersion = 35
-        kotlinVersion = "2.1.20"
+        compileSdkVersion = 36
+        kotlinVersion = "2.2.0"
diff --git a/ios/Podfile b/ios/Podfile
--- a/ios/Podfile
+++ b/ios/Podfile
@@ -1,1 +1,1 @@
-platform :ios, '15.1'
+platform :ios, '16.0'
`);
  assert.equal(describeChange('android/build.gradle', gradle), 'compileSdk 35 → 36, Kotlin 2.1.20 → 2.2.0');
  assert.equal(describeChange('ios/Podfile', podfile), 'minimum iOS 15.1 → 16.0');
  assert.equal(describeChange('ios/DemoApp/AppDelegate.swift', { status: 'modified', hunks: [] }), 'iOS app startup code');
});

test('applyUpgrade writes files and package.json, then installs packages and pods', async () => {
  const root = demoProject({ Gemfile: "source 'https://rubygems.org'\n" });
  const plan = await planUpgrade({ root, pkg: PACKAGE_JSON }, '0.88', { fetcher: fakeFetcher() });
  const { run, calls } = fakeRun(['bundle check']);
  const result = applyUpgrade({ root }, plan, { run, platform: 'darwin' });

  assert.equal(result.installOk, true);
  assert.equal(result.podsOk, true);
  assert.deepEqual(
    calls.map((call) => call.line),
    ['npm install', 'bundle check', 'bundle install', 'bundle exec pod install'],
  );
  assert.equal(calls[3].cwd, path.join(root, 'ios'));
  assert.deepEqual(result.written, [
    'android/app/src/main/java/com/demoapp/MainApplication.kt',
    'android/gradle/wrapper/gradle-wrapper.properties',
    'ios/DemoApp/AppDelegate.swift',
    'ios/DemoApp/SceneDelegate.swift',
    'package.json',
  ]);

  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  assert.match(read('android/gradle/wrapper/gradle-wrapper.properties'), /gradle-9\.3\.1-bin\.zip/);
  assert.match(read('ios/DemoApp/SceneDelegate.swift'), /class SceneDelegate/);
  assert.equal(read('android/app/build.gradle'), APP_GRADLE);
  assert.match(read('App.tsx'), /Mine/);
  assert.equal(JSON.parse(read('package.json')).dependencies['react-native'], '0.88.1');
  assert.ok(!existsSync(path.join(root, 'yarn.lock')));
});

test('applyUpgrade stops after a failed install', async () => {
  const root = demoProject();
  const plan = await planUpgrade({ root, pkg: PACKAGE_JSON }, '0.88', { fetcher: fakeFetcher() });
  const { run, calls } = fakeRun(['npm install']);
  const result = applyUpgrade({ root }, plan, { run, platform: 'darwin' });
  assert.equal(result.installOk, false);
  assert.deepEqual(calls.map((call) => call.line), ['npm install']);
});

test('applyUpgrade makes new scripts executable', () => {
  const root = makeProject({ 'package.json': {} });
  const plan = {
    manager: 'npm',
    packages: [],
    engines: null,
    files: [{ file: 'android/gradlew', action: 'create', status: 'apply', content: '#!/bin/sh\n', mode: '100755' }],
  };
  applyUpgrade({ root }, plan, { run: () => true, platform: 'linux' });
  assert.equal(statSync(path.join(root, 'android/gradlew')).mode & 0o111, 0o111);
});

test('applyUpgrade never writes or deletes outside the project, whatever the diff says', () => {
  const parent = makeProject({ 'outside.txt': 'keep me' });
  const root = path.join(parent, 'app');
  mkdirSync(root);
  const plan = {
    manager: 'npm',
    packages: [],
    engines: null,
    files: [
      { file: '../outside.txt', action: 'delete', status: 'apply' },
      { file: '../evil.txt', action: 'create', status: 'apply', content: 'x' },
      { file: 'ok.txt', action: 'rename', from: '../outside.txt', status: 'apply', content: 'x' },
    ],
  };
  const result = applyUpgrade({ root }, plan, { run: () => true, platform: 'linux' });
  assert.equal(readFileSync(path.join(parent, 'outside.txt'), 'utf8'), 'keep me');
  assert.equal(existsSync(path.join(parent, 'evil.txt')), false);
  assert.deepEqual(result.written, []);
});

test('planExpo: expo install --fix, one SDK at a time, prebuild warning', async () => {
  const pkg = { dependencies: { expo: '~53.0.20', 'react-native': '0.79.5' } };
  const root = makeProject({ 'package.json': pkg, 'android/': '' });
  const plan = await planExpo({ root, pkg }, undefined, { fetcher: fakeFetcher() });
  assert.equal(plan.from, '53.0.20');
  assert.equal(plan.to, '55.0.4');
  assert.deepEqual(plan.advice, { sdks: 2, next: 54 });
  assert.deepEqual(
    plan.commands.map((step) => [step.command, ...step.args].join(' ')),
    ['npx expo install expo@^55.0.0 --fix', 'npx expo install --fix', 'npx expo-doctor'],
  );
  assert.deepEqual(plan.prebuild, ['android']);

  const exact = await planExpo({ root, pkg }, '54.0.0', { fetcher: fakeFetcher() });
  assert.equal(exact.commands[0].args[2], 'expo@54.0.0');
  assert.equal(exact.advice, null);
  assert.equal((await planExpo({ root, pkg }, '54', { fetcher: fakeFetcher() })).commands[0].args[2], 'expo@^54.0.0');

  await assert.rejects(planExpo({ root, pkg }, '52', { fetcher: fakeFetcher() }), /doesn't downgrade/);
  await assert.rejects(planExpo({ root, pkg }, undefined, { fetcher: fakeFetcher({ offline: true }) }), /needs the internet/);
});

test('applyExpo runs the commands and stops at the first failure', async () => {
  const pkg = { dependencies: { expo: '~54.0.12' } };
  const root = makeProject({ 'package.json': pkg });
  const plan = await planExpo({ root, pkg }, undefined, { fetcher: fakeFetcher() });

  const ok = fakeRun(['npx expo-doctor']);
  assert.deepEqual(applyExpo({ root }, plan, { run: ok.run }).failed, null);
  assert.equal(ok.calls.length, 3);

  const failing = fakeRun(['npx expo install expo@^55.0.0 --fix']);
  const result = applyExpo({ root }, plan, { run: failing.run });
  assert.equal(result.failed.args[2], 'expo@^55.0.0');
  assert.equal(failing.calls.length, 1);
});

test('mapDiff maps paths and every line of a parsed diff', () => {
  const names = { appName: 'DemoApp', iosName: 'DemoApp', xcodeName: 'DemoApp', androidPackage: 'com.demoapp' };
  const mapped = mapDiff(parseDiff(DIFF), names);
  const kotlin = mapped.find((file) => file.newPath.endsWith('MainApplication.kt'));
  assert.equal(kotlin.newPath, 'android/app/src/main/java/com/demoapp/MainApplication.kt');
  assert.equal(kotlin.hunks[0].lines[0].text, 'package com.demoapp');
});

// CLI tests read the registry, RELEASES and the diff from local files (RN_BUDDY_DIFF_DIR), never the network.
function fixtures(overrides = {}) {
  return makeProject({
    RELEASES: `${RELEASES.join('\n')}\n`,
    '0.87.1..0.88.0.diff': DIFF,
    'registry.json': { packuments: { 'react-native': RN_PACKUMENT, expo: EXPO_PACKUMENT }, latest: LATEST, directory: DIRECTORY },
    ...overrides,
  });
}

function rnBuddy(diffDir, ...args) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', RN_BUDDY_DIFF_DIR: diffDir },
  });
}

test('rn-buddy upgrade --dry-run prints the plan and changes nothing', () => {
  const root = demoProject();
  const { status, stdout, stderr } = rnBuddy(fixtures(), 'upgrade', '0.88', '--dry-run', '--dir', root);
  assert.equal(stderr, '');
  assert.equal(status, 0);
  assert.match(stdout, /React Native 0\.87\.1 → 0\.88\.1/);
  assert.match(stdout, /Packages {5}react 19\.2\.3 → 19\.3\.0/);
  assert.match(stdout, /react-native 0\.87\.1 → 0\.88\.1/);
  assert.match(stdout, /@react-native\/\* 0\.87\.1 → 0\.88\.1/);
  assert.match(stdout, /@react-native\/jest-preset 0\.88\.1 \(new in the template\)/);
  assert.match(stdout, /Libraries {4}✔ react-native-mmkv {5}3\.0\.0 allows any React Native version/);
  assert.match(stdout, /⚠ react-native-old-lib {2}no version supports 0\.88 yet/);
  assert.match(stdout, /android\/gradle\/wrapper\/gradle-wrapper\.properties +Gradle 9\.0\.0 → 9\.3\.1/);
  assert.match(stdout, /android\/app\/build\.gradle +Android app build settings {2}\(you changed this file: do by hand\)/);
  assert.match(stdout, /ios\/DemoApp\/SceneDelegate\.swift +new: iOS window and scene setup/);
  assert.match(stdout, /gradle-wrapper\.jar +Gradle wrapper \(binary file\) {2}\(replace it with `cd android && \.\/gradlew wrapper/);
  assert.match(stdout, /⚠ react-native-old-lib {2}no version supports 0\.88 yet.*\n +→ marked unmaintained/);
  assert.match(stdout, /App\.tsx +– skipped: your own code/);
  assert.match(stdout, /Then {9}\$ npm install\n.*\n.*rebuild both apps.*\n.*rn-buddy clean --all/);
  assert.match(stdout, /https:\/\/react-native-community\.github\.io\/upgrade-helper\/\?from=0\.87\.1&to=0\.88\.0/);
  assert.match(stdout, /Dry run: nothing was changed\./);
  assert.doesNotMatch(stdout, /yarn\.lock/);
  assert.equal(readFileSync(path.join(root, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8'), WRAPPER);
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['react-native'], '0.87.1');
});

test('rn-buddy upgrade: big jumps, up to date, downgrade and offline', () => {
  const old = makeProject({ 'package.json': { name: 'Old', dependencies: { 'react-native': '0.85.0' } } });
  const jump = rnBuddy(fixtures(), 'upgrade', '--dry-run', '--dir', old);
  assert.equal(jump.status, 0);
  assert.match(jump.stdout, /0\.85 → 0\.88 jumps 3 minor versions/);
  assert.match(jump.stdout, /rn-buddy upgrade 0\.86 first/);
  assert.match(jump.stdout, /no template diff for 0\.85\.0 → 0\.88\.1 yet/);

  const current = makeProject({ 'package.json': { dependencies: { 'react-native': '0.88.1' } } });
  assert.match(rnBuddy(fixtures(), 'upgrade', '--dir', current).stdout, /already up to date/);

  const down = rnBuddy(fixtures(), 'upgrade', '0.86', '--dir', current);
  assert.equal(down.status, 1);
  assert.match(down.stderr, /✖ .*doesn't downgrade/);

  const offline = rnBuddy(makeProject({}), 'upgrade', '--dir', current);
  assert.equal(offline.status, 1);
  assert.match(offline.stderr, /needs the internet/);
  assert.doesNotMatch(offline.stderr, /at .*\.js/);
});

test('rn-buddy upgrade in an Expo project plans expo install', () => {
  const root = makeProject({ 'package.json': { name: 'ExpoApp', dependencies: { expo: '~54.0.12', 'react-native': '0.81.4' } }, 'ios/': '' });
  const { status, stdout } = rnBuddy(fixtures(), 'upgrade', '--dry-run', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Expo SDK 54 → 55/);
  assert.match(stdout, /Run {10}\$ npx expo install expo@\^55\.0\.0 --fix/);
  assert.match(stdout, /\$ npx expo install --fix/);
  assert.match(stdout, /\$ npx expo-doctor/);
  assert.match(stdout, /npx expo prebuild --clean/);
  assert.match(stdout, /overwrites changes/);
  assert.match(stdout, /https:\/\/expo\.dev\/changelog/);
  assert.doesNotMatch(stdout, /rn-diff-purge|upgrade-helper/);
});
