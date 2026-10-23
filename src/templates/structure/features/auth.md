# features/auth/

An example feature: signing in and out. Its screens, components, hooks and API calls live together here.

```
auth/
  screens/
    LoginScreen.{tsx}
  components/
    LoginForm.{tsx}
  hooks/
    useLogin.{ts}
    useSession.{ts}       ← the logged-in user, used by other features too
  api.{ts}               ← the auth endpoints, using the shared client in services/
  index.{ts}             ← the public API of this feature
```

## api.{ts}

The feature's calls to your server. It uses the shared client from `services/`, so the base URL and
error handling stay in one place.

```ts
// features/auth/api.{ts}
import { postJson } from '../../services/api';
import type { User } from '../../types'; <!-- ts -->

export function login(email{: string}, password{: string}){: Promise<User>} {
  return postJson('/login', { email, password });
}
```

## index.{ts}

Everything other code may use from this feature. Anything not exported here is private to `auth/`.

```ts
// features/auth/index.{ts}
export { LoginScreen } from './screens/LoginScreen';
export { useSession } from './hooks/useSession';
```

```tsx
// navigation/RootNavigator.{tsx}
import { LoginScreen } from '../features/auth';
```
