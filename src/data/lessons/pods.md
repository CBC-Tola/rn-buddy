# CocoaPods

How iOS gets the native code of React Native and your packages, and why you run pod install so often.

## What CocoaPods is

CocoaPods is the package manager for iOS native code. React Native itself and every package with iOS
code (it ships a `.podspec` file) are installed as **pods** into `ios/Pods/`.

- `ios/Podfile`: which pods to install. `use_native_modules!` adds your npm packages (autolinking).
- `ios/Podfile.lock`: the exact versions installed. Commit it, like `package-lock.json`.
- `ios/Pods/`: the downloaded code. Don't commit it, don't edit it.

## When to run pod install

After any change that touches iOS native code:

- you installed, removed or upgraded a package with native code
- you upgraded React Native
- you changed the Podfile
- you pulled changes where `Podfile.lock` changed

```sh
cd ios
bundle install            # once: installs the CocoaPods version from the Gemfile
bundle exec pod install
```

`bundle exec` uses the CocoaPods version pinned in your `Gemfile`, so everyone on the team gets the same
result. Then rebuild the app.

## Opening the project in Xcode

Open `ios/YourApp.xcworkspace`, **not** `.xcodeproj`. The workspace includes the pods; the project alone
fails with "module not found" errors.

## When it goes wrong

- "CDN: trunk ... Couldn't download" or a pod version not found: `bundle exec pod install --repo-update`
- Strange build errors after an upgrade: delete `ios/Pods` and `ios/build`, then `pod install` again
- "Unable to find a specification": the package or its version is missing; check `node_modules`

## Expo

In an Expo project `ios/` usually doesn't exist until `npx expo prebuild` or `npx expo run:ios`,
which run pod install for you.

## Related

- `rn-buddy status` tells you when `pod install` is needed
- `rn-buddy clean --pods` deletes the pods and installs them again
- `rn-buddy env` checks Ruby, Bundler, CocoaPods and Xcode
- `rn-buddy learn autolinking`
