# rn-buddy

A small CLI for people learning React Native. Run it inside your project to:

- **`explain`**: find out what each package, file and folder is for, in plain English
- **`env`**: check that your Node, Java and Ruby versions and your lockfiles are right for this project
- **`structure`**: add a `src/` folder layout with a README in each folder that explains what goes there

Made for projects created with the [React Native Community CLI](https://github.com/react-native-community/cli).

## Requirements

Node.js 22 or newer.

## Usage

Run it with `npx` inside your React Native project, no install needed:

```sh
npx rn-buddy explain
```

Or install it globally to use the shorter `rn-buddy` command:

```sh
npm install -g rn-buddy
rn-buddy explain
```

All commands:

```sh
rn-buddy explain                       # explain all packages and root files
rn-buddy explain react-native-svg      # details for one package
rn-buddy explain App.tsx               # what a file or folder is for
rn-buddy explain --offline             # use only the built-in notes, no network
rn-buddy env                           # check tool versions and lockfiles
rn-buddy structure --dry-run           # preview the src/ folder layout
rn-buddy structure                     # create it
rn-buddy <command> --help              # options for one command
```

Every command takes `--dir <path>` to run on another project folder, for example `rn-buddy env --dir ../my-app`.

## `explain`: what is everything for?

```
$ rn-buddy explain
ReactNativeDemo · React Native 0.88.0

Packages
Core
  react                            React itself: components, props, state and hooks
  react-native                     The framework: turns React components into real iOS/Android views  [native]
UI & Layout
  react-native-safe-area-context   Keeps content away from the notch, status bar and home bar  [native]
Testing
  jest                             Test runner (`npm test`)  [dev]

Files
  android/                         Native Android project (Gradle); open this folder in Android Studio
  App.tsx                          Root component: the first screen of your app is rendered from here
  Gemfile                          Ruby gems for this project, mainly the CocoaPods version iOS needs
  metro.config.js                  Metro settings: the bundler that serves your JS to the app
```

| Tag | Meaning |
|---|---|
| `[native]` | Has iOS/Android code. After installing it, run `(cd ios && bundle exec pod install)` and rebuild the app. |
| `[dev]` | A devDependency: used while developing (build, test, lint), not shipped in the app. |
| `[unmaintained]` | Marked unmaintained on React Native Directory. Look for an alternative. |

Add a name to get details about one package, or about a file or folder in your project:

```
$ rn-buddy explain react-native-safe-area-context
react-native-safe-area-context  ^5.5.2 · dependency

  What it is   Keeps content away from the notch, status bar and home bar
  Description  A flexible way to handle safe area, also works on Android and web.
  Category     UI & Layout
  Native code  yes. After installing, run (cd ios && bundle exec pod install) and rebuild the app
  New Arch     supported
  Downloads    9.4M / week
  Repo         https://github.com/AppAndFlow/react-native-safe-area-context
  npm          https://www.npmjs.com/package/react-native-safe-area-context
```

```
$ rn-buddy explain App.tsx
App.tsx  file

  What it is   Root component: the first screen of your app is rendered from here
```

You can also explain a package that isn't installed yet, to see what it does before you add it.

### Where the explanations come from

1. Notes built into rn-buddy for common packages and files.
2. [React Native Directory](https://reactnative.directory), for other React Native libraries: description, New Architecture support and maintenance status.
3. The package's description on [npm](https://www.npmjs.com).

Steps 2 and 3 send package names to those websites. Without internet, or with `--offline`, rn-buddy uses only the built-in notes.

## `env`: is my setup right for this project?

```
$ rn-buddy env
Tools
  ✔ Node  22.23.3  matches >= 22.11.0 (package.json engines)
  ⚠ Java  21.0.12  .java-version wants 17, JAVA_HOME is newer
          → Gradle uses JAVA_HOME. Point it at JDK 17, or update .java-version if 21 builds fine
  ✔ Ruby  4.0.7    matches >=2.6.10 (Gemfile)

Lockfiles
  ✔ package-lock.json  npm, matches package.json
  ✔ node_modules       installed
  ✔ Gemfile.lock       Ruby gem versions are locked
  ✔ ios/Podfile.lock   matches the installed pods

✔ 6 ok  ⚠ 1 to check
```

| Check | What it compares |
|---|---|
| Node | Your Node version with `engines` in package.json and in `react-native`, `.nvmrc` and `.node-version` |
| Java (if there is an `android/` folder) | The JDK in `JAVA_HOME` (or `java` on your PATH) with `.java-version`, or JDK 17, which the React Native docs recommend |
| Ruby (on macOS, if there is a `Gemfile`) | Your Ruby version with the `ruby` line in `Gemfile` and `.ruby-version` |
| JS lockfile | Only one package manager is used, `package-lock.json` matches package.json, and the `packageManager` field matches |
| `node_modules` | Packages are installed |
| `Gemfile.lock`, `ios/Podfile.lock` | They exist, and the installed pods match `Podfile.lock` |

- `✖` means the build will fail. `env` then exits with code 1, so you can also use it in CI.
- `⚠` is worth a look but may be fine.
- `env` runs `java -version` and `ruby -v` on your machine and doesn't use the network.

## `structure`: where should my code go?

Creates a `src/` folder with one folder per kind of code. Each folder gets a README that explains what goes in it, with an example:

```
src/
  README.md        ← map of the folders, and which folder may import which
  screens/         ← one component per screen
  components/      ← reusable UI pieces
  navigation/      ← navigators
  hooks/           ← custom hooks (useSomething)
  services/        ← API calls, storage
  store/           ← state shared between screens
  theme/           ← colors, spacing, font sizes
  utils/           ← small helper functions
  assets/          ← images and fonts
  types/           ← shared TypeScript types (TypeScript projects only)
```

- The examples use TypeScript if the project has a `tsconfig.json`, and JavaScript otherwise.
- Existing files are never overwritten, and nothing outside `src/` is changed, so it is safe to run again.
- Run `rn-buddy structure --dry-run` first to see what it would create.
- Git doesn't track empty folders. Each folder has a README, so the layout gets committed.

## Roadmap

- [x] `explain`: understand packages and files
- [x] `env`: check Node/Java/Ruby versions and lockfiles
- [x] `structure`: add a `src/` folder layout with a README in each folder
- [ ] `add <recipe | package>`: install features (navigation, state, API) the right way

## Contributing

Found a wrong note or a missing package? Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

MIT
