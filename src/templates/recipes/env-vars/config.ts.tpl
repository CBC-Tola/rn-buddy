import Config from 'react-native-config'; <!-- cli -->
<!-- cli -->
// Settings from .env, in one place. Read them from here instead of from .env directly, <!-- cli -->
// so a missing value has a default and the rest of the app doesn't care where it came from. <!-- cli -->
// Settings from .env, in one place. Expo replaces process.env.EXPO_PUBLIC_* with the values <!-- expo -->
// from .env when it bundles the app. A missing value falls back to a default here. <!-- expo -->
export const config = {
  apiUrl: Config.API_URL ?? 'https://jsonplaceholder.typicode.com', <!-- cli -->
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://jsonplaceholder.typicode.com', <!-- expo -->
};
