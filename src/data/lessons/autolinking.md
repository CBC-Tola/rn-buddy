# Autolinking

How a package's native code ends up in your Android and iOS app without you editing native files.

## The problem it solves

Some packages (`react-native-screens`, `react-native-svg`, ...) ship native code next to their JavaScript.
That native code has to be compiled into your app. Years ago you added each one by hand to Gradle files,
Xcode projects and `MainApplication`. Autolinking does it for you at build time.

## How it works

1. You install a package: `npm install react-native-svg`
2. The React Native CLI scans `node_modules` for packages with an `android/` folder or a `.podspec`
3. When you build:
   - **Android**: Gradle includes each library's `android/` project and registers its package
     (the `com.facebook.react.settings` plugin in `android/settings.gradle` does this)
   - **iOS**: `use_native_modules!` in `ios/Podfile` adds each library's pod, so `pod install` picks it up

So autolinking runs when you **build**, not when you install. After installing a native package:

```sh
cd ios && bundle exec pod install && cd ..
npm run android   # or npm run ios
```

## See what is linked

```sh
npx react-native config
```

prints every library the CLI found, with its Android and iOS settings.

## Opting out

A `react-native.config.js` file in your project can turn autolinking off for one platform of one
package, for example when a library only works on iOS. You rarely need it.

## Expo

Expo has its own autolinking (`expo-modules-autolinking`), and native setup that goes beyond linking
is done with config plugins in `app.json`. Either way: new native code means a new development build.

## Related

- `rn-buddy add <package>` installs a package and runs `pod install` when it has native code
- `rn-buddy explain` shows which packages are `[native]`
- `rn-buddy learn pods` and `rn-buddy learn gradle`
