Import any `.svg` file as a component:

```tsx
import { Logo } from '../components/Logo';
import Star from '../assets/star.svg';

<Logo size={64} />
<Star width={24} height={24} fill="gold" />
```

metro.config.js changed: restart Metro with a clean cache. react-native-svg has native code, so rebuild the app too. <!-- cli -->
metro.config.js changed: restart Metro with a clean cache. react-native-svg is part of Expo Go, so no new build is needed. <!-- expo -->

```sh
npm start -- --reset-cache <!-- cli -->
npx expo start --clear <!-- expo -->
```

`fill` and `stroke` props only work when the .svg file doesn't set them itself (or uses `currentColor`).
