import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import pc from 'picocolors';
import {
  applyPlan,
  compatibilityIssues,
  formatCommand,
  hasChanges,
  installCommands,
  planPackage,
  planRecipe,
  podCommand,
} from '../lib/add.js';
import { readProject } from '../lib/project.js';
import { RECIPES, recipeFor } from '../lib/recipes.js';
import { checkPackages, npmLatest } from '../lib/remote.js';

const POD_INSTALL = '(cd ios && bundle exec pod install)';

export async function add(name, options = {}) {
  if (!name) {
    listRecipes();
    return;
  }

  const project = readProject(options.dir ?? process.cwd());
  const { root, pkg } = project;
  const plan = RECIPES[name] ? planRecipe(project, name) : planPackage(project, name, { dev: options.dev });

  const reactNative = pkg.dependencies?.['react-native'];
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (reactNative ? pc.dim(` · React Native ${reactNative}`) : ''));
  console.log(pc.dim(root));
  printPlan(project, plan);

  const recipe = plan.recipe ? null : recipeFor(name);
  if (recipe) {
    console.log(`\n${pc.cyan('Tip:')} ${name} is part of a recipe. ${pc.bold(`rn-buddy add ${recipe}`)} installs it with everything it needs.`);
  }

  if (!hasChanges(plan)) {
    console.log(`\nNothing to do: ${plan.recipe ? `the ${plan.recipe} recipe is already set up` : `${name} is already installed`}.`);
    return;
  }

  const issues = options.offline ? [] : await checkOnline(project, plan);
  if (issues.length > 0) console.log('');
  for (const issue of issues) {
    console.log(issue.level === 'fail' ? pc.red(`✖ ${issue.message}`) : pc.yellow(`⚠ ${issue.message}`));
  }
  if (options.offline) console.log(pc.dim('\nSkipped the npm and React Native Directory checks (--offline).'));
  if (issues.some((issue) => issue.level === 'fail')) {
    process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was changed.'));
    return;
  }
  if (!options.yes && !(await confirm())) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  console.log('');
  const result = applyPlan(project, plan);
  printResult(project, plan, result);
}

function listRecipes() {
  console.log(pc.bold('Recipes'));
  const width = Math.max(...Object.keys(RECIPES).map((name) => name.length));
  for (const [name, recipe] of Object.entries(RECIPES)) {
    console.log(`  ${pc.cyan(name.padEnd(width))}  ${recipe.summary}`);
    console.log(`  ${' '.repeat(width)}  ${pc.dim(recipe.packages.join(', '))}`);
  }
  console.log(`
${pc.bold('rn-buddy add <recipe>')}    install a recipe: packages, starter files in src/ and native setup
${pc.bold('rn-buddy add <package>')}   install any package with your package manager, then pod install if needed
${pc.dim('Add --dry-run to see what would change first.')}`);
}

function printPlan({ root }, plan) {
  const title = plan.recipe
    ? `${pc.bold(`add ${plan.recipe}`)}  ${RECIPES[plan.recipe].summary}`
    : pc.bold(`add ${[...plan.install.map((p) => p.name), ...plan.installed][0]}`);
  console.log(`\n${title}\n`);

  step('Install', plan.install.map((p) => p.name + (p.dev ? pc.dim(' (devDependency)') : '')));
  step('', installCommands(plan).map((command) => pc.dim(`$ ${formatCommand(command, root)}`)));
  step('Installed', plan.installed.map((name) => `${name} ${pc.dim('already installed')}`));
  step('Create', plan.files.filter((f) => !f.exists).map((f) => f.file));
  step('Keep', plan.files.filter((f) => f.exists).map((f) => `${f.file} ${pc.dim('already exists, not changed')}`));
  step(
    'Edit',
    plan.edits.flatMap((edit) => {
      if (edit.status === 'apply') return [edit.file, pc.dim(`  ${edit.description}`)];
      if (edit.status === 'done') return [`${edit.file} ${pc.dim('already set up')}`];
      return [pc.yellow(`⚠ do by hand: ${edit.manual}`)];
    }),
  );
  if (plan.install.length > 0 && podCommand(root)) {
    step('Then', [`${POD_INSTALL} ${pc.dim('if a new package has native code')}`]);
  }
}

function printResult({ root }, plan, { native, pods, podsOk }) {
  const manager = plan.manager;
  console.log('');
  if (plan.install.length > 0) ok(`Installed ${plan.install.map((p) => p.name).join(', ')}`);
  const created = plan.files.filter((f) => !f.exists);
  if (created.length > 0) ok(`Created ${created.map((f) => f.file).join(', ')}`);
  for (const edit of plan.edits.filter((e) => e.status === 'apply')) ok(`Edited ${edit.file}`);
  for (const edit of plan.edits.filter((e) => e.status === 'manual')) {
    console.log(pc.yellow(`⚠ Do this by hand: ${edit.manual}`));
  }

  if (native.length > 0) {
    if (podsOk) ok('Installed the iOS pods');
    else if (pods) console.log(pc.yellow(`⚠ pod install failed. Run rn-buddy env to find out why, then ${POD_INSTALL}`));
    else if (podCommand(root, 'darwin')) console.log(pc.dim(`On a Mac, run ${POD_INSTALL} before building for iOS.`));
  }

  if (plan.next) {
    console.log(`\n${pc.bold('Next steps')}`);
    printMarkdown(plan.next);
  }
  if (plan.docs) console.log(`\n${pc.dim('Docs:')} ${plan.docs}`);

  if (native.length > 0) {
    console.log(
      `\n${pc.yellow('[native]')} ${native.join(', ')} ${native.length === 1 ? 'has' : 'have'} native code: rebuild the app with ${pc.bold(`${manager} run android`)} or ${pc.bold(`${manager} run ios`)}. Reloading is not enough.`,
    );
  } else if (plan.install.length > 0) {
    console.log(pc.dim('\nNo native code: reload the app and it works.'));
  }
  if (!plan.recipe && plan.install.length > 0) {
    console.log(pc.dim(`Tip: rn-buddy explain ${plan.install[0].name} shows what it is for.`));
  }
}

async function checkOnline(project, plan) {
  const names = plan.install.map((p) => p.name);
  if (names.length === 0) return [];
  const [manifests, directory] = await Promise.all([Promise.all(names.map(npmLatest)), checkPackages(names)]);
  const latest = Object.fromEntries(names.map((name, i) => [name, manifests[i]]));
  return compatibilityIssues(project, plan, latest, directory);
}

async function confirm() {
  if (!process.stdin.isTTY) {
    throw new Error('Not running in a terminal. Add --yes to make these changes, or --dry-run to only see them.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`\nMake these changes? ${pc.dim('(Y/n)')} `);
  prompt.close();
  return !/^n/i.test(answer.trim());
}

function step(label, lines) {
  lines.forEach((text, i) => console.log(`  ${pc.dim((i === 0 ? label : '').padEnd(10))}${text}`));
}

function ok(message) {
  console.log(`${pc.green('✔')} ${message}`);
}

// Prints the recipe's next.md: code blocks indented and colored, fences dropped.
function printMarkdown(text) {
  let inCode = false;
  for (const line of text.trim().split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    console.log(inCode ? `    ${pc.cyan(line)}` : line ? `  ${line}` : '');
  }
}
