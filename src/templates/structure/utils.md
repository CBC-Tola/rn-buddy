# utils/

Small helper functions: formatting, validation, calculations. Plain JavaScript, no React and no network.

- Each function takes inputs and returns a value, so it is easy to test with Jest.
- If a helper needs state or effects, it's a hook (`hooks/`). If it calls an API, it's a service (`services/`).

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
