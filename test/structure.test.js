import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { applyStructure, FOLDERS, planStructure } from '../src/lib/structure.js';
import { renderTemplate } from '../src/lib/templates.js';
import { makeProject } from './helpers.js';

const TEMPLATE = [
  '// Button.{tsx} uses theme.{ts}',
  '```tsx',
  'type Props = { title: string }; <!-- ts -->',
  'export function Button({ title }{: Props}) {}',
  'return [on, toggle] as const; <!-- ts -->',
  'return [on, toggle]; <!-- js -->',
  '```',
].join('\n');

test('renders templates for TypeScript', () => {
  assert.equal(
    renderTemplate(TEMPLATE, true),
    [
      '// Button.tsx uses theme.ts',
      '```tsx',
      'type Props = { title: string };',
      'export function Button({ title }: Props) {}',
      'return [on, toggle] as const;',
      '```',
    ].join('\n'),
  );
});

test('renders templates for JavaScript', () => {
  assert.equal(
    renderTemplate(TEMPLATE, false),
    ['// Button.js uses theme.js', '```jsx', 'export function Button({ title }) {}', 'return [on, toggle];', '```'].join(
      '\n',
    ),
  );
});

test('every template renders without leftover markers', () => {
  for (const project of [{ 'package.json': {}, 'tsconfig.json': {} }, { 'package.json': {} }]) {
    for (const { file, content, summary } of planStructure(makeProject(project))) {
      assert.doesNotMatch(content, /\{tsx?\}|\{:|<!--/, file);
      assert.ok(summary, `${file} has no summary`);
    }
  }
});

test('adds types/ only to TypeScript projects', () => {
  const files = (root) => planStructure(root).map((item) => item.file);
  assert.equal(files(makeProject({ 'package.json': {}, 'tsconfig.json': {} })).length, FOLDERS.length);
  assert.ok(!files(makeProject({ 'package.json': {} })).includes(path.join('src', 'types', 'README.md')));
});

test('JavaScript projects get .js examples', () => {
  const plan = planStructure(makeProject({ 'package.json': {} }));
  const components = plan.find((item) => item.file === path.join('src', 'components', 'README.md'));
  assert.match(components.content, /components\/Button\.js/);
  assert.doesNotMatch(components.content, /ButtonProps/);
});

test('creates missing READMEs and never overwrites existing ones', () => {
  const root = makeProject({ 'package.json': {}, 'src/screens/README.md': 'my notes' });
  const plan = planStructure(root);
  assert.equal(plan.find((item) => item.file === path.join('src', 'screens', 'README.md')).exists, true);

  applyStructure(root, plan);
  assert.equal(readFileSync(path.join(root, 'src', 'screens', 'README.md'), 'utf8'), 'my notes');
  assert.match(readFileSync(path.join(root, 'src', 'README.md'), 'utf8'), /^# src\//);
  assert.ok(existsSync(path.join(root, 'src', 'theme', 'README.md')));
  assert.ok(planStructure(root).every((item) => item.exists));
});
