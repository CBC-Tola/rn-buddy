import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { lookupPath } from './notes.js';

// Never shown: version control and OS files.
const HIDDEN = new Set(['.git', '.DS_Store']);
// Shown, but not opened: their contents are installed or generated, and there can be thousands.
const NOT_OPENED = new Set(['node_modules', 'Pods', 'build', '.gradle', '.expo', 'DerivedData', '.bundle']);

export const DEFAULT_DEPTH = 3;
const MAX_ENTRIES = 40;
const MAX_COLUMN = 36;
const MAX_NOTE = 50;

// The folder as nested nodes: { name, folder, note?, children?, hidden?, more? }.
// `depth` is how many levels to open. `folders` leaves out files. `relative` is the folder's path
// from the project root, which the notes are looked up by.
export function buildTree(folder, { root = folder, depth = DEFAULT_DEPTH, folders = false, expo = false } = {}) {
  const relative = path.relative(root, folder).split(path.sep).join('/');
  const entries = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => !HIDDEN.has(entry.name) && (!folders || isFolder(folder, entry)))
    .sort((a, b) => Number(isFolder(folder, b)) - Number(isFolder(folder, a)) || a.name.localeCompare(b.name));

  const shown = entries.slice(0, MAX_ENTRIES);
  const nodes = shown.map((entry) => {
    const child = path.join(folder, entry.name);
    const node = { name: entry.name, folder: isFolder(folder, entry) };
    const note = noteFor(child, path.posix.join(relative, entry.name), node.folder, expo);
    if (note) node.note = note;
    if (!node.folder) return node;
    if (NOT_OPENED.has(entry.name) || entry.isSymbolicLink()) return { ...node, opened: false };
    if (depth <= 1) return { ...node, opened: false, count: countEntries(child, folders) };
    return { ...node, ...buildTree(child, { root, depth: depth - 1, folders, expo }) };
  });
  return { children: nodes, more: entries.length - shown.length };
}

// The tree as lines of text: ├── name/  note  (3 inside). Notes line up in one column.
export function renderTree(tree, { color = (text) => text, dim = (text) => text } = {}) {
  const rows = [];
  const walk = ({ children, more }, prefix) => {
    const items = [...children, ...(more > 0 ? [{ more }] : [])];
    items.forEach((node, i) => {
      const last = i === items.length - 1;
      const branch = last ? '└── ' : '├── ';
      if (node.more) {
        rows.push({ left: `${prefix}${branch}`, name: dim(`… and ${node.more} more`), width: 0, note: '' });
        return;
      }
      const name = node.folder ? `${node.name}/` : node.name;
      const inside = node.opened === false && node.count > 0 ? dim(`(${node.count} inside)`) : '';
      const note = [node.note && dim(node.note), inside].filter(Boolean).join('  ');
      rows.push({ left: `${prefix}${branch}`, name: node.folder ? color(name) : name, width: prefix.length + 4 + name.length, note });
      if (node.children?.length || node.more > 0) walk(node, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(tree, '');
  const column = Math.min(MAX_COLUMN, Math.max(0, ...rows.filter((row) => row.note).map((row) => row.width))) + 2;
  return rows.map((row) => (row.note ? `${row.left}${row.name}${' '.repeat(Math.max(2, column - row.width))}${row.note}` : `${row.left}${row.name}`));
}

// Counts of what is in the tree, for the summary line.
export function countTree({ children }) {
  let folders = 0;
  let files = 0;
  for (const node of children) {
    if (node.folder) folders += 1;
    else files += 1;
    if (node.children) {
      const inner = countTree(node);
      folders += inner.folders;
      files += inner.files;
    }
  }
  return { folders, files };
}

// What a folder or file is for: its README's first paragraph, else rn-buddy's note, cut at the
// first sentence so it fits next to the name.
function noteFor(target, relative, isDir, expo) {
  const readme = isDir ? readmeSummary(target) : null;
  const text = readme ?? lookupPath(relative, { expo });
  return text ? shorten(text.split(/[.:;]\s|\.$|\s\(/)[0].trim()) : null;
}

function shorten(text) {
  if (text.length <= MAX_NOTE) return text;
  return `${text.slice(0, MAX_NOTE).replace(/\s+\S*$/, '')}…`;
}

function readmeSummary(folder) {
  const readme = path.join(folder, 'README.md');
  if (!existsSync(readme)) return null;
  return readFileSync(readme, 'utf8').split('\n').find((text) => text.trim() && !text.startsWith('#')) ?? null;
}

function countEntries(folder, foldersOnly) {
  return readdirSync(folder, { withFileTypes: true }).filter(
    (entry) => !HIDDEN.has(entry.name) && (!foldersOnly || isFolder(folder, entry)),
  ).length;
}

// Symlinks to folders count as folders, but are not followed into (they can loop).
function isFolder(folder, entry) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return statSync(path.join(folder, entry.name)).isDirectory();
  } catch {
    return false;
  }
}
