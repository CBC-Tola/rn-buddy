# Fonts

Put your font files here: `.ttf` or `.otf`, one file per weight/style, for example
`Inter-Regular.ttf` and `Inter-Bold.ttf`.

Then link them to the native apps: <!-- cli -->

```sh <!-- cli -->
npx react-native-asset <!-- cli -->
``` <!-- cli -->

Run it again every time you add or remove a font, then rebuild the app. <!-- cli -->
Load them with expo-font: list the files in the expo-font plugin in app.json (then make a new <!-- expo -->
development build), or load them at runtime with `useFonts` (works in Expo Go). <!-- expo -->

Use a font with `fontFamily`:

- **Android** uses the file name without the extension: `Inter-Bold`.
- **iOS** uses the font's PostScript name, which is often the same but not always.
  Open the font in Font Book (Mac) and look at "PostScript name" to be sure.

Name your files after the PostScript name and the same `fontFamily` works on both.
