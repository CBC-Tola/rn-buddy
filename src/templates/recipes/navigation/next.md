Show the navigator in `App.{tsx}`, instead of the welcome screen:

```tsx
import { Navigation } from './src/navigation';

export default function App() {
  return <Navigation />;
}
```

Add a screen: create it in `src/screens/`, then add it to `screens` in `src/navigation/index.{tsx}`.
