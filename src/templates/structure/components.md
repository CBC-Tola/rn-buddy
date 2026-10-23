# components/

Reusable UI pieces: buttons, cards, inputs, list items. Used by more than one screen.

- One component per file, named in PascalCase: `Button.{tsx}`, `UserCard.{tsx}`.
- Components get their data through props. They don't fetch data or know which screen they are on.
- A component only used by one screen can live next to that screen instead (see `screens/README.md`).

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
