Find mistakes, then format every file the same way:

```sh
npm run lint
npm run format
```

The React Native template already comes with ESLint (`@react-native/eslint-config`, in `.eslintrc.js`) and <!-- cli -->
Prettier (`.prettierrc.js`). ESLint finds bugs like missing hook dependencies; Prettier only formats. <!-- cli -->
The React Native config turns off the ESLint rules that fight with Prettier, so the two don't conflict. <!-- cli -->
The first `npm run lint` runs `npx expo lint`, which installs and sets up ESLint for Expo (eslint-config-expo). <!-- expo -->
Prettier (`.prettierrc.js`) only formats; ESLint finds bugs like missing hook dependencies. <!-- expo -->

Format on save: install the ESLint and Prettier extensions in your editor (VS Code: "ESLint" and "Prettier").
Fix what ESLint can fix by itself: npx eslint . --fix
