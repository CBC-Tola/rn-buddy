import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  appConfigurations,
  appSummary,
  applyAppPlan,
  bumpVersion,
  hasChanges,
  nextBuild,
  normalizeColor,
  planIcon,
  planId,
  planName,
  planSplash,
  planVersion,
  readAppInfo,
  readPngInfo,
  resolveSetting,
  setAndroidAppName,
  androidAppName,
  validateAppId,
} from '../src/lib/app.js';
import { plistArray, plistString, setPlistArray, setPlistString } from '../src/lib/plist.js';
import { readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

const STRINGS = `<resources>
    <string name="app_name">DemoApp</string>
</resources>
`;

const BUILD_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    autolinkLibrariesWithApp()
}

def enableProguardInReleaseBuilds = false

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace "com.demo"
    defaultConfig {
        applicationId "com.demo"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
}
`;

const MAIN_ACTIVITY = `package com.demo

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "DemoApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`;

const MAIN_APPLICATION = `package com.demo

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
      packageList = PackageList(this).packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CADisableMinimumFrameDurationOnPhone</key>
	<true/>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>DemoApp</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<false/>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>arm64</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<false/>
</dict>
</plist>
`;

// The app target's Debug and Release configurations, a test target and the project-level ones.
const PBXPROJ = `// !$*UTF8*$!
{
	objects = {
/* Begin XCBuildConfiguration section */
		00E356F61AD99517003FC87E /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				BUNDLE_LOADER = "$(TEST_HOST)";
				INFOPLIST_FILE = DemoAppTests/Info.plist;
				PRODUCT_BUNDLE_IDENTIFIER = "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)";
				PRODUCT_NAME = "$(TARGET_NAME)";
				TEST_HOST = "$(BUILT_PRODUCTS_DIR)/DemoApp.app/DemoApp";
			};
			name = Debug;
		};
		13B07F941A680F5B00A75B9A /* Debug */ = {
			isa = XCBuildConfiguration;
			baseConfigurationReference = 3B4392A12AC88292D35C810B /* Pods-DemoApp.debug.xcconfig */;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CLANG_ENABLE_MODULES = YES;
				CURRENT_PROJECT_VERSION = 1;
				ENABLE_BITCODE = NO;
				INFOPLIST_FILE = DemoApp/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				OTHER_LDFLAGS = (
					"$(inherited)",
					"-ObjC",
					"-lc++",
				);
				PRODUCT_BUNDLE_IDENTIFIER = "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)";
				PRODUCT_NAME = DemoApp;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
				SWIFT_VERSION = 5.0;
				VERSIONING_SYSTEM = "apple-generic";
			};
			name = Debug;
		};
		13B07F951A680F5B00A75B9A /* Release */ = {
			isa = XCBuildConfiguration;
			baseConfigurationReference = 5709B34CF0A7D63546082F79 /* Pods-DemoApp.release.xcconfig */;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CLANG_ENABLE_MODULES = YES;
				CURRENT_PROJECT_VERSION = 1;
				INFOPLIST_FILE = DemoApp/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)";
				PRODUCT_NAME = DemoApp;
				SWIFT_VERSION = 5.0;
				VERSIONING_SYSTEM = "apple-generic";
			};
			name = Release;
		};
		83CBBA201A601CBA00E9B192 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
				SDKROOT = iphoneos;
			};
			name = Debug;
		};
/* End XCBuildConfiguration section */
	};
	rootObject = 83CBB9F71A601CBA00E9B192 /* Project object */;
}
`;

const APPICON_CONTENTS = JSON.stringify({
  images: [
    { idiom: 'iphone', scale: '2x', size: '20x20' },
    { idiom: 'iphone', scale: '3x', size: '60x60' },
    { idiom: 'ios-marketing', scale: '1x', size: '1024x1024' },
  ],
  info: { author: 'xcode', version: 1 },
});

const TEMPLATE = {
  'package.json': { name: 'DemoApp', version: '0.0.1', dependencies: { 'react-native': '0.88.0' } },
  'app.json': JSON.stringify({ name: 'DemoApp', displayName: 'DemoApp' }, null, 2) + '\n',
  'android/app/build.gradle': BUILD_GRADLE,
  'android/app/src/main/res/values/strings.xml': STRINGS,
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': 'old',
  'android/app/src/main/java/com/demo/MainActivity.kt': MAIN_ACTIVITY,
  'android/app/src/main/java/com/demo/MainApplication.kt': MAIN_APPLICATION,
  'ios/DemoApp/Info.plist': INFO_PLIST,
  'ios/DemoApp/AppDelegate.swift': 'import UIKit\n',
  'ios/DemoApp/Images.xcassets/AppIcon.appiconset/Contents.json': APPICON_CONTENTS,
  'ios/DemoApp.xcodeproj/project.pbxproj': PBXPROJ,
};

function project(files = TEMPLATE) {
  return readProject(makeProject(files));
}

function expoProject(expo, extra = {}) {
  return project({
    'package.json': { name: 'expo-app', version: '1.0.0', dependencies: { expo: '~54.0.0', 'react-native': '0.81.0' } },
    'app.json': JSON.stringify({ expo }, null, 2) + '\n',
    ...extra,
  });
}

// A PNG header: signature, then the IHDR chunk with width, height, bit depth and color type.
function png(width, height, colorType = 2) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  return buffer;
}

function writePng(dir, name, ...args) {
  const file = path.join(dir, name);
  writeFileSync(file, png(...args));
  return file;
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

// Fake sips: "resizes" by writing the size into the --out file.
function fakeRun(calls = []) {
  return (command, args) => {
    calls.push([command, ...args].join(' '));
    if (command === 'sips') writeFileSync(args[args.indexOf('--out') + 1], `png ${args[1]}`);
    return true;
  };
}

test('validateAppId follows the Android and iOS rules', () => {
  assert.equal(validateAppId('com.example.budget'), null);
  assert.equal(validateAppId('com.Example.Budget2'), null);
  assert.match(validateAppId('budget'), /at least two parts/);
  assert.match(validateAppId('com..budget'), /empty part/);
  assert.match(validateAppId('com.1budget'), /start with a letter/);
  assert.match(validateAppId('com.my-app'), /letters, numbers and _/);
  assert.match(validateAppId('com.example.new'), /keyword/);
  assert.match(validateAppId('com.fun.app'), /keyword/);
  assert.match(validateAppId('com.my_app'), /iOS bundle IDs can't contain _/);
  assert.equal(validateAppId('com.my_app', { ios: false }), null);
});

test('bumpVersion and nextBuild', () => {
  assert.equal(bumpVersion('1.0', 'patch'), '1.0.1');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(bumpVersion(null, 'patch'), '0.0.1');
  assert.equal(bumpVersion('1.0', '2.1'), '2.1');
  assert.throws(() => bumpVersion('1.0', 'bigger'), /isn't a version/);
  assert.equal(nextBuild('1'), '2');
  assert.equal(nextBuild(41), '42');
  assert.equal(nextBuild('1.0.3'), null);
});

test('readPngInfo reads size and transparency from the IHDR header', () => {
  assert.deepEqual(readPngInfo(png(1024, 1024)), { width: 1024, height: 1024, alpha: false });
  assert.deepEqual(readPngInfo(png(512, 300, 6)), { width: 512, height: 300, alpha: true });
  assert.equal(readPngInfo(Buffer.from('GIF89a, not a png at all, really')), null);
});

test('normalizeColor accepts #fff, fff and #FFFFFF', () => {
  assert.equal(normalizeColor('#fff'), '#ffffff');
  assert.equal(normalizeColor('1E90FF'), '#1e90ff');
  assert.throws(() => normalizeColor('white'), /hex color/);
});

test('plist helpers read and set top-level strings and arrays, keeping tabs', () => {
  assert.equal(plistString(INFO_PLIST, 'CFBundleDisplayName'), 'DemoApp');
  assert.equal(plistString(INFO_PLIST, 'NSAllowsArbitraryLoads'), null);
  assert.equal(plistString(INFO_PLIST, 'LSRequiresIPhoneOS'), null);

  const renamed = setPlistString(INFO_PLIST, 'CFBundleDisplayName', 'Budget & Co');
  assert.match(renamed, /\t<key>CFBundleDisplayName<\/key>\n\t<string>Budget &amp; Co<\/string>/);
  assert.equal(plistString(renamed, 'CFBundleDisplayName'), 'Budget & Co');

  // A missing key is added in alphabetical order, like Xcode writes them.
  const withoutName = INFO_PLIST.replace('\t<key>CFBundleDisplayName</key>\n\t<string>DemoApp</string>\n', '');
  const added = setPlistString(withoutName, 'CFBundleDisplayName', 'Budget');
  assert.match(added, /<string>en<\/string>\n\t<key>CFBundleDisplayName<\/key>\n\t<string>Budget<\/string>\n\t<key>CFBundleExecutable/);
  assert.equal(setPlistString(INFO_PLIST, 'LSRequiresIPhoneOS', 'x'), null);

  assert.deepEqual(plistArray(INFO_PLIST, 'UIRequiredDeviceCapabilities'), ['arm64']);
  const array = setPlistArray(INFO_PLIST, 'UIRequiredDeviceCapabilities', ['arm64', 'gamekit']);
  assert.match(array, /\t<array>\n\t\t<string>arm64<\/string>\n\t\t<string>gamekit<\/string>\n\t<\/array>/);
  assert.deepEqual(plistArray(setPlistArray(INFO_PLIST, 'LSApplicationQueriesSchemes', ['tel']), 'LSApplicationQueriesSchemes'), ['tel']);
});

test('Android app_name is escaped for string resources', () => {
  const content = setAndroidAppName(STRINGS, "Tola's \"Budget\" & Co");
  assert.match(content, /<string name="app_name">Tola\\'s \\"Budget\\" &amp; Co<\/string>/);
  assert.equal(androidAppName(content), 'Tola\'s "Budget" & Co');
  assert.equal(setAndroidAppName('<resources/>', 'x'), null);
});

test('pbxproj: finds the app configurations and resolves the bundle ID', () => {
  const configs = appConfigurations(PBXPROJ, 'DemoApp');
  assert.deepEqual(configs.map((c) => c.name), ['Debug', 'Release']);
  assert.equal(
    resolveSetting(configs[0].settings.PRODUCT_BUNDLE_IDENTIFIER, configs[0].settings),
    'org.reactjs.native.example.DemoApp',
  );
  assert.equal(resolveSetting('$(PRODUCT_NAME:rfc1034identifier)', { PRODUCT_NAME: 'My App' }), 'My-App');
  assert.equal(resolveSetting('$(UNKNOWN)', {}), '$(UNKNOWN)');
});

test('readAppInfo and appSummary show both platforms and flag differences', () => {
  const { root, pkg } = project();
  const info = readAppInfo(root, pkg);
  assert.equal(info.android.name, 'DemoApp');
  assert.equal(info.android.applicationId, 'com.demo');
  assert.equal(info.android.versionCode, '1');
  assert.equal(info.ios.name, 'DemoApp');
  assert.equal(info.ios.bundleId, 'org.reactjs.native.example.DemoApp');
  assert.equal(info.ios.version, '1.0');
  assert.equal(info.ios.build, '1');

  const { rows, notes } = appSummary(info);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel.Name.differs, false);
  assert.equal(byLabel.ID.differs, true);
  assert.equal(byLabel.Version.differs, false);
  assert.ok(notes.some((note) => /placeholder ID/.test(note)));
  assert.ok(notes.some((note) => /package.json version is 0.0.1/.test(note)));
});

test('app name: strings.xml, Info.plist and app.json, never the module name', () => {
  const p = project();
  const plan = planName(p, 'Budget Buddy');
  assert.deepEqual(plan.edits.map((e) => [e.file, e.status]), [
    ['android/app/src/main/res/values/strings.xml', 'apply'],
    ['ios/DemoApp/Info.plist', 'apply'],
    ['app.json', 'apply'],
  ]);
  assert.ok(plan.notes.some((note) => /internal name "DemoApp" stays the same/.test(note)));
  assert.equal(plan.warnings.length, 0);
  assert.ok(planName(p, 'Budget Buddy Pro').warnings.some((w) => /12 characters/.test(w)));

  applyAppPlan(p.root, plan, { run: fakeRun() });
  assert.match(read(p.root, 'android/app/src/main/res/values/strings.xml'), /<string name="app_name">Budget Buddy<\/string>/);
  assert.equal(plistString(read(p.root, 'ios/DemoApp/Info.plist'), 'CFBundleDisplayName'), 'Budget Buddy');
  assert.deepEqual(JSON.parse(read(p.root, 'app.json')), { name: 'DemoApp', displayName: 'Budget Buddy' });
  assert.match(read(p.root, 'android/app/src/main/java/com/demo/MainActivity.kt'), /"DemoApp"/);

  // Running it again changes nothing.
  assert.equal(hasChanges(planName(p, 'Budget Buddy')), false);
});

test('app name: a strings.xml without app_name becomes a manual step', () => {
  const p = project({ ...TEMPLATE, 'android/app/src/main/res/values/strings.xml': '<resources>\n</resources>\n' });
  const plan = planName(p, 'Budget');
  assert.ok(plan.manual.some((m) => /app_name/.test(m)));
});

test('app id: plans gradle, package folder move and pbxproj', () => {
  const p = project({ ...TEMPLATE, 'android/app/src/main/java/com/demo/newarch/Thing.kt': 'package com.demo.newarch\n' });
  const plan = planId(p, 'com.example.budget');

  const gradle = plan.edits.find((e) => e.file === 'android/app/build.gradle');
  assert.deepEqual(gradle.changes.map((c) => `${c.label} ${c.before} → ${c.after}`), [
    'applicationId com.demo → com.example.budget',
    'namespace com.demo → com.example.budget',
  ]);
  assert.deepEqual(plan.moves.map((m) => [m.from, m.to]).sort(), [
    ['android/app/src/main/java/com/demo/MainActivity.kt', 'android/app/src/main/java/com/example/budget/MainActivity.kt'],
    ['android/app/src/main/java/com/demo/MainApplication.kt', 'android/app/src/main/java/com/example/budget/MainApplication.kt'],
  ]);
  assert.ok(plan.moves.every((m) => m.content.startsWith('package com.example.budget\n')));
  assert.ok(plan.manual.some((m) => /newarch\/ is a sub-package/.test(m)));

  const pbx = plan.edits.find((e) => e.file.endsWith('project.pbxproj'));
  assert.deepEqual(pbx.changes.map((c) => `${c.label}: ${c.after}`), [
    'PRODUCT_BUNDLE_IDENTIFIER (DemoApp: Debug, Release): com.example.budget',
    'PRODUCT_BUNDLE_IDENTIFIER (DemoAppTests: Debug): com.example.budget.$(PRODUCT_NAME:rfc1034identifier)',
  ]);
  assert.ok(plan.warnings.some((w) => /different app/.test(w)));
  assert.ok(plan.then.some((t) => /rn-buddy clean --android/.test(t)));
});

test('app id: apply moves the Kotlin files and removes the empty old folder', () => {
  const p = project();
  applyAppPlan(p.root, planId(p, 'com.example.budget'), { run: fakeRun() });
  const java = 'android/app/src/main/java';
  assert.equal(existsSync(path.join(p.root, java, 'com/demo')), false);
  assert.equal(existsSync(path.join(p.root, java, 'com')), true);
  assert.match(read(p.root, `${java}/com/example/budget/MainActivity.kt`), /^package com\.example\.budget\n/);
  assert.match(read(p.root, 'android/app/build.gradle'), /namespace "com\.example\.budget"[\s\S]*applicationId "com\.example\.budget"/);

  const pbx = read(p.root, 'ios/DemoApp.xcodeproj/project.pbxproj');
  assert.equal((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.example\.budget;/g) ?? []).length, 2);
  assert.match(pbx, /PRODUCT_BUNDLE_IDENTIFIER = "com\.example\.budget\.\$\(PRODUCT_NAME:rfc1034identifier\)";/);
  assert.equal(readAppInfo(p.root, p.pkg).ios.bundleId, 'com.example.budget');

  assert.equal(hasChanges(planId(p, 'com.example.budget')), false);
});

test('app id: Kotlin DSL gradle files and invalid IDs', () => {
  const kts = BUILD_GRADLE.replace('namespace "com.demo"', 'namespace = "com.demo"').replace('applicationId "com.demo"', 'applicationId = "com.demo"');
  const files = Object.fromEntries(Object.entries(TEMPLATE).filter(([file]) => file !== 'android/app/build.gradle'));
  const p = project({ ...files, 'android/app/build.gradle.kts': kts });
  const gradle = planId(p, 'com.example.budget').edits.find((e) => e.file === 'android/app/build.gradle.kts');
  assert.match(gradle.content, /namespace = "com\.example\.budget"/);
  assert.throws(() => planId(p, 'com.example.class'), /keyword/);
});

test('app version: bumps versionName/Code, MARKETING_VERSION/CURRENT_PROJECT_VERSION and package.json together', () => {
  const p = project();
  const plan = planVersion(p, 'patch');
  assert.equal(plan.title, 'app version  1.0 → 1.0.1');
  const changes = plan.edits.flatMap((e) => e.changes.map((c) => `${c.label} ${c.before} → ${c.after}`));
  assert.deepEqual(changes, [
    'versionName 1.0 → 1.0.1',
    'versionCode 1 → 2',
    'MARKETING_VERSION (Debug, Release) 1.0 → 1.0.1',
    'CURRENT_PROJECT_VERSION (Debug, Release) 1 → 2',
    'version "0.0.1" → "1.0.1"',
  ]);

  applyAppPlan(p.root, plan, { run: fakeRun() });
  const info = readAppInfo(p.root, readProject(p.root).pkg);
  assert.equal(info.android.versionName, '1.0.1');
  assert.equal(info.android.versionCode, '2');
  assert.equal(info.ios.version, '1.0.1');
  assert.equal(info.ios.build, '2');
  assert.equal(JSON.parse(read(p.root, 'package.json')).version, '1.0.1');
  // The test target has no versions, so it is left alone.
  assert.match(read(p.root, 'ios/DemoApp.xcodeproj/project.pbxproj'), /INFOPLIST_FILE = DemoAppTests\/Info.plist;\n\t\t\t\tPRODUCT_BUNDLE/);
});

test('app version: literal versions in Info.plist and a version that goes down', () => {
  const plist = INFO_PLIST.replace('$(MARKETING_VERSION)', '1.4').replace('$(CURRENT_PROJECT_VERSION)', '7');
  const p = project({ ...TEMPLATE, 'ios/DemoApp/Info.plist': plist });
  const plan = planVersion(p, '1.0.0');
  const edit = plan.edits.find((e) => e.file === 'ios/DemoApp/Info.plist');
  assert.deepEqual(edit.changes.map((c) => `${c.label} ${c.before} → ${c.after}`), [
    'CFBundleShortVersionString 1.4 → 1.0.0',
    'CFBundleVersion 7 → 8',
  ]);
  assert.ok(plan.warnings.some((w) => /not higher than 1\.4/.test(w)));
});

test('app icon: every Android density, round icons and one 1024 icon for iOS', () => {
  const p = project();
  const icon = writePng(p.root, 'icon.png', 1024, 1024);
  const plan = planIcon(p, icon, { platform: 'darwin' });
  assert.equal(plan.resizes.filter((r) => r.file.includes('mipmap')).length, 10);
  assert.ok(plan.resizes.some((r) => r.file === 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png' && r.size === 192));
  assert.ok(plan.resizes.some((r) => r.file === 'ios/DemoApp/Images.xcassets/AppIcon.appiconset/icon-1024.png' && r.size === 1024));

  const calls = [];
  applyAppPlan(p.root, plan, { run: fakeRun(calls) });
  assert.equal(calls.length, 6);
  assert.match(calls[0], /^sips -z 48 48 .*icon\.png --out /);
  assert.equal(read(p.root, 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png'), 'png 72');
  assert.equal(read(p.root, 'ios/DemoApp/Images.xcassets/AppIcon.appiconset/icon-1024.png'), 'png 1024');
  const contents = JSON.parse(read(p.root, 'ios/DemoApp/Images.xcassets/AppIcon.appiconset/Contents.json'));
  assert.deepEqual(contents.images, [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }]);
});

test('app icon: checks the image and the platform', () => {
  const p = project();
  assert.throws(() => planIcon(p, writePng(p.root, 'small.png', 512, 512), { platform: 'darwin' }), /at least 1024×1024/);
  assert.throws(() => planIcon(p, writePng(p.root, 'wide.png', 2048, 1024), { platform: 'darwin' }), /must be square/);
  assert.throws(() => planIcon(p, path.join(p.root, 'missing.png')), /Can't find/);
  assert.throws(() => planIcon(p, path.join(p.root, 'app.json')), /not a PNG/);
  assert.throws(() => planIcon(p, writePng(p.root, 'icon.png', 1024, 1024), { platform: 'linux' }), /sips/);

  const plan = planIcon(p, writePng(p.root, 'alpha.png', 1024, 1024, 6), { platform: 'darwin' });
  assert.ok(plan.warnings.some((w) => /transparency/.test(w)));
});

test('app icon: a failing sips changes nothing', () => {
  const p = project();
  const plan = planIcon(p, writePng(p.root, 'icon.png', 1024, 1024), { platform: 'darwin' });
  assert.throws(() => applyAppPlan(p.root, plan, { run: () => false }), /Nothing was changed/);
  assert.equal(read(p.root, 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png'), 'old');
});

test('app splash: installs react-native-bootsplash and runs its generator', () => {
  const p = project();
  const logo = writePng(p.root, 'logo.png', 400, 400);
  const plan = planSplash(p, logo, 'fff', { platform: 'darwin' });
  assert.deepEqual(
    plan.commands.map((c) => [c.command, ...c.args].join(' ')),
    [
      'npm install react-native-bootsplash',
      'npx react-native-bootsplash generate logo.png --background=#ffffff --logo-width=100 --assets-output=assets/bootsplash --platforms=android,ios',
    ],
  );
  assert.match(plan.next, /RNBootSplash\.init\(this, R\.style\.BootTheme\)/);
  assert.match(plan.next, /AppDelegate\.swift/);
  assert.match(plan.next, /BootSplash\.hide\(\{ fade: true \}\)/);
});

test('Expo: app.json is the only file that changes', () => {
  const p = expoProject({ name: 'expo-app', slug: 'expo-app', version: '1.0.0', ios: { buildNumber: '3' }, android: { versionCode: 3 } });

  const summary = appSummary(readAppInfo(p.root, p.pkg));
  assert.equal(summary.source, 'app.json (expo)');
  assert.ok(summary.notes.some((n) => /android\.package/.test(n)));

  applyAppPlan(p.root, planId(p, 'com.example.budget'), { run: fakeRun() });
  applyAppPlan(p.root, planVersion(p, 'minor'), { run: fakeRun() });
  applyAppPlan(p.root, planName(p, 'Budget'), { run: fakeRun() });
  const { expo } = JSON.parse(read(p.root, 'app.json'));
  assert.equal(expo.android.package, 'com.example.budget');
  assert.equal(expo.ios.bundleIdentifier, 'com.example.budget');
  assert.equal(expo.version, '1.1.0');
  assert.equal(expo.ios.buildNumber, '4');
  assert.equal(expo.android.versionCode, 4);
  assert.equal(expo.name, 'Budget');
});

test('Expo: icon and splash go through app.json and the expo-splash-screen plugin', () => {
  const p = expoProject({ name: 'expo-app', plugins: ['expo-router'] });
  const icon = writePng(p.root, 'icon-src.png', 1024, 1024);
  const iconPlan = planIcon(p, icon, { platform: 'linux' });
  assert.deepEqual(iconPlan.copies.map((c) => c.to), ['assets/icon.png']);
  applyAppPlan(p.root, iconPlan, { run: fakeRun() });
  assert.equal(JSON.parse(read(p.root, 'app.json')).expo.icon, './assets/icon.png');
  assert.ok(existsSync(path.join(p.root, 'assets/icon.png')));

  const splash = planSplash(readProject(p.root), writePng(p.root, 'logo.png', 200, 200), '#000');
  assert.deepEqual(splash.commands.map((c) => c.args.join(' ')), ['expo install expo-splash-screen']);
  const calls = [];
  applyAppPlan(p.root, splash, { run: fakeRun(calls) });
  assert.deepEqual(JSON.parse(read(p.root, 'app.json')).expo.plugins, [
    'expo-router',
    ['expo-splash-screen', { image: './logo.png', backgroundColor: '#000000', imageWidth: 200 }],
  ]);
});

test('Expo: a dynamic app.config.ts becomes a manual step', () => {
  const p = project({
    'package.json': { name: 'expo-app', dependencies: { expo: '~54.0.0' } },
    'app.config.ts': 'export default { name: "x" };\n',
  });
  const summary = appSummary(readAppInfo(p.root, p.pkg));
  assert.ok(summary.notes.some((n) => /dynamic config/.test(n)));
  const plan = planName(p, 'Budget');
  assert.equal(hasChanges(plan), false);
  assert.ok(plan.manual.some((m) => /app\.config\.ts/.test(m)));
});

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('CLI: rn-buddy app shows the table', () => {
  const root = makeProject(TEMPLATE);
  const { status, stdout } = rnBuddy('app', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Android +iOS/);
  assert.match(stdout, /ID +com\.demo +org\.reactjs\.native\.example\.DemoApp +⚠ different/);
  assert.match(stdout, /Version +1\.0 +1\.0\n/);
});

test('CLI: rn-buddy app id --dry-run prints the plan and changes nothing', () => {
  const root = makeProject(TEMPLATE);
  const { status, stdout } = rnBuddy('app', 'id', 'com.example.budget', '--dry-run', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Edit +android\/app\/build\.gradle\n +applicationId +com\.demo → com\.example\.budget/);
  assert.match(stdout, /Move +android\/app\/src\/main\/java\/com\/demo\/MainActivity\.kt/);
  assert.match(stdout, /Dry run: nothing was changed/);
  assert.match(read(root, 'android/app/build.gradle'), /applicationId "com\.demo"/);
});

test('CLI: rn-buddy app version patch --yes, and errors for bad input', () => {
  const root = makeProject(TEMPLATE);
  const { status, stdout } = rnBuddy('app', 'version', 'patch', '--yes', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /✔ Edited android\/app\/build\.gradle/);
  assert.match(read(root, 'android/app/build.gradle'), /versionName "1\.0\.1"/);

  const bad = rnBuddy('app', 'id', 'com.my-app', '--dir', root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /letters, numbers and _/);
  assert.match(rnBuddy('app', 'colour', '--dir', root).stderr, /Unknown action "colour"/);
});
