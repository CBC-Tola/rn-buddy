import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { importedPackages } from './sources.js';

const data = JSON.parse(readFileSync(new URL('../data/explain.json', import.meta.url), 'utf8'));

export const categories = data.categories;

// Exact names win. Keys ending in "*" match by prefix (the longest prefix wins),
// and "{rest}" in the note is replaced with the part after the prefix.
export function lookupPackage(name) {
  if (data.packages[name]) return data.packages[name];

  const prefix = Object.keys(data.packages)
    .filter((key) => key.endsWith('*') && name.startsWith(key.slice(0, -1)))
    .sort((a, b) => b.length - a.length)[0];
  if (!prefix) return null;

  const entry = data.packages[prefix];
  return { ...entry, note: entry.note.replaceAll('{rest}', name.slice(prefix.length - 1)) };
}

// Notes for files and folders in the project root. Expo projects have their own notes
// for some of them (app.json is the Expo config there, android/ and ios/ are generated).
export function lookupFile(name, { expo = false } = {}) {
  return (expo ? data.expoFiles[name] : null) ?? data.files[name] ?? null;
}

// --- Notes for any path in the project ---------------------------------------------------
//
// Keys of "paths" are root-relative patterns:
//   *      any part of one file or folder name   android/app/src/main/res/mipmap-*
//   **     any number of folders                  android/app/src/main/java/**/MainActivity.*
//   <app>  the app name (any name)                ios/<app>/Info.plist
// The pattern with the most fixed text wins, so an exact path beats a wildcard.

const compiled = new Map();

function patternRegex(pattern) {
  if (!compiled.has(pattern)) {
    const source = pattern
      .split(/(\*\*\/|\*\*|\*|<app>)/)
      .map((part) => {
        if (part === '**/') return '(?:.*/)?';
        if (part === '**') return '.*';
        if (part === '*') return '[^/]*';
        if (part === '<app>') return '[^/]+';
        return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    compiled.set(pattern, new RegExp(`^${source}$`));
  }
  return compiled.get(pattern);
}

function fixedLength(pattern) {
  return pattern.replace(/\*|<app>/g, '').length;
}

function matchPattern(entries, name) {
  if (entries[name]) return entries[name];
  const best = Object.keys(entries)
    .filter((key) => patternRegex(key).test(name))
    .sort((a, b) => fixedLength(b) - fixedLength(a))[0];
  return best ? entries[best] : null;
}

// Forward slashes and no "./" or trailing "/", whatever the user typed.
export function normalizePath(name) {
  return name.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '') || '.';
}

// The note for a file or folder, by its path relative to the project root.
export function lookupPath(relative, { expo = false } = {}) {
  const name = normalizePath(relative);
  if (!name.includes('/')) return lookupFile(name, { expo });
  return (expo ? matchPattern(data.expoPaths, name) : null) ?? matchPattern(data.paths, name);
}

// --- Line-level notes for config files ---------------------------------------------------

// Which "settings" notes apply to a file, or null when rn-buddy can't go through it line by line.
export function settingsKind(relative) {
  const name = normalizePath(relative);
  const base = path.posix.basename(name);
  if (name === 'app.json') return 'app.json';
  if (base === 'gradle.properties' && name.startsWith('android/')) return 'gradle.properties';
  if (base === 'gradle-wrapper.properties') return 'gradle-wrapper.properties';
  if (/^android\/(app\/)?build\.gradle(\.kts)?$/.test(name)) return 'build.gradle';
  if (base === 'Info.plist' && name.startsWith('ios/')) return 'Info.plist';
  return null;
}

// The note for one setting. Keys with "*" match any text, and "{rest}" is that text
// in plain words (NSCameraUsageDescription → "camera").
export function lookupSetting(kind, key) {
  const notes = data.settings[kind] ?? {};
  if (notes[key]) return notes[key];
  const pattern = Object.keys(notes)
    .filter((candidate) => candidate.includes('*'))
    .map((candidate) => ({ candidate, match: wildcardMatch(candidate, key) }))
    .filter(({ match }) => match !== null)
    .sort((a, b) => b.candidate.length - a.candidate.length)[0];
  if (!pattern) return null;
  return notes[pattern.candidate].replaceAll('{rest}', words(pattern.match));
}

function wildcardMatch(pattern, key) {
  const [before, after] = pattern.split('*');
  if (key.length < before.length + after.length || !key.startsWith(before) || !key.endsWith(after)) return null;
  return key.slice(before.length, key.length - after.length);
}

// "LocationWhenInUse" → "location when in use"
function words(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

// Every setting in a config file: [{ key, value, line?, note }]. `note` is null for unknown keys.
// For build.gradle only the lines rn-buddy has a note for are returned (the rest is braces and plumbing).
export function explainSettings(kind, content) {
  const rows = parseSettings(kind, content);
  return rows.map((row) => ({ ...row, note: row.note ?? lookupSetting(kind, row.key) }));
}

function parseSettings(kind, content) {
  if (kind === 'gradle.properties' || kind === 'gradle-wrapper.properties') return parseProperties(content);
  if (kind === 'build.gradle') return parseGradle(content);
  if (kind === 'Info.plist') {
    return Object.entries(parsePlist(content)).map(([key, value]) => ({ key, value: formatValue(value) }));
  }
  if (kind === 'app.json') return parseAppJson(content);
  return [];
}

export function parseProperties(content) {
  const rows = [];
  content.split('\n').forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return;
    const match = trimmed.match(/^([^=:\s]+)\s*[=:]\s*(.*)$/);
    if (match) rows.push({ key: match[1], value: match[2], line: i + 1 });
  });
  return rows;
}

// build.gradle is code, not a list of settings: find the lines that mention a known name.
// When several names are on one line, the first one wins (the longer one when they start together).
export function parseGradle(content) {
  const keys = Object.keys(data.settings['build.gradle']).map((key) => [
    key,
    new RegExp(`(?<![\\w.])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`),
  ]);
  const rows = [];
  content.split('\n').forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed || /^(\/\/|\/\*|\*)/.test(trimmed)) return;
    let found = null;
    for (const [key, regex] of keys) {
      const match = regex.exec(trimmed);
      if (!match) continue;
      if (!found || match.index < found.index || (match.index === found.index && key.length > found.key.length)) {
        found = { key, index: match.index };
      }
    }
    if (!found) return;
    rows.push({ key: found.key, value: gradleValue(trimmed, found), line: i + 1 });
  });
  return rows;
}

// "versionCode 1" → "1", "def jscFlavor = '...'" → "'...'"; other lines are shown whole.
function gradleValue(line, { key, index }) {
  const start = line.slice(0, index).trim();
  if (start !== '' && start !== 'def') return line;
  const rest = line.slice(index + key.length).replace(/^\s*=?\s*/, '');
  if (rest === '{') return '{ … }';
  return rest && !rest.startsWith('(') ? rest : line;
}

// A small plist reader: enough for Info.plist (dict, array, string, numbers, booleans).
export function parsePlist(content) {
  const tokens = [...content.matchAll(/<(\/?)([A-Za-z]+)\s*(\/?)>|([^<]+)/g)]
    .map(([, close, tag, selfClose, text]) => (tag ? { close: Boolean(close), tag, selfClose: Boolean(selfClose) } : { text }))
    .filter((token) => token.tag || token.text.trim());
  let i = tokens.findIndex((token) => token.tag === 'dict' && !token.close);
  if (i === -1) return {};

  function value() {
    const token = tokens[i++];
    if (!token?.tag) return null;
    if (token.selfClose) return token.tag === 'true' ? true : token.tag === 'false' ? false : token.tag === 'dict' ? {} : [];
    if (token.tag === 'dict') {
      const result = {};
      while (tokens[i] && !(tokens[i].tag === 'dict' && tokens[i].close)) {
        const key = keyText();
        result[key] = value();
      }
      i += 1;
      return result;
    }
    if (token.tag === 'array') {
      const result = [];
      while (tokens[i] && !(tokens[i].tag === 'array' && tokens[i].close)) result.push(value());
      i += 1;
      return result;
    }
    const content = tokens[i]?.text !== undefined ? tokens[i++].text : '';
    i += 1; // closing tag
    if (token.tag === 'integer' || token.tag === 'real') return Number(content);
    return decodeXml(content);
  }

  function keyText() {
    i += 1; // <key>
    const content = tokens[i]?.text !== undefined ? tokens[i++].text : '';
    i += 1; // </key>
    return decodeXml(content.trim());
  }

  return value() ?? {};
}

function decodeXml(text) {
  const entities = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
  return text.replace(/&(lt|gt|quot|apos|amp);/g, (_, name) => entities[name]);
}

// app.json: objects are opened while rn-buddy has notes for keys inside them,
// so expo.ios.bundleIdentifier is its own row but expo.splash stays one row.
export function parseAppJson(content) {
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const notes = Object.keys(data.settings['app.json']);
  const rows = [];
  (function walk(object, prefix) {
    for (const [key, value] of Object.entries(object)) {
      const name = prefix ? `${prefix}.${key}` : key;
      const isObject = value && typeof value === 'object' && !Array.isArray(value);
      if (isObject && notes.some((note) => note.startsWith(`${name}.`))) walk(value, name);
      else rows.push({ key: name, value: formatValue(value) });
    }
  })(json && typeof json === 'object' ? json : {}, '');
  return rows;
}

const MAX_VALUE = 60;

// Short text for any value: "true", "./assets/icon.png", "[expo-router, expo-font]", "{ image, backgroundColor }".
export function formatValue(value) {
  let text;
  if (Array.isArray(value)) {
    // Expo plugins can be ['expo-font', { options }]: show the plugin name.
    const items = value.map((item) => (Array.isArray(item) ? item[0] : item && typeof item === 'object' ? '{…}' : String(item)));
    text = `[${items.join(', ')}]`;
  } else if (value && typeof value === 'object') {
    text = `{ ${Object.keys(value).join(', ')} }`;
  } else if (value === '') {
    text = '""';
  } else {
    text = String(value);
  }
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
}

// --- Source files --------------------------------------------------------------------------

export const SOURCE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const RESOLVE_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];
// Path aliases set up with babel-plugin-module-resolver or tsconfig "paths": '@/components/Button'.
const ALIAS = /^[@~]\//;

// Specifiers of the files a file imports: './Button', '../hooks/useTodos', '@/theme'.
export function importedFiles(content) {
  const names = new Set();
  const pattern = /(?:import\s[^'"]*?from\s*|export\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  for (const [, specifier] of content.matchAll(pattern)) {
    if (specifier.startsWith('.') || ALIAS.test(specifier)) names.add(specifier);
  }
  return [...names];
}

// The packages a file imports, without path aliases ('@/components' is a folder, not a package).
export function sourcePackages(content) {
  return importedPackages(content).filter((name) => !ALIAS.test(`${name}/`) && name !== '@' && name !== '~');
}

// The root-relative file an import points to, or null. Tries the usual extensions and index files;
// '@/x' and '~/x' are looked up in src/ and then the project root.
export function resolveImport(root, fromFile, specifier) {
  const bases = ALIAS.test(specifier)
    ? [path.join(root, 'src', specifier.slice(2)), path.join(root, specifier.slice(2))]
    : [path.resolve(root, path.dirname(fromFile), specifier)];
  for (const base of bases) {
    const candidates = [
      ...RESOLVE_EXTENSIONS.map((ext) => base + ext),
      ...RESOLVE_EXTENSIONS.slice(1).map((ext) => path.join(base, `index${ext}`)),
    ];
    const found = candidates.find((file) => existsSync(file) && statSync(file).isFile());
    if (found) return normalizePath(path.relative(root, found));
  }
  return null;
}

// --- explain --outdated ------------------------------------------------------------------

// The version to compare: the installed one, else the lowest version the range allows.
export function currentVersion(range, installed) {
  if (installed && semver.valid(installed)) return installed;
  try {
    const version = semver.validRange(range) ? semver.minVersion(range)?.version : null;
    // '*' allows anything: there is nothing useful to compare.
    return version && version !== '0.0.0' ? version : null;
  } catch {
    return null;
  }
}

// 'current', 'patch', 'minor' or 'major'; null when the versions can't be compared.
// Below 1.0.0 a minor bump (0.79 → 0.80) can break things, so it counts as major.
export function updateKind(current, latest) {
  if (!semver.valid(current) || !semver.valid(latest)) return null;
  if (semver.gte(current, latest)) return 'current';
  const diff = semver.diff(current, latest)?.replace(/^pre(?!release)/, '');
  if (diff === 'major') return 'major';
  if (diff === 'minor') return semver.major(current) === 0 ? 'major' : 'minor';
  return 'patch';
}

// Packages that move together with react-native and are updated by `rn-buddy upgrade`.
function tiedToReactNative(name) {
  return name === 'react' || name === 'react-native' || name.startsWith('@react-native/');
}

// Packages Expo picks the versions of for its SDK.
function pickedByExpo(name) {
  return name === 'expo' || name.startsWith('expo-') || name.startsWith('@expo/') || tiedToReactNative(name);
}

// One row per dependency: { name, dev, range, current, latest, kind, safe, advice, hint }.
// `latest` maps names to npm's latest version (missing: not found or offline); `native(name)`
// says whether a package has native code (true/false/null).
export function planOutdated(deps, { installed = () => null, latest = {}, native = () => null, expo = false }) {
  return deps.map((dep) => {
    const current = currentVersion(dep.version, installed(dep.name));
    const newest = latest[dep.name] ?? null;
    const kind = current && newest ? updateKind(current, newest) : null;
    const safe = kind === 'patch' || kind === 'minor';
    const row = { name: dep.name, dev: dep.dev, range: dep.version, current, latest: newest, kind, safe };
    row.advice = null;
    row.hint = null;
    if (!kind || kind === 'current') return row;

    row.advice = safe ? 'safe to update' : 'read the changelog first';
    if (expo && pickedByExpo(dep.name)) {
      Object.assign(row, { safe: false, advice: 'update with the Expo SDK' });
      row.hint = dep.name === 'expo'
        ? 'A new Expo SDK: `npx expo install expo@latest --fix` updates Expo and the packages that go with it'
        : 'Expo picks this version for your SDK: run `npx expo install --check`';
    } else if (dep.name === 'react-native') {
      Object.assign(row, { safe: false, advice: 'use rn-buddy upgrade' });
      row.hint = 'Upgrade React Native with `rn-buddy upgrade`: native files change too';
    } else if (tiedToReactNative(dep.name)) {
      Object.assign(row, { safe: false, advice: 'update with react-native' });
      row.hint = 'Goes with your react-native version: `rn-buddy upgrade` updates them together';
    } else if (kind === 'major' && (dep.name.startsWith('react-native-') || native(dep.name) === true)) {
      row.hint = 'Native library: a major update may need native changes, a pod install and a rebuild';
    } else if (kind === 'major') {
      row.hint = 'Breaking changes are possible: check the release notes before updating';
    }
    return row;
  });
}
