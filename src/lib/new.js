import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './recipes.js';

const BIN = fileURLToPath(new URL('../../bin/rn-buddy.js', import.meta.url));

// The rules of `@react-native-community/cli init`: the name becomes the Android and iOS project
// name, so letters and digits only, starting with a letter. Returns a message, or null when valid.
export function nameProblem(name) {
  if (!name) return 'Give the app a name, e.g. rn-buddy new MyApp';
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    return `"${name}" can't be an app name: use only letters and digits, starting with a letter (e.g. MyApp).`;
  }
  if (/^react(native)?$/i.test(name)) return `"${name}" is reserved by React Native. Pick another name.`;
  if (/helloworld/i.test(name)) return 'The name can\'t contain "HelloWorld": it is the placeholder the template replaces.';
  return null;
}

// The folder `init` would create, or null when it doesn't exist yet.
export function folderProblem(cwd, name) {
  const folder = path.join(cwd, name);
  return existsSync(folder) ? `The folder ${folder} already exists. Pick another name or remove it first.` : null;
}

// "navigation, api" → ['navigation', 'api']. Unknown names throw, listing the recipes that exist.
// `structure` is accepted too: it is the folder layout, not a recipe, so it's returned separately.
export function parseRecipes(text, available = Object.keys(RECIPES)) {
  const names = [
    ...new Set(
      String(text ?? '')
        .split(/[\s,]+/)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const unknown = names.filter((name) => name !== 'structure' && !available.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown recipe${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Recipes: ${available.join(', ')}.`);
  }
  return { recipes: names.filter((name) => name !== 'structure'), structure: names.includes('structure') };
}

// The answer to the numbered recipe question: "1 3", "1,3", "navigation api", "all", or empty for none.
// Returns null when the answer doesn't make sense, so the question can be asked again.
export function parseChoice(answer, available = Object.keys(RECIPES)) {
  const words = String(answer ?? '')
    .split(/[\s,]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  if (words.length === 1 && words[0] === 'all') return [...available];
  const chosen = [];
  for (const word of words) {
    const name = /^\d+$/.test(word) ? available[Number(word) - 1] : available.find((recipe) => recipe === word);
    if (!name) return null;
    if (!chosen.includes(name)) chosen.push(name);
  }
  return chosen;
}

// The commands `new` runs, in order. Each step has `command` + `args` to spawn, the `cwd` to run
// it in and `display`, the command a learner would type to do the same by hand.
export function planNew({ name, cwd, recipes = [], structure = true, bin = BIN, node = process.execPath }) {
  const folder = path.join(cwd, name);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const steps = [
    {
      title: `Create ${name} with the React Native Community CLI`,
      command: npx,
      args: ['@react-native-community/cli@latest', 'init', name],
      cwd,
      display: `npx @react-native-community/cli@latest init ${name}`,
      required: true,
    },
  ];
  if (structure) {
    steps.push({
      title: 'Add the src/ folder layout',
      command: node,
      args: [bin, 'structure', '--dir', folder],
      cwd: folder,
      display: 'rn-buddy structure',
    });
  }
  for (const recipe of recipes) {
    steps.push({
      title: `Add the ${recipe} recipe: ${RECIPES[recipe]?.summary ?? recipe}`,
      command: node,
      args: [bin, 'add', recipe, '--yes', '--dir', folder],
      cwd: folder,
      display: `rn-buddy add ${recipe}`,
    });
  }
  return { name, folder, steps };
}

// Runs the steps in order. If creating the app fails, there is nothing to set up, so it stops;
// a failed recipe doesn't stop the others. Returns one { step, ok, error? } per step that ran.
export function runNew(plan, run = defaultRun, onStep = () => {}) {
  const results = [];
  for (const step of plan.steps) {
    onStep(step);
    const { status, error } = run(step.command, step.args, { cwd: step.cwd });
    const result = { step, ok: !error && status === 0 };
    if (error) result.error = error.code === 'ENOENT' ? `${step.command} was not found. Is Node.js installed?` : error.message;
    results.push(result);
    if (!result.ok && step.required) break;
  }
  return results;
}

// stdio is inherited so the learner sees npm and the CLI working, and can answer their questions.
// On Windows npx is a .cmd file, which Node only runs through a shell.
function defaultRun(command, args, { cwd }) {
  return spawnSync(command, args, { cwd, stdio: 'inherit', shell: command.endsWith('.cmd') });
}
