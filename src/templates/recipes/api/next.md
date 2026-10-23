Wrap your app once in `App.{tsx}`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/services/queryClient';

export default function App() {
  return <QueryClientProvider client={queryClient}>{/* your app */}</QueryClientProvider>;
}
```

Then load data in any screen:

```tsx
const { data, isPending, error } = useTodos();
```

Add an endpoint: write a hook like `src/hooks/useTodos.{ts}` with its own `queryKey`.
