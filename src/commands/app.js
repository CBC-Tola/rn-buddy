import { existsSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { formatCommand } from '../lib/add.js';
import {
  appSummary,
  applyAppPlan,
  hasChanges,
  planIcon,
  planId,
  planName,
  planSplash,
  planVersion,
  readAppInfo,
} from '../lib/app.js';
import { readProject } from '../lib/project.js';
import { confirm, ok, printHeader, printMarkdown, printStep, warn } from '../lib/ui.js';

const ACTIONS = {
  name: (project, value) => planName(project, value),
  id: (project, value) => planId(project, value),
  version: (project, value) => planVersion(project, value),
  // Images are relative to where you run the command, not to --dir.
  icon: (project, value) => planIcon(project, value),
  splash: (project, value, options) => planSplash(project, value, options.bg ?? '#ffffff'),
};

export async function app(action, value, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  printHeader(project);
  if (!action) {
    show(project);
    return;
  }
  if (!ACTIONS[action]) {
    throw new Error(`Unknown action "${action}". Use name, id, icon, splash or version, or leave it out to see the current values.`);
  }

  const plan = ACTIONS[action](project, value, options);
  printPlan(project.root, plan);

  if (!hasChanges(plan)) {
    console.log(`\nNothing to change${plan.manual.length ? ' automatically: see the steps to do by hand above' : ': it is already set'}.`);
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
  const { failed } = applyAppPlan(project.root, plan);
  printResult(project.root, plan, failed);
}

function show({ root, pkg }) {
  const info = readAppInfo(root, pkg);
  const { rows, notes, source } = appSummary(info);
  console.log('');
  if (rows.length === 0 && notes.length === 0) {
    warn('No android/ or ios/ folder and no Expo app.json found, so there is nothing to show.');
    return;
  }
  if (rows.length > 0) {
    const cell = (text) => text ?? '—';
    const left = Math.max('Android'.length, ...rows.map((r) => cell(r.android).length));
    const right = Math.max('iOS'.length, ...rows.map((r) => cell(r.ios).length));
    if (source) console.log(pc.dim(`From ${source}`));
    console.log(`  ${''.padEnd(9)} ${pc.bold('Android'.padEnd(left))}  ${pc.bold('iOS')}`);
    for (const row of rows) {
      const flag = row.differs ? `  ${pc.yellow('⚠ different')}` : '';
      const color = row.differs ? pc.yellow : (text) => text;
      const iosCell = row.differs ? cell(row.ios).padEnd(right) : cell(row.ios);
      console.log(`  ${pc.dim(row.label.padEnd(9))} ${color(cell(row.android).padEnd(left))}  ${color(iosCell)}${flag}`);
    }
  }
  if (notes.length > 0) console.log('');
  for (const note of notes) console.log(pc.dim(`→ ${note}`));

  console.log(`\n${pc.bold('Change them')}`);
  const commands = [
    ['rn-buddy app name "My App"', 'the name under the icon, on both platforms'],
    ['rn-buddy app id com.yourname.app', 'the bundle ID / applicationId'],
    ['rn-buddy app version patch', 'version +0.0.1 and build numbers +1 (or major, minor, 1.2.0)'],
    ['rn-buddy app icon ./icon.png', 'every icon size from one 1024×1024 PNG'],
    ['rn-buddy app splash ./logo.png', 'a splash screen with your logo (--bg "#ffffff")'],
  ];
  for (const [command, why] of commands) console.log(`  ${pc.cyan(command.padEnd(34))}${pc.dim(why)}`);
}

function printPlan(root, plan) {
  console.log(`\n${pc.bold(plan.title)}\n`);

  for (const edit of plan.edits) {
    if (edit.status === 'done') {
      printStep('Keep', [`${edit.file} ${pc.dim('already set')}`]);
      continue;
    }
    const width = Math.max(...edit.changes.map((change) => change.label.length));
    printStep('Edit', [
      edit.file,
      ...edit.changes.map((c) => `  ${pc.dim(c.label.padEnd(width))}  ${c.before} → ${pc.green(c.after)}`),
    ]);
  }
  printStep(
    'Move',
    plan.moves.flatMap((move) => [move.from, pc.dim(`  → ${move.to}  (package line updated)`)]),
  );
  printStep(
    'Copy',
    plan.copies.map((copy) => {
      const replaces = existsSync(path.join(root, copy.to)) ? pc.yellow('  replaces the file there') : '';
      return `${copy.from} → ${copy.to}${replaces}`;
    }),
  );
  printStep('Resize', resizeLines(plan.resizes));
  printStep('Remove', plan.removes.map((file) => `${file} ${pc.dim('(replaced by the new PNG)')}`));
  printStep('Run', plan.commands.map((step) => `$ ${formatCommand(step, root)}`));
  printStep('By hand', plan.manual.map((text) => pc.yellow(`⚠ ${text}`)));
  printStep('Then', plan.then);

  if (plan.warnings.length > 0) console.log('');
  for (const text of plan.warnings) warn(text);
  if (plan.notes.length > 0) console.log('');
  for (const text of plan.notes) console.log(pc.dim(`→ ${text}`));
}

// One line per folder: "android/.../mipmap-hdpi/  ic_launcher.png, ic_launcher_round.png  72×72".
function resizeLines(resizes) {
  const folders = new Map();
  for (const { file, size } of resizes) {
    const key = `${path.dirname(file)}/\n${size}`;
    folders.set(key, [...(folders.get(key) ?? []), path.basename(file)]);
  }
  const width = Math.max(0, ...[...folders.keys()].map((key) => key.split('\n')[0].length));
  return [...folders].map(([key, names]) => {
    const [folder, size] = key.split('\n');
    return `${folder.padEnd(width)}  ${names.join(', ')}  ${pc.dim(`${size}×${size}`)}`;
  });
}

function printResult(root, plan, failed) {
  if (plan.commands.length > 0) console.log('');
  for (const copy of plan.copies) ok(`Copied the image to ${copy.to}`);
  for (const edit of plan.edits.filter((e) => e.status === 'apply')) ok(`Edited ${edit.file}`);
  if (plan.moves.length > 0) ok(`Moved ${plan.moves.map((m) => path.basename(m.from)).join(', ')} to ${path.dirname(plan.moves[0].to)}`);
  if (plan.resizes.length > 0) ok(`Made ${plan.resizes.length} icon ${plan.resizes.length === 1 ? 'file' : 'files'}`);
  for (const file of plan.removes) ok(`Removed ${file}`);
  for (const step of failed) {
    console.log(pc.yellow(`⚠ \`${formatCommand(step, root)}\` failed. Run rn-buddy env to find out why, then run it again.`));
  }
  for (const text of plan.manual) console.log(pc.yellow(`⚠ Do this by hand: ${text}`));

  if (plan.next) {
    console.log(`\n${pc.bold('Next steps')}`);
    printMarkdown(plan.next);
  } else if (plan.then.length > 0) {
    console.log(`\n${pc.bold('Next')}`);
    for (const text of plan.then) console.log(`  ${text}`);
  }
}
