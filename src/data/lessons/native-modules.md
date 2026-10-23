# Native modules and components

How JavaScript calls Kotlin, Swift and C++ code: Turbo Modules, Fabric components and Codegen on one page.

## Two kinds of native code

- A **native module** gives JavaScript functions: read the battery level, save to the keychain, play a
  sound. In the New Architecture it's a **Turbo Module**.
- A **native component** gives JavaScript a view to render: a map, a video player, a camera preview. In
  the New Architecture it's a **Fabric component**.

## How a call travels

```
JavaScript  →  JSI (C++)  →  Kotlin / Objective-C / Swift
```

JSI lets JavaScript hold references to C++ objects and call them directly. No JSON messages over a
bridge anymore. Calls can even be synchronous.

## Codegen: the typed contract

You describe the module in a TypeScript **spec** file, for example `NativeBattery.ts`:

```ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getLevel(): Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBattery');
```

At build time **Codegen** reads the spec (found through `codegenConfig` in `package.json`) and generates
the native interfaces. You implement them in Kotlin and Objective-C/Swift. If the types don't match,
the build fails instead of the app crashing later.

## Do you need to write one?

Usually not. Most things you need already exist as a library: search https://reactnative.directory.
Write your own when you need a platform API nobody wrapped yet, or code you already have in Kotlin/Swift.
With Expo, the **Expo Modules API** is the easiest way to write one.

## Errors you may see

- "TurboModuleRegistry.getEnforcing(...): 'X' could not be found": the native part isn't in the app.
  Rebuild, run `pod install`, or the library doesn't support the New Architecture.
- "Invariant Violation: requireNativeComponent ... was not found": same, for a component.

## Related

- `rn-buddy explain` marks packages with native code `[native]`
- `rn-buddy why "<error>"` explains the errors above
- `rn-buddy learn new-architecture` and `rn-buddy learn autolinking`
