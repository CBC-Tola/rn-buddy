Use any Ionicons icon by name:

```tsx
import { Ionicons } from '@react-native-vector-icons/ionicons/static'; <!-- cli -->
import { Ionicons } from '@react-native-vector-icons/ionicons'; <!-- expo -->
import { IconButton } from '../components/IconButton';

<Ionicons name="home-outline" size={24} color="black" />
<IconButton icon="heart" label="Like" onPress={() => {}} />
```

The icons come from a font file: rebuild the app so it's included, reloading is not enough. <!-- cli -->
On iOS, the font is listed in Info.plist (UIAppFonts). Add another family later, for example <!-- cli -->
@react-native-vector-icons/material-icons, with rn-buddy add @react-native-vector-icons/material-icons, <!-- cli -->
then npx rnvi-update-plist package.json ios/<App>/Info.plist and pod install. <!-- cli -->
In Expo the font loads when the app starts, so this works in Expo Go too. <!-- expo -->
In a development build you can use the `/static` import instead: add the package to "plugins" in app.json first. <!-- expo -->
