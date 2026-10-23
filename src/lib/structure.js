import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TEMPLATES = new URL('../templates/structure/', import.meta.url);

// The folders `structure` creates, in the order they are printed. '' is src/ itself.
export const FOLDERS = ['', 'screens', 'components', 'navigation', 'hooks', 'services', 'store', 'theme', 'utils', 'assets', 'types'];
const TYPESCRIPT_ONLY = new Set(['types']);

export function isTypeScript(root) {
  return existsSync(path.join(root, 'tsconfig.json'));
}

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

// Templates are written for TypeScript and adapted for JavaScript projects:
//   {tsx} / {ts}     file extension: tsx/ts, or js
//   {: Type}         a type annotation, removed for JavaScript
//   <!-- ts -->      at the end of a line: keep the line only for TypeScript
//   <!-- js -->      at the end of a line: keep the line only for JavaScript
export function renderTemplate(template, typescript) {
  const keep = typescript ? '<!-- ts -->' : '<!-- js -->';
  return template
    .split('\n')
    .filter((line) => !/<!-- (ts|js) -->$/.test(line) || line.endsWith(keep))
    .map((line) => line.replace(/ <!-- (ts|js) -->$/, ''))
    .join('\n')
    .replaceAll('{tsx}', typescript ? 'tsx' : 'js')
    .replaceAll('{ts}', typescript ? 'ts' : 'js')
    .replace(/\{(:[^}]*)\}/g, typescript ? '$1' : '')
    .replace(/^```(tsx?)$/gm, (fence, lang) => (typescript ? fence : `\`\`\`${lang === 'tsx' ? 'jsx' : 'js'}`));
}

// The first sentence of the README, used as its one-line description.
function summary(content) {
  const paragraph = content.split('\n').find((line) => line.trim() && !line.startsWith('#')) ?? '';
  return paragraph.split(/[.:]\s/)[0].replace(/\.$/, '');
}
