# features/auth/components/

UI pieces only used by the auth feature. For example `LoginForm.{tsx}`.

- Components get their data through props, like shared components. They don't call the API.
- When another feature needs the same component, move it to the shared `src/components/` folder
  instead of importing it from here.
- Build them from shared pieces: `import { Button } from '../../../components/Button'`.

## Example

```tsx
// features/auth/components/LoginForm.{tsx}
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../../../components/Button';

type LoginFormProps = { <!-- ts -->
  onSubmit: (email: string, password: string) => void; <!-- ts -->
  isLoading: boolean; <!-- ts -->
  error?: string; <!-- ts -->
}; <!-- ts -->

export function LoginForm({ onSubmit, isLoading, error }{: LoginFormProps}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text>{error}</Text> : null}
      <Button title={isLoading ? 'Signing in…' : 'Sign in'} onPress={() => onSubmit(email, password)} />
    </View>
  );
}
```
