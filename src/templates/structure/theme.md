# theme/

Colors, spacing and font sizes in one place. Change them here and the whole app stays consistent.

```
theme/
  colors.{ts}
  spacing.{ts}
  index.{ts}     ← re-exports everything: import { colors, spacing } from '../theme'
```

## Example

```ts
// theme/colors.{ts}
export const colors = {
  primary: '#2563eb',
  text: '#111827',
  background: '#ffffff',
};
```

```ts
// theme/spacing.{ts}
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
```

```ts
// theme/index.{ts}
export * from './colors';
export * from './spacing';
```

Use `colors.primary` instead of writing `'#2563eb'` in every file.
