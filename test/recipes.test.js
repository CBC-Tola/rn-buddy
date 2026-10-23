import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyPlan,
  applyUndo,
  hasChanges,
  installCommands,
  planRecipe,
  planUndo,
  uninstallCommand,
} from '../src/lib/add.js';
import { readProject } from '../src/lib/project.js';
import { RECIPE_GROUPS, RECIPES, recipeFor } from '../src/lib/recipes.js';
import { addPlugin, addWorkletsPlugin, babelPlugins, removePlugin, removeWorkletsPlugin } from '../src/lib/recipes/babel.js';
import { addSetupPermissions, parsePermissions, removeSetupPermissions } from '../src/lib/recipes/permissions.js';
import { addPlistArrayString, removePlistArrayString, removePlistStrings, setPlistStrings } from '../src/lib/recipes/plist.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

// --- A React Native 0.81 template project ----------------------------------------------------

const BABEL = `module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
`;

const METRO = `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
`;

const JEST = `module.exports = {
  preset: 'react-native',
};
`;

const TSCONFIG = `{
  "extends": "@react-native/typescript-config",
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/node_modules", "**/Pods"]
}
`;

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>DemoApp</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<false/>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string></string>
	<key>RCTNewArchEnabled</key>
	<true/>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<false/>
</dict>
</plist>
`;

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
      android:name=".MainApplication"
      android:label="@string/app_name"
      android:icon="@mipmap/ic_launcher"
      android:allowBackup="false"
      android:theme="@style/AppTheme"
      android:supportsRtl="true">
      <activity
        android:name=".MainActivity"
        android:exported="true">
      </activity>
    </application>
</manifest>
`;

const PODFILE = `# Resolve react_native_pods.rb with node to allow for hoisting
require Pod::Executable.execute_command('node', ['-p',
  'require.resolve(
    "react-native/scripts/react_native_pods.rb",
    {paths: [process.argv[1]]},
  )', __dir__]).strip

platform :ios, min_ios_version_supported
prepare_react_native_project!

linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with #{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
end

target 'DemoApp' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )
end
`;

const APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    autolinkLibrariesWithApp()
}

def enableProguardInReleaseBuilds = false

android {
    ndkVersion rootProject.ext.ndkVersion
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

const MAIN_ACTIVITY = `package com.demoapp

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "DemoApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`;

const APP_TSX = `import { NewAppScreen } from '@react-native/new-app-screen';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function App() {
  return <SafeAreaProvider />;
}
`;

const PACKAGE = {
  name: 'DemoApp',
  version: '0.0.1',
  private: true,
  scripts: { android: 'react-native run-android', ios: 'react-native run-ios', lint: 'eslint .', start: 'react-native start', test: 'jest' },
  dependencies: { react: '19.1.0', 'react-native': '0.81.4', '@react-native/new-app-screen': '0.81.4', 'react-native-safe-area-context': '^5.5.2' },
  devDependencies: {
    '@react-native/babel-preset': '0.81.4',
    '@react-native/eslint-config': '0.81.4',
    '@react-native/metro-config': '0.81.4',
    eslint: '^8.19.0',
    jest: '^29.6.3',
    prettier: '2.8.8',
    typescript: '^5.8.3',
  },
};

const MAIN_ACTIVITY_PATH = 'android/app/src/main/java/com/demoapp/MainActivity.kt';

function template(overrides = {}) {
  const files = {
    'package.json': JSON.stringify(PACKAGE, null, 2) + '\n',
    'package-lock.json': '{}',
    'App.tsx': APP_TSX,
    'app.json': '{ "name": "DemoApp", "displayName": "DemoApp" }',
    'babel.config.js': BABEL,
    'metro.config.js': METRO,
    'jest.config.js': JEST,
    'tsconfig.json': TSCONFIG,
    '.gitignore': '# node.js\nnode_modules/\n',
    '.eslintrc.js': "module.exports = {\n  root: true,\n  extends: '@react-native',\n};\n",
    '.prettierrc.js': "module.exports = {\n  arrowParens: 'avoid',\n  singleQuote: true,\n  trailingComma: 'all',\n};\n",
    Gemfile: '',
    'android/app/build.gradle': APP_GRADLE,
    'android/app/src/main/AndroidManifest.xml': MANIFEST,
    [MAIN_ACTIVITY_PATH]: MAIN_ACTIVITY,
    'ios/Podfile': PODFILE,
    'ios/DemoApp/Info.plist': PLIST,
    'ios/DemoApp/AppDelegate.swift': '',
    ...overrides,
  };
  return readProject(makeProject(Object.fromEntries(Object.entries(files).filter(([, content]) => content !== null))));
}

const EXPO_PACKAGE = {
  name: 'expo-demo',
  main: 'expo-router/entry',
  dependencies: { expo: '~54.0.0', react: '19.1.0', 'react-native': '0.81.4' },
  devDependencies: { typescript: '~5.9.2' },
};
const EXPO_APP_JSON = `{
  "expo": {
    "name": "expo-demo",
    "slug": "expo-demo",
    "plugins": [
      "expo-router"
    ]
  }
}
`;

function expoProject(overrides = {}) {
  const files = {
    'package.json': EXPO_PACKAGE,
    'app.json': EXPO_APP_JSON,
    'tsconfig.json': '{\n  "extends": "expo/tsconfig.base",\n  "compilerOptions": {\n    "strict": true\n  }\n}\n',
    '.gitignore': 'node_modules/\n.expo/\n/ios\n/android\n',
    ...overrides,
  };
  return readProject(makeProject(Object.fromEntries(Object.entries(files).filter(([, content]) => content !== null))));
}

function edit(plan, file) {
  return plan.edits.find((e) => e.file === file || e.file?.endsWith(file));
}

function fakeRun(onRun = () => {}) {
  const calls = [];
  const run = (command, args, cwd) => {
    calls.push([command, ...args].join(' '));
    onRun(command, args, cwd);
    return true;
  };
  return { run, calls };
}

function read(root, file) {
  return readFileSync(path.join(root, file), 'utf8');
}

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

// --- Every recipe ------------------------------------------------------------------------------

test('every recipe is listed in a group, and every group recipe exists', () => {
  const grouped = RECIPE_GROUPS.flatMap((group) => group.recipes);
  assert.deepEqual([...grouped].sort(), Object.keys(RECIPES).sort());
});

test('every recipe plans on the template, in TypeScript, JavaScript and Expo, with no leftover markers', () => {
  const projects = {
    typescript: template(),
    javascript: template({ 'tsconfig.json': null, 'App.tsx': null, 'App.js': '' }),
    expo: expoProject(),
  };
  for (const [kind, project] of Object.entries(projects)) {
    for (const name of Object.keys(RECIPES)) {
      const plan = planRecipe(project, name, name === 'permissions' ? ['camera', 'notifications'] : []);
      for (const { file, content } of plan.files) {
        assert.doesNotMatch(content, /\{tsx?\}|\{:|<!--|\{\{\w+\}\}/, `${kind} ${name} ${file}`);
        if (kind === 'javascript') assert.doesNotMatch(file, /\.tsx?$/, `${kind} ${name} ${file}`);
      }
      assert.doesNotMatch(plan.next, /\{tsx?\}|\{:|<!--|\{\{\w+\}\}/, `${kind} ${name} next steps`);
      assert.ok(plan.docs, `${kind} ${name} docs`);
      for (const e of plan.edits) assert.ok(['apply', 'done', 'manual'].includes(e.status), `${kind} ${name} ${e.file}`);
    }
  }
});

test('the template project needs no edits by hand for any recipe', () => {
  const project = template();
  for (const name of Object.keys(RECIPES)) {
    const plan = planRecipe(project, name, name === 'permissions' ? ['camera'] : []);
    assert.deepEqual(plan.edits.filter((e) => e.status === 'manual').map((e) => e.manual), [], name);
  }
});

test('packages point to the smallest recipe that installs them', () => {
  assert.equal(recipeFor('react-native-reanimated'), 'animations');
  assert.equal(recipeFor('react-native-screens'), 'navigation');
  assert.equal(recipeFor('@react-navigation/drawer'), 'drawer');
  assert.equal(recipeFor('react-native-permissions'), 'permissions');
  assert.equal(recipeFor('react-native-svg-transformer'), 'svg');
});

// --- permissions --------------------------------------------------------------------------------

test('permissions: names are checked, with friendly aliases', () => {
  assert.deepEqual(parsePermissions(['camera', 'Location', 'photo', 'mic', 'camera']), ['camera', 'location', 'photos', 'microphone']);
  assert.throws(() => parsePermissions(['camra']), /Unknown permission "camra"\. Choose from: camera, microphone/);
  assert.throws(() => planRecipe(template(), 'permissions', []), /Say which permissions to add, e\.g\. rn-buddy add permissions camera/);
  assert.throws(() => planRecipe(template(), 'svg', ['camera']), /The svg recipe has no options/);
});

test('permissions: Info.plist, AndroidManifest.xml and the Podfile', () => {
  const plan = planRecipe(template(), 'permissions', ['camera', 'location']);
  assert.deepEqual(plan.install.map((p) => p.name), ['react-native-permissions']);
  assert.deepEqual(plan.files.map((f) => f.file), ['src/hooks/usePermission.ts']);
  assert.match(plan.next, /PERMISSIONS\.IOS\.CAMERA, default: PERMISSIONS\.ANDROID\.CAMERA/);
  assert.match(plan.next, /`NSLocationWhenInUseUsageDescription`/);

  const plist = edit(plan, 'Info.plist');
  assert.equal(plist.status, 'apply');
  // The template's empty location string is filled in, the camera key goes at the end of the top-level dict.
  assert.match(plist.content, /<key>NSLocationWhenInUseUsageDescription<\/key>\n\t<string>This app uses your location/);
  assert.match(
    plist.content,
    /\t<key>UIViewControllerBasedStatusBarAppearance<\/key>\n\t<false\/>\n\t<key>NSCameraUsageDescription<\/key>\n\t<string>This app uses the camera to take photos\.<\/string>\n<\/dict>\n<\/plist>/,
  );
  assert.match(plist.content, /<true\/>\n\t<\/dict>\n\t<key>NSLocationWhenInUse/, 'the nested dict is untouched');

  const manifest = edit(plan, 'AndroidManifest.xml');
  assert.match(
    manifest.content,
    /android\.permission\.INTERNET" \/>\n {4}<uses-permission android:name="android\.permission\.CAMERA" \/>\n {4}<uses-permission android:name="android\.permission\.ACCESS_COARSE_LOCATION" \/>\n {4}<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION" \/>\n\n {4}<application/,
  );

  const podfile = edit(plan, 'Podfile');
  assert.match(podfile.content, /^def node_require\(script\)\n/);
  assert.match(podfile.content, /node_require\('react-native\/scripts\/react_native_pods\.rb'\)\nnode_require\('react-native-permissions\/scripts\/setup\.rb'\)\n/);
  assert.match(podfile.content, /prepare_react_native_project!\n\nsetup_permissions\(\[\n {2}'Camera',\n {2}'LocationWhenInUse',\n\]\)\n\nlinkage/);
  assert.doesNotMatch(podfile.content, /require Pod::Executable\.execute_command\('node', \['-p',\n {2}'require/);
});

test('permissions: running it again is a no-op, and new names are added to the same setup_permissions', () => {
  const project = template();
  applyPlan(project, planRecipe(project, 'permissions', ['camera']), { run: fakeRun().run, platform: 'linux' });
  const again = planRecipe(readProject(project.root), 'permissions', ['camera']);
  assert.deepEqual(again.edits.map((e) => e.status), ['done', 'done', 'done']);

  const more = addSetupPermissions(read(project.root, 'ios/Podfile'), ['Camera', 'Microphone']);
  assert.match(more, /setup_permissions\(\[\n {2}'Camera',\n {2}'Microphone',\n\]\)/);
  assert.equal(more.match(/setup_permissions/g).length, 1);
  assert.equal(more.match(/scripts\/setup\.rb/g).length, 1);
});

test('permissions: an unfamiliar Podfile is left for the user', () => {
  assert.equal(addSetupPermissions("platform :ios, '15.0'\ntarget 'X' do\nend\n", ['Camera']), null);
});

test('permissions: notifications and Face ID only touch the platform that needs them', () => {
  const plan = planRecipe(template(), 'permissions', ['notifications']);
  assert.equal(edit(plan, 'Info.plist'), undefined);
  assert.match(edit(plan, 'AndroidManifest.xml').content, /POST_NOTIFICATIONS/);
  assert.match(plan.next, /useNotificationPermission|requestNotifications/);

  const faceId = planRecipe(template(), 'permissions', ['face-id']);
  assert.equal(edit(faceId, 'AndroidManifest.xml'), undefined);
  assert.match(faceId.next, /usePermission\(PERMISSIONS\.IOS\.FACE_ID\)/);
});

test('setup_permissions: removing names, then the whole call', () => {
  const both = addSetupPermissions(PODFILE, ['Camera', 'Microphone']);
  const one = removeSetupPermissions(both, ['Microphone']);
  assert.match(one, /setup_permissions\(\[\n {2}'Camera',\n\]\)/);
  const none = removeSetupPermissions(one, ['Camera']);
  assert.doesNotMatch(none, /setup_permissions|scripts\/setup\.rb/);
  assert.match(none, /prepare_react_native_project!\n\nlinkage/);
});

// --- Info.plist -------------------------------------------------------------------------------

test('plist: keys go before the closing </dict> of the top-level dict, with its indentation', () => {
  const spaces = PLIST.replaceAll('\t', '  ');
  const result = setPlistStrings(spaces, [{ key: 'NSCameraUsageDescription', value: 'Scan <receipts> & bills' }]);
  assert.match(result, / {2}<key>NSCameraUsageDescription<\/key>\n {2}<string>Scan &lt;receipts&gt; &amp; bills<\/string>\n<\/dict>\n<\/plist>\n$/);
  // A key with a value is kept as it is.
  const mine = setPlistStrings(result, [{ key: 'NSCameraUsageDescription', value: 'Other' }]);
  assert.equal(mine, result);
  assert.equal(setPlistStrings('not a plist', [{ key: 'A', value: 'b' }]), null);
});

test('plist: undo removes only the strings rn-buddy wrote', () => {
  const entry = { key: 'NSCameraUsageDescription', value: 'This app uses the camera to take photos.' };
  const added = setPlistStrings(PLIST, [entry]);
  assert.equal(removePlistStrings(added, [entry]), PLIST);
  const edited = added.replace(entry.value, 'To scan receipts.');
  assert.equal(removePlistStrings(edited, [entry]), edited);
});

test('plist: UIAppFonts array is created, extended and cleaned up', () => {
  const created = addPlistArrayString(PLIST, 'UIAppFonts', 'Ionicons.ttf');
  assert.match(created, /\t<key>UIAppFonts<\/key>\n\t<array>\n\t\t<string>Ionicons\.ttf<\/string>\n\t<\/array>\n<\/dict>/);
  assert.equal(addPlistArrayString(created, 'UIAppFonts', 'Ionicons.ttf'), created);
  const two = addPlistArrayString(created, 'UIAppFonts', 'Inter-Bold.ttf');
  assert.match(two, /<string>Ionicons\.ttf<\/string>\n\t\t<string>Inter-Bold\.ttf<\/string>\n\t<\/array>/);
  assert.equal(removePlistArrayString(removePlistArrayString(two, 'UIAppFonts', 'Inter-Bold.ttf'), 'UIAppFonts', 'Ionicons.ttf'), PLIST);
});

// --- babel.config.js -------------------------------------------------------------------------

test('babel: the worklets plugin is added last, creating the plugins array', () => {
  assert.equal(
    addWorkletsPlugin(BABEL),
    "module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: [\n    'react-native-worklets/plugin',\n  ],\n};\n",
  );
  // A presets line without a trailing comma gets one.
  const noComma = addWorkletsPlugin("module.exports = {\n  presets: ['module:@react-native/babel-preset']\n};\n");
  assert.match(noComma, /babel-preset'\],\n {2}plugins: \[/);
});

test('babel: the worklets plugin is moved to the end, and Reanimated 3 plugin is replaced', () => {
  const notLast = "module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: ['react-native-worklets/plugin', 'transform-remove-console'],\n};\n";
  assert.deepEqual(babelPlugins(addWorkletsPlugin(notLast)), ['transform-remove-console', 'react-native-worklets/plugin']);

  const old = "module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: [['module-resolver', { root: ['./src'] }], 'react-native-reanimated/plugin'],\n};\n";
  assert.deepEqual(babelPlugins(addWorkletsPlugin(old)), ['module-resolver', 'react-native-worklets/plugin']);

  const done = addWorkletsPlugin(BABEL);
  assert.equal(addWorkletsPlugin(done), done);
});

test('babel: module-resolver goes before the worklets plugin, which stays last', () => {
  const withWorklets = addWorkletsPlugin(BABEL);
  const item = (indent) => `['module-resolver', { alias: { '@': './src' } }]${indent ? '' : ''}`;
  const result = addPlugin(withWorklets, 'module-resolver', item);
  assert.deepEqual(babelPlugins(result), ['module-resolver', 'react-native-worklets/plugin']);
  assert.equal(addPlugin(result, 'module-resolver', item), result);
  // Undo: only an unchanged entry is removed; an empty array is removed too.
  assert.equal(removePlugin(result, 'module-resolver', item('')), withWorklets);
  assert.equal(removeWorkletsPlugin(withWorklets), BABEL);
  assert.equal(removePlugin(result, 'module-resolver', "['module-resolver', {}]"), null);
});

test('babel: unfamiliar files are left for the user', () => {
  const commented = "module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: [\n    // 'some-plugin',\n  ],\n};\n";
  assert.equal(addWorkletsPlugin(commented), null);
  assert.equal(addWorkletsPlugin('module.exports = require("./shared-babel");\n'), null);
  // Function configs work when they have the same shape.
  const fn = "module.exports = function (api) {\n  api.cache(true);\n  return {\n    presets: ['babel-preset-expo'],\n  };\n};\n";
  assert.match(addWorkletsPlugin(fn), / {4}presets: \['babel-preset-expo'\],\n {4}plugins: \[\n {6}'react-native-worklets\/plugin',\n {4}\],\n/);
});

// --- UI recipes ---------------------------------------------------------------------------------

test('animations: packages and the Babel plugin', () => {
  const plan = planRecipe(template(), 'animations');
  assert.deepEqual(plan.install.map((p) => p.name), ['react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler']);
  assert.match(edit(plan, 'babel.config.js').content, /'react-native-worklets\/plugin',\n {2}\],/);
  assert.match(plan.next, /--reset-cache/);
  assert.match(plan.next, /GestureHandlerRootView/);
});

test('svg: metro.config.js gets the transformer, declarations.d.ts is created for TypeScript', () => {
  const plan = planRecipe(template(), 'svg');
  assert.deepEqual(installCommands(plan), [
    { command: 'npm', args: ['install', 'react-native-svg'] },
    { command: 'npm', args: ['install', '--save-dev', 'react-native-svg-transformer'] },
  ]);
  assert.deepEqual(plan.files.map((f) => f.file), ['src/assets/logo.svg', 'src/components/Logo.tsx', 'declarations.d.ts']);
  assert.match(plan.files[2].content, /declare module '\*\.svg'/);
  const metro = edit(plan, 'metro.config.js');
  assert.match(metro.content, /const defaultConfig = getDefaultConfig\(__dirname\);\nconst \{ assetExts, sourceExts \} = defaultConfig\.resolver;/);
  assert.match(metro.content, /require\.resolve\('react-native-svg-transformer\/react-native'\)/);
  assert.match(metro.content, /module\.exports = mergeConfig\(defaultConfig, config\);/);

  const custom = planRecipe(template({ 'metro.config.js': "module.exports = { resolver: { foo: 1 } };\n" }), 'svg');
  assert.equal(edit(custom, 'metro.config.js').status, 'manual');

  const existing = planRecipe(template({ 'declarations.d.ts': "declare module '*.png';\n" }), 'svg');
  assert.equal(existing.files.some((f) => f.file === 'declarations.d.ts'), false);
  assert.match(edit(existing, 'declarations.d.ts').content, /^declare module '\*\.png';\n\ndeclare module '\*\.svg' \{/);
});

test('fonts: react-native.config.js is created, or extended when it has no assets', () => {
  const plan = planRecipe(template(), 'fonts');
  assert.deepEqual(plan.files.map((f) => f.file), ['src/assets/fonts/README.md', 'react-native.config.js']);
  assert.match(plan.files[1].content, /assets: \['\.\/src\/assets\/fonts\/'\]/);
  assert.deepEqual(plan.install.map((p) => `${p.name}${p.dev ? ' (dev)' : ''}`), ['react-native-asset (dev)']);
  assert.match(plan.next, /npx react-native-asset/);
  assert.match(plan.next, /PostScript name/);

  const existing = planRecipe(template({ 'react-native.config.js': 'module.exports = {\n  dependencies: {},\n};\n' }), 'fonts');
  assert.equal(existing.files.length, 1);
  assert.match(edit(existing, 'react-native.config.js').content, /module\.exports = \{\n {2}assets: \['\.\/src\/assets\/fonts\/'\],\n {2}dependencies/);
  const other = planRecipe(template({ 'react-native.config.js': "module.exports = {\n  assets: ['./fonts'],\n};\n" }), 'fonts');
  assert.equal(edit(other, 'react-native.config.js').status, 'manual');
});

test('icons: per-family package, static import and UIAppFonts', () => {
  const plan = planRecipe(template(), 'icons');
  assert.deepEqual(plan.install.map((p) => p.name), ['@react-native-vector-icons/ionicons']);
  assert.match(plan.files[0].content, /from '@react-native-vector-icons\/ionicons\/static'/);
  assert.match(edit(plan, 'Info.plist').content, /<key>UIAppFonts<\/key>\n\t<array>\n\t\t<string>Ionicons\.ttf<\/string>/);
});

// --- Data and native recipes ----------------------------------------------------------------------

test('storage: MMKV with Nitro Modules and a typed helper', () => {
  const plan = planRecipe(template(), 'storage');
  assert.deepEqual(plan.install.map((p) => p.name), ['react-native-mmkv', 'react-native-nitro-modules']);
  const [helper] = plan.files;
  assert.equal(helper.file, 'src/services/storage.ts');
  assert.match(helper.content, /export function getJSON<T>\(key: string\): T \| undefined \{/);
  assert.match(helper.content, /storage\.remove\(key\)/);
  const js = planRecipe(template({ 'tsconfig.json': null }), 'storage').files[0];
  assert.match(js.content, /export function getString\(key\) \{/);
  assert.doesNotMatch(js.content, /: string|<T>| as T/);
});

test('env-vars: .env files, .gitignore and the Android Gradle line', () => {
  const plan = planRecipe(template(), 'env-vars');
  assert.deepEqual(plan.files.map((f) => f.file), ['.env', '.env.example', 'src/config.ts', 'react-native-config.d.ts']);
  assert.match(plan.files[0].content, /^API_URL=/m);
  assert.match(plan.files[2].content, /Config\.API_URL/);
  assert.match(edit(plan, '.gitignore').content, /node_modules\/\n\n# Local settings \(rn-buddy add env-vars\)\n\.env\n$/);
  assert.match(
    edit(plan, 'build.gradle').content,
    /apply plugin: "com\.facebook\.react"\napply from: project\(':react-native-config'\)\.projectDir\.getPath\(\) \+ "\/dotenv\.gradle"\n\nreact \{/,
  );
  assert.match(plan.next, /never\s+put secrets there/);

  const ignored = planRecipe(template({ '.gitignore': 'node_modules/\n.env\n' }), 'env-vars');
  assert.equal(edit(ignored, '.gitignore').status, 'done');
  const kts = planRecipe(template({ 'android/app/build.gradle': null, 'android/app/build.gradle.kts': 'plugins {}\n' }), 'env-vars');
  assert.equal(kts.edits.find((e) => e.id === 'dotenv-gradle').status, 'manual');
});

// --- Navigation --------------------------------------------------------------------------------------

test('tabs and drawer bring the navigation packages and setup when navigation is missing', () => {
  const tabs = planRecipe(template(), 'tabs');
  assert.deepEqual(tabs.install.map((p) => p.name), ['@react-navigation/bottom-tabs', '@react-navigation/native', 'react-native-screens']);
  assert.deepEqual(tabs.installed, ['react-native-safe-area-context']);
  assert.match(tabs.files[0].content, /createBottomTabNavigator\(\{\n {2}screens: \{\n {4}Feed: FeedScreen,/);
  assert.equal(edit(tabs, 'MainActivity.kt').status, 'apply');

  const drawer = planRecipe(template(), 'drawer');
  assert.ok(drawer.install.some((p) => p.name === 'react-native-worklets'));
  assert.match(drawer.files[0].content, /createDrawerNavigator/);
  assert.equal(edit(drawer, 'babel.config.js').status, 'apply');
});

test('tabs after navigation: only the tab package is new', () => {
  const project = template({
    'package.json': JSON.stringify({
      ...PACKAGE,
      dependencies: { ...PACKAGE.dependencies, '@react-navigation/native': '^7.1.0', '@react-navigation/native-stack': '^7.3.0', 'react-native-screens': '^4.16.0' },
    }),
  });
  assert.deepEqual(planRecipe(project, 'tabs').install.map((p) => p.name), ['@react-navigation/bottom-tabs']);
});

// --- Tooling --------------------------------------------------------------------------------------------

test('imports: Babel module-resolver and tsconfig paths', () => {
  const plan = planRecipe(template(), 'imports');
  assert.deepEqual(plan.install, [{ name: 'babel-plugin-module-resolver', spec: 'babel-plugin-module-resolver', dev: true }]);
  assert.match(edit(plan, 'babel.config.js').content, /alias: \{ '@': '\.\/src' \}/);
  const tsconfig = JSON.parse(edit(plan, 'tsconfig.json').content);
  assert.deepEqual(tsconfig.compilerOptions, { paths: { '@/*': ['./src/*'] } });
  assert.equal(tsconfig.extends, '@react-native/typescript-config');

  // After animations, module-resolver goes before the worklets plugin.
  const animated = template({ 'babel.config.js': addWorkletsPlugin(BABEL) });
  assert.deepEqual(babelPlugins(edit(planRecipe(animated, 'imports'), 'babel.config.js').content), ['module-resolver', 'react-native-worklets/plugin']);

  const comments = planRecipe(template({ 'tsconfig.json': '{\n  // my settings\n  "extends": "x"\n}\n' }), 'imports');
  assert.equal(edit(comments, 'tsconfig.json').status, 'manual');
  const js = planRecipe(template({ 'tsconfig.json': null }), 'imports');
  assert.equal(edit(js, 'tsconfig.json'), undefined);
});

test('testing: jest.setup mocks the native packages the project has', () => {
  const plan = planRecipe(template(), 'testing');
  assert.deepEqual(plan.install.map((p) => p.name), ['@testing-library/react-native', 'test-renderer']);
  const setup = plan.files.find((f) => f.file === 'jest.setup.ts');
  assert.match(setup.content, /react-native-safe-area-context\/jest\/mock/);
  assert.doesNotMatch(setup.content, /reanimated|gesture-handler/);
  assert.ok(plan.files.some((f) => f.file === '__tests__/Example.test.tsx'));
  assert.match(edit(plan, 'jest.config.js').content, /preset: 'react-native',\n {2}setupFilesAfterEnv: \['<rootDir>\/jest\.setup\.ts'\],\n\};/);

  const nav = template({
    'package.json': JSON.stringify({ ...PACKAGE, dependencies: { ...PACKAGE.dependencies, '@react-navigation/native': '^7.1.0', 'react-native-reanimated': '^4.1.0' } }),
    'src/screens/HomeScreen.tsx': 'export function HomeScreen() {}\n',
  });
  const navPlan = planRecipe(nav, 'testing');
  assert.ok(navPlan.files.some((f) => f.file === '__tests__/HomeScreen.test.tsx'));
  assert.match(navPlan.files[0].content, /setUpTests\(\)/);
  const jest = edit(navPlan, 'jest.config.js').content;
  assert.match(jest, /transformIgnorePatterns: \['node_modules\/\(\?!\(@react-native\|react-native\|@react-navigation\)\/\)'\]/);
  assert.match(jest, /resolver: 'react-native-reanimated\/jest\/resolver'/);
});

test('lint: the template already has ESLint and Prettier; only the format script is added', () => {
  const plan = planRecipe(template(), 'lint');
  assert.deepEqual(plan.install, []);
  assert.deepEqual(plan.files, []);
  const scripts = JSON.parse(edit(plan, 'package.json').content).scripts;
  assert.equal(scripts.lint, 'eslint .');
  assert.equal(scripts.format, 'prettier --write .');

  const bare = template({ 'package.json': JSON.stringify({ name: 'x', dependencies: { 'react-native': '0.81.4' } }), '.eslintrc.js': null, '.prettierrc.js': null });
  const barePlan = planRecipe(bare, 'lint');
  assert.deepEqual(barePlan.install.map((p) => p.spec), ['eslint@^8.19.0', '@react-native/eslint-config@0.81', 'prettier']);
  assert.deepEqual(barePlan.files.map((f) => f.file), ['.eslintrc.js', '.prettierrc.js']);
});

test('applyPlan works out package.json edits again after the install changed the file', () => {
  const project = template({ 'package.json': JSON.stringify({ name: 'x', dependencies: { 'react-native': '0.81.4' } }, null, 2), '.eslintrc.js': null });
  const plan = planRecipe(project, 'lint');
  const { run } = fakeRun(() => {
    const pkg = JSON.parse(read(project.root, 'package.json'));
    pkg.devDependencies = { eslint: '^8.19.0', prettier: '^3.6.0' };
    writeFileSync(path.join(project.root, 'package.json'), JSON.stringify(pkg, null, 2));
  });
  const result = applyPlan(project, plan, { run, platform: 'linux' });
  assert.deepEqual(result.skipped, []);
  const pkg = JSON.parse(read(project.root, 'package.json'));
  assert.deepEqual(pkg.devDependencies, { eslint: '^8.19.0', prettier: '^3.6.0' });
  assert.equal(pkg.scripts.format, 'prettier --write .');
});

// --- Expo ---------------------------------------------------------------------------------------------

test('Expo: npx expo install, with devDependencies passed to the package manager', () => {
  const plan = planRecipe(expoProject(), 'svg');
  assert.deepEqual(installCommands(plan), [
    { command: 'npx', args: ['expo', 'install', 'react-native-svg'] },
    { command: 'npx', args: ['expo', 'install', 'react-native-svg-transformer', '--', '--save-dev'] },
  ]);
  const yarn = planRecipe(expoProject({ 'yarn.lock': '' }), 'svg');
  assert.deepEqual(installCommands(yarn)[1].args.slice(-2), ['--', '--dev']);
  // Expo projects often have no metro.config.js: it's created with the Expo transformer.
  const metro = plan.files.find((f) => f.file === 'metro.config.js');
  assert.match(metro.content, /require\('expo\/metro-config'\)/);
  assert.match(metro.content, /react-native-svg-transformer\/expo/);
});

test('Expo: an existing default metro.config.js is extended', () => {
  const metro = "// Learn more https://docs.expo.dev/guides/customizing-metro\nconst { getDefaultConfig } = require('expo/metro-config');\n\n/** @type {import('expo/metro-config').MetroConfig} */\nconst config = getDefaultConfig(__dirname);\n\nmodule.exports = config;\n";
  const plan = planRecipe(expoProject({ 'metro.config.js': metro }), 'svg');
  assert.equal(plan.files.some((f) => f.file === 'metro.config.js'), false);
  const result = edit(plan, 'metro.config.js').content;
  assert.match(result, /const config = getDefaultConfig\(__dirname\);\n\n\/\/ react-native-svg-transformer/);
  assert.match(result, /\nmodule\.exports = config;\n$/);
});

test('Expo: native folders are generated, so permissions go into app.json', () => {
  const plan = planRecipe(expoProject(), 'permissions', ['camera', 'location']);
  assert.equal(plan.expoGo, false);
  assert.deepEqual(plan.edits.map((e) => e.file), ['app.json']);
  const app = JSON.parse(edit(plan, 'app.json').content);
  assert.deepEqual(app.expo.plugins, ['expo-router', ['react-native-permissions', { iosPermissions: ['Camera', 'LocationWhenInUse'] }]]);
  assert.equal(app.expo.ios.infoPlist.NSCameraUsageDescription, 'This app uses the camera to take photos.');
  assert.deepEqual(app.expo.android.permissions, ['android.permission.CAMERA', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']);
  assert.match(plan.next, /development build/);
  assert.match(plan.next, /app\.json/);

  // Adding more later merges into the same plugin entry.
  const project = expoProject({ 'app.json': edit(plan, 'app.json').content });
  const more = JSON.parse(edit(planRecipe(project, 'permissions', ['microphone']), 'app.json').content);
  assert.deepEqual(more.expo.plugins[1], ['react-native-permissions', { iosPermissions: ['Camera', 'LocationWhenInUse', 'Microphone'] }]);

  const dynamic = planRecipe(expoProject({ 'app.config.ts': 'export default {};' }), 'permissions', ['camera']);
  assert.equal(dynamic.edits[0].status, 'manual');
  assert.match(dynamic.edits[0].manual, /"iosPermissions": \["Camera"\]/);
});

test('Expo: git-ignored native folders are not edited; a bare Expo project is', () => {
  const generated = expoProject({ 'ios/Podfile': PODFILE, 'ios/DemoApp/Info.plist': PLIST });
  assert.deepEqual(planRecipe(generated, 'icons').edits, []);
  assert.deepEqual(planRecipe(generated, 'permissions', ['camera']).edits.map((e) => e.file), ['app.json']);

  const bare = expoProject({ '.gitignore': 'node_modules/\n', 'ios/Podfile': PODFILE, 'ios/DemoApp/Info.plist': PLIST });
  assert.deepEqual(planRecipe(bare, 'permissions', ['camera']).edits.map((e) => path.basename(e.file)), ['Info.plist', 'Podfile']);
});

test('Expo: recipes use what Expo has built in', () => {
  const project = expoProject();
  const env = planRecipe(project, 'env-vars');
  assert.deepEqual(env.install, []);
  assert.match(env.files[0].content, /^EXPO_PUBLIC_API_URL=/m);
  assert.match(env.files[2].content, /process\.env\.EXPO_PUBLIC_API_URL/);
  assert.equal(env.expoGo, true);

  const imports = planRecipe(project, 'imports');
  assert.deepEqual(imports.install, []);
  assert.deepEqual(imports.edits.map((e) => e.file), ['tsconfig.json']);
  assert.deepEqual(JSON.parse(imports.edits[0].content).compilerOptions, { strict: true, paths: { '@/*': ['./src/*'] } });

  assert.deepEqual(planRecipe(project, 'animations').edits, []);
  assert.match(planRecipe(project, 'icons').files[0].content, /from '@react-native-vector-icons\/ionicons';/);
  assert.equal(planRecipe(project, 'storage').expoGo, false);
  assert.deepEqual(planRecipe(project, 'fonts').install.map((p) => p.name), ['expo-font']);
  assert.match(planRecipe(project, 'lint').edits[0].content, /"lint": "expo lint"/);
});

// --- Undo ---------------------------------------------------------------------------------------------

function installAll(project, plan) {
  // Pretends the packages were installed: package.json lists them.
  const pkg = JSON.parse(read(project.root, 'package.json'));
  for (const { name, dev } of plan.install) {
    const field = dev ? 'devDependencies' : 'dependencies';
    pkg[field] = { ...pkg[field], [name]: '*' };
  }
  writeFileSync(path.join(project.root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

function addRecipe(project, name, args = []) {
  const plan = planRecipe(project, name, args);
  applyPlan(project, plan, { run: fakeRun(() => installAll(project, plan)).run, platform: 'linux' });
  return readProject(project.root);
}

test('undo: unchanged files are deleted, changed ones kept, edits reverted, packages uninstalled', () => {
  const project = addRecipe(template(), 'animations');
  const plan = planUndo(project, 'animations');
  assert.deepEqual(plan.uninstall, ['react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler']);
  assert.deepEqual(uninstallCommand(plan), {
    command: 'npm',
    args: ['uninstall', 'react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler'],
  });
  assert.deepEqual(plan.files, [{ file: 'src/components/FadeInView.tsx', status: 'delete' }]);
  assert.equal(edit(plan, 'babel.config.js').status, 'apply');

  const { run, calls } = fakeRun();
  applyUndo(project, plan, { run, platform: 'linux' });
  assert.deepEqual(calls, ['npm uninstall react-native-reanimated react-native-worklets react-native-gesture-handler']);
  assert.equal(read(project.root, 'babel.config.js'), BABEL);
  assert.equal(existsSync(path.join(project.root, 'src')), false, 'empty folders are removed too');
});

test('undo: a changed file is kept, and packages your code imports stay', () => {
  const project = addRecipe(template(), 'animations');
  writeFileSync(path.join(project.root, 'src/components/FadeInView.tsx'), '// mine\n');
  writeFileSync(path.join(project.root, 'src/App.tsx'), "import { Gesture } from 'react-native-gesture-handler';\n");
  const plan = planUndo(readProject(project.root), 'animations');
  assert.deepEqual(plan.files, [{ file: 'src/components/FadeInView.tsx', status: 'keep', reason: 'you changed it' }]);
  assert.deepEqual(plan.kept, [{ name: 'react-native-gesture-handler', reason: 'imported in src/App.tsx' }]);
  assert.ok(!plan.uninstall.includes('react-native-gesture-handler'));
});

test('undo: a library your code still uses keeps its peers and its setup', () => {
  const project = addRecipe(template({ 'node_modules/react-native-reanimated/package.json': { peerDependencies: { 'react-native-worklets': '*', react: '*' } } }), 'animations');
  writeFileSync(path.join(project.root, 'src/Splash.tsx'), "import Animated from 'react-native-reanimated';\n");
  const plan = planUndo(readProject(project.root), 'animations');
  assert.deepEqual(plan.uninstall, ['react-native-gesture-handler']);
  assert.deepEqual(plan.kept, [
    { name: 'react-native-reanimated', reason: 'imported in src/Splash.tsx' },
    { name: 'react-native-worklets', reason: 'react-native-reanimated needs it' },
  ]);
  assert.equal(edit(plan, 'babel.config.js').status, 'keep');
  assert.match(edit(plan, 'babel.config.js').reason, /still needed: react-native-reanimated is imported in src\/Splash\.tsx/);
});

test('undo: what another set-up recipe needs is kept', () => {
  let project = addRecipe(template(), 'animations');
  project = addRecipe(project, 'drawer');
  const plan = planUndo(project, 'animations');
  assert.deepEqual(plan.uninstall, []);
  assert.deepEqual(plan.kept.map((k) => k.reason), ['the drawer recipe uses it', 'the drawer recipe uses it', 'the drawer recipe uses it']);
  assert.equal(edit(plan, 'babel.config.js').status, 'keep');
  assert.ok(hasChanges(plan), 'FadeInView is still deleted');

  // Undoing the drawer keeps the navigation core? No navigation recipe here, so it goes, except what App.tsx imports.
  const drawer = planUndo(project, 'drawer');
  assert.ok(drawer.kept.some((k) => k.name === 'react-native-safe-area-context' && /App\.tsx/.test(k.reason)));
  assert.equal(drawer.edits.find((e) => e.id === 'babel-worklets').status, 'keep');
});

test('undo: navigation native edits are reverted exactly', () => {
  const project = addRecipe(template(), 'navigation');
  assert.match(read(project.root, MAIN_ACTIVITY_PATH), /RNScreensFragmentFactory/);
  applyUndo(project, planUndo(project, 'navigation'), { run: fakeRun().run, platform: 'linux' });
  assert.equal(read(project.root, MAIN_ACTIVITY_PATH), MAIN_ACTIVITY);
  assert.equal(read(project.root, 'android/app/src/main/AndroidManifest.xml'), MANIFEST);
});

test('undo: permissions found in the Podfile are removed from all three files', () => {
  const project = addRecipe(template(), 'permissions', ['camera', 'microphone']);
  const plan = planUndo(project, 'permissions');
  assert.deepEqual(plan.args, ['camera', 'microphone']);
  applyUndo(project, plan, { run: fakeRun().run, platform: 'linux' });
  assert.equal(read(project.root, 'ios/DemoApp/Info.plist').includes('NSCameraUsageDescription'), false);
  assert.equal(read(project.root, 'android/app/src/main/AndroidManifest.xml'), MANIFEST);
  assert.doesNotMatch(read(project.root, 'ios/Podfile'), /setup_permissions/);
});

test('undo: edits without a safe undo are listed as by hand', () => {
  const project = addRecipe(template(), 'svg');
  writeFileSync(path.join(project.root, 'metro.config.js'), read(project.root, 'metro.config.js').replace("'svg']", "'svg', 'md']"));
  const plan = planUndo(readProject(project.root), 'svg');
  const metro = edit(plan, 'metro.config.js');
  assert.equal(metro.status, 'manual');
  assert.match(metro.manual, /^Undo by hand in metro\.config\.js/);
});

test('undo: Expo app.json plugin is removed', () => {
  const project = addRecipe(expoProject(), 'permissions', ['camera']);
  const plan = planUndo(project, 'permissions');
  applyUndo(project, plan, { run: fakeRun().run, platform: 'linux' });
  assert.deepEqual(JSON.parse(read(project.root, 'app.json')), JSON.parse(EXPO_APP_JSON));
});

// --- CLI ----------------------------------------------------------------------------------------------

test('cli: add lists recipes by group', () => {
  const { status, stdout } = rnBuddy('add');
  assert.equal(status, 0);
  assert.match(stdout, /Navigation\n {2}navigation +Move between screens.*\n {2}tabs +.*\n {2}drawer/);
  assert.match(stdout, /Tooling\n {2}imports/);
  assert.match(stdout, /rn-buddy add --undo <recipe>/);
});

test('cli: add permissions without names lists them; unknown names fail', () => {
  const list = rnBuddy('add', 'permissions');
  assert.equal(list.status, 0);
  assert.match(list.stdout, /Which permissions\? Name one or more/);
  assert.match(list.stdout, /camera +take photos or video/);

  const root = template().root;
  const wrong = rnBuddy('add', 'permissions', 'camra', '--dir', root, '--offline', '--dry-run');
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /Unknown permission "camra"/);
});

test('cli: add permissions --dry-run shows the edits', () => {
  const root = template().root;
  const { status, stdout } = rnBuddy('add', 'permissions', 'camera', '--dir', root, '--offline', '--dry-run');
  assert.equal(status, 0);
  assert.match(stdout, /add permissions camera +Ask for camera/);
  assert.match(stdout, /\$ npm install react-native-permissions/);
  assert.match(stdout, /Edit +ios\/DemoApp\/Info\.plist/);
  assert.match(stdout, /setup_permissions\(\['Camera'\]\)/);
  assert.match(stdout, /Dry run: nothing was changed/);
  assert.equal(read(root, 'ios/Podfile'), PODFILE);
});

test('cli: Expo projects install with npx expo install and warn about Expo Go', () => {
  const root = expoProject().root;
  const { status, stdout } = rnBuddy('add', 'storage', '--dir', root, '--offline', '--dry-run');
  assert.equal(status, 0);
  assert.match(stdout, /\$ npx expo install react-native-mmkv react-native-nitro-modules/);
  assert.match(stdout, /Then +rebuild your development build/);
  assert.match(stdout, /Expo Go doesn't include/);
});

test('cli: add --undo --dry-run shows what would be removed', () => {
  const project = addRecipe(template(), 'state');
  const { status, stdout } = rnBuddy('add', 'state', '--undo', '--dir', project.root, '--dry-run');
  assert.equal(status, 0);
  assert.match(stdout, /undo state/);
  assert.match(stdout, /Uninstall +zustand\n +\$ npm uninstall zustand/);
  assert.match(stdout, /Delete +src\/store\/useCounterStore\.ts/);
  assert.ok(existsSync(path.join(project.root, 'src/store/useCounterStore.ts')));

  const notRecipe = rnBuddy('add', 'lodash', '--undo', '--dir', project.root);
  assert.equal(notRecipe.status, 1);
  assert.match(notRecipe.stderr, /--undo works with recipes/);
});
