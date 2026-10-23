import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Finds the native files of the React Native template, wherever the app name put them.
// Every function returns an absolute path, or null when the project doesn't have that file.

export function androidAppGradle(root) {
  return firstExisting(root, ['android/app/build.gradle', 'android/app/build.gradle.kts']);
}

export function androidRootGradle(root) {
  return firstExisting(root, ['android/build.gradle', 'android/build.gradle.kts']);
}

export function gradleProperties(root) {
  return firstExisting(root, ['android/gradle.properties']);
}

export function gradleWrapperProperties(root) {
  return firstExisting(root, ['android/gradle/wrapper/gradle-wrapper.properties']);
}

export function androidManifest(root) {
  return firstExisting(root, ['android/app/src/main/AndroidManifest.xml']);
}

export function androidStrings(root) {
  return firstExisting(root, ['android/app/src/main/res/values/strings.xml']);
}

export function androidRes(root) {
  return firstExisting(root, ['android/app/src/main/res']);
}

export function mainActivity(root) {
  return findFile(path.join(root, 'android', 'app', 'src', 'main'), /^MainActivity\.(kt|java)$/);
}

export function mainApplication(root) {
  return findFile(path.join(root, 'android', 'app', 'src', 'main'), /^MainApplication\.(kt|java)$/);
}

export function podfile(root) {
  return firstExisting(root, ['ios/Podfile']);
}

// The iOS app target folder: the folder in ios/ that has an Info.plist (ios/<AppName>/).
export function iosAppDir(root) {
  const ios = path.join(root, 'ios');
  if (!existsSync(ios)) return null;
  const dir = readdirSync(ios, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && !/Tests$|^Pods$|^build$|\./.test(entry.name) && existsSync(path.join(ios, entry.name, 'Info.plist')),
  );
  return dir ? path.join(ios, dir.name) : null;
}

export function infoPlist(root) {
  const dir = iosAppDir(root);
  return dir ? path.join(dir, 'Info.plist') : null;
}

export function appDelegate(root) {
  const dir = iosAppDir(root);
  return dir ? firstExisting(dir, ['AppDelegate.swift', 'AppDelegate.mm', 'AppDelegate.m']) : null;
}

// ios/<AppName>.xcodeproj/project.pbxproj: build settings such as the bundle ID and versions.
export function pbxproj(root) {
  const ios = path.join(root, 'ios');
  if (!existsSync(ios)) return null;
  const project = readdirSync(ios).find((name) => name.endsWith('.xcodeproj'));
  return project ? firstExisting(ios, [path.join(project, 'project.pbxproj')]) : null;
}

export function xcworkspace(root) {
  const ios = path.join(root, 'ios');
  if (!existsSync(ios)) return null;
  const workspace = readdirSync(ios).find((name) => name.endsWith('.xcworkspace'));
  return workspace ? path.join(ios, workspace) : null;
}

// Reads a file, or returns null when it doesn't exist.
export function readText(file) {
  return file && existsSync(file) ? readFileSync(file, 'utf8') : null;
}

// Depth-first search for a file whose name matches `pattern`, skipping build output.
export function findFile(dir, pattern) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && pattern.test(entry.name)) return path.join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'build' || entry.name === 'Pods') continue;
    const found = findFile(path.join(dir, entry.name), pattern);
    if (found) return found;
  }
  return null;
}

function firstExisting(root, candidates) {
  return candidates.map((file) => path.join(root, file)).find((file) => existsSync(file)) ?? null;
}
