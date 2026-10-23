import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyStructure, FEATURE_FOLDERS, FOLDERS, planStructure } from '../src/lib/structure.js';
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
    for (const featureBased of [false, true]) {
      for (const { file, content, summary } of planStructure(makeProject(project), { featureBased })) {
        assert.doesNotMatch(content, /\{tsx?\}|\{:|<!--/, file);
        assert.ok(summary, `${file} has no summary`);
        assert.ok(summary.length < 70, `${file}: summary is too long for the table`);
      }
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

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));
const readme = (...folders) => path.join('src', ...folders, 'README.md');

test('the default layout is type-based and unchanged', () => {
  const files = planStructure(makeProject({ 'package.json': {}, 'tsconfig.json': {} })).map((item) => item.file);
  assert.deepEqual(files, [readme(), ...FOLDERS.slice(1).map((folder) => readme(folder))]);
  assert.ok(!files.some((file) => file.includes('features')));
});

test('--feature-based plans features/auth plus shared folders', () => {
  const plan = planStructure(makeProject({ 'package.json': {}, 'tsconfig.json': {} }), { featureBased: true });
  assert.deepEqual(
    plan.map((item) => item.file),
    [
      readme(),
      readme('features'),
      readme('features', 'auth'),
      readme('features', 'auth', 'screens'),
      readme('features', 'auth', 'components'),
      readme('features', 'auth', 'hooks'),
      readme('components'),
      readme('navigation'),
      readme('services'),
      readme('theme'),
      readme('utils'),
      readme('types'),
    ],
  );
  assert.equal(plan.length, FEATURE_FOLDERS.length);
  // No type-based folders: screens and hooks live inside each feature.
  assert.ok(!plan.some((item) => [readme('screens'), readme('hooks'), readme('store')].includes(item.file)));

  const src = plan[0].content;
  assert.match(src, /## Feature-based or type-based\?/);
  assert.match(src, /Type-based\*\* is simpler for small apps/);
  assert.match(src, /doesn't import another feature's internals/);
  assert.match(src, /features\/\*\/index\.ts/);
  assert.match(plan.find((item) => item.file === readme('features', 'auth')).content, /api\.ts/);
});

test('--feature-based in JavaScript: no types/ and .js examples', () => {
  const plan = planStructure(makeProject({ 'package.json': {} }), { featureBased: true });
  assert.ok(!plan.some((item) => item.file === readme('types')));
  const auth = plan.find((item) => item.file === readme('features', 'auth')).content;
  assert.match(auth, /api\.js/);
  assert.doesNotMatch(auth, /import type|: string|Promise<User>/);
  const hooks = plan.find((item) => item.file === readme('features', 'auth', 'hooks')).content;
  assert.match(hooks, /useState\(\);/);
  assert.doesNotMatch(hooks, /useState</);
});

test('--feature-based never overwrites an existing type-based src/README.md', () => {
  const root = makeProject({ 'package.json': {}, 'src/README.md': 'type-based notes' });
  const plan = planStructure(root, { featureBased: true });
  assert.equal(plan[0].exists, true);
  applyStructure(root, plan);
  assert.equal(readFileSync(path.join(root, 'src', 'README.md'), 'utf8'), 'type-based notes');
  assert.ok(existsSync(path.join(root, 'src', 'features', 'auth', 'screens', 'README.md')));
});

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('rn-buddy structure --feature-based --dry-run writes nothing', () => {
  const root = makeProject({ 'package.json': { name: 'DemoApp' }, 'tsconfig.json': {}, 'src/screens/': '' });
  const { status, stdout } = rnBuddy('structure', '--feature-based', '--dry-run', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Folder layout \(feature-based, TypeScript examples\)/);
  assert.match(stdout, /\+ src\/features\/auth\/README\.md +An example feature/);
  assert.match(stdout, /Would create 12 READMEs/);
  assert.match(stdout, /already has type-based folders \(screens\/\)/);
  assert.ok(!existsSync(path.join(root, 'src', 'features')));
});

test('rn-buddy structure keeps the type-based output', () => {
  const root = makeProject({ 'package.json': { name: 'DemoApp' } });
  const { status, stdout } = rnBuddy('structure', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /Folder layout \(JavaScript examples\)/);
  assert.match(stdout, /Created 10 READMEs/);
  assert.match(stdout, /Start with src\/README\.md/);
  assert.doesNotMatch(stdout, /features/);
});
