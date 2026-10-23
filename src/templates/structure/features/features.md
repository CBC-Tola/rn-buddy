# features/

One folder per feature of the app: everything about the login in `auth/`, everything about the cart in `cart/`.

A feature is something a user would name: sign in, profile, feed, cart, settings. Each one gets the
kinds of code it needs, and nothing more:

```
features/
  auth/
    screens/          ← LoginScreen, SignUpScreen
    components/       ← UI only used by this feature
    hooks/            ← useLogin, useSession
    api.{ts}             ← calls to the auth endpoints
    index.{ts}           ← what other code may import from auth
  profile/
    screens/
    api.{ts}
    index.{ts}
```

`auth/` is an example: rename it, copy it for your next feature, or delete it.

## Rules

- **Import another feature only through its `index.{ts}`**: `import { useSession } from '../auth'`,
  never `'../auth/hooks/useSession'`. Then a feature can reorganize its files without breaking others.
- **Shared code lives outside `features/`**: UI used by two features goes to `components/`, the API
  client to `services/`, helpers to `utils/`.
- **No feature needs every folder.** A feature with one screen can be a single `SettingsScreen.{tsx}`
  and an `index.{ts}`.

Not sure if this layout is right for your app? `src/README.md` compares feature-based and type-based folders.
