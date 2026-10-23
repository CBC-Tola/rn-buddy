# hooks/

Custom React hooks: reusable logic with state or effects. A hook's name starts with `use`.

- Move logic here when a screen gets long, or when two screens need the same logic.
- Hooks can call `services/` to load data and `store/` to read shared state.

## Example

```ts
// hooks/useToggle.{ts}
import { useCallback, useState } from 'react';

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((value) => !value), []);
  return [on, toggle] as const; <!-- ts -->
  return [on, toggle]; <!-- js -->
}
```

```tsx
const [showDetails, toggleDetails] = useToggle();
```
