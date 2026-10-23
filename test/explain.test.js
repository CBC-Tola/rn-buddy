import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

const GRADLE_PROPERTIES = `# Project-wide Gradle settings.
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
newArchEnabled=true
hermesEnabled=true
edgeToEdgeEnabled=false
myCustomFlag=yes
`;

const APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    /* Autolinking */
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
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")

    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    } else {
        implementation jscFlavor
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
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
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
	<key>NSCameraUsageDescription</key>
	<string>Take a profile photo</string>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string></string>
	<key>RCTNewArchEnabled</key>
	<true/>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>arm64</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<false/>
	<key>MyCustomKey</key>
	<integer>3</integer>
</dict>
</plist>
`;

const EXPO_APP_JSON = {
  expo: {
    name: 'expo-demo',
    slug: 'expo-demo',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'expodemo',
    newArchEnabled: true,
    ios: { supportsTablet: true, bundleIdentifier: 'com.example.expodemo' },
    android: {
      adaptiveIcon: { foregroundImage: './assets/images/adaptive-icon.png', backgroundColor: '#ffffff' },
      package: 'com.example.expodemo',
      edgeToEdgeEnabled: true,
    },
    plugins: ['expo-router', ['expo-splash-screen', { image: './assets/images/splash-icon.png' }]],
    experiments: { typedRoutes: true },
    somethingNew: 1,
  },
};

const cliProject = makeProject({
  'package.json': {
    name: 'DemoApp',
    dependencies: {
      react: '19.1.0',
      'react-native': '0.81.0',
      '@react-navigation/native': '^7.0.0',
      'react-native-screens': '^4.0.0',
    },
  },
  'app.json': { name: 'DemoApp', displayName: 'DemoApp' },
  'index.js': "import { AppRegistry } from 'react-native';\nimport App from './App';\nAppRegistry.registerComponent('DemoApp', () => App);\n",
  'App.tsx': "import React from 'react';\nimport RootNavigator from './src/navigation';\nexport default function App() { return <RootNavigator />; }\n",
  'src/navigation/index.tsx':
    "import { NavigationContainer } from '@react-navigation/native';\nimport HomeScreen from '../screens/HomeScreen';\n",
  'src/screens/HomeScreen.tsx': [
    "import React from 'react';",
    "import { View, Text } from 'react-native';",
    "import { useNavigation } from '@react-navigation/native';",
    "import { enableScreens } from 'react-native-screens';",
    "import Button from '../components/Button';",
    "import { colors } from '@/theme';",
    "import { missing } from './nope';",
    'export default function HomeScreen() { return null; }',
  ].join('\n'),
  'src/components/Button.tsx': "import { Pressable } from 'react-native';\n",
  'src/theme/index.ts': 'export const colors = {};\n',
  'node_modules/react-native-screens/RNScreens.podspec': '',
  'node_modules/react-native-screens/package.json': { version: '4.1.0' },
  'android/gradle.properties': GRADLE_PROPERTIES,
  'android/app/build.gradle': APP_GRADLE,
  'android/app/src/main/java/com/demoapp/MainActivity.kt': 'package com.demoapp\n',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': '',
  'ios/DemoApp/Info.plist': INFO_PLIST,
  'ios/DemoApp/AppDelegate.swift': 'import UIKit\n',
  'ios/DemoApp.xcodeproj/project.pbxproj': '',
  'ios/DemoApp.xcworkspace/contents.xcworkspacedata': '',
  'ios/Podfile': "require_relative '../node_modules/react-native/scripts/react_native_pods'\n",
});

const expoProject = makeProject({
  'package.json': {
    name: 'expo-demo',
    main: 'expo-router/entry',
    dependencies: { expo: '~54.0.0', 'expo-router': '~6.0.0', 'expo-camera': '~17.0.0', 'react-native': '0.81.4' },
  },
  'app.json': EXPO_APP_JSON,
  'eas.json': {},
  'app/_layout.tsx': "import { Stack } from 'expo-router';\nexport default function RootLayout() { return <Stack />; }\n",
  'app/(tabs)/index.tsx': "import { Text } from 'react-native';\nexport default function Home() { return null; }\n",
  'app/+not-found.tsx': '',
});

test('explains nested native files whatever the app name is', () => {
  const kotlin = rnBuddy('explain', 'android/app/src/main/java/com/demoapp/MainActivity.kt', '--offline', '--dir', cliProject);
  assert.equal(kotlin.status, 0);
  assert.match(kotlin.stdout, /What it is +The one Android screen/);
  assert.doesNotMatch(kotlin.stdout, /notes for files in the project root/);

  assert.match(rnBuddy('explain', 'ios/DemoApp/AppDelegate.swift', '--offline', '--dir', cliProject).stdout, /What it is +Starts the app on iOS/);
  assert.match(rnBuddy('explain', 'ios/DemoApp.xcodeproj', '--offline', '--dir', cliProject).stdout, /open the \.xcworkspace instead/);
  assert.match(rnBuddy('explain', 'ios/DemoApp.xcworkspace/', '--offline', '--dir', cliProject).stdout, /Open this one in Xcode/);
  assert.match(rnBuddy('explain', 'android/app/src/main/res/mipmap-hdpi', '--offline', '--dir', cliProject).stdout, /Launcher icons/);
});

test('explain gradle.properties lists each setting with its value', () => {
  const { status, stdout } = rnBuddy('explain', 'android/gradle.properties', '--offline', '--dir', cliProject);
  assert.equal(status, 0);
  assert.match(stdout, /What it is +Gradle settings/);
  assert.match(stdout, /newArchEnabled +true +line 5\n +The New Architecture/);
  assert.match(stdout, /org\.gradle\.jvmargs +-Xmx2048m -XX:MaxMetaspaceSize=512m/);
  assert.match(stdout, /reactNativeArchitectures +armeabi-v7a,arm64-v8a,x86,x86_64 .*\n +CPU types/);
  assert.match(stdout, /myCustomFlag +yes +line 8\n +no note/);
});

test('explain app/build.gradle shows the important lines', () => {
  const { stdout } = rnBuddy('explain', 'android/app/build.gradle', '--offline', '--dir', cliProject);
  assert.match(stdout, /applicationId +"com\.demoapp" +line \d+\n +The app's unique ID/);
  assert.match(stdout, /versionCode +1 /);
  assert.match(stdout, /enableProguardInReleaseBuilds +false/);
  assert.match(stdout, /hermesEnabled +if \(hermesEnabled\.toBoolean\(\)\) \{/);
  assert.doesNotMatch(stdout, /storePassword/);
  assert.doesNotMatch(stdout, /Caution/);
});

test('explain Info.plist lists keys, with a note for every NS...UsageDescription', () => {
  const { stdout } = rnBuddy('explain', 'ios/DemoApp/Info.plist', '--offline', '--dir', cliProject);
  assert.match(stdout, /CFBundleDisplayName +DemoApp\n +The name shown under the app icon/);
  assert.match(stdout, /CFBundleIdentifier +\$\(PRODUCT_BUNDLE_IDENTIFIER\)/);
  assert.match(stdout, /NSAppTransportSecurity +\{ NSAllowsArbitraryLoads, NSAllowsLocalNetworking \}/);
  assert.match(stdout, /NSCameraUsageDescription +Take a profile photo\n +The message iOS shows when the app asks for camera permission/);
  assert.match(stdout, /NSLocationWhenInUseUsageDescription +""\n +.*location when in use permission/);
  assert.match(stdout, /UIRequiredDeviceCapabilities +\[arm64\]/);
  assert.match(stdout, /MyCustomKey +3\n +no note/);
});

test('explain app.json: React Native CLI and Expo keys', () => {
  const cli = rnBuddy('explain', 'app.json', '--offline', '--dir', cliProject).stdout;
  assert.match(cli, /What it is +App name and display name/);
  assert.match(cli, /name +DemoApp\n +The app's internal name/);

  const expo = rnBuddy('explain', 'app.json', '--offline', '--dir', expoProject).stdout;
  assert.match(expo, /What it is +Expo config/);
  assert.match(expo, /expo\.ios\.bundleIdentifier +com\.example\.expodemo\n +The iOS bundle ID/);
  assert.match(expo, /expo\.android\.adaptiveIcon +\{ foregroundImage, backgroundColor \}/);
  assert.match(expo, /expo\.plugins +\[expo-router, expo-splash-screen\]\n +Config plugins/);
  assert.match(expo, /expo\.somethingNew +1\n +no note/);
});

test('explain <source file> shows its packages, files and who imports it', () => {
  const { status, stdout } = rnBuddy('explain', 'src/screens/HomeScreen.tsx', '--offline', '--dir', cliProject);
  assert.equal(status, 0);
  assert.match(stdout, /In folder +src\/screens\/ +One component per screen/);
  assert.match(stdout, /Packages it imports\n {2}react +React itself/);
  assert.match(stdout, /react-native-screens +Native screen containers.*\[native\]/);
  assert.doesNotMatch(stdout, /^ {2}@\/theme/m);
  assert.match(stdout, /Files it imports\n {2}src\/components\/Button\.tsx +\(\.\.\/components\/Button\)\n {2}src\/theme\/index\.ts +\(@\/theme\)\n {2}\.\/nope +not found/);
  assert.match(stdout, /Imported by\n {2}src\/navigation\/index\.tsx/);
  assert.match(stdout, /\[native\] has iOS\/Android code/);

  const entry = rnBuddy('explain', 'index.js', '--offline', '--dir', cliProject).stdout;
  assert.match(entry, /Files it imports\n {2}App\.tsx/);
  assert.match(entry, /entry point/);
});

test('explain in an Expo project: routes, missing native folders, Expo packages', () => {
  const layout = rnBuddy('explain', 'app/_layout.tsx', '--offline', '--dir', expoProject).stdout;
  assert.match(layout, /What it is +Layout for the routes/);
  assert.match(layout, /Expo Router loads it/);
  assert.match(rnBuddy('explain', 'app/(tabs)', '--offline', '--dir', expoProject).stdout, /A route group/);
  assert.match(rnBuddy('explain', 'app/+not-found.tsx', '--offline', '--dir', expoProject).stdout, /route that doesn't exist/);

  const ios = rnBuddy('explain', 'ios', '--offline', '--dir', expoProject);
  assert.equal(ios.status, 0);
  assert.match(ios.stdout, /ios {2}not in this project/);
  assert.match(ios.stdout, /npx expo prebuild/);
  assert.match(rnBuddy('explain', 'ios/Podfile', '--offline', '--dir', expoProject).stdout, /npx expo prebuild/);

  const all = rnBuddy('explain', '--offline', '--dir', expoProject).stdout;
  assert.match(all, /expo-demo · React Native 0\.81\.4 · Expo ~54\.0\.0/);
  assert.match(all, /expo-router +File-based navigation/);
  assert.match(all, /expo-camera +Camera preview/);
  assert.match(all, /eas\.json +EAS Build/);
  assert.match(all, /app\/ +Expo Router screens/);
  assert.match(all, /No android\/ or ios\/ folder yet.*npx expo prebuild/);

  const pkg = rnBuddy('explain', 'expo-haptics', '--offline', '--dir', expoProject).stdout;
  assert.match(pkg, /Install +npx expo install expo-haptics/);
});

test('explain --outdated --offline explains that it needs the internet', () => {
  const { status, stdout } = rnBuddy('explain', '--outdated', '--offline', '--dir', cliProject);
  assert.equal(status, 0);
  assert.match(stdout, /needs the internet/);
});
