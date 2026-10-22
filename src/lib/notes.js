import { readFileSync } from 'node:fs';

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

export function lookupFile(name) {
  return data.files[name] ?? null;
}
