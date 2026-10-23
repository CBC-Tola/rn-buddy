import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { formatCommand } from '../lib/add.js';
import {
  applyFixes,
  detectToolchain,
  detectTools,
  envJson,
  envReport,
  envSections,
  planFixes,
  shortenHome,
} from '../lib/env.js';
import { readProject } from '../lib/project.js';
import { confirm, printHeader, printRows, printStep, summarize } from '../lib/ui.js';

export async function env(options = {}) {
  if (options.fix && (options.json || options.report)) {
    throw new Error('--fix prints its own output: run it without --json or --report.');
  }
  const project = readProject(options.dir ?? process.cwd());
  let { tools, sections } = await check(project, { report: options.report });

  if (options.json) {
    console.log(JSON.stringify(envJson(project, sections), null, 2));
  } else if (options.report) {
    console.log(envReport(project, tools, sections));
  } else {
    printHeader(project);
    printSections(sections);
    if (options.fix) ({ sections } = await fix(project, tools, sections, options));
  }

  if (rowsOf(sections).some((row) => row.status === 'fail')) {
    if (!options.json && !options.report) {
      console.log(pc.dim('Fix the ✖ items first: the app will not build until you do.'));
    }
    process.exitCode = 1;
  }
}

async function check(project, { report = false } = {}) {
  const installed = detectTools(project.root);
  const tools = { ...installed, ...(await detectToolchain(project, installed, { report })) };
  return { tools, sections: envSections(project, tools) };
}

function printSections(sections) {
  for (const [title, rows] of sections) printRows(title, rows);
  console.log(`\n${summarize(rowsOf(sections))}`);
}

// Plan, confirm, apply, then check again so the learner sees what changed.
async function fix(project, tools, sections, options) {
  const { root } = project;
  const plan = planFixes(project, rowsOf(sections), tools);
  if (plan.length === 0) {
    const left = rowsOf(sections).some((row) => row.status === 'fail' || row.status === 'warn');
    console.log(`\n${left ? 'Nothing rn-buddy can fix by itself: follow the → hints above.' : 'Nothing to fix.'}`);
    return { sections };
  }

  console.log(`\n${pc.bold('Fix plan')}`);
  for (const step of plan) {
    if (step.kind === 'write') {
      const file = path.relative(root, step.file);
      printStep(step.exists ? 'Update' : 'Create', [`${file}  ${pc.dim(shortenHome(step.line, os.homedir()))}`]);
    } else {
      printStep('Run', [formatCommand(step, root)]);
    }
  }

  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was changed.'));
    return { sections };
  }
  if (!options.yes && !(await confirm('Apply these fixes?'))) {
    console.log('Cancelled. Nothing was changed.');
    return { sections };
  }

  console.log('');
  const describe = (step) =>
    step.kind === 'write' ? `Writing ${path.relative(root, step.file)}` : `$ ${formatCommand(step, root)}`;
  const results = applyFixes(plan, { onStep: (step) => console.log(pc.cyan(describe(step))) });
  const failed = results.find((result) => !result.ok);
  if (failed) {
    console.log(pc.red(`✖ ${describe(failed.step)} failed. Fix the error above, then run rn-buddy env --fix again.`));
  }

  console.log(`\n${pc.bold('After the fixes')}`);
  const after = await check(project);
  printSections(after.sections);
  return after;
}

function rowsOf(sections) {
  return sections.flatMap(([, rows]) => rows);
}
