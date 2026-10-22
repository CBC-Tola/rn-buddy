# rn-buddy

A small CLI that explains your React Native project in plain English: what each package does, which ones have native code, and what every file in the project root is for.

Made for people learning React Native with the [React Native Community CLI](https://github.com/react-native-community/cli).

## Usage

Run it inside a React Native project:

```sh
npx rn-buddy explain                    # explain all packages and root files
npx rn-buddy explain react-native-svg   # details for one package
npx rn-buddy explain --dir ../my-app    # explain another project
npx rn-buddy explain --offline          # no network lookups
```

Example:

```
Packages
UI & Layout
  react-native-safe-area-context  Keeps content away from the notch, status bar and home bar  [native]
Testing
  jest                            Test runner (`npm test`)  [dev]

Files
  Gemfile                         Ruby gems for this project, mainly the CocoaPods version iOS needs
  .watchmanconfig                 Settings for Watchman, the file watcher Metro uses
```

Tags:

| Tag | Meaning |
|---|---|
| `[native]` | Has iOS/Android code. After installing it, run `(cd ios && bundle exec pod install)` and rebuild the app. |
| `[dev]` | A devDependency: used while developing (build, test, lint), not shipped in the app. |
| `[unmaintained]` | Marked unmaintained on React Native Directory. Look for an alternative. |

### Where the explanations come from

1. `src/data/explain.json`: hand-written notes for common packages and files.
2. [React Native Directory](https://reactnative.directory) for other React Native libraries (description, New Architecture support, maintenance status).
3. The package's description on npm.

Steps 2 and 3 need internet. Without it (or with `--offline`), rn-buddy still works with the built-in notes.

## Development

Requires Node 22+.

```sh
npm install
npm test                                        # run the tests (node:test, no network)
node bin/rn-buddy.js explain --dir ../react-native-demo
```

To use the `rn-buddy` command anywhere on your machine while developing:

```sh
npm link        # inside this folder
rn-buddy explain
npm unlink -g rn-buddy   # when you're done
```

### Project layout

```
bin/rn-buddy.js        # entry point (#!/usr/bin/env node)
src/cli.js             # registers commands with commander
src/commands/          # one file per command
src/lib/               # project reading, notes lookup, online lookups
src/data/explain.json  # plain-English notes; add entries here
test/                  # node:test tests
```

### Adding a note

Add an entry to `src/data/explain.json`. The `category` must be one of the listed `categories`; a test checks this.

```json
"react-native-svg": { "category": "UI & Layout", "note": "Draw SVG shapes and icons" }
```

A key ending in `*` matches by prefix, and `{rest}` is replaced with the rest of the name:

```json
"@types/*": { "category": "Types", "note": "TypeScript type definitions for {rest}" }
```

## Publishing

```sh
npm test
npm pack --dry-run      # check which files will be published
npm login               # turn on 2FA on npmjs.com first
npm publish
```

If npm rejects the name as too similar to an existing package, use a scoped name (`@yourname/rn-buddy`) and publish with `npm publish --access public`.

## Roadmap

- [x] `explain`: understand packages and files
- [ ] `env`: check Node/Java/Ruby versions and lockfiles for this project
- [ ] `structure`: add a `src/` folder layout with a README in each folder
- [ ] `add <recipe | package>`: install features (navigation, state, api) the right way

## License

MIT
