Save and read data anywhere, no `await` needed:

```tsx
import { getJSON, setJSON, setString, getString } from '../services/storage';

setString('theme', 'dark');
const theme = getString('theme'); // 'dark', or undefined the first time

setJSON('user', { name: 'Ana', age: 31 });
const user = getJSON<{ name: string; age: number }>('user'); <!-- ts -->
const user = getJSON('user'); <!-- js -->
```

MMKV has native code: rebuild the app, reloading is not enough. <!-- cli -->
MMKV has native code, so it doesn't work in Expo Go: make a development build (npx expo run:android / npx expo run:ios). <!-- expo -->
Don't store passwords or tokens in plain MMKV: use the Keychain/Keystore (e.g. react-native-keychain) for secrets.
