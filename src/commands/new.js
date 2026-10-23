import pc from 'picocolors';
import { folderProblem, nameProblem, parseChoice, parseRecipes, planNew, runNew } from '../lib/new.js';
import { RECIPES } from '../lib/recipes.js';
import { ask, confirm, ICONS, ok, printStep, warn } from '../lib/ui.js';

// `context` is for tests: the folder to create the app in and a fake `run`.
export async function createApp(name, options = {}, context = {}) {
  const cwd = context.cwd ?? process.cwd();
  const problem = nameProblem(name) ?? folderProblem(cwd, name);
  if (problem) throw new Error(problem);

  // Check --recipes before asking anything, so a typo fails right away.
  const given = options.recipes === undefined ? null : parseRecipes(options.recipes);
  const structure = options.structure !== false;

  console.log(`${pc.bold(`rn-buddy new ${name}`)}  creates a React Native Community CLI app and sets it up`);
  console.log(pc.dim(`→ Prefer Expo? Run npx create-expo-app@latest instead.`));

  const recipes = given ? given.recipes : options.yes ? [] : await askRecipes();
  const plan = planNew({ name, cwd, recipes, structure });

  console.log(`\n${pc.bold('Plan')}`);
  plan.steps.forEach((step, i) => {
    printStep(`${i + 1}.`, [step.title, pc.dim(`$ ${step.display}`)], 4);
  });
  if (!structure) console.log(pc.dim('\nSkipping the src/ folder layout (--no-structure). Add it later with rn-buddy structure.'));

  if (!options.yes) {
    requireTerminal();
    if (!(await confirm(`Create ${name} in ${plan.folder}?`))) {
      console.log('Cancelled. Nothing was created.');
      return;
    }
  }

  const results = runNew(plan, context.run, (step) => {
    console.log(`\n${pc.bold(step.title)}`);
    console.log(pc.dim(`$ ${step.display}`));
  });
  printResults(plan, results);
}

async function askRecipes() {
  requireTerminal();
  const names = Object.keys(RECIPES);
  const width = Math.max(...names.map((recipe) => recipe.length));
  console.log(`\n${pc.bold('Recipes')} ${pc.dim('(you can also add them later with rn-buddy add <recipe>)')}`);
  names.forEach((recipe, i) => {
    console.log(`  ${pc.dim(String(i + 1).padStart(2))}  ${pc.cyan(recipe.padEnd(width))}  ${RECIPES[recipe].summary}`);
  });
  while (true) {
    const answer = await ask(`\nWhich recipes? ${pc.dim('Numbers or names, e.g. 1,3 or all. Enter for none:')} `);
    const chosen = parseChoice(answer, names);
    if (chosen) return chosen;
    warn(`"${answer.trim()}" doesn't match a recipe. Type numbers from 1 to ${names.length}, names, or nothing.`);
  }
}

function requireTerminal() {
  if (!process.stdin.isTTY) {
    throw new Error('Not running in a terminal. Add --yes (and --recipes navigation,state if you want recipes) to create the app without questions.');
  }
}

function printResults(plan, results) {
  console.log('');
  for (const { step, ok: done, error } of results) {
    if (done) ok(step.title);
    else console.log(`${ICONS.fail} ${step.title}${error ? pc.dim(`: ${error}`) : ''}`);
  }

  const created = results[0]?.ok;
  if (!created) {
    console.log(pc.dim('→ The React Native CLI could not create the app. Read its error above, check your setup with'));
    console.log(pc.dim('  https://reactnative.dev/docs/set-up-your-environment, then run this command again.'));
    process.exitCode = 1;
    return;
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(pc.dim(`→ The app was created. Run the failed step${failed.length === 1 ? '' : 's'} again inside ${plan.name}/:`));
    for (const { step } of failed) console.log(`  ${step.display}`);
    process.exitCode = 1;
  }

  console.log(`\n${pc.bold('Next steps')}`);
  const next = [
    [`cd ${plan.name}`, ''],
    ['npm run android', 'build the app and start it on an Android emulator or phone'],
    ['npm run ios', 'on a Mac: build the app and start it on the iOS Simulator'],
    ['rn-buddy env', 'if a build fails: checks Node, Java, the Android SDK, Xcode and CocoaPods'],
    ['rn-buddy learn reload-vs-rebuild', 'when a change needs a new build, and when a reload is enough'],
  ];
  const width = Math.max(...next.map(([command]) => command.length));
  for (const [command, note] of next) console.log(note ? `  ${command.padEnd(width)}  ${pc.dim(note)}` : `  ${command}`);
}
