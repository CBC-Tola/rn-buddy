# rn-buddy v2: feature ideas

Notes on what to add next so rn-buddy helps with the problems React Native developers actually lose time on, not just with project setup.

> **Status:** everything in this document is implemented, P0 to P2, including Expo support. See the README for how each command works. The open questions at the end were settled with these defaults:
> 1. **Expo:** supported in every command where it makes sense (see the README's "Expo projects" table).
> 2. **Error database:** built-in only (`src/data/errors.json`); new errors ship with releases.
> 3. **`why` with AI:** not added. `why` stays offline and only uses its database.
> 4. **Icons:** `sips`, so `app icon` works on macOS only, with no new dependency.
> 5. **Telemetry:** none. Unknown errors point to the GitHub issues page.

## Why v1 feels thin

v1 (0.3.0) has four commands, and all of them help on **day one**:

| Command | Helps when… | How often you need it |
|---|---|---|
| `explain` | you open a new project and don't know what anything is | once per project, then rarely |
| `env` | you set up a machine | once per machine, again after an upgrade |
| `structure` | you start writing code | once per project |
| `add` | you install a library | sometimes |

But most of a React Native developer's lost hours come **after** day one: the build breaks, the app can't reach Metro, an upgrade goes wrong, a release needs signing. v1 has no answer when something goes wrong. That is the moment a learner most needs a buddy, and it is why they'd come back to the tool.

The v2 goal: **when something breaks or something hard has to be done, `rn-buddy` is the first thing you run.**

## Where React Native developers lose time

Ranked by how often they come up (Stack Overflow, GitHub issues of `react-native` and the big libraries, Reddit, Discord) and how much they cost a learner.

| # | Pain | Example | v1 covers it? |
|---|---|---|---|
| 1 | **Cryptic build errors** (Gradle, CocoaPods, Xcode) | `Execution failed for task ':app:mergeDebugNativeLibs'`, `CocoaPods could not find compatible versions for pod` | partly (`env` catches some causes) |
| 2 | **"Have you tried clearing the cache?"** | stale Metro cache, old Pods, broken `android/.gradle`, DerivedData | no |
| 3 | **Red screen / runtime errors** | `Unable to resolve module`, `TurboModuleRegistry.getEnforcing(...): 'RNCxxx' could not be found`, `Text strings must be rendered within a <Text>` | no |
| 4 | **Reload or rebuild?** | installed a native package, reloaded, crash | partly (`add` says to rebuild) |
| 5 | **Device and network trouble** | `Could not connect to development server`, `fetch('http://localhost:3000')` fails on Android, cleartext HTTP blocked | no |
| 6 | **Android SDK / Xcode setup** | `SDK location not found`, wrong NDK, `ANDROID_HOME` missing, no simulator | no (`env` checks Node, Java, Ruby only) |
| 7 | **Upgrading React Native** | dozens of native files to change by hand, libraries that break | no |
| 8 | **Native config by hand** | permissions in `Info.plist` and `AndroidManifest.xml`, fonts, Reanimated Babel plugin, SVG transformer | partly (3 recipes) |
| 9 | **App identity** | app name, bundle ID / package name, icon, splash screen, version numbers | no |
| 10 | **Release builds** | Android keystore and signing, AAB, iOS archive, "works in debug, crashes in release" | no |
| 11 | **Beginner code mistakes** | `ScrollView` + `.map()` for long lists, `<div>`, secrets in the JS bundle, deprecated core APIs | no |
| 12 | **Expo vs Community CLI** | the React Native docs now recommend Expo; rn-buddy only supports CLI projects | no |

## Proposed features

Priorities:
- **P0**: highest value, should define v2.
- **P1**: strong value, next.
- **P2**: nice to have, or needs more design.

Effort is relative: **S** is a few days, **M** about a week, **L** several weeks.

---

### P0-1. `rn-buddy why`: explain an error and how to fix it

**Pain #1 and #3.** The single most useful thing a buddy can do. Learners copy an error into Google and land on a 2019 GitHub thread with 40 different answers.

```
$ rn-buddy why "Unable to resolve module @react-navigation/native"
Metro can't find the package @react-navigation/native.

  Likely cause  It's imported in your code but not installed
                (it's not in package.json).
  Fix           rn-buddy add navigation
                or: npm install @react-navigation/native
  Then          Restart Metro with a clean cache: npx react-native start --reset-cache
```

Ways to give it the error:

```sh
rn-buddy why "<error text>"               # paste the message
npx react-native run-android 2>&1 | rn-buddy why   # pipe the build output
rn-buddy why --file build.log
```

How it works:
- A built-in database of error signatures, `src/data/errors.json`, in the same spirit as `explain.json`. Each entry has a regex, a plain-English explanation, likely causes and fixes.
- Captures from the regex fill in the answer, for example the module name.
- **Project-aware fixes.** It checks the project before answering:
  - Is the package in `package.json`? Is it in `node_modules`?
  - Are the Pods up to date?
  - Is the JDK the right one? (reuse `env` checks)
  
  So instead of five possible causes it can say which one it is.
- For long build logs, it finds the first real error and skips the noise (Gradle prints the root cause far above `BUILD FAILED`; Xcode buries it among warnings).

Starter list of errors to cover (about 30 covers most questions):

| Area | Errors |
|---|---|
| Metro / JS | `Unable to resolve module`, `No bundle URL present`, port 8081 in use, `Invariant Violation: "main" has not been registered`, watchman recrawl warnings |
| Native modules | `TurboModuleRegistry.getEnforcing ... could not be found`, `requireNativeComponent: "X" was not found in the UIManager`, `null is not an object (evaluating 'NativeModules.X')` (all: native package added, app not rebuilt) |
| Android | `SDK location not found`, `JAVA_HOME is set to an invalid directory`, `Unsupported class file major version`, `INSTALL_FAILED_INSUFFICIENT_STORAGE`, `Duplicate class`, `mergeDebugNativeLibs` / `2 files found with path 'lib/...so'`, NDK not installed, `No connected devices` |
| iOS | `CocoaPods could not find compatible versions`, `Sandbox: rsync deny`, `Command PhaseScriptExecution failed`, `Multiple commands produce`, `No such module`, `Unable to boot simulator`, `Signing for "App" requires a development team` |
| React | `Text strings must be rendered within a <Text> component`, `VirtualizedLists should never be nested inside plain ScrollViews`, `Each child in a list should have a unique "key" prop`, `Rendered more hooks than during the previous render` |

Fits the code: new `commands/why.js` and `lib/errors.js`, reuse `readProject`, `checkTools` and `hasNativeCode`. No network needed.

Effort: **M** for the engine and the first 30 errors, then ongoing. Contributors can add errors the same way they add package notes.

---

### P0-2. `rn-buddy clean`: reset caches safely

**Pain #2.** "Clear everything and try again" fixes a large share of weird build problems, but learners don't know which caches exist, and copy-pasted `rm -rf` commands are scary.

```
$ rn-buddy clean
What do you want to clean?

  1 Metro cache          fixes: changes not showing up, "Unable to resolve module" after install
  2 Watchman             fixes: Metro not noticing file changes
  3 Android build        android/build, android/app/build, android/.gradle
  4 iOS build            ios/build, Xcode DerivedData for this app
  5 iOS Pods             ios/Pods, then pod install again
  6 node_modules         delete, then reinstall with npm
  a All of the above

Choose (1-6, a): 
```

- Levels, from light to heavy: `--metro`, `--android`, `--ios`, `--pods`, `--deps`, `--all`.
- `--dry-run` lists what would be deleted and how big it is.
- After deleting, it reinstalls what is needed (`npm install`, `pod install`) and says what to run next (rebuild, `--reset-cache`).
- Never touches lockfiles unless asked (`--lockfiles`), and explains why deleting `Podfile.lock` or `package-lock.json` is usually a bad idea.

`why` can suggest the right level: "this usually goes away after `rn-buddy clean --android`".

Effort: **S**. Reuses `podCommand`, `packageManager` and the confirm/dry-run pattern from `add`.

---

### P0-3. `env` v2: check the whole toolchain

**Pain #6.** `env` checks Node, Java and Ruby. The setup errors learners actually hit are mostly elsewhere.

New checks:

| Check | Compares |
|---|---|
| Android SDK | `ANDROID_HOME` / `ANDROID_SDK_ROOT` set and exists, or `sdk.dir` in `android/local.properties` |
| SDK platform | `compileSdkVersion` in `android/build.gradle` is installed in `$ANDROID_HOME/platforms` |
| Build tools and NDK | `buildToolsVersion` and `ndkVersion` from `android/build.gradle` are installed (a missing NDK is a very common first-build failure) |
| `adb` | on PATH; lists connected devices and emulators |
| Emulators | at least one AVD exists (`emulator -list-avds`) |
| Xcode (macOS) | installed, `xcode-select -p` points at it, version meets the React Native minimum |
| CocoaPods | the version in `Gemfile.lock` is the one `bundle exec pod` uses |
| Simulators (macOS) | at least one iOS simulator runtime installed |
| Watchman | installed (optional, a warning only) |
| Ports | 8081 free, or used by Metro itself |

Plus:
- `rn-buddy env --fix`: for things it can fix safely, it does: writes `android/local.properties` with `sdk.dir`, runs `bundle install`, runs `pod install`. It asks first.
- `rn-buddy env --json`: for CI and bug reports.
- `rn-buddy env --report`: prints a short, copyable block for GitHub issues and Discord, like `npx react-native info` but readable, with secrets and paths under `$HOME` shortened.

Effort: **M**. Same `ok / warn / fail` rows, so `commands/env.js` barely changes.

---

### P0-4. `rn-buddy status`: do I need to rebuild?

**Pain #4.** The difference between reload (JS only) and rebuild (native) is the most common beginner confusion in React Native. Every "X is null" or "could not be found" error after an install comes from it.

```
$ rn-buddy status
ReactNativeDemo · React Native 0.88.0

  ⚠ Rebuild needed
    react-native-mmkv was added since the last build (it has native code)
    → npm run android / npm run ios

  ⚠ iOS pods out of date
    package.json changed after the last pod install
    → (cd ios && bundle exec pod install)

  ✔ JS changes only otherwise: reload with r in Metro
```

How it works:
- Compares native packages in `node_modules` with `ios/Podfile.lock` (iOS) and with a fingerprint written by rn-buddy (Android). Gradle has no lockfile for autolinking, so the fingerprint can be the list of native packages and their versions, saved in `node_modules/.cache/rn-buddy`.
- Also flags edits to `android/`, `ios/`, `babel.config.js` (needs a Metro cache reset) and `.env` files (need a rebuild with `react-native-config`).
- `add` and `clean` update the fingerprint.

Effort: **S–M**.

---

### P1-1. More recipes

**Pain #8.** Recipes are the best part of v1: they do the boring native setup correctly. More of them, chosen by how often the setup goes wrong:

| Recipe | Why it's hard by hand | What rn-buddy does |
|---|---|---|
| `permissions <camera\|location\|photos\|microphone\|notifications\|…>` | each needs an `Info.plist` usage string, an `AndroidManifest.xml` entry, sometimes a Podfile `setup_permissions` line; a missing iOS string crashes the app on first use | installs `react-native-permissions`, edits all three files, creates `src/hooks/usePermission` |
| `fonts` | `react-native.config.js` assets, `npx react-native-asset`, the font name differs between iOS and Android | creates `src/assets/fonts/`, config, links fonts, prints the font family names to use |
| `icons` | vector icons need font linking on both platforms | `@react-native-vector-icons/*` with the setup done |
| `svg` | needs `react-native-svg` **and** `react-native-svg-transformer` **and** a `metro.config.js` change **and** a `declarations.d.ts` for TypeScript | does all four |
| `animations` | Reanimated's Babel plugin must be **last** in `babel.config.js`, then Metro needs `--reset-cache` | adds the plugin in the right place, plus `react-native-gesture-handler` |
| `storage` | AsyncStorage vs MMKV confusion | MMKV with a typed `src/services/storage` helper |
| `env-vars` | `.env` with `react-native-config` needs Gradle and Xcode changes; learners commit secrets | sets it up, adds `.env` to `.gitignore`, creates `.env.example`, warns that values end up in the app bundle |
| `tabs`, `drawer` | builds on `navigation` | adds the navigator and an example |
| `imports` | absolute imports (`@/components/...`) need `babel-plugin-module-resolver` **and** `tsconfig.json` paths kept in sync | edits both |
| `testing` | Jest breaks on native modules; mocks are needed | jest setup file with mocks for installed native packages, React Native Testing Library, an example test |
| `lint` | ESLint + Prettier config conflicts | a working config matching the template |

Also: `rn-buddy add --undo <recipe>` (remove what a recipe added, if the files weren't changed since).

Effort: **S** each, with the existing plan/apply engine. `permissions` and `svg` first.

---

### P1-2. `explain` for native files and code

**Pain: "what is this file?" inside `android/` and `ios/`.** Today `explain` only knows root files (it says so: "rn-buddy has notes for files in the project root"). The files learners fear are deeper.

- Notes for the important native files: `android/app/build.gradle`, `android/build.gradle`, `gradle.properties`, `MainApplication.kt`, `MainActivity.kt`, `AndroidManifest.xml`, `ios/Podfile`, `AppDelegate.swift`, `Info.plist`, `*.xcworkspace` vs `*.xcodeproj` ("always open the workspace").
- **Line-level explain** for config files: `rn-buddy explain android/gradle.properties` goes through the file and explains each setting (`newArchEnabled`, `hermesEnabled`, `org.gradle.jvmargs`). Same for `Info.plist` keys and `app.json`.
- `rn-buddy explain src/screens/HomeScreen.tsx`: lists what the file imports and which of them are native, so the learner sees how files connect. (No AI needed: imports and the existing package notes.)

Effort: **M**, mostly writing notes.

---

### P1-3. `rn-buddy device`: running on devices and reaching your API

**Pain #5.**

```sh
rn-buddy device            # list emulators, simulators and phones; start one
rn-buddy device connect    # physical Android phone: adb reverse tcp:8081, and your API port
```

Plus a network check that runs in `rn-buddy status` and `why`:
- Finds `http://localhost` and `127.0.0.1` URLs in `src/` and explains: on an Android emulator use `10.0.2.2`; on a phone use the computer's LAN IP (rn-buddy prints it) or `adb reverse`.
- Finds plain `http://` URLs and explains that Android blocks cleartext HTTP in release builds and iOS ATS blocks it, with the right per-domain exception for development.

Effort: **S–M**.

---

### P1-4. `rn-buddy upgrade`: upgrade React Native with a plan

**Pain #7.** Upgrading is the most dreaded task in React Native. The official tool is a web diff (Upgrade Helper) that learners don't understand.

```
$ rn-buddy upgrade 0.89
React Native 0.88.0 → 0.89.1

  Packages     react-native 0.88.0 → 0.89.1
               react 19.1.0 → 19.2.0
               @react-native/* 0.88.0 → 0.89.1
  Libraries    ✔ react-native-screens 4.x supports 0.89
               ⚠ react-native-foo  no version supports 0.89 yet
  Files        android/gradle/wrapper/gradle-wrapper.properties  Gradle 8.14 → 9.0
               ios/Podfile                                         new min iOS version
               android/app/build.gradle                            (you changed this file: do by hand)
  Then         rn-buddy clean --all, rebuild both apps

Make these changes? (Y/n)
```

How it works:
- Downloads the template diff between the two versions from [rn-diff-purge](https://github.com/react-native-community/rn-diff-purge) (what Upgrade Helper uses).
- Applies each file's diff when the project file still matches the old template; otherwise lists it as "do by hand" and shows the diff with a short explanation. Same pattern as `add`'s native edits.
- Checks each native library's peer dependencies and React Native Directory data for the target version.
- Upgrades one minor version at a time, and recommends that when the jump is bigger.
- Links the release blog post's breaking changes.

Effort: **L**. Highest value of the P1s but also the biggest. Could start as plan-only (`--dry-run` always) and add apply later.

---

### P1-5. `rn-buddy app`: name, ID, icon, splash, version

**Pain #9.** Each of these touches many native files and goes wrong easily.

```sh
rn-buddy app name "Budget Buddy"          # display name on both platforms
rn-buddy app id com.example.budget        # bundle ID / applicationId (and moves the Kotlin package folder)
rn-buddy app icon ./icon.png              # all icon sizes for Android and iOS, from one 1024×1024 PNG
rn-buddy app splash ./logo.png --bg #fff  # react-native-bootsplash setup
rn-buddy app version patch                # versionName/versionCode and CFBundleShortVersionString/CFBundleVersion together
rn-buddy app                              # show current name, IDs, versions on both platforms, and where they differ
```

Notes:
- `app icon` needs image resizing. Options: `sips` on macOS (no dependency), or an optional dependency. Decide before building.
- `app id` is the riskiest: plan + dry-run + "do by hand" fallback, like `add`.

Effort: **M**.

---

### P2-1. `rn-buddy release`: first release build

**Pain #10.**

- `rn-buddy release android`:
  - generates an upload keystore with `keytool`
  - puts the passwords in `~/.gradle/gradle.properties`, not the project
  - adds the signing config to `android/app/build.gradle`
  - checks `.gitignore`
  - builds the AAB and says where it is
- `rn-buddy release check`: a pre-release checklist that runs offline.
  - version bumped since the last tag
  - icons and splash set (not the template defaults)
  - every used permission has an iOS usage string
  - no `localhost` / cleartext URLs
  - no secrets-looking strings in `src/`
  - Hermes on
  - `console.log` count
- `rn-buddy release ios`: explains the Xcode archive and TestFlight steps (can't automate signing well; guide, don't do).

Effort: **M** (Android), **S** (check).

---

### P2-2. `rn-buddy check`: catch beginner mistakes in code

**Pain #11.** A small linter focused on React Native beginner mistakes that ESLint doesn't catch by default, with an explanation for each:

- `ScrollView` with `.map()` over an array → use `FlatList`
- `FlatList` without `keyExtractor` / items without `key`
- web elements (`div`, `span`, `onClick`)
- `Image` with a remote `uri` and no width/height
- deprecated core imports: `AsyncStorage`, `SafeAreaView` from `react-native` → the community packages
- inline arrow functions and style objects in long lists (a perf hint, warning only)
- `localhost` and `http://` URLs (shared with P1-3)
- API keys and tokens in `src/` ("everything in JS ships inside the app")
- packages: unmaintained, no New Architecture support, two copies of `react` (from `explain` data)

It could start with regex checks (no dependency), and move to a real parser only if needed.

Effort: **M**.

---

### P2-3. Expo support

**Pain #12.** The React Native docs recommend starting with Expo, so a growing share of learners have Expo projects, and rn-buddy refuses or misbehaves there. Supporting them would roughly double the audience.

What changes in an Expo project:

| Command | In an Expo project |
|---|---|
| `explain` | notes for `app.json` / `app.config.ts`, `eas.json`, `expo-*` packages, the `app/` folder (Expo Router) |
| `env` | no Java/Ruby/Xcode checks unless `android/`/`ios/` exist (prebuild) |
| `add` | `npx expo install` instead of `npm install` (picks compatible versions); config plugins in `app.json` instead of native file edits; "rebuild" means a new development build, not reload in Expo Go |
| `why` | Expo-specific errors: "not available in Expo Go", SDK version mismatch |
| `upgrade` | `npx expo install expo@latest --fix` |

Effort: **L**. Big strategic decision: see open questions.

---

### P2-4. Smaller ideas

- **`rn-buddy learn <topic>`**: short offline lessons in the terminal: reload vs rebuild, the New Architecture, how Metro works, what autolinking does, debug vs release. Each `why` answer can link to one.
- **`rn-buddy doctor`**: runs `env`, `status` and `check` together and prints one summary. A single "is everything OK?" command for learners who don't know which to run.
- **`explain --outdated`**: show which packages have newer versions and whether the update is safe (patch/minor vs major).
- **`structure` presets**: `--feature-based` (`src/features/auth/...`) as an alternative to the current type-based layout, with a README explaining when each is better.
- **`rn-buddy new`**: wrap `@react-native-community/cli init` and offer recipes right after (`navigation`, `state`, `api`, `structure`) in one go.

## Suggested release plan

| Version | Theme | Features |
|---|---|---|
| 0.4 | **When it breaks** | `why` (first 30 errors), `clean`, `env` v2 |
| 0.5 | **Reload or rebuild** | `status`, `device`, localhost/cleartext checks, `permissions` + `svg` + `animations` recipes |
| 0.6 | **Understand the native side** | `explain` for native files and config lines, `app` (name, id, version, icon) |
| 0.7 | **Upgrade** | `upgrade` (plan-only first, then apply) |
| 0.8 | **Ship it** | `release android`, `release check`, `check` |
| 1.0 | **Expo** | Expo support across commands (or earlier, depending on the open question below) |

`why`, `clean` and `env` v2 first: they cover the most frequent pain, need no new dependencies, and every later feature can point to them ("run `rn-buddy why` with the error").

## Principles to keep

v1 got these right; v2 features should follow them:

- **Plain English first.** Every output line says what it means for the learner, not just what happened.
- **Plan, then ask, then change.** `--dry-run` and confirmation on everything that writes or deletes.
- **Never overwrite.** If a file doesn't look like the template, say what to change by hand.
- **Offline by default where possible.** Network only for package data, always skippable with `--offline`.
- **Few dependencies.** Today it's `commander`, `picocolors`, `semver`. Think twice before adding an image library or a parser.
- **Teach, don't hide.** Show the real command it runs (`$ npm install …`), so the learner can do it without rn-buddy next time.

## Open questions

1. **Expo:** support it in v2 (bigger audience, more work in every command), or stay Community-CLI-only and say so clearly?
2. **Error database:** only built-in, or also fetch updates from the GitHub repo so new errors don't need a release?
3. **`why` with AI:** fall back to an LLM for errors not in the database? Useful, but needs an API key and sends code/logs to a service; conflicts with "offline by default". Could be opt-in (`--ai`).
4. **Icons:** `sips` (macOS only, no dependency) or an optional image dependency for `app icon`?
5. **Telemetry:** none today. Without it, which errors to add to `why` has to come from GitHub issues. Opt-in anonymous "error not recognized" reports would help, but only if clearly optional.
