import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTemplate } from '../src/lib/templates.js';

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
