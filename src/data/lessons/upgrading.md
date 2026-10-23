# Upgrading React Native

Why an upgrade is more than changing a version number, and how to do it without losing a weekend.

## What an upgrade changes

A React Native release changes three things:

1. **npm packages**: `react-native`, `react`, and tools like `@react-native/babel-preset` must match.
2. **Native template files**: `android/build.gradle`, `MainApplication.kt`, `AppDelegate.swift`, the
   Podfile, Gradle and Kotlin versions. `npm install` doesn't touch them: you update them yourself.
3. **Your libraries**: packages with native code often need a newer version for the new React Native.

## The Upgrade Helper

https://react-native-community.github.io/upgrade-helper shows the exact diff between the template of
your version and the new one, file by file. Apply the same changes to your project. Lines with your
app's name or ID stay yours.

## A safe order

1. Commit everything, so you can go back
2. Read the release notes; upgrade **one minor version at a time** if you're far behind (0.80 → 0.81 → 0.82)
3. Update `react-native`, `react` and the `@react-native/*` packages to the versions in the diff
4. Apply the native file changes from the Upgrade Helper
5. Update libraries with native code; check them on https://reactnative.directory
6. Reinstall: `npm install`, then `cd ios && bundle exec pod install`
7. Clean and rebuild both platforms; run your tests

## Expo

Expo bundles a tested set of versions per SDK, so upgrade the SDK instead:

```sh
npx expo install expo@latest --fix
```

then follow the SDK's changelog. With prebuild, regenerate `android/` and `ios/` instead of editing them.

## When something breaks

- Build errors right after upgrading: clean the build folders and Pods, then rebuild
- One library fails: check its issues for the new React Native version, or upgrade it
- Stuck: go back to your commit and upgrade one step smaller

## Related

- `rn-buddy upgrade` plans the upgrade: packages, libraries and native files
- `rn-buddy explain --outdated` shows which packages have newer versions
- `rn-buddy clean --all` cleans every cache after an upgrade
- `rn-buddy learn new-architecture`
