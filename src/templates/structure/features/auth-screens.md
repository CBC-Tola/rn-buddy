# features/auth/screens/

The screens of the auth feature: what the user sees after navigating to it. Here: `LoginScreen.{tsx}`.

- A screen puts the feature's components together and calls its hooks. Keep it short.
- Export the screens other code needs (usually the navigator) from `features/auth/index.{ts}`.

## Example

```tsx
// features/auth/screens/LoginScreen.{tsx}
import { StyleSheet, View } from 'react-native';
import { LoginForm } from '../components/LoginForm';
import { useLogin } from '../hooks/useLogin';
import { spacing } from '../../../theme';

export function LoginScreen() {
  const { login, isLoading, error } = useLogin();
  return (
    <View style={styles.container}>
      <LoginForm onSubmit={login} isLoading={isLoading} error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.md },
});
```
