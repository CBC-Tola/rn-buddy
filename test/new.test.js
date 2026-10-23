import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/commands/new.js';
import { folderProblem, nameProblem, parseChoice, parseRecipes, planNew, runNew } from '../src/lib/new.js';
import { RECIPES } from '../src/lib/recipes.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(cwd, ...args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

// Runs createApp with console.log captured.
async function capture(fn) {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = log;
  }
  return lines.join('\n');
}

test('validates app names like the React Native CLI', () => {
  for (const name of ['MyApp', 'app2', 'A']) assert.equal(nameProblem(name), null, name);
  for (const name of ['my-app', 'My App', '2fast', 'my_app', '', 'React', 'react', 'MyHelloWorld']) {
    assert.ok(nameProblem(name), name);
  }
});

test('refuses a folder that already exists', () => {
  const cwd = makeProject({ 'Taken/package.json': {} });
  assert.match(folderProblem(cwd, 'Taken'), /already exists/);
  assert.equal(folderProblem(cwd, 'Free'), null);
});

test('validates recipe names against RECIPES', () => {
  assert.deepEqual(parseRecipes('navigation, api'), { recipes: ['navigation', 'api'], structure: false });
  assert.deepEqual(parseRecipes('state,state'), { recipes: ['state'], structure: false });
  assert.deepEqual(parseRecipes('structure,state'), { recipes: ['state'], structure: true });
  assert.deepEqual(parseRecipes(''), { recipes: [], structure: false });
  assert.throws(() => parseRecipes('navigation,redux'), /Unknown recipe: redux\. Recipes: .*navigation/);
  // New recipes added to RECIPES are accepted without changing `new`.
  for (const name of Object.keys(RECIPES)) assert.deepEqual(parseRecipes(name).recipes, [name]);
});

test('parses the answer to the recipe question', () => {
  const names = ['navigation', 'state', 'api'];
  assert.deepEqual(parseChoice('', names), []);
  assert.deepEqual(parseChoice('1,3', names), ['navigation', 'api']);
  assert.deepEqual(parseChoice('3 1 3', names), ['api', 'navigation']);
  assert.deepEqual(parseChoice('state, API', names), ['state', 'api']);
  assert.deepEqual(parseChoice('all', names), names);
  assert.equal(parseChoice('4', names), null);
  assert.equal(parseChoice('redux', names), null);
});

test('plans init, then structure, then each recipe through the rn-buddy binary', () => {
  const plan = planNew({ name: 'MyApp', cwd: '/work', recipes: ['navigation', 'api'], bin: '/rn-buddy.js', node: 'node' });
  const folder = path.join('/work', 'MyApp');
  assert.equal(plan.folder, folder);
  assert.deepEqual(
    plan.steps.map((step) => [step.command.replace(/\.cmd$/, ''), ...step.args]),
    [
      ['npx', '@react-native-community/cli@latest', 'init', 'MyApp'],
      ['node', '/rn-buddy.js', 'structure', '--dir', folder],
      ['node', '/rn-buddy.js', 'add', 'navigation', '--yes', '--dir', folder],
      ['node', '/rn-buddy.js', 'add', 'api', '--yes', '--dir', folder],
    ],
  );
  assert.deepEqual(
    plan.steps.map((step) => step.display),
    ['npx @react-native-community/cli@latest init MyApp', 'rn-buddy structure', 'rn-buddy add navigation', 'rn-buddy add api'],
  );
  assert.equal(plan.steps[0].cwd, '/work');
  assert.equal(plan.steps[1].cwd, folder);
});

test('--no-structure leaves out the structure step', () => {
  const plan = planNew({ name: 'MyApp', cwd: '/work', recipes: [], structure: false });
  assert.deepEqual(
    plan.steps.map((step) => step.display),
    ['npx @react-native-community/cli@latest init MyApp'],
  );
});

test('runs the steps in order, stops when init fails, keeps going after a failed recipe', () => {
  const plan = planNew({ name: 'MyApp', cwd: '/work', recipes: ['navigation', 'state'] });
  const ran = [];
  const results = runNew(plan, (command, args) => {
    ran.push(args.includes('add') ? args[args.indexOf('add') + 1] : args[1]);
    return { status: args.includes('navigation') ? 1 : 0 };
  });
  assert.deepEqual(ran, ['init', 'structure', 'navigation', 'state']);
  assert.deepEqual(
    results.map((result) => result.ok),
    [true, true, false, true],
  );

  const stopped = runNew(plan, () => ({ status: 1 }));
  assert.equal(stopped.length, 1);

  const missing = runNew(plan, () => ({ status: null, error: Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' }) }));
  assert.match(missing[0].error, /was not found/);
});

test('createApp with --yes runs the plan and prints next steps', async () => {
  const cwd = makeProject({});
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ args, cwd: options.cwd });
    return { status: 0 };
  };
  const output = await capture(() => createApp('MyApp', { recipes: 'state', structure: true, yes: true }, { cwd, run }));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].args.slice(1), ['add', 'state', '--yes', '--dir', path.join(cwd, 'MyApp')]);
  assert.match(output, /create-expo-app@latest/);
  assert.match(output, /\$ npx @react-native-community\/cli@latest init MyApp/);
  assert.match(output, /Next steps[\s\S]*cd MyApp[\s\S]*npm run android[\s\S]*npm run ios[\s\S]*rn-buddy env[\s\S]*rn-buddy learn reload-vs-rebuild/);
});

test('createApp refuses bad names, existing folders and unknown recipes before running anything', async () => {
  const cwd = makeProject({ 'Taken/': '' });
  const run = () => assert.fail('should not run');
  await assert.rejects(createApp('my-app', { yes: true }, { cwd, run }), /letters and digits/);
  await assert.rejects(createApp('Taken', { yes: true }, { cwd, run }), /already exists/);
  await assert.rejects(createApp('MyApp', { recipes: 'redux', yes: true }, { cwd, run }), /Unknown recipe: redux/);
});

test('rn-buddy new refuses an invalid name', () => {
  const { status, stderr } = rnBuddy(makeProject({}), 'new', 'my-app', '--yes');
  assert.equal(status, 1);
  assert.match(stderr, /✖ "my-app" can't be an app name/);
});

test('rn-buddy new asks for --yes outside a terminal', () => {
  const { status, stderr } = rnBuddy(makeProject({}), 'new', 'MyApp');
  assert.equal(status, 1);
  assert.match(stderr, /Not running in a terminal/);
});
