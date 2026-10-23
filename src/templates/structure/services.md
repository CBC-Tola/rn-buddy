# services/

Code that talks to the outside world: your API, storage, analytics. No React code here.

- Group by what they talk to: `api.{ts}`, `users.{ts}`, `storage.{ts}`.
- Screens and hooks call these functions. They don't call `fetch` themselves, so the API URL and error handling live in one place.

## Example

```ts
// services/api.{ts}
const BASE_URL = 'https://api.example.com';

export async function getJson(path{: string}) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}
```

```ts
// services/users.{ts}
import { getJson } from './api';
import type { User } from '../types'; <!-- ts -->

export function getUser(id{: string}){: Promise<User>} {
  return getJson(`/users/${id}`);
}
```
