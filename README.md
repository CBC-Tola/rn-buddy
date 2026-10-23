# rn-buddy

A CLI for people learning React Native. Run it inside your project when you want to understand it, when something breaks, or when something hard has to be done.

**Understand your project**
- **`explain`**: what each package, file, folder and setting is for, in plain English
- **`learn`**: short lessons in the terminal: reload vs rebuild, Metro, pods, the New Architecture, ...

**When something is wrong**
- **`why`**: paste an error or pipe a build log, and get what it means and how to fix it
- **`doctor`**: one command for "is everything OK?" (`env` + `status` + `check`)
- **`env`**: check Node, Java, Ruby, the Android SDK, Xcode, CocoaPods and your lockfiles
- **`status`**: do I need to rebuild the app, run `pod install` or reset the Metro cache?
- **`clean`**: clear caches and build folders safely
- **`check`**: find common React Native mistakes in your code and packages

**Change your project**
- **`structure`**: add a `src/` folder layout with a README in each folder
- **`add`**: install navigation, state, storage, permissions, icons, animations and more, including the native setup
- **`app`**: change the app name, bundle ID, icon, splash screen and version on both platforms
- **`upgrade`**: upgrade React Native with a plan

**Run and ship**
- **`device`**: list and start emulators and simulators, connect a phone to Metro
- **`release`**: check the app before releasing, and make your first signed Android build
- **`new`**: create an app and set it up with recipes in one go

Made for projects created with the [React Native Community CLI](https://github.com/react-native-community/cli). Most commands also work in [Expo](https://expo.dev) projects (see [Expo projects](#expo-projects)).

## Requirements

Node.js 22 or newer.

## Usage

Run it with `npx` inside your React Native project, no install needed:

```sh
npx rn-buddy doctor
```

Or install it globally to use the shorter `rn-buddy` command:

```sh
npm install -g rn-buddy
rn-buddy doctor
```

All commands:

```sh
rn-buddy explain                       # explain all packages and root files
rn-buddy explain react-native-svg      # details for one package
rn-buddy explain android/gradle.properties   # what a file is for, setting by setting
rn-buddy explain --outdated            # which packages have newer versions, and is updating safe?
rn-buddy learn                         # list the lessons
rn-buddy learn reload-vs-rebuild       # read one
rn-buddy why "<error text>"            # explain an error
npx react-native run-android 2>&1 | rn-buddy why   # explain a failed build
rn-buddy doctor                        # env + status + check
rn-buddy env                           # check tool versions, SDKs and lockfiles
rn-buddy env --fix                     # fix what can be fixed safely
rn-buddy status                        # reload, rebuild or pod install?
rn-buddy clean                         # pick caches to clear
rn-buddy check                         # common mistakes in your code
rn-buddy structure                     # add the src/ folder layout
rn-buddy add                           # list the recipes
rn-buddy add navigation                # install a recipe
rn-buddy add permissions camera        # recipes can take names
rn-buddy add react-native-svg          # install any package the right way
rn-buddy add --undo navigation         # remove what a recipe added
rn-buddy app                           # show name, ID and version on both platforms
rn-buddy app version patch             # bump the version everywhere
rn-buddy upgrade                       # upgrade React Native
rn-buddy device                        # list emulators, simulators and phones
rn-buddy device connect --port 3000    # Android phone on USB: reach Metro and your API
rn-buddy release check                 # checklist before releasing
rn-buddy release android               # first signed build for Google Play
rn-buddy new MyApp                     # create an app and set it up
rn-buddy <command> --help              # options for one command
```

Every command that works on a project takes `--dir <path>` to run on another project folder, for example `rn-buddy env --dir ../my-app`. Commands that change files show a plan first, ask before changing anything, and take `--dry-run` and `--yes`.

## `explain`: what is everything for?

```
$ rn-buddy explain
ReactNativeDemo · React Native 0.88.0

Packages
Core
  react                            React itself: components, props, state and hooks
  react-native                     The framework: turns React components into real iOS/Android views  [native]
UI & Layout
  react-native-safe-area-context   Keeps content away from the notch, status bar and home bar  [native]
Testing
  jest                             Test runner (`npm test`)  [dev]

Files
  android/                         Native Android project (Gradle); open this folder in Android Studio
  App.tsx                          Root component: the first screen of your app is rendered from here
  Gemfile                          Ruby gems for this project, mainly the CocoaPods version iOS needs
  metro.config.js                  Metro settings: the bundler that serves your JS to the app
```

| Tag | Meaning |
|---|---|
| `[native]` | Has iOS/Android code. After installing it, run `(cd ios && bundle exec pod install)` and rebuild the app. |
| `[dev]` | A devDependency: used while developing (build, test, lint), not shipped in the app. |
| `[unmaintained]` | Marked unmaintained on React Native Directory. Look for an alternative. |

Add a name to get details about one package, or about a file or folder in your project:

```
$ rn-buddy explain react-native-safe-area-context
react-native-safe-area-context  ^5.5.2 · dependency

  What it is   Keeps content away from the notch, status bar and home bar
  Description  A flexible way to handle safe area, also works on Android and web.
  Category     UI & Layout
  Native code  yes. After installing, run (cd ios && bundle exec pod install) and rebuild the app
  New Arch     supported
  Downloads    9.4M / week
  Repo         https://github.com/AppAndFlow/react-native-safe-area-context
  npm          https://www.npmjs.com/package/react-native-safe-area-context
```

```
$ rn-buddy explain App.tsx
App.tsx  file

  What it is   Root component: the first screen of your app is rendered from here
```

You can also explain a package that isn't installed yet, to see what it does before you add it.

### Where the explanations come from

1. Notes built into rn-buddy for common packages and files.
2. [React Native Directory](https://reactnative.directory), for other React Native libraries: description, New Architecture support and maintenance status.
3. The package's description on [npm](https://www.npmjs.com).

Steps 2 and 3 send package names to those websites. Without internet, or with `--offline`, rn-buddy uses only the built-in notes.

### Native files, setting by setting

`explain` knows the files inside `android/` and `ios/`, whatever your app is called, and goes through config files one setting at a time:

```
$ rn-buddy explain android/gradle.properties
android/gradle.properties  file

  What it is   Gradle settings for the Android build: memory, New Architecture, Hermes, CPU architectures

Settings
  org.gradle.jvmargs        -Xmx2048m -XX:MaxMetaspaceSize=512m  line 2
                            Memory for the Gradle build. Raise -Xmx (e.g. -Xmx4096m) if builds fail with 'Java heap space' or 'Metaspace'
  newArchEnabled            true  line 5
                            The New Architecture (Fabric, TurboModules). Required by recent React Native versions; every native library must support it
  myCustomFlag              yes  line 8
                            no note
```

This works for `android/gradle.properties`, `android/app/build.gradle` (the important lines: `applicationId`, `versionCode`, signing, ...), `ios/<App>/Info.plist` (including every `NS...UsageDescription`) and `app.json` (React Native CLI and Expo).

### Source files: how they connect

```
$ rn-buddy explain src/screens/HomeScreen.tsx
src/screens/HomeScreen.tsx  file

  In folder    src/screens/  One component per screen of the app: what the user sees after navigating somewhere

Packages it imports
  react                     React itself: components, props, state and hooks
  react-native-screens      Native screen containers; makes navigation faster (needed by React Navigation)  [native]

Files it imports
  src/components/Button.tsx  (../components/Button)

Imported by
  src/navigation/index.tsx
```

### `--outdated`: which packages have newer versions?

```
$ rn-buddy explain --outdated
Updates
  ✔ @react-navigation/native  7.0.0 → 7.5.1    minor  safe to update
  ⚠ react-native              0.81.0 → 0.88.0  major  use rn-buddy upgrade
                              → Upgrade React Native with `rn-buddy upgrade`: native files change too

✔ 1 safe to update  ⚠ 1 to read first
$ npm install @react-navigation/native@latest
```

- Patch and minor updates are marked safe; majors say "read the changelog first". Below 1.0.0, a minor update counts as major.
- Native libraries get a warning that a major may need native changes and a rebuild.
- `react`, `react-native` and `@react-native/*` point to `rn-buddy upgrade`. In Expo projects, SDK packages point to `npx expo install --check`.
- It needs the internet. With `--offline` it says so and stops.

### In Expo projects

`explain` has notes for `app.json` / `app.config.ts`, `eas.json`, the `app/` folder (Expo Router routes, `_layout`, `(tabs)` groups, `+not-found`) and the `expo-*` packages. When there is no `android/` or `ios/` folder, it tells you that `npx expo prebuild` generates them.

## `learn`: short lessons in the terminal

```
$ rn-buddy learn
Lessons
  reload-vs-rebuild  When a change shows up by itself, when pressing r is enough, and when you have to build the app again.
  metro              The bundler that turns your JavaScript files into one bundle and serves it to the app while you develop.
  devtools           The debugger for React Native: console, breakpoints and the React component tree, opened from Metro.
  expo-go            Why some packages work in Expo Go and others don't, and what a development build is.
  pods               How iOS gets the native code of React Native and your packages, and why you run pod install so often.
  ...
```

`rn-buddy learn metro` prints one lesson: one or two screens of plain English, where to look in your project, and which rn-buddy commands help. Lessons work offline. A typo gets a suggestion: `No lesson called "metor". Did you mean "metro"?`

Lessons: `reload-vs-rebuild`, `metro`, `devtools`, `debug-vs-release`, `expo-go`, `autolinking`, `pods`, `gradle`, `new-architecture`, `hermes`, `native-modules`, `navigation`, `state`, `env-vars`, `upgrading`.

## `why`: what does this error mean?

Paste an error, or pipe a whole build log. `why` finds the real error, explains it in plain English, checks your project to pick the likely cause, and tells you how to fix it.

```
$ rn-buddy why "Unable to resolve module @react-navigation/native"
Metro can't find @react-navigation/native.

  Likely cause  It's imported in your code but not installed (it's not in package.json).
  Fix           rn-buddy add navigation
                or: npm install @react-navigation/native
  Then          Restart Metro with a clean cache: npx react-native start --reset-cache

  Learn more    rn-buddy learn metro
  Tip           If it keeps happening: rn-buddy clean --metro
  Docs          https://metrobundler.dev/docs/resolution/
```

```sh
rn-buddy why "<error text>"                          # paste the message
npx react-native run-android 2>&1 | rn-buddy why     # pipe the build output
rn-buddy why --file build.log                        # read a saved log
```

- **Long logs:** Gradle prints the cause far above `BUILD FAILED`, and Xcode buries it among warnings. `why` skips those generic lines, explains the first real error, and lists any other errors it found below.
- **Checks your project:** is the package in package.json and in node_modules? Is the pod in `ios/Podfile.lock`? Is your JDK the one the project wants (the same check as `env`)? Are `ANDROID_HOME` and `android/local.properties` set? In Expo projects, are you in Expo Go or a development build?
- **Knows about 65 errors** from Metro, native modules, Android/Gradle, iOS/Xcode/CocoaPods, React and Expo. It works offline.
- **Unknown error?** It shows the lines that look like errors, so you know what to search for, and exits with code 1. [Open an issue](https://github.com/CBC-Tola/rn-buddy/issues) to get it added.

| Option | Meaning |
|---|---|
| `-f, --file <path>` | Read the error from a log file |

## `doctor`: is everything OK?

Not sure which command to run? `doctor` runs the checks of `env`, `status` and `check` together and prints one summary.

```
$ rn-buddy doctor
ReactNativeDemo · React Native 0.88.0

Tools
  ✔ Node       22.23.3        matches >= 22.11.0 (package.json engines)
  ⚠ Java       21.0.12        .java-version wants 17, JAVA_HOME is newer
               → Gradle uses JAVA_HOME. Point it at JDK 17, or update .java-version if 21 builds fine
  ...

Build
  ⚠ Android build  Rebuild needed: react-native-screens was installed after the last build (native code)
                   → npm run android
  ✔ Metro cache    Babel and Metro config unchanged since Metro last ran

Code
  ✔ Code  no common React Native mistakes found

✔ 17 ok  ⚠ 6 to check  ✖ 1 to fix
Details: rn-buddy env, rn-buddy status and rn-buddy check. Stuck on an error? rn-buddy why "<error>"
```

It exits with code 1 when something must be fixed. `--offline` skips the React Native Directory check of your packages.

## `env`: is my setup right for this project?

```
$ rn-buddy env
ReactNativeDemo · React Native 0.81.0
/Users/me/code/ReactNativeDemo

Tools
  ✔ Node       22.12.0        matches >= 22.11.0 (package.json engines)
  ✔ Java       17.0.10        matches 17 (React Native docs), from JAVA_HOME
  ✔ Ruby       3.3.0          matches >=2.6.10 (Gemfile)
  ✔ Watchman   2025.01.06.00  installed
  ✔ Port 8081                 Metro is running

Android
  ✔ Android SDK                  /Users/me/Library/Android/sdk (from ANDROID_HOME)
  ✔ SDK Platform  android-36     installed
  ✔ Build tools   36.0.0         installed
  ⚠ NDK           27.1.12297006  not installed. Gradle tries to download it, which fails offline or before you accept the SDK licenses
                  → sdkmanager "ndk;27.1.12297006", or Android Studio → SDK Manager → SDK Tools → NDK (Side by side)
  ✔ adb                          found in the SDK platform-tools
  ⚠ Devices                      no device or emulator connected
                  → Start an emulator from Android Studio → Device Manager, or plug in a phone with USB debugging on
  ✔ Emulators                    Pixel_8_API_36

iOS
  ✔ Xcode       16.2 (16C5032a)  meets 16.1+ for React Native 0.81
  ✔ Simulators                   iOS 18.2
  ✔ CocoaPods   1.15.2           matches Gemfile.lock

Lockfiles
  ✔ package-lock.json  npm, matches package.json
  ✔ node_modules       installed
  ✔ Gemfile.lock       Ruby gem versions are locked
  ✔ ios/Podfile.lock   matches the installed pods

✔ 17 ok  ⚠ 2 to check
```

| Check | What it compares |
|---|---|
| Node | Your Node version with `engines` in package.json and in `react-native`, `.nvmrc` and `.node-version` |
| Java (if there is an `android/` folder) | The JDK in `JAVA_HOME` (or `java` on your PATH) with `.java-version`, or JDK 17, which the React Native docs recommend |
| Ruby (on macOS, if there is a `Gemfile`) | Your Ruby version with the `ruby` line in `Gemfile` and `.ruby-version` |
| Watchman | Installed (optional, a warning only; not checked on Windows) |
| Port 8081 | Free, or used by Metro itself. Another program there stops Metro from starting |
| Android SDK | `sdk.dir` in `android/local.properties`, `ANDROID_HOME` or `ANDROID_SDK_ROOT` points at a folder that exists |
| SDK Platform, Build tools, NDK | `compileSdkVersion`, `buildToolsVersion` and `ndkVersion` from `android/build.gradle` are installed in the SDK |
| adb, Devices, Emulators | `adb` is found, a device or emulator is connected, and at least one emulator (AVD) exists |
| Xcode (macOS) | Installed, `xcode-select -p` points at Xcode (not the Command Line Tools), and new enough for your React Native version |
| Simulators (macOS) | At least one iOS simulator runtime is installed |
| CocoaPods (macOS) | `bundle exec pod` runs the version locked in `Gemfile.lock` |
| Lockfiles | One package manager, lockfiles in sync with package.json, `node_modules`, Ruby gems and pods installed |

Android checks run only if there is an `android/` folder, iOS checks only on macOS with an `ios/` folder. In an Expo project without them, `env` tells you that Expo Go needs neither Android Studio nor Xcode until you make a development build.

| Option | Meaning |
|---|---|
| `--fix` | Fix what is safe to fix, after asking: write `sdk.dir` to `android/local.properties`, run `npm install` (or yarn/pnpm/bun), `bundle install` and `pod install`, then check again |
| `-y, --yes` | With `--fix`: don't ask |
| `--dry-run` | With `--fix`: show the fix plan only |
| `--json` | Print the results as JSON, for CI |
| `--report` | Print a short block to paste into a GitHub issue or Discord, with your home folder shortened to `~` |

```
$ rn-buddy env --report
ReactNativeDemo (rn-buddy env --report)
OS               macOS 15.5 (arm64)
Node             22.12.0
Package manager  npm (installed: npm 10.9.2, yarn 1.22.22)
Java             17.0.10
Xcode            16.2 (16C5032a)
Android SDK      ~/Library/Android/sdk · platforms 35, 36 · build-tools 36.0.0 · NDK 27.1.12297006
react-native     0.81.0
Hermes           true
New Arch         true

Problems
⚠ Android › Devices: no device or emulator connected
```

- `✖` means the build will fail. `env` then exits with code 1 (also with `--json` and `--report`), so you can use it in CI.
- `⚠` is worth a look but may be fine.
- `env` runs `java -version`, `ruby -v`, `bundle check`, `adb devices`, `xcodebuild -version` and similar on your machine. It only talks to `localhost:8081`, never the internet.

## `status`: do I need to rebuild?

The difference between reloading (JavaScript changes) and rebuilding (native changes) is the most common beginner confusion in React Native. `status` tells you which one you need.

```
$ rn-buddy status
ReactNativeDemo · React Native 0.88.0

Since the last build
  ⚠ Android build  Rebuild needed: react-native-mmkv was added since the last build (it has native code)
                   → npm run android
  ⚠ iOS pods       Out of date: react-native-mmkv is not in Podfile.lock yet
                   → (cd ios && bundle exec pod install)
  ✔ Metro cache    Babel and Metro config unchanged since Metro last ran

✔ JS changes only otherwise: reload with r in Metro
```

| Row | Compares |
|---|---|
| Android build / iOS build | When the last build finished (the `.apk`, the `.app` in `ios/build` or this app's DerivedData) with when native packages were installed, updated or removed, and when files in `android/` or `ios/` were edited |
| iOS pods | `Podfile.lock` with `Pods/Manifest.lock`, and every native package with `Podfile.lock` |
| Metro cache | `babel.config.js` / `metro.config.js` changed after Metro last cached your code: restart it with `--reset-cache` |
| .env | With `react-native-config`: `.env` changed after the last build, so the app needs a rebuild |
| Expo Go / Dev build / Config plugins | Expo without `android/`/`ios/`: native packages that Expo Go doesn't include, and `app.json` plugin changes, which need a development build |

- If the app has never been built, it says so instead of guessing.
- It works offline. It remembers the native packages of your last build in `node_modules/.cache/rn-buddy`.

## `clean`: reset caches safely

```
$ rn-buddy clean
What do you want to clean?

  1 Metro cache    Metro and haste-map caches, node_modules/.cache          48 MB
                   fixes: changes not showing up, "Unable to resolve module" after install
  2 Watchman       forget and re-add the watch on this folder
                   fixes: Metro not noticing file changes
  3 Android build  android/build, android/app/build, android/.gradle, .cxx  412 MB
                   fixes: Gradle and CMake errors, old native code after an install
  4 iOS build      ios/build, Xcode DerivedData for this app                1.2 GB
                   fixes: Xcode build errors, old native code after an install
  5 iOS Pods       ios/Pods, then pod install again                         310 MB
                   fixes: pod errors, "No such module", missing pods
  6 node_modules   delete, then reinstall with npm                          520 MB
                   fixes: broken or half-finished installs
  a All of the above

Choose (1-6, a): 1,3

clean metro, android

  Delete    $TMPDIR/metro-cache              48 MB
            android/app/build                372 MB
            android/.gradle                  40 MB
  Skip      android/.cxx                     nothing to clean
  Total     460 MB

Delete these? (Y/n)
```

| Option | Deletes | Then |
|---|---|---|
| `--metro` | `$TMPDIR/metro-*`, `$TMPDIR/haste-map-*`, `node_modules/.cache` | start Metro with `--reset-cache` |
| `--watchman` | nothing: runs `watchman watch-del` and `watchman watch-project` on the project | restart Metro |
| `--android` | `android/build`, `android/app/build`, `android/.gradle`, `.cxx` | rebuild: `npm run android` |
| `--ios` | `ios/build` and Xcode DerivedData for **this app only** | rebuild: `npm run ios` |
| `--pods` | `ios/Pods` (keeps `Podfile.lock`) | runs `(cd ios && bundle exec pod install)` |
| `--deps` | `node_modules` (keeps the lockfile) | runs `npm install` (or yarn/pnpm/bun) |
| `--all` | all of the above | |
| `--lockfiles` | with `--deps`/`--pods`: also the JS lockfile / `Podfile.lock`. Rarely a good idea: they pin the versions that work together | |

- It always shows the plan first, with sizes, then asks. `--dry-run` only shows the plan, `--yes` skips the question.
- It never deletes anything outside your project, except Metro's temp caches and this app's DerivedData folder.
- On Windows and Linux, DerivedData and Pods are skipped.
- In Expo projects, the next step is `npx expo start -c` or `npx expo run:android`.

## `check`: common React Native mistakes in your code

```
$ rn-buddy check
DemoApp · React Native 0.81.0

src/screens/HomeScreen.tsx
  ✖ src/screens/HomeScreen.tsx:2  AsyncStorage was removed from react-native: importing it from there fails as soon as it is used [Old core APIs]
    → Use @react-native-async-storage/async-storage instead
  ⚠ src/screens/HomeScreen.tsx:5  http://localhost:3000/api means the phone itself, not your computer [localhost URLs]
    → Android emulator: http://10.0.2.2:3000. A real phone: your computer's LAN IP, or rn-buddy device connect --port 3000. The iOS simulator can use localhost
  ⚠ src/screens/HomeScreen.tsx:17  <ScrollView> renders a list with .map(): fine for a few items, slow for long lists [ScrollView + map]
    → Use <FlatList data={items} renderItem={...} /> for long or growing lists
  ✖ src/screens/HomeScreen.tsx:19  <div> is an HTML element: React Native has no HTML elements [HTML elements]
    → Use <View> instead. React Native has View, Text, Image, Pressable and TextInput

package.json
  ⚠ package.json:14  react-native-vector-icons is the old, deprecated all-in-one package [Old packages]
    → Use the per-font packages, e.g. @react-native-vector-icons/material-design-icons

Project
  ℹ 12 console.log calls in 4 files [console.log]

✖ 2 to fix  ⚠ 3 to check  ℹ 1 tip  (23 source files checked)
```

| Check | Finds |
|---|---|
| HTML elements | `<div>`, `<span>`, `<p>`, `<img>`, `<button>`, `<input>`, ... and `onClick` |
| Text outside `<Text>` | `<View>Hello</View>`, which crashes with "Text strings must be rendered within a `<Text>` component" |
| Old core APIs | `AsyncStorage`, `Picker`, `NetInfo`, `Slider`, ... (removed) and `SafeAreaView`, `Clipboard` (deprecated) imported from `react-native` |
| Secrets | Stripe, AWS, GitHub and Slack tokens, private keys, `apiKey = "..."`, and a `.env` missing from `.gitignore` |
| localhost / `http://` URLs | `localhost` doesn't reach your computer from a phone, and release builds block plain `http://` |
| Lists | `ScrollView` with `.map()`, `FlatList` without `keyExtractor`, inline `renderItem` |
| Remote images | `<Image source={{ uri }}>` without a width and height shows up 0×0 |
| Packages | Old package names, two copies of `react`, unmaintained packages or packages without New Architecture support (React Native Directory) |

- `✖` breaks the app or leaks a secret, and `check` then exits with code 1. `⚠` is worth a look. `ℹ` is a tip.
- It reads `App.tsx`, `index.js`, `src/`, `app/`, `components/` and `screens/`, and skips comments and tests.
- `--offline` skips the React Native Directory check.

## `structure`: where should my code go?

Creates a `src/` folder with one folder per kind of code. Each folder gets a README that explains what goes in it, with an example:

```
src/
  README.md        ← map of the folders, and which folder may import which
  screens/         ← one component per screen
  components/      ← reusable UI pieces
  navigation/      ← navigators
  hooks/           ← custom hooks (useSomething)
  services/        ← API calls, storage
  store/           ← state shared between screens
  theme/           ← colors, spacing, font sizes
  utils/           ← small helper functions
  assets/          ← images and fonts
  types/           ← shared TypeScript types (TypeScript projects only)
```

- The examples use TypeScript if the project has a `tsconfig.json`, and JavaScript otherwise.
- Existing files are never overwritten, and nothing outside `src/` is changed, so it is safe to run again.
- Run `rn-buddy structure --dry-run` first to see what it would create.
- Git doesn't track empty folders. Each folder has a README, so the layout gets committed.

### `structure --feature-based`

```
$ rn-buddy structure --feature-based
Folder layout (feature-based, TypeScript examples)
  + src/README.md                           All your app code lives here, grouped by feature
  + src/features/README.md                  One folder per feature of the app
  + src/features/auth/README.md             An example feature
  + src/features/auth/screens/README.md     The screens of the auth feature
  + src/features/auth/components/README.md  UI pieces only used by the auth feature
  + src/features/auth/hooks/README.md       Hooks with the logic of the auth feature
  + src/components/README.md                Shared UI pieces used by more than one feature
  + src/navigation/README.md                Navigators
  + src/services/README.md                  Shared code that talks to the outside world
  + src/theme/README.md                     Colors, spacing and font sizes in one place
  + src/utils/README.md                     Small helper functions shared by features
  + src/types/README.md                     TypeScript types used by many files
```

- One folder per feature (`src/features/auth/`) instead of one per kind of code. `src/README.md` explains when each layout is better: type-based for small apps and learning, feature-based for growing apps and teams.
- Features don't import each other's internals, only what a feature exports from its `index.ts`. Shared folders never import from `features/`.
- Like the default layout: READMEs only, existing files are never overwritten, and `--dry-run` shows the plan first.

## `add`: install features the right way

Adding a library to a React Native app often takes more than `npm install`. You may need to run `pod install` for iOS, edit native files, change `babel.config.js`, and rebuild the app. `add` does all of that, and shows you the plan before it changes anything.

### Recipes

| Group | Recipe | What you get |
|---|---|---|
| Navigation | `navigation` | [React Navigation](https://reactnavigation.org) native stack, Home and Details screens, the `react-native-screens` setup in `MainActivity` |
| | `tabs` | Bottom tabs (`@react-navigation/bottom-tabs`) with two example screens. Installs the navigation basics if they're missing |
| | `drawer` | A side menu (`@react-navigation/drawer`), plus Gesture Handler and Reanimated with their Babel plugin |
| Data | `state` | [Zustand](https://zustand.docs.pmnd.rs) with an example store |
| | `api` | [TanStack Query](https://tanstack.com/query), a `fetch` helper and an example query |
| | `storage` | MMKV (`react-native-mmkv` + `react-native-nitro-modules`) and a typed `src/services/storage` helper |
| UI | `icons` | `@react-native-vector-icons/ionicons`, an `IconButton` example, the font listed in `Info.plist` |
| | `svg` | `react-native-svg` + `react-native-svg-transformer`, the `metro.config.js` change, `declarations.d.ts`, a `Logo` example |
| | `fonts` | `src/assets/fonts/`, `react-native.config.js`, and how to link fonts with `npx react-native-asset` |
| | `animations` | Reanimated 4 + Worklets + Gesture Handler, the Babel plugin placed **last** in `babel.config.js`, a `FadeInView` example |
| Native features | `permissions <names...>` | `react-native-permissions`: `Info.plist` usage strings, `AndroidManifest.xml` permissions, the Podfile `setup_permissions` call, a `usePermission` hook |
| | `env-vars` | `react-native-config`, `.env` + `.env.example`, `.env` added to `.gitignore`, the Android Gradle line, `src/config` |
| Tooling | `imports` | `@/` imports for `src/`: `babel-plugin-module-resolver` and `tsconfig.json` paths, kept in sync |
| | `testing` | React Native Testing Library, `jest.setup` with mocks for your native packages, an example test |
| | `lint` | Checks the template's ESLint + Prettier setup, adds `lint` and `format` scripts |

```
$ rn-buddy add permissions camera location
add permissions camera location  Ask for camera, location, photos, ... with react-native-permissions

  Install   react-native-permissions
            $ npm install react-native-permissions
  Create    src/hooks/usePermission.ts
  Edit      ios/DemoApp/Info.plist
              usage descriptions for camera, location (edit the sentences: users see them)
            android/app/src/main/AndroidManifest.xml
              <uses-permission> for camera, location
            ios/Podfile
              setup_permissions(['Camera', 'LocationWhenInUse'])
  Then      (cd ios && bundle exec pod install) if a new package has native code

Make these changes? (Y/n)
```

`rn-buddy add permissions` with no names lists them: camera, microphone, location, location-always, photos, contacts, calendars, notifications, bluetooth, motion, face-id.

When it's done, it prints the next steps, such as the code to put in `App.tsx`, and a link to the library's docs.

### Any package

`rn-buddy add <package>` installs any npm package:

- **Package manager:** it uses the one your project uses, based on its lockfile (npm, Yarn, pnpm or Bun).
- **Checks before installing:**
  - The package exists on npm.
  - Its latest version supports your `react` and `react-native` versions.
  - React Native Directory doesn't mark it unmaintained or without New Architecture support.
- **After installing:** if the package has native code, it runs `pod install` (on macOS) and tells you to rebuild the app.
- **Recipe packages:** if the package belongs to a recipe, for example `react-native-screens`, it suggests the recipe instead.

### Undo a recipe

`rn-buddy add --undo <recipe>` removes what a recipe added, and keeps what is still in use:

- **Packages:** uninstalled, unless another recipe uses them, your code imports them, or a kept package needs them.
- **Starter files:** deleted only if you haven't changed them. Changed files are kept and listed.
- **Config and native edits:** reverted only when the change is still exactly what rn-buddy wrote. Otherwise you get an "undo by hand" line.

```
$ rn-buddy add --undo animations
undo animations  remove what the recipe added

  Uninstall react-native-worklets
            react-native-gesture-handler
            $ npm uninstall react-native-worklets react-native-gesture-handler
  Keep      react-native-reanimated imported in src/components/FadeInView.tsx
            src/components/FadeInView.tsx you changed it
            babel.config.js still needed: react-native-reanimated is imported in src/components/FadeInView.tsx
```

### In Expo projects

- **Install:** packages go in with `npx expo install`, which picks versions that match your Expo SDK.
- **Native setup:** when `android/` and `ios/` are generated (missing or git-ignored), rn-buddy doesn't touch them. Native setup goes into `app.json` instead, for example the `react-native-permissions` config plugin. An `app.config.js`/`.ts` gets a do-by-hand line.
- **Built-in Expo features:** `env-vars` uses Expo's `EXPO_PUBLIC_` variables, `imports` only edits `tsconfig.json`, and `animations` skips the Babel edit (Expo adds the plugin itself).
- **Expo Go:** it warns when a recipe can't run in Expo Go (`permissions`, `storage`), and tells you to rebuild your development build (`npx expo run:android` / `npx expo run:ios`, or EAS) instead of running `pod install`.

### Safe to run

- It shows the plan and asks before changing anything. Use `--dry-run` to see the plan only, or `--yes` to skip the question (needed in scripts and CI).
- Existing files are never overwritten. A native file that doesn't look like the React Native template is left alone, and `add` tells you what to change by hand.
- If the install fails, nothing else is changed.
- The checks send package names to npm and React Native Directory. Use `--offline` to skip them.

| Option | Meaning |
|---|---|
| `--dry-run` | Show what would change, change nothing |
| `-y, --yes` | Don't ask before making the changes |
| `-D, --dev` | Install the package as a devDependency |
| `--undo` | Remove what a recipe added |
| `--offline` | Skip the npm and React Native Directory checks |

## `app`: name, ID, icon, splash screen and version

```
$ rn-buddy app
            Android   iOS
  Name      DemoApp   DemoApp
  ID        com.demo  org.reactjs.native.example.DemoApp  ⚠ different
  Version   1.0       1.0
  Build     1         1

→ iOS still has the template's placeholder ID. Set your own before publishing: rn-buddy app id com.yourname.app
```

```
$ rn-buddy app id com.example.budget
app id  com.example.budget

  Edit      android/app/build.gradle
              applicationId  com.demo → com.example.budget
              namespace      com.demo → com.example.budget
  Edit      ios/DemoApp.xcodeproj/project.pbxproj
              PRODUCT_BUNDLE_IDENTIFIER (DemoApp: Debug, Release)  org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier) → com.example.budget
  Move      android/app/src/main/java/com/demo/MainActivity.kt
              → android/app/src/main/java/com/example/budget/MainActivity.kt  (package line updated)
  Then      rn-buddy clean --android, then rebuild both apps: the old build still has the old ID

⚠ Changing the ID of an app that is already in the App Store or Google Play makes it a different app there.

Make these changes? (Y/n)
```

| Command | Changes |
|---|---|
| `app name "Budget Buddy"` | `app_name` in `strings.xml`, `CFBundleDisplayName` in `Info.plist`, `displayName` in `app.json`. The internal module name stays, because it links the native app to `AppRegistry` |
| `app id com.example.budget` | `applicationId` and `namespace`; moves `MainActivity`/`MainApplication` to the new package folder; `PRODUCT_BUNDLE_IDENTIFIER` (test targets follow) |
| `app version patch` | `versionName` + `versionCode`, `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`, and `version` in package.json. Also `minor`, `major` or a version like `1.2.0` |
| `app icon ./icon.png` | From one square PNG of at least 1024×1024: Android `ic_launcher`/`ic_launcher_round` in every `mipmap-*dpi`, and the single 1024 icon Xcode needs. Uses `sips`, so macOS only |
| `app splash ./logo.png --bg "#1e90ff"` | Installs [react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash), runs its generator, then prints the 3 code changes left to do |

- In Expo projects, changes go to `app.json` (`expo.name`, `ios.bundleIdentifier`/`android.package`, `version`/`buildNumber`/`versionCode`, `icon`, and the `expo-splash-screen` plugin). `app.config.js` can't be edited, so you get the steps to do by hand.
- Each command shows the plan first. A file that doesn't look like the template is left alone, with a "do by hand" step.
- Quote the color (`--bg "#fff"`) or leave out the `#` (`--bg fff`): in a shell, an unquoted `#fff` is a comment.

| Option | Meaning |
|---|---|
| `--dry-run` | Show what would change, change nothing |
| `-y, --yes` | Don't ask before making the changes |
| `--bg <color>` | `splash`: background color |

## `upgrade`: upgrade React Native with a plan

```
$ rn-buddy upgrade 0.88
DemoApp · React Native 0.87.1

React Native 0.87.1 → 0.88.1

  Packages     react 19.2.3 → 19.3.0
               react-native 0.87.1 → 0.88.1
               @react-native/* 0.87.1 → 0.88.1
  Libraries    ✔ react-native-screens  4.18.0 supports 0.88
               ⚠ react-native-old-lib  no version supports 0.88 yet (1.2.0 needs react-native >=0.70 <0.85)
  Files        android/gradle/wrapper/gradle-wrapper.properties  Gradle 9.0.0 → 9.3.1
               ios/DemoApp/AppDelegate.swift                     iOS app startup code
               ios/DemoApp/SceneDelegate.swift                   new: iOS window and scene setup
               android/app/build.gradle                          Android app build settings  (you changed this file: do by hand)
  Then         $ npm install
               $ (cd ios && bundle exec pod install)
               rebuild both apps: npm run android, npm run ios (reload is not enough)
               rn-buddy clean --all if the build fails with old caches

  Changes      https://reactnative.dev/blog (the 0.88 release post lists the breaking changes)
  Full diff    https://react-native-community.github.io/upgrade-helper/?from=0.87.1&to=0.88.0

Make these changes? (Y/n)
```

- **Template changes:** it downloads the changes between your version and the new one from [rn-diff-purge](https://github.com/react-native-community/rn-diff-purge), the same source the Upgrade Helper uses, and renames `RnDiffApp` to your app's names.
- **Your edits are safe:** a file changes only when it still matches the template. Otherwise it is listed as "do by hand", and at the end you get the exact lines to change.
- **Packages:** it updates `react-native`, `react`, `@react-native/*` and the template's tooling in `package.json`, then runs the install and `pod install`.
- **Libraries:** it checks each native library's latest version and React Native Directory: does it support the new version?
- **One step at a time:** it recommends upgrading one minor version at a time when the jump is bigger. It never downgrades.
- **Expo:** it runs `npx expo install expo@^<SDK>.0.0 --fix`, `npx expo install --fix` and `npx expo-doctor`, one SDK at a time.

| Option | Meaning |
|---|---|
| `[version]` | `0.88` (its latest patch), `0.88.1`, or nothing for the latest |
| `--dry-run` | Show the plan without changing anything |
| `-y, --yes` | Make the changes without asking |

`upgrade` needs the internet: versions and template changes come from npm and GitHub.

## `device`: run on emulators, simulators and phones

```
$ rn-buddy device
DemoApp · React Native 0.88.0

Android
  ✔ Pixel 7            phone (USB) · ready  R58M123ABC
  ⚠ 0123456789ABCDEF   phone (USB) · unauthorized
                       → Unlock the phone and tap Allow on the "Allow USB debugging?" prompt
  – Pixel_8_API_35     emulator · not running
                       → rn-buddy device start Pixel_8_API_35

iOS
  ✔ iPhone 16 Pro      simulator · iOS 18.4 · booted
  – iPhone 16          simulator · iOS 18.4

Run the app
  npm run android                              build and open the app on the running Android device
  npm run ios -- --simulator "iPhone 16 Pro"   run on the booted simulator
```

```sh
rn-buddy device                        # list phones, emulators and simulators
rn-buddy device start pixel            # start an emulator or simulator (any part of its name)
rn-buddy device connect --port 3000    # Android phone on USB: reach Metro and your API
```

- `start` boots an Android emulator (`emulator -avd`) or an iOS simulator (`xcrun simctl boot`, then opens Simulator).
- `connect` runs `adb reverse tcp:8081 tcp:8081` (Metro) and the same for each `--port`, for every connected Android device. Then it prints the address of your computer as each device sees it:

| App running on | Reaches your computer at |
|---|---|
| Android emulator | `10.0.2.2` |
| iOS simulator | `localhost` |
| Android phone on USB | `localhost`, after `rn-buddy device connect` |
| Any phone on the same Wi-Fi | your computer's LAN IP (rn-buddy prints it) |

`device` finds `adb` and `emulator` in `ANDROID_HOME` (or `ANDROID_SDK_ROOT`, or Android Studio's default folder) and on your PATH. iOS devices are only listed on macOS.

## `release`: ship your first build

```sh
rn-buddy release check     # checklist before releasing (offline)
rn-buddy release android   # upload key, signing config, then the .aab for Google Play
rn-buddy release ios       # what to check, then the Xcode archive and TestFlight steps
```

```
$ rn-buddy release check
Before you release
  ⚠ Version            Android 1.0, iOS 1.0: not bumped since the last tag v1.0.0
                       → rn-buddy app version patch. The stores reject a build number they already have
  ✖ Bundle ID          iOS still uses the template ID org.reactjs.native.example.<AppName>
  ✖ App icon           iOS has none, so App Store Connect rejects the upload
  ✖ iOS usage strings  Info.plist is missing NSCameraUsageDescription (react-native-vision-camera)
  ✔ URLs               no localhost or plain http:// URLs
  ✔ Secrets            nothing that looks like a key or token
  ✔ Hermes             on (the default)
  ✖ Android signing    release builds are signed with the debug key: Google Play rejects them
                       → rn-buddy release android sets up an upload key
  ⚠ console.log        12 calls in 4 files
```

`release android` follows the [React Native guide](https://reactnative.dev/docs/signed-apk-android):

```
$ rn-buddy release android
release android  Sign your app for Google Play

  Create    android/app/demoapp-upload.keystore
              $ keytool -genkeypair -v -storetype PKCS12 -keystore android/app/demoapp-upload.keystore -alias demoapp-upload -keyalg RSA -keysize 2048 -validity 10000
  Write     ~/.gradle/gradle.properties
              DEMOAPP_UPLOAD_STORE_FILE=demoapp-upload.keystore
              DEMOAPP_UPLOAD_KEY_ALIAS=demoapp-upload
              DEMOAPP_UPLOAD_STORE_PASSWORD=CHANGE_ME
              DEMOAPP_UPLOAD_KEY_PASSWORD=CHANGE_ME
  Edit      android/app/build.gradle
              sign release builds with the upload key instead of the debug key
  Done      .gitignore already set up
  Then      (cd android && ./gradlew bundleRelease) builds android/app/build/outputs/bundle/release/app-release.aab

Make these changes? (Y/n)
```

- `keytool` asks you for the password itself. Passwords go in `~/.gradle/gradle.properties` (or `$GRADLE_USER_HOME`), never in the project: replace `CHANGE_ME`, then run `rn-buddy release android` again to build the `.aab`.
- A `build.gradle` that doesn't look like the template is left alone, and you get the snippet to add by hand.
- Back up the keystore. With Play App Signing a lost upload key can be reset, but that takes days.
- In Expo projects it shows `npx eas-cli build` / `npx eas-cli submit`, because EAS manages the keys.

| Option | Meaning |
|---|---|
| `--dry-run` | Show the plan, change nothing |
| `-y, --yes` | Don't ask (also builds the `.aab` when the passwords are filled in) |

## `new`: create an app and set it up in one go

```
$ rn-buddy new MyApp --recipes navigation,api
rn-buddy new MyApp  creates a React Native Community CLI app and sets it up
→ Prefer Expo? Run npx create-expo-app@latest instead.

Plan
  1.  Create MyApp with the React Native Community CLI
      $ npx @react-native-community/cli@latest init MyApp
  2.  Add the src/ folder layout
      $ rn-buddy structure
  3.  Add the navigation recipe: Move between screens with React Navigation (native stack)
      $ rn-buddy add navigation
  4.  Add the api recipe: Load data from an API with TanStack Query
      $ rn-buddy add api

Create MyApp in /Users/me/code/MyApp? (Y/n)
```

- The name must be letters and digits, starting with a letter (the React Native CLI's rule). An existing folder is never touched.
- Without `--recipes`, it asks which recipes to add (numbers or names; Enter for none).
- If creating the app fails, it stops. If a recipe fails, it prints the command to run again.

| Option | Meaning |
|---|---|
| `-r, --recipes <names>` | Recipes to add, comma separated, e.g. `navigation,state,api` |
| `--no-structure` | Skip the `src/` folder layout |
| `-y, --yes` | Don't ask questions (no recipes unless `--recipes` is given) |

## Expo projects

rn-buddy is made for React Native Community CLI projects, but it recognizes Expo projects (`expo` in package.json) and adapts:

| Command | In an Expo project |
|---|---|
| `explain` | Notes for `app.json`, `eas.json`, the `app/` folder (Expo Router) and `expo-*` packages; tells you `npx expo prebuild` generates `android/` and `ios/` |
| `why` | Knows the Expo errors ("not available in Expo Go", SDK version mismatch) and whether you're in Expo Go or a development build |
| `env` | Skips the Android and iOS checks until you have `android/`/`ios/` folders |
| `status` | Native packages Expo Go doesn't include, and `app.json` plugin changes, need a development build |
| `add` | Installs with `npx expo install`, and does native setup with config plugins in `app.json` |
| `app` | Changes `app.json` |
| `upgrade` | Upgrades one Expo SDK at a time with `npx expo install --fix` |
| `release` | Points to EAS Build and EAS Submit |

## Roadmap

- [x] `explain`: understand packages, files, native files and settings
- [x] `env`: check Node, Java, Ruby, the Android SDK, Xcode and lockfiles
- [x] `structure`: add a `src/` folder layout with a README in each folder
- [x] `add <recipe | package>`: 15 recipes with the native setup, and `--undo`
- [x] `why`, `doctor`, `status`, `clean`, `check`: when something goes wrong
- [x] `app`, `upgrade`, `device`, `release`, `new`, `learn`
- [x] Expo projects

See [feature-v2.md](feature-v2.md) for the ideas behind these commands.

## Contributing

Found a wrong note, a missing package or an error `why` doesn't know? Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

MIT
