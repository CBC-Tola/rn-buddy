# The New Architecture

What changed inside React Native, why libraries talk about "New Arch support", and what it means for you.

## Old vs new

In the old architecture, JavaScript and native code talked through **the bridge**: every call was turned
into a JSON message and sent across, one batch at a time. It worked, but it was slow and always async.

The New Architecture replaces the bridge with **JSI** (JavaScript Interface): JavaScript holds direct
references to native objects and can call them, even synchronously. On top of JSI:

- **Fabric**: the new renderer that draws your views. It supports React features like concurrent
  rendering and measures layout synchronously.
- **Turbo Modules**: native modules (camera, storage, ...) that load only when first used.
- **Codegen**: generates the glue code between JavaScript and native from typed spec files, so type
  mismatches are caught at build time.
- **Bridgeless mode**: the bridge is gone entirely.

## Timeline

- 0.68: available as opt-in
- 0.76: on by default for new and upgraded apps
- 0.82: the old architecture is removed; the `newArchEnabled` switch no longer turns it off

On React Native 0.82 and newer every app runs the New Architecture.

## What it means for you

- Your own JavaScript code doesn't change.
- **Libraries** matter: a library must support the New Architecture. Most popular ones do. An
  interop layer runs many older libraries too, but unmaintained ones may break.
- Errors like "TurboModuleRegistry.getEnforcing(...): 'X' could not be found" usually mean a library
  isn't built into the app (rebuild) or doesn't support the New Architecture.

## In your project

- `android/gradle.properties`: `newArchEnabled=true` (ignored from 0.82)
- `ios/Podfile`: the New Architecture is set up by `use_react_native!`
- Check a library on https://reactnative.directory (look for the "New Architecture" tag)

## Related

- `rn-buddy check` flags packages that are unmaintained or lack New Architecture support
- `rn-buddy explain <package>` shows what a package is and whether it has native code
- `rn-buddy upgrade` plans an upgrade, including library versions
- `rn-buddy learn native-modules` explains Turbo Modules and Fabric components from the native side
