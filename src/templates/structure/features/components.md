# components/

Shared UI pieces used by more than one feature: buttons, inputs, cards, list items.

- One component per file, named in PascalCase: `Button.{tsx}`, `Card.{tsx}`.
- Components get their data through props. They don't fetch data and never import from `features/`.
- A component only used by one feature lives in that feature: `features/auth/components/`.

## Example

```tsx
// components/Button.{tsx}
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';

type ButtonProps = { title: string; onPress: () => void }; <!-- ts -->

export function Button({ title, onPress }{: ButtonProps}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8 },
  text: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
```
