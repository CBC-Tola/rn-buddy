# src/

All your app code lives here. Each folder has its own README that explains what goes in it.

| Folder | What goes in it |
|---|---|
| `screens/` | One component per screen of the app |
| `components/` | Reusable UI pieces used by more than one screen |
| `navigation/` | Navigators: which screens exist and how you move between them |
| `hooks/` | Custom React hooks (`useSomething`) |
| `services/` | Code that talks to the outside world: APIs, storage |
| `store/` | State shared between screens (logged-in user, cart, settings) |
| `theme/` | Colors, spacing and font sizes |
| `utils/` | Small helper functions with no React code |
| `assets/` | Images and fonts |
| `types/` | TypeScript types shared by many files | <!-- ts -->

## Who imports whom

Imports should point "down" this list, never up:

```
screens/  →  components/, hooks/, store/
hooks/    →  services/, store/
services/ →  utils/, types/
anything  →  theme/, utils/, types/, assets/
```

For example, a screen may import a `Button` from `components/`, but a component should never import a screen.
If two files need each other, move the shared part down a level.

## Moving App into src/

You can keep `App.{tsx}` in the project root, or move it to `src/App.{tsx}` and change the import in `index.js`:

```js
import App from './src/App';
```

*Created by [rn-buddy](https://www.npmjs.com/package/rn-buddy). Edit or delete these READMEs as your app grows.*
