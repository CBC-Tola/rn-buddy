import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isTypeScript, renderTemplate } from './templates.js';

const TEMPLATES = new URL('../templates/structure/', import.meta.url);

// The folders `structure` creates, in the order they are printed. '' is src/ itself.
export const FOLDERS = ['', 'screens', 'components', 'navigation', 'hooks', 'services', 'store', 'theme', 'utils', 'assets', 'types'];
const TYPESCRIPT_ONLY = new Set(['types']);

// One entry per README: { file, summary, content, exists }. `file` is relative to the project root.
export function planStructure(root) {
  const typescript = isTypeScript(root);
  return FOLDERS.filter((folder) => typescript || !TYPESCRIPT_ONLY.has(folder)).map((folder) => {
    const file = path.join('src', folder, 'README.md');
    const content = renderTemplate(readFileSync(new URL(`${folder || 'src'}.md`, TEMPLATES), 'utf8'), typescript);
    return { file, summary: summary(content), content, exists: existsSync(path.join(root, file)) };
  });
}

// Creates the missing folders and READMEs. Existing files are never touched.
export function applyStructure(root, plan) {
  for (const { file, content, exists } of plan) {
    if (exists) continue;
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

// The first sentence of the README, used as its one-line description.
function summary(content) {
  const paragraph = content.split('\n').find((line) => line.trim() && !line.startsWith('#')) ?? '';
  return paragraph.split(/[.:]\s/)[0].replace(/\.$/, '');
}
