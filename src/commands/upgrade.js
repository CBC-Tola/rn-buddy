import pc from 'picocolors';
import { formatCommand, podCommand } from '../lib/add.js';
import { formatHunk } from '../lib/diff.js';
import { isExpo, readProject } from '../lib/project.js';
import { ICONS, confirm, ok, printHeader, printStep, warn } from '../lib/ui.js';
import {
  BLOG,
  applyExpo,
  applyUpgrade,
  createFetcher,
  installCommand,
  planExpo,
  planUpgrade,
} from '../lib/upgrade.js';

const WIDTH = 13;
const MAX_HUNK_LINES = 60;

// `options.fetcher` and `options.run` are for tests: the network and the commands that get run.
export async function upgrade(version, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const fetcher = options.fetcher ?? createFetcher();
  printHeader(project);

  if (isExpo(project.pkg)) {
    await upgradeExpo(project, version, options, fetcher);
    return;
  }

  const plan = await planUpgrade(project, version, { fetcher });
  if (plan.upToDate) {
    console.log('');
    ok(`React Native ${plan.to} is the ${version ? 'version you asked for' : 'latest version'}: already up to date.`);
    return;
  }

  console.log(`\n${pc.bold(`React Native ${plan.from} → ${plan.to}`)}`);
  if (plan.advice) printAdvice(plan);
  console.log('');
  printPlan(project, plan);

  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was changed.'));
    return;
  }
  if (!options.yes && !(await confirm())) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  console.log('');
  const result = applyUpgrade(project, plan, options.run ? { run: options.run } : {});
  printResult(project, plan, result);
}

function printAdvice({ from, to, advice }) {
  const minor = (version) => version.split('.').slice(0, 2).join('.');
  console.log('');
  warn(`${minor(from)} → ${minor(to)} jumps ${advice.minors} minor versions. Upgrading one at a time is safer.`);
  console.log(pc.dim(`  → rn-buddy upgrade ${minor(advice.next)} first, then the next one. Or go on to do the whole jump now.`));
}

function printPlan({ root }, plan) {
  printStep('Packages', packageLines(plan), WIDTH);
  if (plan.removed.length > 0) {
    printStep('', [pc.dim(`no longer in the template: ${plan.removed.join(', ')} (remove if you don't use them)`)], WIDTH);
  }
  printStep('Libraries', libraryLines(plan.libraries), WIDTH);
  printStep('Files', fileLines(plan), WIDTH);

  const then = [`$ ${formatCommand(installCommand(plan.manager), root)}`];
  const pods = podCommand(root, 'darwin');
  if (pods) then.push(`$ ${formatCommand(pods, root)}${process.platform === 'darwin' ? '' : pc.dim(' (on a Mac)')}`);
  then.push(`rebuild both apps: ${plan.manager} run android, ${plan.manager} run ios ${pc.dim('(reload is not enough)')}`);
  then.push(`rn-buddy clean --all ${pc.dim('if the build fails with old caches')}`);
  printStep('Then', then, WIDTH);

  console.log('');
  printStep('Changes', [`${BLOG} ${pc.dim(`(the ${minorOf(plan.to)} release post lists the breaking changes)`)}`], WIDTH);
  printStep('Full diff', [plan.helper], WIDTH);
}

function packageLines({ packages, engines }) {
  if (packages.length === 0 && !engines) return [pc.dim('nothing to change in package.json')];
  // @react-native/* packages all move together: one line for them.
  const scoped = packages.filter((p) => p.name.startsWith('@react-native/') && p.from !== null);
  const grouped = scoped.length > 1 && scoped.every((p) => p.from === scoped[0].from && p.to === scoped[0].to);
  const lines = [];
  for (const p of packages) {
    if (grouped && scoped.includes(p)) {
      if (p === scoped[0]) lines.push(`@react-native/* ${p.from} → ${p.to}`);
      continue;
    }
    lines.push(p.from === null ? `${p.name} ${p.to} ${pc.dim('(new in the template)')}` : `${p.name} ${p.from} → ${p.to}`);
  }
  if (engines) lines.push(`Node version (engines) ${engines.from} → ${engines.to}`);
  return lines;
}

function libraryLines(rows) {
  if (rows.length === 0) return [pc.dim('no native libraries to check')];
  const width = Math.max(...rows.map((row) => row.name.length));
  return rows.flatMap((row) => [
    `${ICONS[row.status]} ${row.name.padEnd(width)}  ${row.message}`,
    ...(row.hint ? [pc.dim(`  ${' '.repeat(width)}  → ${row.hint}`)] : []),
  ]);
}

function fileLines(plan) {
  if (plan.diffMissing) {
    return [pc.yellow(`⚠ no template diff for ${plan.from} → ${plan.to} yet: compare the native files with the link below`)];
  }
  if (plan.files.length === 0) return [pc.dim('no native or config file changes in the template')];
  const width = Math.min(48, Math.max(...plan.files.map((file) => file.file.length)));
  return plan.files.map((file) => `${file.file.padEnd(width)}  ${fileStatus(file)}`);
}

function fileStatus(file) {
  const note = file.note ? pc.dim(file.note) : '';
  if (file.status === 'apply') {
    if (file.action === 'delete') return pc.dim(`delete: ${file.note}`);
    if (file.action === 'rename') return pc.dim(`moved from ${file.from}${file.note ? `: ${file.note}` : ''}`);
    return note || pc.dim(file.action === 'create' ? 'new file' : 'update');
  }
  if (file.status === 'done') return pc.dim('already up to date');
  if (file.status === 'skip') return pc.dim(`– skipped: ${file.reason}`);
  return `${note ? `${note}  ` : ''}${pc.yellow(`(${file.reason})`)}`;
}

function printResult({ root }, plan, { written, installOk, pods, podsOk }) {
  if (written.length > 0) ok(`Updated ${written.length} file${written.length === 1 ? '' : 's'}: ${written.join(', ')}`);
  const install = formatCommand(installCommand(plan.manager), root);
  if (!installOk) {
    console.log(pc.red(`✖ \`${install}\` failed. Fix the error above, then run it again by hand.`));
    process.exitCode = 1;
  } else {
    ok(`Installed the packages (${install})`);
    if (podsOk) ok('Installed the iOS pods');
    else if (pods) warn(`pod install failed. Run rn-buddy env to find out why, then ${formatCommand(pods, root)}`);
    else if (podCommand(root, 'darwin')) {
      console.log(pc.dim(`On a Mac, run ${formatCommand(podCommand(root, 'darwin'), root)} before building for iOS.`));
    }
  }

  printManual(plan);

  console.log(`\n${pc.bold('Next steps')}`);
  const steps = [
    plan.files.some((file) => file.status === 'manual') && 'Make the changes above by hand.',
    `Rebuild both apps: ${pc.bold(`${plan.manager} run android`)} and ${pc.bold(`${plan.manager} run ios`)}. Reloading is not enough.`,
    `If the build fails with strange cache errors: ${pc.bold('rn-buddy clean --all')}, then rebuild.`,
    `Read the breaking changes in the ${minorOf(plan.to)} release post: ${BLOG}`,
    plan.libraries.some((row) => row.status === 'warn') && 'Check the ⚠ libraries above before you ship.',
  ].filter(Boolean);
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
  console.log(pc.dim(`\nThe whole template diff: ${plan.helper}`));
}

// The changes rn-buddy couldn't make, with the template's hunks so they can be done by hand.
function printManual(plan) {
  const manual = plan.files.filter((file) => file.status === 'manual');
  if (manual.length === 0) return;
  console.log(`\n${pc.bold('Do by hand')}`);
  for (const file of manual) {
    console.log(`\n  ${pc.bold(file.file)}  ${pc.yellow(file.reason)}`);
    if (file.note) console.log(pc.dim(`  → ${file.note}`));
    const lines = file.hunks.flatMap(formatHunk);
    for (const line of lines.slice(0, MAX_HUNK_LINES)) console.log(`    ${colorLine(line)}`);
    if (lines.length > MAX_HUNK_LINES) {
      console.log(pc.dim(`    … ${lines.length - MAX_HUNK_LINES} more lines: see ${plan.helper}`));
    }
  }
}

function colorLine(line) {
  if (line.startsWith('@@')) return pc.cyan(line);
  if (line.startsWith('+')) return pc.green(line);
  if (line.startsWith('-')) return pc.red(line);
  return pc.dim(line);
}

function minorOf(version) {
  return version.split('.').slice(0, 2).join('.');
}

async function upgradeExpo(project, version, options, fetcher) {
  const { root } = project;
  const plan = await planExpo(project, version, { fetcher });
  if (plan.upToDate) {
    console.log('');
    ok(`Expo ${plan.to} is the ${version ? 'version you asked for' : 'latest version'}: already up to date.`);
    return;
  }

  const sdk = plan.fromSdk && plan.fromSdk !== plan.toSdk ? `Expo SDK ${plan.fromSdk} → ${plan.toSdk}` : `Expo SDK ${plan.toSdk}`;
  console.log(`\n${pc.bold(sdk)} ${pc.dim(`(expo ${plan.from ?? '?'} → ${plan.to})`)}`);
  if (plan.advice) {
    console.log('');
    warn(`This jumps ${plan.advice.sdks} SDK versions. Upgrading one SDK at a time is safer.`);
    console.log(pc.dim(`  → rn-buddy upgrade ${plan.advice.next} first, then the next one. Or go on to do the whole jump now.`));
  }
  console.log('');
  printStep('Run', plan.commands.map((step) => `$ ${formatCommand(step, root)}`), WIDTH);
  printStep('', [pc.dim('expo install picks the react-native and library versions that match the SDK')], WIDTH);
  printStep('Then', expoNextSteps(plan), WIDTH);
  console.log('');
  printStep('Changes', [`${plan.changelog} ${pc.dim(`(the SDK ${plan.toSdk} post lists the breaking changes)`)}`], WIDTH);

  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was changed.'));
    return;
  }
  if (!options.yes && !(await confirm('Run these commands?'))) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  console.log('');
  const result = applyExpo(project, plan, options.run ? { run: options.run } : {});
  for (const step of result.done) ok(`$ ${formatCommand(step, root)}`);
  if (result.failed) {
    console.log(pc.red(`✖ \`${formatCommand(result.failed, root)}\` failed. Fix the error above, then run it again by hand.`));
    process.exitCode = 1;
    return;
  }
  console.log(`\n${pc.bold('Next steps')}`);
  expoNextSteps(plan).forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}

function expoNextSteps(plan) {
  const steps = [];
  if (plan.prebuild.length > 0) {
    steps.push(
      `${plan.prebuild.map((dir) => `${dir}/`).join(' and ')} exist: regenerate them with ${pc.bold('npx expo prebuild --clean')}`,
      pc.yellow('⚠ it overwrites changes you made by hand in those folders: move them to config plugins first'),
    );
  }
  steps.push(
    `Make a new development build (${pc.bold('npx expo run:android')} / ${pc.bold('npx expo run:ios')} or EAS Build); in Expo Go, update the Expo Go app`,
  );
  return steps;
}
