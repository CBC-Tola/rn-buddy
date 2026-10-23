import { existsSync, readdirSync, readFileSync } from 'node:fs';

const LESSONS = new URL('../data/lessons/', import.meta.url);

// The order `rn-buddy learn` lists lessons in: from "what happens when I save a file"
// to shipping and upgrading. Lessons not listed here come last, A to Z.
const ORDER = [
  'reload-vs-rebuild',
  'metro',
  'devtools',
  'debug-vs-release',
  'expo-go',
  'autolinking',
  'pods',
  'gradle',
  'new-architecture',
  'hermes',
  'native-modules',
  'navigation',
  'state',
  'env-vars',
  'upgrading',
];

// A lesson file starts with "# Title", then a one-paragraph summary, then the body.
export function parseLesson(id, text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  const title = lines[0].replace(/^#\s*/, '').trim();
  let i = 1;
  while (i < lines.length && !lines[i].trim()) i++;
  const summary = [];
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) summary.push(lines[i++].trim());
  return { id, title, summary: summary.join(' '), body: lines.slice(i).join('\n').trim() };
}

// Every lesson, in ORDER. Lesson ids are the file names without .md.
export function listLessons(dir = LESSONS) {
  const ids = readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -3));
  const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  return ids
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((id) => parseLesson(id, readFileSync(new URL(`${id}.md`, dir), 'utf8')));
}

// One lesson, or null when there is no lesson with that id.
export function readLesson(id, dir = LESSONS) {
  const name = String(id).toLowerCase().trim();
  // Only plain ids, so `learn ../../package` can't read other files.
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const file = new URL(`${name}.md`, dir);
  if (!existsSync(file)) return null;
  return parseLesson(name, readFileSync(file, 'utf8'));
}

// Up to 3 lesson ids close to what the user typed: same start, contains it, or a typo away.
export function suggestLessons(input, ids) {
  const word = String(input).toLowerCase().trim();
  if (!word) return [];
  const scored = ids.map((id) => {
    if (id.startsWith(word) || word.startsWith(id)) return { id, score: 0 };
    if (id.includes(word) || id.split('-').some((part) => part.length > 2 && word.includes(part))) return { id, score: 1 };
    return { id, score: 2 + distance(word, id) };
  });
  const limit = 2 + Math.max(2, Math.floor(word.length / 3));
  return scored
    .filter((item) => item.score <= limit)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.id);
}

// Levenshtein distance: how many letters to add, remove or change to get from a to b.
export function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
