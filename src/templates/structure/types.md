# types/

TypeScript types used by many files: API responses, app models.

- Types used by only one file stay in that file.
- Import them with `import type`, which disappears from the built app.

## Example

```ts
// types/index.ts
export type User = {
  id: string;
  name: string;
  email: string;
};
```

```ts
import type { User } from '../types';
```
