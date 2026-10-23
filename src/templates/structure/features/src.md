# src/

All your app code lives here, grouped by feature. Each folder has its own README that explains what goes in it.

| Folder | What goes in it |
|---|---|
| `features/` | One folder per feature (`auth/`, `profile/`, `cart/`) with its screens, components, hooks and API calls |
| `components/` | Shared UI pieces used by more than one feature: buttons, inputs, cards |
| `navigation/` | Navigators: which screens exist and how you move between them |
| `services/` | Shared code that talks to the outside world: the API client, storage |
| `theme/` | Colors, spacing and font sizes |
| `utils/` | Small helper functions with no React code |
| `types/` | TypeScript types shared by many features | <!-- ts -->

## Feature-based or type-based?

There are two common ways to organize `src/`:

- **Type-based**: one folder per kind of code: `screens/`, `components/`, `hooks/`, `services/`. To work on
  the login, you open four folders. (`rn-buddy structure` without `--feature-based` creates this layout.)
- **Feature-based** (this layout): one folder per feature, holding all its kinds of code. To work on the
  login, you open `features/auth/`.

Which is better?

- **Type-based** is simpler for small apps (a handful of screens) and while you're learning: there is
  one obvious place for every file.
- **Feature-based** pays off when the app grows (many screens) or a team works on it: a feature can be
  changed, moved or deleted in one place, and people working on different features rarely touch the
  same files.

You can start type-based and move to features later: move one screen with its components and hooks into
`features/<name>/` at a time.

## Import rules

```
features/auth/  →  its own files, plus components/, services/, theme/, utils/, types/
navigation/     →  features/*/index.{ts}  (only what a feature exports)
anything        →  theme/, utils/, types/
```

1. **A feature doesn't import another feature's internals.** `features/cart/` must not import
   `features/auth/hooks/useLogin`. If it needs something from auth, auth exports it in its `index.{ts}`.
2. **Shared code doesn't import features.** `components/` and `services/` work for every feature, so
   they never import from `features/`.
3. **Code used by two features moves to a shared folder.** A button used by auth and cart goes to
   `components/`; a date helper goes to `utils/`.

## Moving App into src/

You can keep `App.{tsx}` in the project root, or move it to `src/App.{tsx}` and change the import in `index.js`:

```js
import App from './src/App';
```

*Created by [rn-buddy](https://www.npmjs.com/package/rn-buddy). Edit or delete these READMEs as your app grows.*
