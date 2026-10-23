# navigation/

Navigators: the list of screens in your app and how the user moves between them (stack, tabs, drawer).

React Navigation is the most common library. Install it first: https://reactnavigation.org/docs/getting-started

```
navigation/
  RootNavigator.{tsx}   ← the top-level navigator, rendered in App.{tsx}
  TabNavigator.{tsx}    ← bottom tabs, if you have them
  types.ts              ← screen names and their params <!-- ts -->
```

- Screens live in their feature: `features/auth/screens/`. This folder only wires them together.
- Import screens from the feature's `index.{ts}`: `import { LoginScreen } from '../features/auth'`.
- Run `npx rn-buddy explain @react-navigation/native` to see what each React Navigation package does.
