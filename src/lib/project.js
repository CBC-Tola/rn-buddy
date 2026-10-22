import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Walks up from startDir until it finds a folder with a package.json.
export function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readProject(startDir) {
  const root = findProjectRoot(startDir);
  if (!root) {
    throw new Error(`No package.json found in ${path.resolve(startDir)} or its parent folders.`);
  }

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = [
    ...Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({ name, version, dev: false })),
    ...Object.entries(pkg.devDependencies ?? {}).map(([name, version]) => ({ name, version, dev: true })),
  ];

  return { root, pkg, deps };
}

export function hasNodeModules(root) {
  return existsSync(path.join(root, 'node_modules'));
}

// A package has native code if it ships an iOS .podspec or an android/ folder.
// Returns null when the package is not installed, so we can't tell.
export function hasNativeCode(root, name) {
  const dir = path.join(root, 'node_modules', name);
  if (!existsSync(dir)) return null;
  if (existsSync(path.join(dir, 'android'))) return true;
  return readdirSync(dir).some((file) => file.endsWith('.podspec'));
}
