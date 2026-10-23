# Expo Go vs development builds

Why some packages work in Expo Go and others don't, and what a development build is.

## Expo Go

Expo Go is an app from the App Store / Play Store. It already contains the native code of the Expo SDK
(camera, location, notifications, ...). When you scan the QR code, it downloads **only your JavaScript**
from Metro and runs it.

That's why it's great for learning: no Xcode, no Android Studio, no build. But:

- You can't add native code. A package that isn't part of the Expo SDK and has native code fails with
  errors like "... not available in Expo Go" or "TurboModuleRegistry ... could not be found".
- Expo Go only supports the newest Expo SDK. After an SDK release you have to upgrade your project.
- Your `app.json` settings (app name, icon, permissions, plugins) are not really applied: you're
  running inside Expo Go, not your own app.

## Development builds

A development build is **your own version of Expo Go**: your app, with your native packages and config
plugins compiled in, plus the developer tools (`expo-dev-client`). You build it once, then develop with
Fast Refresh as usual. Rebuild only when native code changes.

```sh
npx expo install expo-dev-client
npx expo run:android        # build on your computer
npx expo run:ios
eas build --profile development   # or build in the cloud with EAS
```

## Community CLI apps

A React Native Community CLI app (`npx @react-native-community/cli init`) is always a "development build":
`npm run android` builds your own app from `android/` and `ios/`. There is no Expo Go step.

## Which one to use

- Learning, prototyping, only Expo SDK packages: **Expo Go** is fine
- Any package with native code outside the Expo SDK, push notifications, custom app icon: **development build**

## Related

- `rn-buddy add <package>` uses `npx expo install` in Expo projects
- `rn-buddy why "<error>"` explains "not available in Expo Go" errors
- `rn-buddy learn reload-vs-rebuild`
