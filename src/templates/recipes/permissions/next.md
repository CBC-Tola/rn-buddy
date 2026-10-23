Set up: {{permissions}}.

Ask for a permission right before you need it, for example when the user taps "Take photo":

```tsx
import { Platform } from 'react-native';
import { PERMISSIONS } from 'react-native-permissions';
import { usePermission } from '../hooks/usePermission';

{{example}}

if (!granted) {
  // Explain why first, then ask. If the user said no for good (blocked), send them to Settings.
  await request();
}
```

Notifications work differently: use `checkNotifications()` and `requestNotifications(['alert', 'sound', 'badge'])`.

Edit the sentences rn-buddy wrote in Info.plist: iOS shows them in the permission dialog, and <!-- cli -->
App Review rejects vague ones. Say what the app does with it ("to scan receipts"). <!-- cli -->
Edit the sentences rn-buddy wrote in app.json (ios.infoPlist): iOS shows them in the permission dialog, and <!-- expo -->
App Review rejects vague ones. Say what the app does with it ("to scan receipts"). <!-- expo -->
{{usageStrings}}

Remove the permissions you don't use from AndroidManifest.xml: Google Play asks why you need each one. <!-- cli -->
Then run pod install and rebuild the app. Adding a permission later: rn-buddy add permissions <name>. <!-- cli -->
react-native-permissions has native code, so it doesn't work in Expo Go. Make a new development build <!-- expo -->
(npx expo run:android / npx expo run:ios, or EAS): the config plugin writes the native settings during the build. <!-- expo -->
