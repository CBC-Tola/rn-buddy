import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasNativeCode, installedVersion } from './project.js';

// Gradle has no lockfile for autolinking, so rn-buddy remembers which native packages
// (and which Expo config plugins) the project had, to tell later what changed since.
const FILE = path.join('node_modules', '.cache', 'rn-buddy', 'native.json');

// Sorted [{ name, version }] of the installed packages with native code. Autolinking only
// links the packages listed in package.json, so those are the only ones worth checking.
export function nativeFingerprint(root) {
  const pkg = readJson(path.join(root, 'package.json')) ?? {};
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  return [...new Set(names)]
    .filter((name) => hasNativeCode(root, name) === true)
    .sort()
    .map((name) => ({ name, version: installedVersion(root, name) }));
}

// The `plugins` of app.json, as text so it's easy to compare. null without app.json
// (app.config.js can't be read without running it).
export function expoPlugins(root) {
  const plugins = readJson(path.join(root, 'app.json'))?.expo?.plugins;
  return plugins ? JSON.stringify(plugins) : null;
}

// Writes the fingerprint; returns it, or null when there is no node_modules to write into.
export function saveFingerprint(root, { now = Date.now() } = {}) {
  if (!existsSync(path.join(root, 'node_modules'))) return null;
  const fingerprint = { savedAt: now, packages: nativeFingerprint(root), plugins: expoPlugins(root) };
  const file = path.join(root, FILE);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`);
    return fingerprint;
  } catch {
    return null; // read-only node_modules: status just works without it
  }
}

// { savedAt, packages, plugins }, or null when rn-buddy hasn't saved one yet.
export function readFingerprint(root) {
  const data = readJson(path.join(root, FILE));
  return data && Array.isArray(data.packages) && typeof data.savedAt === 'number' ? data : null;
}

// What changed between two package lists:
// { added: [{ name, version }], removed: [{ name, version }], changed: [{ name, from, to }] }
export function diffFingerprint(before, after) {
  const old = new Map(before.map((entry) => [entry.name, entry.version]));
  const now = new Map(after.map((entry) => [entry.name, entry.version]));
  return {
    added: after.filter((entry) => !old.has(entry.name)),
    removed: before.filter((entry) => !now.has(entry.name)),
    changed: after
      .filter((entry) => old.has(entry.name) && old.get(entry.name) !== entry.version)
      .map((entry) => ({ name: entry.name, from: old.get(entry.name), to: entry.version })),
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
