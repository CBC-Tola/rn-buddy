# Navigation

Stacks, tabs and drawers: a mental model for moving between screens.

## There is no URL bar

On the web the browser keeps the history. In a React Native app a **navigator** does: a component that
decides which screen is visible and remembers where the user came from. The most used library is
React Navigation; Expo Router builds on it with file-based routes (`app/` folder).

## The three navigators

- **Stack**: screens pile up like cards. `navigate('Details')` pushes a card, back pops it. The
  screens below stay mounted, so their state is kept. Use it for "list → details → edit".
- **Tabs**: a bar at the bottom with a few top-level sections (Home, Search, Profile). Each tab keeps
  its own state when you switch.
- **Drawer**: a menu that slides in from the side. Good for many sections you don't need often.

## Nesting

Real apps put navigators inside each other:

```
Stack (root)
  ├─ Tabs
  │    ├─ Home      (a stack: Feed → Post)
  │    └─ Profile
  └─ Settings       (opens above the tabs, hides the tab bar)
```

Screens that should cover the tab bar (settings, a checkout flow) go in the root stack, not in a tab.

## Logged in or not

Don't navigate to Login and back. Render different screens based on state:

```tsx
{user ? <Stack.Screen name="Home" component={HomeScreen} /> : <Stack.Screen name="Login" component={LoginScreen} />}
```

When `user` changes, the navigator switches and the back button can't return to Login.

## Params

Pass small values like ids: `navigate('Details', { id: 42 })`, then read `route.params.id`. Don't pass
whole objects that can change; load them from the id.

## In your project

- `src/navigation/`: your navigators; `src/screens/` (or `src/features/*/screens/`): the screens
- The native stack needs `react-native-screens`, which has native code: rebuild after installing

## Related

- `rn-buddy add navigation` installs React Navigation with a stack and two example screens
- `rn-buddy explain @react-navigation/native` explains each React Navigation package
- `rn-buddy learn state`
