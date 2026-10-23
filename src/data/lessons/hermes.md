# Hermes

The JavaScript engine that runs your app's code on the phone, and why it makes release builds fast.

## What a JavaScript engine is

Your components are JavaScript, but phones don't run JavaScript by themselves. An engine does. Browsers
use V8 (Chrome) or JavaScriptCore (Safari). React Native uses **Hermes**, an engine Meta built for
mobile apps. It's the default since React Native 0.70, on Android and iOS.

## Why Hermes

- **Faster startup**: in release builds your JavaScript is compiled to Hermes **bytecode** at build
  time. The phone doesn't have to parse and compile it when the app opens.
- **Less memory**, which matters on cheap Android phones
- **Smaller downloads**: bytecode is compact
- **Debugging**: React Native DevTools connects to Hermes directly

In debug builds Hermes runs the plain JavaScript from Metro, so you get Fast Refresh.

## Things to know

- Hermes supports modern JavaScript, but a few rare features differ from a browser. If a library says
  "Hermes not supported", look for an alternative.
- `Intl` (dates, numbers, currencies) is supported, but check uncommon locales on a real device.
- Check which engine is running: `typeof HermesInternal === 'object'` is `true` with Hermes.
- JavaScriptCore is no longer built into React Native; it's a separate community package. Unless a
  library requires it, stay with Hermes.

## In your project

- `android/gradle.properties`: `hermesEnabled=true`
- `ios/Podfile`: Hermes is on unless `:hermes_enabled => false` is passed to `use_react_native!`
- Release builds contain `index.android.bundle` / `main.jsbundle` as Hermes bytecode

## Related

- `rn-buddy learn debug-vs-release` explains what else changes in a release build
- `rn-buddy learn devtools` shows how to debug code running in Hermes
- `rn-buddy explain android/gradle.properties`
