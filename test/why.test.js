import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AREAS,
  CLEAN_LEVELS,
  ERRORS,
  LEARN_TOPICS,
  PROBES,
  errorLines,
  explainMatch,
  fill,
  findMatches,
  projectVars,
  stripAnsi,
} from '../src/lib/errors.js';
import { readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(args, { input, cwd } = {}) {
  return spawnSync(process.execPath, [bin, 'why', ...args], {
    encoding: 'utf8',
    input: input ?? '',
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

// The best match for a text, explained for a fake project and a fake machine.
function why(text, files = null, context = {}) {
  const [best] = findMatches(text);
  assert.ok(best, `no match for: ${text}`);
  const project = files ? readProject(makeProject(files)) : null;
  return explainMatch(best, { project, env: {}, platform: 'darwin', tools: { node: '22.12.0', java: '17.0.10' }, ...context });
}

const RN = { name: 'DemoApp', dependencies: { react: '19.1.0', 'react-native': '0.81.0' } };
const BUILTIN_VARS = Object.keys(projectVars(null));

test('every entry in errors.json is complete and its patterns compile', () => {
  const ids = new Set();
  for (const entry of ERRORS) {
    const where = `errors.json "${entry.id}"`;
    assert.match(entry.id, /^[a-z0-9-]+$/, where);
    assert.ok(!ids.has(entry.id), `${where} is a duplicate id`);
    ids.add(entry.id);
    assert.ok(AREAS.includes(entry.area), `${where}: unknown area ${entry.area}`);
    assert.ok(Array.isArray(entry.patterns) && entry.patterns.length > 0, `${where}: needs patterns`);
    for (const pattern of entry.patterns) assert.ok(new RegExp(pattern, entry.flags ?? 'i'), where);
    assert.ok(entry.title?.length > 0, `${where}: needs a title`);
    assert.ok(entry.causes?.length > 0, `${where}: needs causes`);
    assert.ok(entry.fixes?.length > 0, `${where}: needs fixes`);
    if (entry.kind) assert.ok(['wrapper', 'warning'].includes(entry.kind), `${where}: unknown kind`);
    if (entry.learn) assert.ok(LEARN_TOPICS.includes(entry.learn), `${where}: unknown learn topic`);
    if (entry.clean) assert.ok(CLEAN_LEVELS.includes(entry.clean), `${where}: unknown clean level`);
    if (entry.probe) assert.ok(PROBES[entry.probe], `${where}: unknown probe`);
    if (entry.docs) assert.match(entry.docs, /^https:\/\//, where);

    // Every placeholder must get a value whichever pattern matched.
    const texts = [entry.title, ...entry.causes, ...entry.fixes, entry.then, ...Object.values(entry.expo ?? {}).flat()];
    const placeholders = texts.filter(Boolean).flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name));
    for (const pattern of entry.patterns) {
      const known = [...BUILTIN_VARS, ...Object.keys(entry.defaults ?? {}), ...[...pattern.matchAll(/\(\?<(\w+)>/g)].map(([, n]) => n)];
      for (const name of placeholders) assert.ok(known.includes(name), `${where}: {${name}} has no value with pattern ${pattern}`);
    }
  }
  assert.ok(ERRORS.length >= 35);
});

// Real messages, as React Native 0.8x, Gradle 8/9, Xcode 16+, CocoaPods and Expo print them.
const SAMPLES = [
  ['error: Error: Unable to resolve module @react-navigation/native from /Users/me/DemoApp/App.tsx: @react-navigation/native could not be found within the project or in these directories:\n  node_modules', 'unable-to-resolve-module', { module: '@react-navigation/native', from: '/Users/me/DemoApp/App.tsx' }],
  ['Unable to resolve module ./src/screens/Home from C:\\Users\\me\\DemoApp\\App.tsx: ', 'unable-to-resolve-module', { module: './src/screens/Home', from: 'C\\Users\\me\\DemoApp\\App.tsx'.replace('C', 'C:') }],
  ["No bundle URL present.\n\nMake sure you're running a packager server or have included a .jsbundle file in your application bundle.", 'no-bundle-url'],
  ["Unable to load script. Make sure you're either running Metro (run 'npx react-native start') or that your bundle 'index.android.bundle' is packaged correctly for release.", 'metro-not-reachable'],
  ['error listen EADDRINUSE: address already in use :::8081.', 'port-in-use', { port: '8081' }],
  ['Invariant Violation: "DemoApp" has not been registered. This can happen if:\n* Metro (the local dev server) is run from the wrong folder.', 'app-not-registered', { app: 'DemoApp' }],
  ["Recrawled this watch 4 times, most recently because:\nMustScanSubDirs UserDroppedTo resolve, please review the information on\nhttps://facebook.github.io/watchman/docs/troubleshooting.html#recrawl", 'watchman-recrawl'],
  ['Error: EMFILE: too many open files, watch', 'too-many-open-files'],
  ['TypeError: Network request failed', 'network-request-failed'],
  ["ReferenceError: Property 'navigation' doesn't exist, js engine: hermes", 'property-doesnt-exist', { name: 'navigation' }],
  ["Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'RNCAsyncStorage' could not be found. Verify that a module by this name is registered in the native binary.Bridgeless mode: true.", 'turbomodule-not-found', { module: 'RNCAsyncStorage' }],
  ['Invariant Violation: requireNativeComponent: "RNSScreen" was not found in the UIManager.', 'native-component-not-found', { module: 'RNSScreen' }],
  ["TypeError: null is not an object (evaluating '_reactNative.NativeModules.RNGestureHandlerModule.Direction')", 'native-module-null', { module: 'RNGestureHandlerModule' }],
  ["The package 'react-native-webview' doesn't seem to be linked. Make sure: \n\n- You rebuilt the app after installing the package", 'native-module-null', { module: 'react-native-webview' }],
  ["Error: Cannot find native module 'ExpoCamera'", 'expo-go-native-module', { module: 'ExpoCamera' }],
  ["Invariant Violation: Your JavaScript code tried to access a native module that doesn't exist. If you're trying to use a module that is not supported in Expo Go, you need to create a development build of your app.", 'expo-go-native-module'],
  ['Project is incompatible with this version of Expo Go', 'expo-go-sdk-mismatch'],
  ['The following packages should be updated for best compatibility with the installed expo version:\n  react-native-screens@4.0.0 - expected version: ~4.16.0', 'expo-dependency-versions'],
  ['CommandError: No development build (com.demoapp) for this project is installed. Install a development build on the target device and try again.', 'expo-no-development-build', { appId: 'com.demoapp' }],
  ["SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path in your project's local properties file at '/Users/me/DemoApp/android/local.properties'.", 'sdk-location-not-found'],
  ['ERROR: JAVA_HOME is set to an invalid directory: /Library/Java/JavaVirtualMachines/zulu-11.jdk/Contents/Home', 'java-home-invalid'],
  ["BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_' Unsupported class file major version 65", 'unsupported-class-file-version', { major: '65' }],
  ['Android Gradle plugin requires Java 17 to run. You are currently using Java 11.', 'java-version-mismatch', { wanted: '17', current: '11' }],
  ['Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]', 'install-failed-insufficient-storage'],
  ['INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package com.demoapp signatures do not match newer version; ignoring!', 'install-failed-update-incompatible', { appId: 'com.demoapp' }],
  ['Duplicate class kotlin.collections.jdk8.CollectionsJDK8Kt found in modules kotlin-stdlib-1.8.10 (org.jetbrains.kotlin:kotlin-stdlib:1.8.10) and kotlin-stdlib-jdk8-1.6.21', 'duplicate-class', { class: 'kotlin.collections.jdk8.CollectionsJDK8Kt' }],
  ["   > 2 files found with path 'lib/arm64-v8a/libc++_shared.so' from inputs:", 'duplicate-native-library', { lib: 'libc++_shared.so' }],
  ['[CXX1101] NDK at /Users/me/Library/Android/sdk/ndk/27.1.12297006 did not have a source.properties file', 'ndk-not-installed', { ndk: '27.1.12297006' }],
  ['No version of NDK matched the requested version 27.1.12297006. Versions available locally: 26.1.10909125', 'ndk-not-installed', { ndk: '27.1.12297006' }],
  ["com.android.builder.testing.api.DeviceException: No connected devices!", 'no-connected-devices'],
  ['error Failed to install the app. Make sure you have an Android emulator running or a device connected.', 'no-connected-devices'],
  ['adb: device unauthorized.', 'device-unauthorized'],
  ['zsh: command not found: adb', 'android-tools-not-found', { tool: 'adb' }],
  ["'emulator' is not recognized as an internal or external command,", 'android-tools-not-found', { tool: 'emulator' }],
  ['Failed to install the following Android SDK packages as some licences have not been accepted.', 'android-sdk-licenses'],
  ['java.lang.OutOfMemoryError: Metaspace', 'gradle-out-of-memory'],
  ['Module was compiled with an incompatible version of Kotlin. The binary version of its metadata is 2.1.0, expected version is 1.9.0.', 'kotlin-version-incompatible', { found: '2.1.0', expected: '1.9.0' }],
  ['uses-sdk:minSdkVersion 23 cannot be smaller than version 24 declared in library [:react-native-vision-camera]', 'min-sdk-too-low', { current: '23', wanted: '24' }],
  ["Dependency 'androidx.core:core:1.16.0' requires libraries and applications that\n      depend on it to compile against version 35 or later of the\n      Android APIs.", 'compile-sdk-too-low', { wanted: '35' }],
  ["> Could not find com.facebook.react:react-native:+.\n  Required by:", 'gradle-dependency-not-found', { dep: 'com.facebook.react:react-native:+' }],
  ["Execution failed for task ':app:compileDebugKotlin'.", 'gradle-build-failed', { task: ':app:compileDebugKotlin' }],
  ['[!] CocoaPods could not find compatible versions for pod "hermes-engine":', 'cocoapods-incompatible-versions', { pod: 'hermes-engine' }],
  ['Specs satisfying the `RNScreens (from `../node_modules/react-native-screens`)` dependency were found, but they required a higher minimum deployment target.', 'pod-deployment-target'],
  ["error: The sandbox is not in sync with the Podfile.lock. Run 'pod install' or update your CocoaPods installation.", 'pods-not-in-sync'],
  ["Could not find 'bundler' (2.4.22) required by your /Users/me/DemoApp/Gemfile.lock.", 'bundler-version-missing', { version: '2.4.22' }],
  ["Could not find gem 'cocoapods (>= 1.13, != 1.15.1, != 1.15.0)' in locally installed gems.", 'gems-not-installed', { gem: 'cocoapods (>= 1.13, != 1.15.1, != 1.15.0)' }],
  ['Sandbox: rsync.samba(4182) deny(1) file-write-create /Users/me/Library/Developer/Xcode/DerivedData/DemoApp/Build/Products/Debug-iphonesimulator/DemoApp.app/Frameworks/hermes.framework', 'rsync-sandbox-deny'],
  ["error: Can't find the 'node' binary to build the React Native bundle. If you have a non-standard Node.js installation, select your project in Xcode", 'node-not-found-xcode'],
  ['Command PhaseScriptExecution failed with a nonzero exit code', 'xcode-build-failed'],
  ["error: Multiple commands produce '/Users/me/Library/Developer/Xcode/DerivedData/DemoApp/Build/Products/Debug-iphonesimulator/DemoApp.app/Ionicons.ttf'", 'multiple-commands-produce'],
  ["/Users/me/DemoApp/ios/DemoApp/AppDelegate.swift:2:8: error: No such module 'React_RCTAppDelegate'", 'no-such-module', { module: 'React_RCTAppDelegate' }],
  ['Undefined symbols for architecture arm64:', 'undefined-symbols', { arch: 'arm64' }],
  ['error: unable to attach DB: error: accessing build database "/Users/me/Library/Developer/Xcode/DerivedData/DemoApp/Build/Intermediates.noindex/XCBuildData/build.db": database is locked Possibly there are two concurrent builds running in the same filesystem location.', 'build-database-locked'],
  ['Unable to boot the Simulator.', 'simulator-boot-failed'],
  ['error Could not find "iPhone 15" simulator. Run CLI with --verbose flag for more details.', 'simulator-not-found', { name: 'iPhone 15' }],
  ['error: Signing for "DemoApp" requires a development team. Select a development team in the Signing & Capabilities editor. (in target \'DemoApp\' from project \'DemoApp\')', 'signing-requires-team', { target: 'DemoApp' }],
  ["error: No profiles for 'com.demoapp' were found: Xcode couldn't find any iOS App Development provisioning profiles matching 'com.demoapp'.", 'no-provisioning-profiles', { bundleId: 'com.demoapp' }],
  ["xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance", 'xcode-select-command-line-tools'],
  ['error: iOS 18.2 is not installed. To use with Xcode, first download and install the platform', 'ios-platform-not-installed', { platform: 'iOS 18.2' }],
  ['Error: Text strings must be rendered within a <Text> component.', 'text-outside-text'],
  ['VirtualizedLists should never be nested inside plain ScrollViews with the same orientation because it can break windowing and other functionality - use another VirtualizedList-backed container instead.', 'nested-virtualized-lists'],
  ['Warning: Each child in a list should have a unique "key" prop.\n\nCheck the render method of `TodoList`.', 'missing-key-prop'],
  ['Error: Rendered more hooks than during the previous render.', 'hooks-order-changed'],
  ['Error: Invalid hook call. Hooks can only be called inside of the body of a function component.', 'invalid-hook-call'],
  ['Error: Too many re-renders. React limits the number of renders to prevent an infinite loop.', 'too-many-rerenders'],
  ['Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate', 'maximum-update-depth'],
  ['Warning: Cannot update a component (`HomeScreen`) while rendering a different component (`Counter`).', 'update-while-rendering', { other: 'HomeScreen', current: 'Counter' }],
  ['Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined.', 'element-type-invalid', { got: 'undefined' }],
  ['Error: Objects are not valid as a React child (found: object with keys {id, name}).', 'object-as-react-child'],
  ['The action \'NAVIGATE\' with payload {"name":"Details"} was not handled by any navigator.', 'navigation-action-not-handled', { action: 'NAVIGATE' }],
  ["Error: Couldn't find a navigation object. Is your component inside NavigationContainer?", 'navigation-object-missing'],
];

test('real error messages match the right entry and capture the details', () => {
  for (const [text, id, groups] of SAMPLES) {
    const [best] = findMatches(text);
    assert.equal(best?.entry.id, id, `"${text.slice(0, 60)}" matched ${best?.entry.id}`);
    for (const [name, value] of Object.entries(groups ?? {})) assert.equal(best.groups[name], value, `${id}: ${name}`);
  }
  // Most entries have a sample here.
  assert.ok(new Set(SAMPLES.map(([, id]) => id)).size >= 60);
});

test('every area of the starter list is covered', () => {
  const ids = new Set(SAMPLES.map(([, id]) => id));
  for (const area of AREAS) assert.ok(ERRORS.some((entry) => entry.area === area && ids.has(entry.id)), area);
});

test('colors are stripped before matching', () => {
  const colored = '\u001b[31merror\u001b[39m Unable to resolve module \u001b[1mlodash\u001b[22m from /x/App.tsx: x';
  assert.equal(stripAnsi(colored), 'error Unable to resolve module lodash from /x/App.tsx: x');
  assert.equal(findMatches(colored)[0].groups.module, 'lodash');
});

test('no match for text that is not a known error', () => {
  assert.deepEqual(findMatches('everything is fine\nhello'), []);
});

const GRADLE_LOG = `info Running jetifier to migrate libraries to AndroidX.
info Starting JS server...
info Installing the app...
> Configure project :react-native-reanimated
Android gradle plugin: 8.11.0
Gradle: 9.0.0
Recrawled this watch 2 times, most recently because:
MustScanSubDirs UserDroppedTo resolve
> Task :app:mergeDebugNativeLibs FAILED

[Incubating] Problems report is available at: file:///Users/me/DemoApp/android/build/reports/problems/problems-report.html

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:mergeDebugNativeLibs'.
> A failure occurred while executing com.android.build.gradle.internal.tasks.MergeNativeLibsTask$MergeNativeLibsTaskWorkAction
   > 2 files found with path 'lib/arm64-v8a/libfbjni.so' from inputs:
      - /Users/me/.gradle/caches/8.14/transforms/abc/transformed/jetified-fbjni-0.7.0/jni/arm64-v8a/libfbjni.so
      - /Users/me/DemoApp/node_modules/old-camera-lib/android/build/intermediates/library_jni/debug/jni/arm64-v8a/libfbjni.so

* Try:
> Run with --stacktrace option to get the stack trace.
> Run with --info or --debug option to get more log output.

BUILD FAILED in 1m 12s
error Failed to install the app. Command failed with exit code 1: ./gradlew app:installDebug -PreactNativeDevServerPort=8081
`;

test('in a Gradle log, the root cause wins over BUILD FAILED and warnings', () => {
  const matches = findMatches(GRADLE_LOG);
  assert.deepEqual(
    matches.map((match) => match.entry.id),
    ['duplicate-native-library', 'gradle-build-failed', 'watchman-recrawl'],
  );
  assert.equal(matches[0].groups.lib, 'libfbjni.so');
  assert.equal(matches[0].line, 16); // "Execution failed for task ':app:mergeDebugNativeLibs'"
});

test('a Gradle log with only a generic failure points at the "What went wrong" block', () => {
  const log = `> Task :app:compileDebugKotlin FAILED
e: file:///Users/me/DemoApp/android/app/src/main/java/com/demoapp/MainApplication.kt:21:13 Unresolved reference 'MyPackage'.

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileDebugKotlin'.
> A failure occurred while executing org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction
   > Compilation error. See log for more details

* Try:
> Run with --stacktrace option to get the stack trace.

BUILD FAILED in 9s`;
  const [best] = findMatches(log);
  assert.equal(best.entry.id, 'gradle-build-failed');
  const lines = errorLines(log);
  assert.match(lines[0], /^e: file:.*MainApplication\.kt:21:13 Unresolved reference 'MyPackage'\.$/);
  assert.ok(lines[1].startsWith('A failure occurred'));
  assert.ok(!lines.some((line) => /BUILD FAILED|Execution failed for task/.test(line)), 'wrapper lines are left out');
});

const XCODE_LOG = `Building workspace DemoApp with scheme DemoApp and configuration Debug
/Users/me/DemoApp/ios/Pods/Pods.xcodeproj: warning: The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 9.0, but the range of supported deployment target versions is 12.0 to 18.2.99. (in target 'fmt' from project 'Pods')
▸ Compiling AppDelegate.swift
/Users/me/DemoApp/node_modules/react-native/ReactCommon/react/renderer/core/ShadowNode.h:42:3: warning: 'auto' type specifier is a C++11 extension
▸ Running script '[CP-User] [RN]Bundle React Native code and images'
+ source /Users/me/DemoApp/ios/.xcode.env.local
error: Can't find the '/Users/me/.nvm/versions/node/v20.11.0/bin/node' binary to build the React Native bundle. If you have a non-standard Node.js installation, select your project in Xcode, find 'Build Phases' - 'Bundle React Native code and images' and change NODE_BINARY to an absolute path to your node executable.
Command PhaseScriptExecution failed with a nonzero exit code

** BUILD FAILED **

The following build commands failed:
	PhaseScriptExecution [CP-User]\\ [RN]Bundle\\ React\\ Native\\ code\\ and\\ images /Users/me/Library/Developer/Xcode/DerivedData/DemoApp/Build/Intermediates.noindex/DemoApp.build/Debug-iphonesimulator/DemoApp.build/Script-00DD1BFF1BD5951E006B06BC.sh (in target 'DemoApp' from project 'DemoApp')
(1 failure)
error Failed to build ios project. "xcodebuild" exited with error code '65'.`;

test('in an xcodebuild log, the specific error wins over PhaseScriptExecution and warnings', () => {
  const matches = findMatches(XCODE_LOG);
  assert.deepEqual(matches.map((match) => match.entry.id), ['node-not-found-xcode', 'xcode-build-failed']);
  assert.equal(matches[0].line, 7);
  const lines = errorLines(XCODE_LOG);
  assert.match(lines[0], /^error: Can't find the/);
  assert.ok(!lines.some((line) => line.includes('warning:')));
});

test('placeholders are filled from captures, defaults and the project', () => {
  assert.equal(fill('{module} and {missing}', { module: 'lodash' }), 'lodash and {missing}');
  assert.equal(why('Native module cannot be null.').title, "The native code for a package isn't in the app you're running.");
  assert.equal(why('Execution failed for task \':app:mergeDebugNativeLibs\'.').title.includes('<library>.so'), true);
  assert.match(why("SDK location not found.", null).title, /Android SDK/);

  const yarn = why('Unable to resolve module lodash/fp', { 'package.json': RN, 'yarn.lock': '' }, { env: {} });
  assert.deepEqual(yarn.fixes, ['`rn-buddy add lodash`', 'or: `yarn add lodash`']);
  assert.equal(yarn.title, "Metro can't find lodash.");
});

test('projectVars follow the package manager, Expo and Bundler', () => {
  assert.equal(projectVars(null).podInstall, '(cd ios && bundle exec pod install)');
  const expo = projectVars(readProject(makeProject({ 'package.json': { dependencies: { expo: '~54.0.0' } } })));
  assert.equal(expo.install, 'npx expo install');
  assert.equal(expo.resetCache, 'npx expo start --clear');
  assert.equal(expo.runIos, 'npx expo run:ios');
  assert.equal(expo.podInstall, '(cd ios && pod install)');
  const bare = projectVars(
    readProject(
      makeProject({
        'package.json': RN,
        'pnpm-lock.yaml': '',
        Gemfile: "source 'https://rubygems.org'",
        'android/app/build.gradle': 'android {\n    namespace "com.demoapp"\n    defaultConfig {\n        applicationId "com.demoapp"\n        versionCode 1\n    }\n}',
      }),
    ),
  );
  assert.equal(bare.install, 'pnpm add');
  assert.equal(bare.resetCache, 'npx react-native start --reset-cache');
  assert.equal(bare.podInstall, '(cd ios && bundle exec pod install)');
  assert.equal(bare.appId, 'com.demoapp');
});

test('module probe: not installed, not in node_modules, installed, Node built-in', () => {
  const missing = why('Unable to resolve module @react-navigation/native from /x/App.tsx: x', { 'package.json': RN });
  assert.equal(missing.likely, "It's imported in your code but not installed (it's not in package.json).");
  assert.deepEqual(missing.fixes, ['`rn-buddy add navigation`', 'or: `npm install @react-navigation/native`']);
  assert.equal(missing.then, 'Restart Metro with a clean cache: `npx react-native start --reset-cache`');

  const notInstalled = why('Unable to resolve module zustand', {
    'package.json': { ...RN, dependencies: { ...RN.dependencies, zustand: '^5.0.0' } },
  });
  assert.match(notInstalled.likely, /in package\.json but not in node_modules/);
  assert.deepEqual(notInstalled.fixes, ['`npm install`']);

  const stale = why('Unable to resolve module zustand', {
    'package.json': { ...RN, dependencies: { ...RN.dependencies, zustand: '^5.0.0' } },
    'node_modules/zustand/package.json': { version: '5.0.8' },
  });
  assert.match(stale.likely, /Metro's cache is probably out of date/);
  assert.deepEqual(stale.fixes, ['Restart Metro with a clean cache: `npx react-native start --reset-cache`']);
  assert.equal(stale.then, null);

  assert.match(why('Unable to resolve module crypto from /x/node_modules/jsonwebtoken/sign.js: x', { 'package.json': RN }).likely, /Node\.js built-in/);
  assert.match(why('Unable to resolve module expo-camera', { 'package.json': { dependencies: { expo: '~54.0.0' } } }).fixes[1], /npx expo install expo-camera/);
});

test('module probe: relative imports', () => {
  const root = makeProject({ 'package.json': RN, 'src/screens/HomeScreen.tsx': '', 'src/App.tsx': '' });
  const project = readProject(root);
  const explain = (text) => explainMatch(findMatches(text)[0], { project, env: {} });
  const from = path.join(root, 'src', 'App.tsx');

  assert.match(explain(`Unable to resolve module ./screens/HomeScreen from ${from}: x`).likely, /The file exists/);
  assert.equal(
    explain(`Unable to resolve module ./screens/homeScreen from ${from}: x`).likely,
    'The file is called HomeScreen.tsx, but the import says homeScreen. Upper/lower case must match exactly.',
  );
  assert.equal(explain(`Unable to resolve module ./screens/Profile from ${from}: x`).likely, "There's no file ./screens/Profile next to src/App.tsx.");
});

test('native module probe: pods missing, not rebuilt, Expo Go', () => {
  const files = {
    'package.json': { ...RN, dependencies: { ...RN.dependencies, '@react-native-async-storage/async-storage': '^2.2.0' } },
    'node_modules/@react-native-async-storage/async-storage/package.json': { version: '2.2.0' },
    'node_modules/@react-native-async-storage/async-storage/RNCAsyncStorage.podspec': '',
    'node_modules/@react-native-async-storage/async-storage/android/build.gradle': '',
    'ios/Podfile': "platform :ios, min_ios_version_supported\ntarget 'DemoApp' do\n  config = use_native_modules!\nend",
    Gemfile: "source 'https://rubygems.org'\ngem 'cocoapods', '>= 1.13'\n",
  };
  const error = "TurboModuleRegistry.getEnforcing(...): 'RNCAsyncStorage' could not be found.";
  const lock = 'PODS:\n  - hermes-engine (0.81.0)\n';

  const noPod = why(error, { ...files, 'ios/Podfile.lock': lock, 'ios/Pods/Manifest.lock': lock });
  assert.match(noPod.likely, /@react-native-async-storage\/async-storage isn't in ios\/Podfile\.lock/);
  assert.equal(noPod.fixes[0], '`(cd ios && bundle exec pod install)`');

  const withPod = `${lock}  - RNCAsyncStorage (2.2.0):\n    - React-Core\n`;
  const notRebuilt = why(error, { ...files, 'ios/Podfile.lock': withPod, 'ios/Pods/Manifest.lock': withPod });
  assert.match(notRebuilt.likely, /built before it was added: reloading only updates JavaScript/);
  assert.deepEqual(notRebuilt.fixes, ['iOS: `(cd ios && bundle exec pod install)`', 'Rebuild the app: `npx react-native run-android` or `npx react-native run-ios`']);

  // Guessed from the package name: RNGestureHandlerModule → react-native-gesture-handler.
  const gesture = why("null is not an object (evaluating 'NativeModules.RNGestureHandlerModule.Direction')", {
    'package.json': { ...RN, dependencies: { ...RN.dependencies, 'react-native-gesture-handler': '^2.28.0' } },
    'node_modules/react-native-gesture-handler/package.json': { version: '2.28.0' },
    'node_modules/react-native-gesture-handler/android/build.gradle': '',
  });
  assert.match(gesture.likely, /^react-native-gesture-handler has native code/);

  const expoGo = why(error, { 'package.json': { dependencies: { expo: '~54.0.0', '@react-native-async-storage/async-storage': '2.2.0' } } });
  assert.match(expoGo.likely, /no expo-dev-client, so it probably runs in Expo Go/);
  assert.match(expoGo.fixes[0], /npx expo install expo-dev-client/);

  const devClient = why("Cannot find native module 'ExpoCamera'", { 'package.json': { dependencies: { expo: '~54.0.0', 'expo-dev-client': '~6.0.0' } } });
  assert.match(devClient.likely, /development build\. The one on your device was made before/);
});

test('java probe reuses the env checks', () => {
  const android = { 'package.json': RN, 'android/': '' };
  const broken = why('ERROR: JAVA_HOME is set to an invalid directory: /nope', android, { env: { JAVA_HOME: '/nope/jdk' } });
  assert.equal(broken.likely, "JAVA_HOME is /nope/jdk, but there's no Java in it (no bin/java).");

  const tooNew = why('Unsupported class file major version 68', android, { tools: { node: '22.12.0', java: '24.0.1' } });
  assert.match(tooNew.likely, /React Native docs wants 17, `java` on PATH is newer/);
  assert.ok(tooNew.facts.includes('Class file version 68 means Java 24'));
  assert.ok(tooNew.facts.includes('Your terminal uses Java 24.0.1, from `java` on your PATH'));

  const fine = why('Android Gradle plugin requires Java 17 to run. You are currently using Java 11.', android);
  assert.match(fine.likely, /Java 17\.0\.10 is right for this project, so the build probably ran with another JDK/);

  const pinned = why('Unsupported class file major version 65', { ...android, '.java-version': '21' }, { tools: { node: '22.12.0', java: '17.0.10' } });
  assert.match(pinned.likely, /\.java-version wants 21/);
});

test('Android SDK probe checks ANDROID_HOME and local.properties', () => {
  const text = 'SDK location not found.';
  const sdk = makeProject({ 'platform-tools/adb': '' });

  const badProps = why(text, { 'package.json': RN, 'android/local.properties': 'sdk.dir=/nowhere/sdk\n' });
  assert.equal(badProps.likely, "android/local.properties says sdk.dir=/nowhere/sdk, but that folder doesn't exist.");

  const badHome = why(text, { 'package.json': RN, 'android/': '' }, { env: { ANDROID_HOME: '/nowhere/sdk', HOME: '/nowhere' } });
  assert.equal(badHome.likely, "ANDROID_HOME is /nowhere/sdk, but that folder doesn't exist.");

  const setHere = why(text, { 'package.json': RN }, { env: { ANDROID_HOME: sdk } });
  assert.match(setHere.likely, /set in this terminal, so the build probably ran where it isn't/);
  assert.deepEqual(setHere.fixes, [`Put it in android/local.properties so every build finds it: \`sdk.dir=${sdk}\``]);

  const usual = why(text, { 'package.json': RN }, { env: { HOME: path.dirname(path.dirname(path.dirname(sdk))) } });
  assert.ok(usual.likely);

  const adb = why('zsh: command not found: adb', null, { env: { ANDROID_HOME: sdk, PATH: '/usr/bin' } });
  assert.match(adb.likely, /platform-tools and emulator folders aren't on your PATH/);
});

test('NDK probe finds a broken download', () => {
  const sdk = makeProject({ 'ndk/27.1.12297006/build/': '' });
  const result = why('NDK is not installed', {
    'package.json': RN,
    'android/build.gradle': 'buildscript {\n    ext {\n        ndkVersion = "27.1.12297006"\n    }\n}',
  }, { env: { ANDROID_HOME: sdk } });
  assert.match(result.title, /\(27\.1\.12297006\)/);
  assert.match(result.likely, /has no source\.properties: the download was interrupted/);
});

test('pods probe: never installed, out of sync, pinned pod', () => {
  const ios = { 'package.json': RN, 'ios/Podfile': "platform :ios, min_ios_version_supported\n", Gemfile: '' };
  assert.match(why("No such module 'React'", ios).likely, /Podfile\.lock doesn't exist/);
  assert.match(
    why('The sandbox is not in sync with the Podfile.lock.', { ...ios, 'ios/Podfile.lock': 'a', 'ios/Pods/Manifest.lock': 'b' }).likely,
    /doesn't match ios\/Podfile\.lock/,
  );
  const lock = 'PODS:\n  - hermes-engine (0.79.2):\n    - hermes-engine/Pre-built (= 0.79.2)\n';
  const pinned = why('[!] CocoaPods could not find compatible versions for pod "hermes-engine":', {
    ...ios,
    'ios/Podfile.lock': lock,
    'ios/Pods/Manifest.lock': lock,
  });
  assert.equal(pinned.likely, 'ios/Podfile.lock pins hermes-engine 0.79.2, and a package now needs another version.');
  assert.equal(pinned.fixes[0], 'Let CocoaPods update it: `(cd ios && bundle exec pod update hermes-engine)`');
});

test('app name probe compares the error with app.json and the native code', () => {
  const files = {
    'package.json': RN,
    'app.json': { name: 'DemoApp', displayName: 'DemoApp' },
    'android/app/src/main/java/com/demoapp/MainActivity.kt':
      'package com.demoapp\n\nclass MainActivity : ReactActivity() {\n  override fun getMainComponentName(): String = "DemoApp"\n}\n',
  };
  assert.match(why('"OtherApp" has not been registered', files).likely, /app\.json \(which index\.js registers\) says "DemoApp"/);
  assert.match(why('"DemoApp" has not been registered', files).likely, /The names match/);
});

test('Expo SDK and duplicate React probes', () => {
  const expo = why('Project is incompatible with this version of Expo Go', {
    'package.json': { dependencies: { expo: '~54.0.0' } },
    'node_modules/expo/package.json': { version: '54.0.12' },
  });
  assert.deepEqual(expo.facts, ['Expo SDK 54 (expo 54.0.12)']);

  const hooks = why('Invalid hook call. Hooks can only be called inside of the body of a function component.', {
    'package.json': RN,
    'node_modules/react/package.json': { version: '19.1.0' },
    'node_modules/@acme/ui/node_modules/react/package.json': { version: '18.3.1' },
  });
  assert.match(hooks.likely, /two copies of React: @acme\/ui/);
});

test('Expo projects get Expo fixes', () => {
  const result = why('uses-sdk:minSdkVersion 23 cannot be smaller than version 26 declared in library [:expo-camera]', {
    'package.json': { dependencies: { expo: '~54.0.0' } },
  });
  assert.match(result.fixes[0], /expo-build-properties.*"minSdkVersion": 26/);
});

const project = makeProject({ 'package.json': RN });

test('CLI: explains a pasted error, project-aware', () => {
  const { status, stdout } = rnBuddy(['Unable to resolve module @react-navigation/native', '--dir', project]);
  assert.equal(status, 0);
  assert.match(stdout, /^Metro can't find @react-navigation\/native\.\n/);
  assert.match(stdout, /Likely cause {2}It's imported in your code but not installed/);
  assert.match(stdout, /Fix {11}rn-buddy add navigation\n {16}or: npm install @react-navigation\/native/);
  assert.match(stdout, /Then {10}Restart Metro with a clean cache: npx react-native start --reset-cache/);
  assert.match(stdout, /Learn more {4}rn-buddy learn metro/);
  assert.match(stdout, /Tip {11}If it keeps happening: rn-buddy clean --metro/);
});

test('CLI: reads a piped build log from stdin', () => {
  const { status, stdout } = rnBuddy(['--dir', project], { input: GRADLE_LOG });
  assert.equal(status, 0);
  assert.match(stdout, /^Line 16: Execution failed for task ':app:mergeDebugNativeLibs'\./);
  assert.match(stdout, /Two packages contain the same native file \(libfbjni\.so\)/);
  assert.match(stdout, /pickFirsts \+= \['\*\*\/libfbjni\.so'\]/);
  assert.match(stdout, /Also found in this log\n {2}• Watchman lost track/);
  assert.doesNotMatch(stdout, /Also found[\s\S]*The Android build failed/);
});

test('CLI: reads a log file with --file', () => {
  const file = path.join(project, 'build.log');
  writeFileSync(file, XCODE_LOG);
  const { status, stdout } = rnBuddy(['--file', file, '--dir', project]);
  assert.equal(status, 0);
  assert.match(stdout, /Xcode can't find Node/);
  assert.match(stdout, /echo export NODE_BINARY=\$\(command -v node\) > ios\/\.xcode\.env\.local/);

  const missing = rnBuddy(['--file', path.join(project, 'nope.log')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Can't read .*nope\.log: file not found/);
});

test('CLI: unknown errors exit 1 and show the error-looking lines', () => {
  const { status, stdout } = rnBuddy(['--dir', project], { input: 'some output\nFATAL: the flux capacitor could not be charged\nmore output' });
  assert.equal(status, 1);
  assert.match(stdout, /rn-buddy doesn't know this error yet/);
  assert.match(stdout, /> FATAL: the flux capacitor could not be charged/);
  assert.match(stdout, /rn-buddy doctor/);
  assert.match(stdout, /email the error to vittola\.work@gmail\.com/);
});

test('CLI: no input shows how to use it', () => {
  const { status, stdout } = rnBuddy([]);
  assert.equal(status, 0);
  assert.match(stdout, /rn-buddy why --file build\.log/);
});

test('CLI: works outside a project', () => {
  const { status, stdout } = rnBuddy(['No connected devices!'], { cwd: path.parse(project).root });
  assert.equal(status, 0);
  assert.match(stdout, /Then {10}npx react-native run-android/);
});
