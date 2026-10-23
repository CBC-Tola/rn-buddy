Use the store in any component, no provider needed:

```tsx
import { useCounterStore } from '../store/useCounterStore';

const count = useCounterStore((state) => state.count);
const increase = useCounterStore((state) => state.increase);
```

Make your own store: copy `src/store/useCounterStore.{ts}` and change the state and actions.
