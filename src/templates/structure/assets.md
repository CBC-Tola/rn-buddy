# assets/

Images and fonts bundled with the app.

```
assets/
  images/
    logo.png
    logo@2x.png    ← used on high-resolution screens
    logo@3x.png
  fonts/
```

## Using an image

```tsx
<Image source={require('../assets/images/logo.png')} />
```

Write the file name in full inside `require(...)`. Metro bundles images when it builds the app, so the name can't come from a variable.

Fonts need extra setup for iOS and Android: https://reactnative.dev/docs/text-style-props#fontfamily
