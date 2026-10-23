# React Native DevTools

The debugger for React Native: console, breakpoints and the React component tree, opened from Metro.

## Open it

1. Start the app in a debug build (`npm run android` / `npm run ios`), with Metro running
2. In the Metro terminal, press `j`

Or open the dev menu in the app and choose "Open DevTools":

- iOS Simulator: `Cmd + D`
- Android emulator: `Cmd + M` (macOS) or `Ctrl + M` (Windows/Linux)
- Real phone: shake it, or press `d` in the Metro terminal

DevTools opens in a Chrome or Edge window, so one of them must be installed.

## What's inside

- **Console**: your `console.log` output, with objects you can expand. Type JavaScript to run it in the app.
- **Sources**: open your files, set breakpoints, step through code. Or write `debugger;` in your code.
- **Components**: the React tree, with the props and state of each component
- **Profiler**: find out which components re-render and how long they take
- **Memory**: heap snapshots for finding memory leaks
- Newer versions (0.83 and up) also show network requests and a performance timeline

## What's gone

If a tutorial tells you to use these, it's out of date:

- **Flipper**: removed from the template in React Native 0.74
- **"Debug JS Remotely"** in Chrome: the old remote debugger was removed. It ran your code in the
  browser instead of on the device, which hid real bugs.
- Standalone React DevTools for the component tree: now built into React Native DevTools

## In release builds

DevTools only works in debug builds. For crashes in a release build, read the native logs:
`adb logcat` on Android, Console.app or Xcode on iOS, or use a crash reporting service.

## Related

- `rn-buddy device` lists and starts emulators, simulators and phones
- `rn-buddy why "<error>"` explains the red error screen
- `rn-buddy learn metro`
