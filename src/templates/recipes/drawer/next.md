Show the drawer in `App.{tsx}`, inside `GestureHandlerRootView` (the drawer follows your finger with Gesture Handler):

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DrawerNavigation } from './src/navigation/Drawer';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DrawerNavigation />
    </GestureHandlerRootView>
  );
}
```

The drawer uses Reanimated, which changed `babel.config.js`: restart Metro with a clean cache, <!-- cli -->
then rebuild the app (Reanimated has native code): <!-- cli -->
The drawer uses Reanimated, which has native code: restart Metro with a clean cache and rebuild your development build: <!-- expo -->

```sh
npm start -- --reset-cache <!-- cli -->
npx expo start --clear <!-- expo -->
```

If you have a stack from `rn-buddy add navigation`, you can put `MainDrawer` inside it as a screen,
like the tabs example in the React Navigation docs.
Reanimated 4 needs the New Architecture (on by default since React Native 0.76).
