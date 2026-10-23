import pc from 'picocolors';
import {
  applyPlan,
  applyUndo,
  compatibilityIssues,
  formatCommand,
  hasChanges,
  installCommands,
  planPackage,
  planRecipe,
  planUndo,
  podCommand,
  uninstallCommand,
} from '../lib/add.js';
import { readProject } from '../lib/project.js';
import { RECIPE_GROUPS, RECIPES, recipeFor } from '../lib/recipes.js';
import { checkPackages, npmLatest } from '../lib/remote.js';
import { confirm, ok, printHeader, printMarkdown, printStep, warn } from '../lib/ui.js';

const POD_INSTALL = '(cd ios && bundle exec pod install)';
const DEV_BUILD = 'npx expo run:android / npx expo run:ios, or a new EAS build';

export async function add(name, args = [], options = {}) {
  if (!name) {
    listRecipes();
    return;
  }
  const recipe = RECIPES[name];
  if (options.undo) {
    if (!recipe) {
      throw new Error(`--undo works with recipes. To remove a package, use your package manager, e.g. npm uninstall ${name}`);
    }
    await undo(name, args, options);
    return;
  }
  if (recipe?.args && args.length === 0) {
    listChoices(name, recipe);
    return;
  }
  if (!recipe && args.length > 0) {
    throw new Error(`${name} is not a recipe, so it takes no options. Add one package at a time: rn-buddy add ${name}`);
  }

  const project = readProject(options.dir ?? process.cwd());
  const plan = recipe ? planRecipe(project, name, args) : planPackage(project, name, { dev: options.dev });

  printHeader(project);
  printPlan(project, plan);

  const partOf = plan.recipe ? null : recipeFor(name);
  if (partOf) {
    const tip = `${pc.bold(`rn-buddy add ${partOf}`)} installs it with everything it needs.`;
    console.log(`\n${pc.cyan('Tip:')} ${name} is part of a recipe. ${tip}`);
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
  for (const group of RECIPE_GROUPS) {
    console.log(`\n${pc.bold(group.title)}`);
    for (const name of group.recipes) console.log(`  ${pc.cyan(name.padEnd(width))}  ${RECIPES[name].summary}`);
  }
  const usage = [
    ['rn-buddy add <recipe>', 'packages, starter files in src/ and the native setup'],
    ['rn-buddy add permissions <name...>', 'e.g. rn-buddy add permissions camera location'],
    ['rn-buddy add <package>', 'any package with your package manager, then pod install if needed'],
    ['rn-buddy add --undo <recipe>', 'remove what a recipe added (files you changed are kept)'],
  ];
  const usageWidth = Math.max(...usage.map(([command]) => command.length));
  console.log('');
  for (const [command, text] of usage) console.log(`${pc.bold(command.padEnd(usageWidth))}  ${text}`);
  console.log(pc.dim('Add --dry-run to see what would change first.'));
}

// `rn-buddy add permissions` without names: what can be set up.
function listChoices(name, recipe) {
  const { label, choices } = recipe.args;
  console.log(`${pc.bold(`Which ${label}s?`)} Name one or more:\n`);
  const width = Math.max(...Object.keys(choices).map((choice) => choice.length));
  for (const [choice, info] of Object.entries(choices)) console.log(`  ${pc.cyan(choice.padEnd(width))}  ${info.about}`);
  console.log(`\n${pc.bold(`rn-buddy add ${name} ${Object.keys(choices).slice(0, 2).join(' ')}`)}`);
}

function printPlan({ root }, plan) {
  const what = plan.recipe ? [plan.recipe, ...(plan.args ?? [])].join(' ') : [...plan.install.map((p) => p.name), ...plan.installed][0];
  const title = plan.recipe ? `${pc.bold(`add ${what}`)}  ${RECIPES[plan.recipe].summary}` : pc.bold(`add ${what}`);
  console.log(`\n${title}\n`);

  printStep('Install', plan.install.map((p) => p.spec + (p.dev ? pc.dim(' (devDependency)') : '')));
  printStep('', installCommands(plan).map((command) => pc.dim(`$ ${formatCommand(command, root)}`)));
  printStep('Installed', plan.installed.map((name) => `${name} ${pc.dim('already installed')}`));
  printStep('Create', plan.files.filter((f) => !f.exists).map((f) => f.file));
  printStep('Keep', plan.files.filter((f) => f.exists).map((f) => `${f.file} ${pc.dim('already exists, not changed')}`));
  printStep('Edit', plan.edits.flatMap(editLines));
  // devDependencies are build tools, without native code for the app.
  if (plan.install.some((p) => !p.dev)) {
    if (plan.expo && !podCommand(root, 'darwin')) {
      printStep('Then', [`rebuild your development build ${pc.dim(`if a new package has native code (${DEV_BUILD})`)}`]);
    } else if (podCommand(root, 'darwin')) {
      printStep('Then', [`${POD_INSTALL} ${pc.dim('if a new package has native code')}`]);
    }
  }
  if (plan.expo && plan.expoGo === false && plan.install.length > 0) {
    console.log(`\n${pc.yellow('⚠')} This recipe has native code that Expo Go doesn't include: you need a development build.`);
  }
}

function editLines(edit) {
  if (edit.status === 'apply') return [edit.file, pc.dim(`  ${edit.description}`)];
  if (edit.status === 'done') return [`${edit.file} ${pc.dim('already set up')}`];
  return [pc.yellow(`⚠ do by hand: ${edit.manual}`)];
}

function printResult({ root }, plan, { native, pods, podsOk, skipped }) {
  const manager = plan.manager;
  console.log('');
  if (plan.install.length > 0) ok(`Installed ${plan.install.map((p) => p.name).join(', ')}`);
  const created = plan.files.filter((f) => !f.exists);
  if (created.length > 0) ok(`Created ${created.map((f) => f.file).join(', ')}`);
  for (const edit of plan.edits.filter((e) => e.status === 'apply' && !skipped.includes(e))) ok(`Edited ${edit.file}`);
  for (const edit of skipped) warn(`${edit.file} changed while installing: ${edit.manual}`);
  for (const edit of plan.edits.filter((e) => e.status === 'manual')) warn(`Do this by hand: ${edit.manual}`);
  printPods(root, native, pods, podsOk);

  if (plan.next) {
    console.log(`\n${pc.bold('Next steps')}`);
    printMarkdown(plan.next);
  }
  if (plan.docs) console.log(`\n${pc.dim('Docs:')} ${plan.docs}`);

  if (native.length > 0) {
    const names = `${native.join(', ')} ${native.length === 1 ? 'has' : 'have'} native code`;
    if (plan.expo && plan.expoGo !== false && plan.recipe) {
      const rebuild = `if you use a development build, rebuild it (${DEV_BUILD})`;
      console.log(`\n${pc.yellow('[native]')} ${names}. Expo Go already includes it; ${rebuild}.`);
    } else if (plan.expo) {
      console.log(`\n${pc.yellow('[native]')} ${names}: rebuild your development build (${DEV_BUILD}). Expo Go can't load new native code.`);
    } else {
      console.log(
        `\n${pc.yellow('[native]')} ${names}: rebuild the app with ${pc.bold(`${manager} run android`)} or ${pc.bold(`${manager} run ios`)}. Reloading is not enough.`,
      );
    }
  } else if (plan.install.length > 0) {
    console.log(pc.dim('\nNo native code: reload the app and it works.'));
  }
  if (!plan.recipe && plan.install.length > 0) {
    console.log(pc.dim(`Tip: rn-buddy explain ${plan.install[0].name} shows what it is for.`));
  }
}

function printPods(root, native, pods, podsOk) {
  if (native.length === 0) return;
  if (podsOk) ok('Installed the iOS pods');
  else if (pods) warn(`pod install failed. Run rn-buddy env to find out why, then ${POD_INSTALL}`);
  else if (podCommand(root, 'darwin')) console.log(pc.dim(`On a Mac, run ${POD_INSTALL} before building for iOS.`));
}

// --- undo -----------------------------------------------------------------------------------

async function undo(name, args, options) {
  const project = readProject(options.dir ?? process.cwd());
  const { root } = project;
  const plan = planUndo(project, name, args);

  printHeader(project);
  const what = [name, ...plan.args].join(' ');
  console.log(`\n${pc.bold(`undo ${what}`)}  ${pc.dim('remove what the recipe added')}\n`);
  const command = uninstallCommand(plan);
  printStep('Uninstall', plan.uninstall);
  printStep('', command ? [pc.dim(`$ ${formatCommand(command, root)}`)] : []);
  printStep('Keep', [
    ...plan.kept.map((pkg) => `${pkg.name} ${pc.dim(pkg.reason)}`),
    ...plan.files.filter((f) => f.status === 'keep').map((f) => `${f.file} ${pc.dim(f.reason)}`),
    ...plan.edits.filter((e) => e.status === 'keep').map((e) => `${e.file} ${pc.dim(e.reason)}`),
  ]);
  printStep('Delete', plan.files.filter((f) => f.status === 'delete').map((f) => f.file));
  printStep(
    'Revert',
    plan.edits.filter((e) => e.status !== 'keep').flatMap((edit) =>
      edit.status === 'apply' ? [edit.file, pc.dim(`  ${edit.description}`)] : [pc.yellow(`⚠ ${edit.manual}`)],
    ),
  );
  if (plan.uninstall.length > 0 && !plan.devOnly && podCommand(root, 'darwin')) {
    printStep('Then', [`${POD_INSTALL} ${pc.dim('if a removed package had native code')}`]);
  }

  if (!hasChanges(plan)) {
    console.log(`\nNothing to undo: rn-buddy found nothing from the ${name} recipe it can remove safely.`);
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
  const { native, pods, podsOk, skipped } = applyUndo(project, plan);
  console.log('');
  if (plan.uninstall.length > 0) ok(`Uninstalled ${plan.uninstall.join(', ')}`);
  const deleted = plan.files.filter((f) => f.status === 'delete');
  if (deleted.length > 0) ok(`Deleted ${deleted.map((f) => f.file).join(', ')}`);
  for (const edit of plan.edits.filter((e) => e.status === 'apply' && !skipped.includes(e))) ok(`Reverted ${edit.file}`);
  for (const edit of [...skipped, ...plan.edits.filter((e) => e.status === 'manual')]) {
    warn(`Undo by hand in ${edit.file}: ${edit.description}`);
  }
  printPods(root, native, pods, podsOk);
  if (native.length > 0) {
    const how = plan.expo
      ? `rebuild your development build (${DEV_BUILD})`
      : `rebuild the app (${plan.manager} run android / ${plan.manager} run ios)`;
    console.log(`\n${pc.yellow('[native]')} Native code was removed: ${how}.`);
  }
  if (plan.files.some((f) => f.status === 'delete')) {
    console.log(pc.dim('Remove any imports of the deleted files from your own code.'));
  }
}

async function checkOnline(project, plan) {
  const names = plan.install.map((p) => p.name);
  if (names.length === 0) return [];
  const [manifests, directory] = await Promise.all([Promise.all(names.map(npmLatest)), checkPackages(names)]);
  const latest = Object.fromEntries(names.map((name, i) => [name, manifests[i]]));
  return compatibilityIssues(project, plan, latest, directory);
}
