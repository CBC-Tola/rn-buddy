# Gradle

The build tool of the Android app: what its files are for and what to do when a build fails.

## What Gradle does

`npm run android` runs Gradle inside `android/`. Gradle downloads Android libraries, compiles the Kotlin
and Java code of your app and your packages, bundles your JavaScript in release builds, and produces an
`.apk` or `.aab` file.

## The files

- `android/gradlew`: the Gradle wrapper. Always use it (`./gradlew`), never a globally installed Gradle.
- `android/gradle/wrapper/gradle-wrapper.properties`: the Gradle version this project needs
- `android/settings.gradle`: which projects are part of the build (your app + autolinked libraries)
- `android/build.gradle`: settings for all projects: SDK versions, Kotlin version
- `android/app/build.gradle`: your app: `namespace`, `applicationId`, `versionCode`, `versionName`, signing
- `android/gradle.properties`: switches like `hermesEnabled`, `newArchEnabled` and
  `reactNativeArchitectures`, plus how much memory Gradle may use

## Java

Gradle runs on Java. React Native 0.8x needs **JDK 17**. A newer or older JDK is the most common cause of
"Unsupported class file major version" or "Could not determine java version" errors.

## Useful commands

```sh
cd android
./gradlew clean                 # delete build outputs
./gradlew assembleDebug         # build a debug APK
./gradlew bundleRelease         # build a release AAB for Google Play
./gradlew --stop                # stop Gradle daemons stuck with old settings
```

## When a build fails

1. Scroll up to the first "What went wrong:" block. The last lines are rarely the real error.
2. Check Java and the Android SDK with `rn-buddy env`.
3. Clean and try again: `rn-buddy clean --android`.
4. The first build downloads a lot. Slow is normal; "Could not resolve" means a network problem.

## Related

- `rn-buddy why --file build.log` explains the error from a build log
- `rn-buddy env` checks Java, `JAVA_HOME` and the Android SDK
- `rn-buddy explain android/app/build.gradle` explains the file line by line
- `rn-buddy learn autolinking`
