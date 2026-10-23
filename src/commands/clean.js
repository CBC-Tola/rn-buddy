import pc from 'picocolors';
import { formatCommand } from '../lib/add.js';
import {
  applyClean,
  hasWork,
  nextSteps,
  parseChoice,
  planClean,
  runCommand,
  TARGETS,
  targetsFromOptions,
  totalSize,
} from '../lib/clean.js';
import { packageManager, readProject } from '../lib/project.js';
import { ask, confirm, formatBytes, ok, printHeader, printStep } from '../lib/ui.js';

const FLAGS = '--metro, --watchman, --android, --ios, --pods, --deps or --all';

export async function clean(options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  let targets = targetsFromOptions(options);
  if (targets.length === 0 && !process.stdin.isTTY) {
    throw new Error(`Choose what to clean: ${FLAGS}. Add --dry-run to see what would be deleted first.`);
  }

  printHeader(project);
  if (targets.length === 0) {
    targets = await chooseTargets(project, options);
    if (targets.length === 0) {
      console.log('Nothing chosen. Nothing was deleted.');
      return;
    }
  }

  const plan = planClean(project, targets, { lockfiles: options.lockfiles });
  printPlan(project, plan);
  if (!hasWork(plan)) {
    console.log('\nNothing to clean.');
    return;
  }
  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was deleted.'));
    return;
  }
  const lockfiles = plan.deletions.some((item) => item.lockfile && item.exists);
  if (!options.yes && !(await confirm(lockfiles ? 'Delete these, including the lockfiles?' : 'Delete these?'))) {
    console.log('Cancelled. Nothing was deleted.');
    return;
  }

  console.log('');
  const result = applyClean(project, plan, { run: showCommand(project.root) });
  printResult(project, plan, result);
}

// The numbered menu from `rn-buddy clean` without flags.
async function chooseTargets(project, options) {
  console.log(`\n${pc.bold('What do you want to clean?')}\n`);
  const labelWidth = Math.max(...TARGETS.map((target) => target.label.length));
  const manager = packageManager(project.root, project.pkg);
  const what = (target) => (target.key === 'deps' ? `delete, then reinstall with ${manager}` : target.what);
  const whatWidth = Math.max(...TARGETS.map((target) => what(target).length));
  TARGETS.forEach((target, i) => {
    const plan = planClean(project, [target.key], { lockfiles: options.lockfiles });
    const size = !hasWork(plan) ? pc.dim('nothing to clean') : totalSize(plan) > 0 ? formatBytes(totalSize(plan)) : '';
    console.log(`  ${pc.cyan(String(i + 1))} ${target.label.padEnd(labelWidth)}  ${what(target).padEnd(whatWidth)}  ${size}`);
    console.log(`    ${' '.repeat(labelWidth)}  ${pc.dim(`fixes: ${target.fixes}`)}`);
  });
  console.log(`  ${pc.cyan('a')} All of the above\n`);
  return parseChoice(await ask(`Choose (1-${TARGETS.length}, a): `));
}

function printPlan({ root }, plan) {
  console.log(`\n${pc.bold(`clean ${plan.targets.join(', ')}`)}\n`);
  const present = plan.deletions.filter((item) => item.exists);
  const width = Math.max(0, ...plan.deletions.map((item) => item.display.length));
  const line = (item) => `${item.display.padEnd(width)}  ${formatBytes(item.size)}`;

  printStep('Delete', present.filter((item) => !item.lockfile).map(line));
  printStep(
    'Lockfile',
    present
      .filter((item) => item.lockfile)
      .flatMap((item) => [pc.yellow(`${line(item)}  ⚠ usually a bad idea`), pc.dim(item.warning)]),
  );
  printStep(
    'Skip',
    plan.deletions.filter((item) => !item.exists).map((item) => `${item.display.padEnd(width)}  ${pc.dim('nothing to clean')}`),
  );
  printStep('Then', plan.commands.map((step) => pc.dim(`$ ${formatCommand(step, root)}`)));
  printStep('Note', plan.notes.map((note) => pc.dim(note)));
  if (present.length > 0) printStep('Total', [pc.bold(formatBytes(totalSize(plan)))]);
}

function printResult(project, plan, { removed, failed, steps }) {
  const { root } = project;
  console.log('');
  if (removed.length > 0) {
    const freed = removed.reduce((sum, item) => sum + item.size, 0);
    ok(`Deleted ${removed.map((item) => item.display).join(', ')} ${pc.dim(`(${formatBytes(freed)} freed)`)}`);
  }
  for (const { item, error } of failed) {
    console.log(pc.red(`✖ Could not delete ${item.display}: ${error}`));
  }

  for (const step of steps) {
    const command = formatCommand(step, root);
    if (step.ok) ok(`Ran ${command}`);
    else if (step.ok === null) console.log(pc.dim(`– Skipped ${command} because the step before it failed`));
    else if (step.optional) console.log(pc.yellow(`⚠ ${command} failed. Not a problem: Metro works without Watchman.`));
    else console.log(pc.red(`✖ ${command} failed. Run rn-buddy env to check your setup, then run it again by hand.`));
  }

  const failedStep = steps.some((step) => step.ok === false && !step.optional);
  if (failed.length > 0 || failedStep) process.exitCode = 1;

  const next = nextSteps(project, plan.targets);
  if (next.length > 0 && !failedStep) {
    console.log(`\n${pc.bold('Next')}`);
    for (const text of next) console.log(`  ${pc.dim('→')} ${text}`);
  }
}

// Shows each command before running it, so learners can run it by hand next time.
function showCommand(root) {
  return (command, args, cwd, options = {}) => {
    if (!options.quiet) console.log(pc.dim(`$ ${formatCommand({ command, args, cwd }, root)}`));
    return runCommand(command, args, cwd, options);
  };
}
