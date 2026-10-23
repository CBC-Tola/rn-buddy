# utils/

Small helper functions shared by features: formatting, validation, calculations. Plain JavaScript, no React and no network.

- Each function takes inputs and returns a value, so it is easy to test with Jest.
- A helper only one feature uses can stay in that feature. Move it here when a second feature needs it.
- If a helper needs state or effects, it's a hook (`features/<name>/hooks/`). If it calls an API, it
  belongs in `services/` or a feature's `api.{ts}`.

## Example

```ts
// utils/format.{ts}
export function formatPrice(cents{: number}) {
  return `$${(cents / 100).toFixed(2)}`;
}
```

```ts
// __tests__/format.test.{ts}
import { formatPrice } from '../src/utils/format';

test('formats cents as dollars', () => {
  expect(formatPrice(1999)).toBe('$19.99');
});
```
