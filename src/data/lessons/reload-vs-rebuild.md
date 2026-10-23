# Reload vs rebuild

When a change shows up by itself, when pressing r is enough, and when you have to build the app again.

## Two halves of one app

Your app has two parts:

- **JavaScript**: your components, screens and most packages. Metro sends it to the app while it runs.
- **Native code**: the Android and iOS projects in `android/` and `ios/`, plus the native code of packages
  like `react-native-screens`. It is compiled into the app when you build it.

A change to JavaScript can reach a running app. A change to native code can't: it needs a new build.

## Fast Refresh, reload, rebuild

- **Fast Refresh** (automatic): save a `.tsx`/`.js` file and the screen updates, usually keeping its state.
- **Reload** (press `r` in the Metro terminal, or Reload in the dev menu): restarts your JavaScript
  from scratch. Use it when Fast Refresh gets confused or you changed something at the top level.
- **Rebuild** (`npm run android` / `npm run ios`): compiles the native app and installs it again.

## When you must rebuild

- You installed or removed a package with native code (rn-buddy marks them `[native]`)
- You changed anything in `android/` or `ios/`: `AndroidManifest.xml`, `Info.plist`, Gradle files, the Podfile
- You ran `pod install`
- You changed the app name, icon, splash screen, permissions or the bundle ID
- You changed `.env` values read by `react-native-config` (they are compiled into the native app)
- Expo: you changed `app.json` plugins or added a native package. That needs a new development build;
  reloading Expo Go won't help.

Everything else (screens, styles, logic, JavaScript-only packages) only needs Fast Refresh or a reload.

## A classic mistake

You install `react-native-svg`, reload, and get "requireNativeComponent: RNSVGPath was not found" or
"TurboModuleRegistry.getEnforcing(...): 'X' could not be found". The JavaScript arrived, the native half
didn't. Rebuild the app and the error goes away.

## Related

- `rn-buddy status` tells you if this project needs a rebuild, `pod install` or a Metro reset right now
- `rn-buddy explain` tags packages with native code as `[native]`
- `rn-buddy why "<error>"` explains errors like the ones above
- `rn-buddy learn metro` and `rn-buddy learn autolinking` go one step deeper
