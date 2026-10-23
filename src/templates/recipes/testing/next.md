Run the tests:

```sh
npm test
```

Tests live in `__tests__/` (or next to a file, as `Button.test.{tsx}`). A test renders a component,
finds things like a user would, and checks the result:

```tsx
await render(<LoginScreen />);
await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'ana@example.com');
await fireEvent.press(screen.getByText('Log in'));
expect(screen.getByText('Welcome, Ana')).toBeOnTheScreen();
```

In React Native Testing Library 14, `render` and `fireEvent` return promises: always `await` them.
`jest.setup.{ts}` replaces native modules with mocks. When a test fails with an error about a native module
(for example "TurboModuleRegistry ... could not be found"), add that package's Jest mock there.
Expo projects test with the jest-expo preset: https://docs.expo.dev/develop/unit-testing/ <!-- expo -->
