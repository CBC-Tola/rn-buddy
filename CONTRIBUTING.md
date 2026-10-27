# Contributing to rn-buddy

## Setup

Requires Node 22+.

```sh
npm install
npm test                                     # run the tests (node:test, no network)
node bin/rn-buddy.js explain --dir ../some-react-native-app
```

To use the `rn-buddy` command anywhere on your machine while developing:

```sh
npm link                  # inside this folder
rn-buddy explain
npm unlink -g rn-buddy    # when you're done
```

## Project layout

```
bin/rn-buddy.js          # entry point (#!/usr/bin/env node)
src/cli.js               # registers commands with commander
src/commands/            # one file per command: what it prints
src/lib/                 # the logic, without console output, so it can be tested
src/lib/ui.js            # shared output helpers: header, ✔/⚠/✖ rows, confirm
src/lib/native.js        # finds the Android/iOS files of the template, whatever the app is called
src/lib/sources.js       # lists and reads the app's own JS/TS files
src/data/explain.json    # plain-English notes for packages, files, native paths and settings
src/data/errors.json     # error signatures for `why`
src/data/lessons/        # one markdown file per `learn` lesson
src/templates/recipes/   # starter files and next steps for each `add` recipe
test/                    # node:test tests
```

## Adding a note

Add an entry to `src/data/explain.json`. The `category` must be one of the listed `categories`; a test checks this.

```json
"react-native-svg": { "category": "UI & Layout", "note": "Draw SVG shapes and icons" }
```

A key ending in `*` matches by prefix, and `{rest}` is replaced with the rest of the name:

```json
"@types/*": { "category": "Types", "note": "TypeScript type definitions for {rest}" }
```

File and folder notes go in `files`, keyed by their name in the project root. In Expo projects, `expoFiles` is used instead.

Notes for files deeper in the project go in `paths` (and `expoPaths` for Expo Router's `app/` folder), keyed by their path from the project root:

| In the key | Matches |
|---|---|
| `*` | part of one name: `android/app/build.gradle*` matches `build.gradle` and `build.gradle.kts` |
| `**` | any number of folders: `android/app/src/main/java/**/MainActivity.*` |
| `<app>` | the app's name: `ios/<app>/Info.plist` |

When several keys match, the one with the most fixed text wins.

Notes for the settings inside a config file go in `settings`, grouped by file (`gradle.properties`, `build.gradle`, `Info.plist`, `app.json`, ...). A key ending in `*` matches by prefix, like package notes.

## Adding an error to `why`

Add an entry to `errors` in `src/data/errors.json`. The `about` block at the top of the file lists every field. For example:

```json
{
  "id": "unable-to-resolve-module",
  "area": "Metro / JS",
  "patterns": ["Unable to resolve module [`'\"]?(?<module>[^\\s`'\"]+)"],
  "title": "Metro can't find {module}.",
  "causes": ["The package isn't installed, or was installed while Metro was running"],
  "fixes": ["If it's a package: `{install} {module}`"],
  "then": "Restart Metro with a clean cache: `{resetCache}`",
  "learn": "metro",
  "clean": "metro"
}
```

- Copy the error text exactly as React Native, Gradle or Xcode print it, and list the most specific pattern first.
- Named groups such as `(?<module>...)` fill `{module}` in the text. `{install}`, `{resetCache}`, `{runAndroid}`, `{podInstall}` and the others listed in `about` are filled in for the user's project.
- Put commands in backticks so they stand out.
- `npm test` checks that every entry has the required fields, that its patterns compile and that every placeholder gets a value.

## Writing a lesson

Each `rn-buddy learn` lesson is a markdown file in `src/data/lessons/`, named after its id. Start with `# Title`, then a one-paragraph summary (shown in the lesson list), then `## ` sections. Keep it to one or two screens, and end with a `## Related` section listing the rn-buddy commands that help.

## Template placeholders

Recipe templates in `src/templates/recipes/` are written in TypeScript and converted for JavaScript projects:

| In the template | TypeScript project | JavaScript project |
|---|---|---|
| `{tsx}` / `{ts}` | `tsx` / `ts` | `js` |
| `{: Type}` | `: Type` | removed |
| line ending in `<!-- ts -->` | kept | removed |
| line ending in `<!-- js -->` | removed | kept |

## Adding a recipe

1. Define the recipe in one of the files in `src/lib/recipes/` (grouped like the `add` list: `navigation.js`, `data.js`, `ui.js`, `permissions.js`, `tooling.js`), then add it to `RECIPES` and `RECIPE_GROUPS` in `src/lib/recipes.js`. The comment above `RECIPES` lists every field: `summary`, `docs`, `packages`, `devPackages`, `files`, `edits`, and the optional `args`, `vars`, `expoGo` and `expo`.
2. For every entry in `files`, add a template in `src/templates/recipes/<recipe>/`. Name it after the file, with the extension filled in and `.tpl` added. For example, `src/store/useCounterStore.{ts}` comes from `state/useCounterStore.ts.tpl`. Dotfiles have no leading dot in the template name (`.env` comes from `env.tpl`). Templates use the placeholders from [Template placeholders](#template-placeholders), plus `{{name}}` for the recipe's `vars`, and lines ending in `<!-- expo -->` or `<!-- cli -->` for one kind of project only.
3. Add `src/templates/recipes/<recipe>/next.md`: the next steps printed after the recipe runs.
4. `edits` change native and config files. The comment at the top of `src/lib/recipes/edits.js` describes an edit. In short: `apply` returns the new content, the same content when the change is already there, or `null` when the file looks unfamiliar and the user has to make the change by hand. Give it an `undo` when the change can be removed safely, so `add --undo` can revert it. Use `platform: 'android' | 'ios'` for native files and `'expo'` for `app.json` config plugins. Test edits against the current React Native template.
