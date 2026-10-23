# screens/

One component per screen of the app: what the user sees after navigating somewhere.

- Name files after the screen and end with `Screen`: `HomeScreen.{tsx}`, `ProfileScreen.{tsx}`.
- A screen puts components together and loads its data. Keep it short: move UI pieces to `components/` and logic to `hooks/`.
- When a screen gets its own small components, give it a folder:

```
screens/
  HomeScreen.{tsx}
  Profile/
    ProfileScreen.{tsx}
    Avatar.{tsx}        ← only used by ProfileScreen
```

## Example

```tsx
// screens/HomeScreen.{tsx}
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors, spacing } from '../theme';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Button title="Say hi" onPress={() => console.log('hi')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
});
```
