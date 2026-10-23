Import from `src/` with `@/`, from any folder:

```tsx
import { Logo } from '@/components/Logo';   // instead of '../../components/Logo'
import { config } from '@/config';
```

babel.config.js changed: restart Metro with a clean cache. <!-- cli -->

```sh <!-- cli -->
npm start -- --reset-cache <!-- cli -->
``` <!-- cli -->
Expo reads the alias from tsconfig.json: restart with a clean cache (npx expo start --clear). <!-- expo -->

In a JavaScript project, a jsconfig.json with the same "paths" gives your editor autocomplete.
Jest uses Babel too, so the `@/` imports work in tests without extra setup. <!-- cli -->
