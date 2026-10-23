import { existsSync } from 'node:fs';
import path from 'node:path';

export function isTypeScript(root) {
  return existsSync(path.join(root, 'tsconfig.json'));
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
    .map((line) => line.replace(/\s*<!-- (ts|js) -->$/, ''))
    .join('\n')
    .replaceAll('{tsx}', typescript ? 'tsx' : 'js')
    .replaceAll('{ts}', typescript ? 'ts' : 'js')
    .replace(/\{(:[^}]*)\}/g, typescript ? '$1' : '')
    .replace(/^```(tsx?)$/gm, (fence, lang) => (typescript ? fence : `\`\`\`${lang === 'tsx' ? 'jsx' : 'js'}`));
}
