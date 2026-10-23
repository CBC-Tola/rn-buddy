# Debug vs release

Why the app you develop with is not the app your users get, and what changes in a release build.

## Debug build (what you use every day)

- Loads JavaScript **from Metro** over the network, so Fast Refresh works
- Has the dev menu, the red error screen (LogBox) and React Native DevTools
- `__DEV__` is `true`: React runs extra checks and warnings
- Slower, on purpose: easier to debug, not optimized

## Release build (what users install)

- The JavaScript is **bundled into the app** (`index.android.bundle`, `main.jsbundle`), minified and
  compiled to Hermes bytecode. No Metro needed.
- No dev menu, no LogBox; `__DEV__` is `false`
- Much faster startup and smoother animations
- Must be **signed**: Android with your upload key, iOS with your Apple certificate

## Things that work in debug and break in release

- Code that only works because Metro is running (e.g. fetching from `localhost`)
- `http://` URLs: Android blocks cleartext traffic and iOS blocks it with App Transport Security
- Code that relies on `console.log` side effects or `__DEV__`-only branches
- Missing ProGuard/R8 rules for a library (Android, when minification is turned on)

So test a release build on a real device before you publish.

## Run a release build locally

```sh
npx react-native run-android --mode release
npx react-native run-ios --mode Release
```

The Android template signs release builds with the **debug** key so this works out of the box. Before
publishing to Google Play you must create your own upload key.

## In your project

- `android/app/build.gradle`: `buildTypes { debug { } release { } }` and `signingConfigs`
- Xcode: the scheme's Build Configuration (Debug or Release)

## Related

- `rn-buddy release check` looks for problems before you release
- `rn-buddy release android` sets up signing and builds your first release
- `rn-buddy learn hermes`
