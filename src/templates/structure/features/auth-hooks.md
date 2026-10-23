# features/auth/hooks/

Hooks with the logic of the auth feature. For example `useLogin.{ts}`; a hook's name starts with `use`.

- Hooks call the feature's `api.{ts}` and hold loading and error state, so screens stay short.
- A hook other features need (like `useSession`) is exported from `features/auth/index.{ts}`.

## Example

```ts
// features/auth/hooks/useLogin.{ts}
import { useState } from 'react';
import { login as loginRequest } from '../api';

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(); <!-- ts -->
  const [error, setError] = useState(); <!-- js -->

  async function login(email{: string}, password{: string}) {
    setIsLoading(true);
    setError(undefined);
    try {
      await loginRequest(email, password);
    } catch {
      setError('Wrong email or password');
    } finally {
      setIsLoading(false);
    }
  }

  return { login, isLoading, error };
}
```
