import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readProject } from '../src/lib/project.js';
import {
  addReleaseSigning,
  androidTemplateIcon,
  applyAndroidRelease,
  buildCommand,
  expoConfigRows,
  iosReleaseRows,
  keytoolCommand,
  passwordsFilled,
  planAndroidRelease,
  planGradleProperties,
  releaseCheckRows,
  releaseNames,
  requiredUsageKeys,
  signingState,
  versionRow,
} from '../src/lib/release.js';
import { readSources } from '../src/lib/sources.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

// android/app/build.gradle from the React Native 0.8x template (the parts that matter).
const APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    autolinkLibrariesWithApp()
}

def enableProguardInReleaseBuilds = false
def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace "com.demoapp"
    defaultConfig {
        applicationId "com.demoapp"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>DemoApp</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string></string>
</dict>
</plist>
`;

const PBXPROJ = `		13B07F941A680F5B00A75B9A /* Debug */ = {
			buildSettings = {
				CURRENT_PROJECT_VERSION = 1;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)";
				PRODUCT_NAME = DemoApp;
			};
		};
`;

const GITIGNORE = `# Android/IntelliJ
build/
.gradle
local.properties
*.iml
*.hprof
.cxx/
*.keystore
!debug.keystore
.kotlin/
`;

function templateFiles(extra = {}) {
  return {
    'package.json': { name: 'DemoApp', version: '0.0.1', dependencies: { 'react-native': '0.81.0' } },
    'App.tsx': 'export default () => null;',
    '.gitignore': GITIGNORE,
    'android/app/build.gradle': APP_GRADLE,
    'android/gradle.properties': 'newArchEnabled=true\nhermesEnabled=true\n',
    'ios/DemoApp/Info.plist': INFO_PLIST,
    'ios/DemoApp/Images.xcassets/AppIcon.appiconset/Contents.json': '{"images":[]}',
    'ios/DemoApp.xcodeproj/project.pbxproj': PBXPROJ,
    'ios/Podfile': "platform :ios, min_ios_version_supported\ntarget 'DemoApp' do\n  config = use_native_modules!\nend\n",
    ...extra,
  };
}

function fakeRun(responses = {}) {
  const calls = [];
  const run = (command, args, options = {}) => {
    calls.push({ command, args, ...options });
    const response = responses[command];
    return typeof response === 'function' ? response(args, options) : (response ?? { ok: false, missing: true, stdout: '' });
  };
  return { run, calls };
}

const tag = (name) => ({ git: { ok: true, missing: false, stdout: `${name}\n` } });
const gradleHome = () => mkdtempSync(path.join(os.tmpdir(), 'rn-buddy-gradle-'));

test('releaseNames makes file-safe names and a per-app property prefix', () => {
  const project = readProject(makeProject({ 'package.json': { name: '@me/My-App' } }));
  assert.deepEqual(releaseNames(project), {
    slug: 'myapp',
    prefix: 'MYAPP',
    keystore: 'myapp-upload.keystore',
    alias: 'myapp-upload',
  });
});

test('keytoolCommand follows the React Native docs, using the JDK in JAVA_HOME', () => {
  const names = { keystore: 'demoapp-upload.keystore', alias: 'demoapp-upload' };
  const command = keytoolCommand('/app', names, {});
  assert.equal(command.command, 'keytool');
  assert.equal(command.cwd, '/app');
  assert.equal(
    command.args.join(' '),
    '-genkeypair -v -storetype PKCS12 -keystore android/app/demoapp-upload.keystore -alias demoapp-upload -keyalg RSA -keysize 2048 -validity 10000',
  );
  assert.equal(keytoolCommand('/app', names, { JAVA_HOME: '/jdk' }).command, path.join('/jdk', 'bin', 'keytool'));
});

test('addReleaseSigning edits the template build.gradle', () => {
  assert.equal(signingState(APP_GRADLE), 'debug');
  const after = addReleaseSigning(APP_GRADLE, 'DEMOAPP');
  assert.equal(signingState(after), 'release');
  assert.match(
    after,
    /keyPassword 'android'\n {8}\}\n {8}release \{\n {12}if \(project\.hasProperty\('DEMOAPP_UPLOAD_STORE_FILE'\)\) \{\n {16}storeFile file\(DEMOAPP_UPLOAD_STORE_FILE\)\n {16}storePassword DEMOAPP_UPLOAD_STORE_PASSWORD\n {16}keyAlias DEMOAPP_UPLOAD_KEY_ALIAS\n {16}keyPassword DEMOAPP_UPLOAD_KEY_PASSWORD\n {12}\}\n {8}\}\n {4}\}\n {4}buildTypes \{/,
  );
  assert.match(after, /release \{\n {12}signingConfig signingConfigs\.release\n {12}minifyEnabled/);
  assert.match(after, /debug \{\n {12}signingConfig signingConfigs\.debug\n/, 'debug builds keep the debug key');
  assert.doesNotMatch(after, /Caution!/);
  assert.equal(addReleaseSigning(after, 'DEMOAPP'), after, 'running again changes nothing');
});

test('addReleaseSigning leaves files that differ from the template alone', () => {
  const custom = APP_GRADLE.replace('signingConfig signingConfigs.debug\n            minify', 'signingConfig signingConfigs.prod\n            minify');
  assert.equal(addReleaseSigning(custom, 'DEMOAPP'), null);
  const ownRelease = APP_GRADLE.replace("keyPassword 'android'\n        }", "keyPassword 'android'\n        }\n        release {\n        }");
  assert.equal(addReleaseSigning(ownRelease, 'DEMOAPP'), null);
  assert.equal(addReleaseSigning('android {\n}\n', 'DEMOAPP'), null);
});

test('planGradleProperties writes the non-secret lines and password placeholders', () => {
  const home = gradleHome();
  const project = readProject(makeProject(templateFiles()));
  const names = releaseNames(project);

  const plan = planGradleProperties(project, names, home);
  assert.equal(plan.file, path.join(home, 'gradle.properties'));
  assert.equal(plan.status, 'apply');
  assert.deepEqual(plan.lines, [
    '# rn-buddy: release signing for DemoApp (android/app/demoapp-upload.keystore)',
    'DEMOAPP_UPLOAD_STORE_FILE=demoapp-upload.keystore',
    'DEMOAPP_UPLOAD_KEY_ALIAS=demoapp-upload',
    'DEMOAPP_UPLOAD_STORE_PASSWORD=CHANGE_ME',
    'DEMOAPP_UPLOAD_KEY_PASSWORD=CHANGE_ME',
  ]);

  // Existing settings are kept, and only missing keys are added.
  writeFileSync(plan.file, 'org.gradle.daemon=true\nDEMOAPP_UPLOAD_STORE_PASSWORD=secret123\n');
  const again = planGradleProperties(project, names, home);
  assert.match(again.content, /^org\.gradle\.daemon=true\nDEMOAPP_UPLOAD_STORE_PASSWORD=secret123\n\n# rn-buddy/);
  assert.equal(again.content.match(/STORE_PASSWORD/g).length, 1);

  writeFileSync(plan.file, again.content);
  assert.equal(planGradleProperties(project, names, home).status, 'done');
  assert.equal(passwordsFilled(names, home), false, 'the key password is still CHANGE_ME');
  writeFileSync(plan.file, again.content.replace('CHANGE_ME', 'secret123'));
  assert.equal(passwordsFilled(names, home), true);
});

test('planAndroidRelease + applyAndroidRelease on the template', () => {
  const root = makeProject(templateFiles());
  const project = readProject(root);
  const home = gradleHome();
  const plan = planAndroidRelease(project, { env: {}, gradleHome: home });
  assert.deepEqual(
    plan.steps.map((step) => [step.id, step.status]),
    [
      ['keystore', 'apply'],
      ['properties', 'apply'],
      ['gradle', 'apply'],
      ['gitignore', 'done'],
    ],
  );

  // keytool is interactive: it gets the terminal. The fake one creates the file.
  const { run, calls } = fakeRun({
    keytool: () => {
      writeFileSync(path.join(root, 'android/app/demoapp-upload.keystore'), 'key');
      return { ok: true, missing: false, stdout: '' };
    },
  });
  applyAndroidRelease(project, plan, { run });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].interactive, true);
  assert.equal(calls[0].cwd, root);
  assert.equal(signingState(readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8')), 'release');
  assert.match(readFileSync(path.join(home, 'gradle.properties'), 'utf8'), /DEMOAPP_UPLOAD_KEY_ALIAS=demoapp-upload/);

  const done = planAndroidRelease(project, { env: {}, gradleHome: home });
  assert.ok(done.steps.every((step) => step.status === 'done'));
});

test('applyAndroidRelease changes nothing when keytool fails or is missing', () => {
  const root = makeProject(templateFiles({ '.gitignore': 'node_modules/\n' }));
  const project = readProject(root);
  const home = gradleHome();
  const plan = planAndroidRelease(project, { env: {}, gradleHome: home });
  assert.equal(plan.steps.find((step) => step.id === 'gitignore').status, 'apply');

  assert.throws(() => applyAndroidRelease(project, plan, fakeRun({ keytool: { ok: false } })), /did not create the keystore/);
  assert.throws(() => applyAndroidRelease(project, plan, fakeRun()), /keytool was not found.*JDK/);
  assert.equal(readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), APP_GRADLE);
  assert.equal(existsSync(path.join(home, 'gradle.properties')), false);
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), 'node_modules/\n');
});

test('planAndroidRelease adds the keystore to .gitignore, and falls back to by-hand for Kotlin DSL', () => {
  const files = templateFiles({ '.gitignore': 'node_modules/' });
  delete files['android/app/build.gradle'];
  const kts = makeProject({ ...files, 'android/app/build.gradle.kts': 'android {\n}\n' });
  const plan = planAndroidRelease(readProject(kts), { env: {}, gradleHome: gradleHome() });
  const gradle = plan.steps.find((step) => step.id === 'gradle');
  assert.equal(gradle.status, 'manual');
  assert.match(gradle.manual, /DEMOAPP_UPLOAD_STORE_FILE/);
  assert.equal(
    plan.steps.find((step) => step.id === 'gitignore').content,
    'node_modules/\n\n# Release keystore: keep it out of git\n*.keystore\n!debug.keystore\n',
  );
});

test('buildCommand runs gradlew bundleRelease in android/', () => {
  assert.deepEqual(buildCommand('/app', 'darwin'), { command: './gradlew', args: ['bundleRelease'], cwd: path.join('/app', 'android') });
  assert.equal(buildCommand('/app', 'win32').command, 'gradlew.bat');
});

test('versionRow compares app versions with the last git tag', () => {
  const project = readProject(makeProject(templateFiles()));
  assert.equal(versionRow(project, fakeRun().run).status, 'skip', 'no git');
  assert.equal(versionRow(project, fakeRun({ git: { ok: false, stdout: '' } }).run).status, 'skip', 'no tags');

  const stale = versionRow(project, fakeRun(tag('v1.0.0')).run);
  assert.equal(stale.status, 'warn');
  assert.match(stale.message, /Android 1\.0, iOS 1\.0: not bumped since the last tag v1\.0\.0/);
  assert.match(stale.hint, /rn-buddy app version patch/);

  const ok = versionRow(project, fakeRun(tag('v0.9.2')).run);
  assert.equal(ok.status, 'ok');
  const { run, calls } = fakeRun(tag('v0.9.2'));
  versionRow(project, run);
  assert.deepEqual(calls[0].args, ['describe', '--tags', '--abbrev=0']);
});

test('requiredUsageKeys: from packages, feature use and react-native-permissions', () => {
  const root = makeProject({
    'package.json': {
      dependencies: { 'react-native-vision-camera': '4', 'react-native-image-picker': '8', 'react-native-permissions': '5' },
      devDependencies: { 'expo-location': '1' },
    },
    'src/photo.ts': "launchCamera({});\ncheck(PERMISSIONS.IOS.MICROPHONE);\ncheck(PERMISSIONS.ANDROID.CAMERA);",
  });
  const project = readProject(root);
  const needed = requiredUsageKeys(project, readSources(root));
  assert.deepEqual(Object.fromEntries(needed), {
    NSCameraUsageDescription: ['react-native-vision-camera', 'react-native-image-picker'],
    NSPhotoLibraryUsageDescription: ['react-native-image-picker'],
    NSMicrophoneUsageDescription: ['PERMISSIONS.IOS.MICROPHONE'],
  });
});

test('releaseCheckRows on a fresh template project', () => {
  const root = makeProject(
    templateFiles({
      'package.json': {
        name: 'DemoApp',
        dependencies: { 'react-native': '0.81.0', 'react-native-vision-camera': '4.0.0', '@react-native-community/geolocation': '3' },
      },
      'src/api.ts': "export const API = 'http://localhost:3000';\nconsole.log(API);\nconst STRIPE = 'sk_live_51Habcdefghijklmnop';",
      'android/gradle.properties': 'hermesEnabled=false\n',
    }),
  );
  const rows = releaseCheckRows(readProject(root), { run: fakeRun(tag('v1.0.0')).run });
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.deepEqual(
    rows.map((row) => [row.name, row.status]),
    [
      ['Version', 'warn'],
      ['Bundle ID', 'fail'],
      ['App icon', 'fail'],
      ['iOS usage strings', 'fail'],
      ['URLs', 'fail'],
      ['Secrets', 'fail'],
      ['Hermes', 'warn'],
      ['Android signing', 'fail'],
      ['console.log', 'warn'],
    ],
  );
  assert.match(byName['Bundle ID'].message, /org\.reactjs\.native\.example\.<AppName>/);
  // The template's empty NSLocationWhenInUseUsageDescription doesn't count.
  assert.match(byName['iOS usage strings'].message, /NSCameraUsageDescription \(react-native-vision-camera\), NSLocationWhenInUseUsageDescription/);
  assert.match(byName.URLs.message, /src\/api\.ts:1/);
  assert.match(byName['Android signing'].hint, /rn-buddy release android/);
});

test('releaseCheckRows when everything is ready', () => {
  const plist = INFO_PLIST.replace('<string></string>', '<string>Shows shops near you</string>');
  const root = makeProject(
    templateFiles({
      'package.json': { name: 'DemoApp', dependencies: { 'react-native': '0.81.0', 'react-native-geolocation-service': '5' } },
      'android/app/build.gradle': addReleaseSigning(APP_GRADLE, 'DEMOAPP'),
      'ios/DemoApp/Info.plist': plist,
      'ios/DemoApp/Images.xcassets/AppIcon.appiconset/icon-1024.png': 'png',
      'ios/DemoApp.xcodeproj/project.pbxproj': PBXPROJ.replace(/org\.reactjs\.native\.example\.\$\(PRODUCT_NAME:rfc1034identifier\)/, 'com.example.demo'),
    }),
  );
  const rows = releaseCheckRows(readProject(root), { run: fakeRun(tag('v0.9.0')).run });
  assert.deepEqual(
    rows.filter((row) => row.status !== 'ok').map((row) => row.name),
    [],
  );
});

test('androidTemplateIcon spots the template launcher icons', () => {
  const root = makeProject({
    'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': 'template',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher.png': 'template',
  });
  const sha = (text) => createHash('sha1').update(text).digest('hex');
  assert.equal(androidTemplateIcon(root, new Set([sha('template')])), true);
  assert.equal(androidTemplateIcon(root, new Set([sha('other')])), false);
  assert.equal(androidTemplateIcon(makeProject({ 'package.json': {} })), null);
});

test('Expo projects: app.json fields instead of native files', () => {
  const root = makeProject({
    'package.json': { name: 'expo-app', dependencies: { expo: '~54.0.0', 'expo-camera': '~17.0.0' } },
    'app.json': { expo: { name: 'Expo App', version: '1.0.0', ios: {}, icon: './assets/icon.png' } },
    'app/index.tsx': 'export default () => null;',
  });
  assert.deepEqual(
    expoConfigRows(root).map((row) => [row.status, row.message]),
    [['warn', 'app.json has no ios.bundleIdentifier, android.package']],
  );
  const rows = releaseCheckRows(readProject(root), { run: fakeRun().run });
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.equal(byName['App icon'].status, 'ok');
  assert.equal(byName['iOS usage strings'].status, 'ok');
  assert.match(byName['iOS usage strings'].message, /config plugins/);
  assert.match(byName['Android signing'].message, /EAS Build/);
  assert.equal(byName['Bundle ID'], undefined);
});

test('iosReleaseRows checks Xcode, the team, the bundle ID and the icon', () => {
  const root = makeProject(templateFiles({ 'ios/DemoApp.xcworkspace/contents.xcworkspacedata': '' }));
  const project = readProject(root);
  const { run } = fakeRun({ xcodebuild: { ok: true, stdout: 'Xcode 26.0\nBuild version 17A324\n' } });
  const rows = iosReleaseRows(project, { run, platform: 'darwin' });
  assert.deepEqual(
    rows.map((row) => [row.name, row.status, row.message]).slice(0, 5),
    [
      ['Xcode', 'ok', 'Xcode 26.0'],
      ['Workspace', 'ok', 'ios/DemoApp.xcworkspace'],
      ['Bundle ID', 'fail', 'iOS still uses the template ID org.reactjs.native.example.<AppName>'],
      ['Team', 'warn', 'no signing team set yet'],
      ['Version', 'ok', '1.0 (build 1)'],
    ],
  );
  assert.equal(rows.find((row) => row.name === 'App icon').status, 'fail');
  assert.equal(iosReleaseRows(project, { run: fakeRun().run, platform: 'linux' })[0].status, 'fail');
  assert.match(iosReleaseRows(project, { run: fakeRun().run, platform: 'darwin' })[0].hint, /Install Xcode/);
});

function rnBuddy(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });
}

test('rn-buddy release explains the subcommands', () => {
  const { status, stdout } = rnBuddy(['release']);
  assert.equal(status, 0);
  assert.match(stdout, /check {4}a checklist/);
  assert.match(stdout, /android {2}first Android release/);
  assert.match(stdout, /ios {6}what to check/);
  assert.match(rnBuddy(['release', 'web']).stderr, /Unknown release target "web"/);
});

test('rn-buddy release check prints the checklist and exits 1 on ✖', () => {
  const root = makeProject(templateFiles());
  const { status, stdout } = rnBuddy(['release', 'check', '--dir', root]);
  assert.equal(status, 1);
  assert.match(stdout, /Before you release/);
  assert.match(stdout, /✖ Android signing +release builds are signed with the debug key/);
});

test('rn-buddy release android --dry-run shows the plan and changes nothing', () => {
  const root = makeProject(templateFiles());
  const home = gradleHome();
  const { status, stdout } = rnBuddy(['release', 'android', '--dry-run', '--dir', root], { GRADLE_USER_HOME: home, JAVA_HOME: '' });
  assert.equal(status, 0);
  assert.match(stdout, /Create {4}android\/app\/demoapp-upload\.keystore/);
  assert.match(stdout, /\$ keytool -genkeypair -v -storetype PKCS12 -keystore android\/app\/demoapp-upload\.keystore/);
  assert.match(stdout, /Write {5}.*gradle\.properties\n(.*\n){2} +DEMOAPP_UPLOAD_STORE_FILE=demoapp-upload\.keystore\n.*\n +DEMOAPP_UPLOAD_STORE_PASSWORD=CHANGE_ME/);
  assert.match(stdout, /Edit {6}android\/app\/build\.gradle/);
  assert.match(stdout, /Done {6}\.gitignore already set up/);
  assert.match(stdout, /\(cd android && \.\/gradlew bundleRelease\)/);
  assert.match(stdout, /Dry run: nothing was changed/);
  assert.equal(readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), APP_GRADLE);
  assert.equal(existsSync(path.join(home, 'gradle.properties')), false);
});

test('rn-buddy release android in an Expo project points to EAS Build', () => {
  const root = makeProject({ 'package.json': { name: 'expo-app', dependencies: { expo: '~54.0.0' } } });
  const { status, stdout } = rnBuddy(['release', 'android', '--dir', root]);
  assert.equal(status, 0);
  assert.match(stdout, /npx eas-cli build --platform android/);
  assert.match(stdout, /npx eas-cli submit --platform android/);
});
