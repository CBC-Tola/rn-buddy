# store/

State shared between screens: the logged-in user, a cart, settings. State used by only one screen stays in that screen.

Start simple:

1. **React Context**: built into React, enough for a few values that rarely change (user, theme).
2. **Zustand**: a small library when state changes often or Context gets messy. Run `npx rn-buddy explain zustand`.

```
store/
  AuthContext.{tsx}     ← with React Context
  useCartStore.{ts}     ← with Zustand
```

For data from an API (lists, details), look at TanStack Query before putting it in a store. It handles loading, caching and refreshing for you.
