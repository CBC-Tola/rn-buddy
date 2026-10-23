import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const EXTENSIONS = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const SKIP = new Set(['node_modules', 'android', 'ios', 'build', 'dist', 'coverage', 'vendor', '.git', '.expo', '__tests__']);
// The app's own code: the root entry files, src/, and app/ (Expo Router).
const ROOTS = ['src', 'app', 'components', 'screens'];
const ROOT_FILES = ['App.tsx', 'App.ts', 'App.jsx', 'App.js', 'index.js', 'index.ts'];

// Every JS/TS source file of the app, as paths relative to the project root.
export function listSourceFiles(root) {
  const files = ROOT_FILES.filter((file) => existsSync(path.join(root, file)));
  for (const dir of ROOTS) walk(root, dir, files);
  return files;
}

// [{ file, content }] for every source file.
export function readSources(root) {
  return listSourceFiles(root).map((file) => ({ file, content: readFileSync(path.join(root, file), 'utf8') }));
}

// The packages a file imports or requires: '@react-navigation/native', 'react-native', ...
// Relative imports ('./Button') are left out.
export function importedPackages(content) {
  const names = new Set();
  const pattern = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  for (const [, specifier] of content.matchAll(pattern)) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    const parts = specifier.split('/');
    names.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
  }
  return [...names];
}

// 1-based line number of a character offset, for messages like "src/api.ts:12".
export function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (content.charCodeAt(i) === 10) line += 1;
  return line;
}

function walk(root, dir, files) {
  const full = path.join(root, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) return;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, relative, files);
    else if (EXTENSIONS.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(relative);
  }
}
