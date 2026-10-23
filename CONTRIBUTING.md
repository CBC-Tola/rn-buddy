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
src/lib/                 # the logic: project reading, notes, online lookups, env checks, structure
src/data/explain.json    # plain-English notes for packages and files
src/templates/structure/ # README templates that `structure` writes
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

File and folder notes go in `files`, keyed by their name in the project root.

## Editing the `structure` templates

Each folder's README comes from `src/templates/structure/<folder>.md` (`src.md` is `src/README.md`). The templates are written in TypeScript and converted for JavaScript projects:

| In the template | TypeScript project | JavaScript project |
|---|---|---|
| `{tsx}` / `{ts}` | `tsx` / `ts` | `js` |
| `{: Type}` | `: Type` | removed |
| line ending in `<!-- ts -->` | kept | removed |
| line ending in `<!-- js -->` | removed | kept |

The text before the first period or colon in each template is the description `structure` prints.

## Adding a recipe

1. Add an entry to `RECIPES` in `src/lib/recipes.js`: `summary`, `docs`, `packages`, `files` and `edits`.
2. For every entry in `files`, add a template in `src/templates/recipes/<recipe>/`. Name it after the file, with the extension filled in and `.tpl` added. For example, `src/store/useCounterStore.{ts}` comes from `state/useCounterStore.ts.tpl`. It uses the same placeholders as the `structure` templates.
3. Add `src/templates/recipes/<recipe>/next.md`: the next steps printed after the recipe runs.
4. `edits` change native files. An edit returns the new content, the same content when the change is already there, or `null` when the file looks unfamiliar and the user has to make the change by hand. Test edits against the current React Native template.
