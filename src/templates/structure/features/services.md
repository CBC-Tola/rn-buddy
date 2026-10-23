# services/

Shared code that talks to the outside world: the API client, storage, analytics. No React code here.

- Only code used by many features. A feature's own endpoints live in the feature: `features/auth/api.{ts}`.
- Features call these helpers instead of calling `fetch` themselves, so the API URL, headers and error
  handling live in one place.
- Services never import from `features/`.

## Example

```ts
// services/api.{ts}
const BASE_URL = 'https://api.example.com';

async function request(path{: string}, init{: RequestInit} = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

export function getJson(path{: string}) {
  return request(path);
}

export function postJson(path{: string}, body{: unknown}) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}
```
