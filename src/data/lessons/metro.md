# Metro

The bundler that turns your JavaScript files into one bundle and serves it to the app while you develop.

## What Metro does

When you run `npm start` (or `npm run android`, which starts it for you), Metro:

1. Starts at `index.js` and follows every `import` to find all the files your app uses
2. Transforms them with Babel: TypeScript and JSX become plain JavaScript
3. Joins them into one bundle and serves it on http://localhost:8081
4. Watches your files: when you save, it sends just the change (Fast Refresh)

In a debug build the app downloads the bundle from Metro each time it starts. That's why the app shows
"Unable to load script" or a red screen when Metro isn't running.

## The Metro terminal

The terminal running Metro is a small control panel. Press:

- `r` to reload the app
- `d` to open the dev menu
- `j` to open React Native DevTools

## How the phone finds Metro

- iOS Simulator: `localhost` is your computer, so it just works.
- Android emulator: the CLI runs `adb reverse tcp:8081 tcp:8081` so `localhost:8081` on the emulator
  reaches your computer.
- A real phone: over USB the same `adb reverse` works on Android. Over Wi-Fi, the phone and the computer
  must be on the same network.

## The cache

Metro caches transformed files to start faster. After changing `babel.config.js`, `metro.config.js` or
`.env` values read by a Babel plugin, the old cache can serve stale code. Start Metro with a clean cache:

```sh
npm start -- --reset-cache
```

## In your project

- `index.js`: the entry point Metro starts from
- `metro.config.js`: Metro settings (extra file types, monorepo folders)
- `babel.config.js`: how your code is transformed

## Related

- `rn-buddy clean --metro` clears the Metro cache for you
- `rn-buddy device connect` sets up `adb reverse` for a phone or emulator
- `rn-buddy status` tells you when a Metro reset is needed
- `rn-buddy learn reload-vs-rebuild`
