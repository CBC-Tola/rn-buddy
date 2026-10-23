# rn-buddy

A small CLI for people learning React Native. Run it inside your project to:

- **`explain`**: find out what each package, file and folder is for, in plain English
- **`env`**: check that your Node, Java and Ruby versions and your lockfiles are right for this project
- **`structure`**: add a `src/` folder layout with a README in each folder that explains what goes there
- **`add`**: install navigation, state management or API loading the right way, or any package, including the native setup

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
rn-buddy add                           # list the recipes
rn-buddy add navigation                # install a recipe: navigation, state or api
rn-buddy add react-native-svg          # install any package the right way
rn-buddy add prettier --dev            # install as a devDependency
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
| Bundler and Ruby gems (on macOS) | `Gemfile.lock` wasn't made with a Bundler too old for your Ruby, and the gems are installed (`bundle check`), so `pod install` can run |

- `✖` means the build will fail. `env` then exits with code 1, so you can also use it in CI.
- `⚠` is worth a look but may be fine.
- `env` runs `java -version`, `ruby -v` and `bundle check` on your machine and doesn't use the network.

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

## `add`: install features the right way

Adding a library to a React Native app often takes more than `npm install`. You may need to run `pod install` for iOS, edit native Android files, and rebuild the app. `add` does all of that, and shows you the plan before it changes anything.

### Recipes

| Recipe | Installs | Creates | Native setup |
|---|---|---|---|
| `navigation` | [React Navigation](https://reactnavigation.org) with a native stack: `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context` | `src/navigation/index`, `src/screens/HomeScreen`, `src/screens/DetailsScreen` | Adds the `react-native-screens` code to `MainActivity` and turns off predictive back in `AndroidManifest.xml`, as the React Navigation docs ask |
| `state` | [Zustand](https://zustand.docs.pmnd.rs) | `src/store/useCounterStore`, an example store | none |
| `api` | [TanStack Query](https://tanstack.com/query) | `src/services/api` (a `fetch` helper), `src/services/queryClient`, `src/hooks/useTodos` (an example query) | none |

```
$ rn-buddy add navigation
add navigation  Move between screens with React Navigation (native stack)

  Install   @react-navigation/native
            @react-navigation/native-stack
            react-native-screens
            $ npm install @react-navigation/native @react-navigation/native-stack react-native-screens
  Installed react-native-safe-area-context already installed
  Create    src/navigation/index.tsx
            src/screens/HomeScreen.tsx
            src/screens/DetailsScreen.tsx
  Edit      android/app/src/main/java/com/reactnativedemo/MainActivity.kt
              react-native-screens setup, so Android can restore the app without crashing
            android/app/src/main/AndroidManifest.xml
              turn off predictive back, which React Navigation doesn't support yet
  Then      (cd ios && bundle exec pod install) if a new package has native code

Make these changes? (Y/n)
```

When it's done, it prints the next steps, such as the code to put in `App.tsx`, and a link to the library's docs.

### Any package

`rn-buddy add <package>` installs any npm package:

- **Package manager:** it uses the one your project uses, based on its lockfile (npm, Yarn, pnpm or Bun).
- **Checks before installing:**
  - The package exists on npm.
  - Its latest version supports your `react` and `react-native` versions.
  - React Native Directory doesn't mark it unmaintained or without New Architecture support.
- **After installing:** if the package has native code, it runs `pod install` (on macOS) and tells you to rebuild the app.
- **Recipe packages:** if the package belongs to a recipe, for example `react-native-screens`, it suggests the recipe instead.

### Safe to run

- It shows the plan and asks before changing anything. Use `--dry-run` to see the plan only, or `--yes` to skip the question (needed in scripts and CI).
- Existing files are never overwritten. A native file that doesn't look like the React Native template is left alone, and `add` tells you what to change by hand.
- If the install fails, nothing else is changed.
- The checks send package names to npm and React Native Directory. Use `--offline` to skip them.

| Option | Meaning |
|---|---|
| `--dry-run` | Show what would change, change nothing |
| `-y, --yes` | Don't ask before making the changes |
| `-D, --dev` | Install the package as a devDependency |
| `--offline` | Skip the npm and React Native Directory checks |
| `-d, --dir <path>` | Run on another project folder |

## Roadmap

- [x] `explain`: understand packages and files
- [x] `env`: check Node/Java/Ruby versions and lockfiles
- [x] `structure`: add a `src/` folder layout with a README in each folder
- [x] `add <recipe | package>`: install features (navigation, state, API) the right way

## Contributing

Found a wrong note or a missing package? Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

MIT
