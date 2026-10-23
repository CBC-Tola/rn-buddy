# Environment variables

How .env values get into a React Native app, and why they are never secret.

## On a server vs in an app

On a server, `process.env.API_KEY` is read while the server runs, on a machine you control.

A React Native app has no such thing. Your JavaScript runs on the user's phone. Tools that support
`.env` files copy the values **into your app at build time**:

- `react-native-config`: reads `.env` when the native app is built (Gradle and Xcode), so values are
  available in native code too. Changing `.env` needs a **rebuild**.
- `react-native-dotenv` (a Babel plugin): replaces `import { API_URL } from '@env'` with the value when
  Metro bundles your code. Changing `.env` needs `npm start -- --reset-cache`.
- Expo: variables starting with `EXPO_PUBLIC_` are inlined into the bundle: `process.env.EXPO_PUBLIC_API_URL`.

## Nothing in the app is secret

Anything compiled into the app can be read by anyone who downloads it: unzipping an `.apk` or `.ipa` and
searching the JavaScript bundle takes minutes. So:

- **Fine** in `.env`: API base URLs, feature flags, public keys meant for clients (e.g. a Stripe
  *publishable* key, a Maps key restricted to your app's bundle ID)
- **Never** in the app: secret API keys, database passwords, private keys, admin tokens

If a service needs a secret, call **your own server**; the server holds the secret and calls the service.

## Still: keep .env out of git

```
.env           ← your real values, in .gitignore
.env.example   ← the same names with empty values, committed
```

Not because it hides values from users, but to keep them out of a public repo and to have different
values per developer or environment.

## In your project

- `.env`, `.env.example`, `.gitignore`
- `babel.config.js` if you use `react-native-dotenv`

## Related

- `rn-buddy check` looks for keys that look secret in your code
- `rn-buddy learn reload-vs-rebuild`: which `.env` changes need a rebuild
- `rn-buddy explain react-native-config`
