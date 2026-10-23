Use the settings anywhere:

```tsx
import { config } from '../config';

fetch(`${config.apiUrl}/todos`);
```

**Everything in .env ends up inside the app bundle.** Anyone can unpack the app and read it, so never
put secrets there (API secret keys, passwords). Keep secrets on your server.

.env is read when the app is built: after changing it, rebuild the app (reloading is not enough). <!-- cli -->
Add a variable: put it in .env and .env.example, and in react-native-config.d.ts for TypeScript. <!-- cli -->
If you turn on Proguard for release builds, keep BuildConfig: see "Problems with Proguard" in the docs. <!-- cli -->
Expo reads .env when Metro starts: after changing it, restart with npx expo start --clear. <!-- expo -->
Only variables that start with EXPO_PUBLIC_ are available in your code, as process.env.EXPO_PUBLIC_NAME. <!-- expo -->
