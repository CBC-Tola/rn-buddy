Wrap your app once in `GestureHandlerRootView`, in `App.{tsx}`, so gestures work everywhere:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}>{/* your app */}</GestureHandlerRootView>;
}
```

Try the example animation:

```tsx
import { FadeInView } from '../components/FadeInView';

<FadeInView>
  <Text>Hello!</Text>
</FadeInView>
```

babel.config.js changed (the worklets plugin must stay last in `plugins`): restart Metro with a clean cache, <!-- cli -->
then rebuild the app: Reanimated and Gesture Handler have native code. <!-- cli -->

```sh <!-- cli -->
npm start -- --reset-cache <!-- cli -->
npm run android   # or: npm run ios <!-- cli -->
``` <!-- cli -->
Expo already sets up Reanimated's Babel plugin, and Expo Go includes both libraries. Restart with a clean cache: <!-- expo -->

```sh <!-- expo -->
npx expo start --clear <!-- expo -->
``` <!-- expo -->

Reanimated 4 needs the New Architecture (on by default since React Native 0.76).
