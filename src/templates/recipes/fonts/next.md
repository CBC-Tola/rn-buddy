1. Copy your `.ttf` / `.otf` files into `src/assets/fonts/`.
2. Link them to the iOS and Android apps (run it again whenever you add a font): <!-- cli -->

```sh <!-- cli -->
npx react-native-asset <!-- cli -->
``` <!-- cli -->

3. Rebuild the app: fonts are part of the native app, reloading is not enough. <!-- cli -->
2. Load them before showing text, in `App.{tsx}`: <!-- expo -->

```tsx <!-- expo -->
import { useFonts } from 'expo-font'; <!-- expo -->

const [loaded] = useFonts({ <!-- expo -->
  'Inter-Bold': require('./src/assets/fonts/Inter-Bold.ttf'), <!-- expo -->
}); <!-- expo -->
if (!loaded) return null; <!-- expo -->
``` <!-- expo -->

Then use them by name:

```tsx
<Text style={{ fontFamily: 'Inter-Bold' }}>Hello</Text>
```

The name is the file name on Android, and the font's PostScript name on iOS. Name each file
after its PostScript name (Font Book shows it) and one `fontFamily` works on both.
Don't use `fontWeight` with custom fonts: pick the file of that weight instead (Inter-Bold).
