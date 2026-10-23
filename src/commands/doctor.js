import pc from 'picocolors';
import { checkRows, runChecks } from '../lib/check.js';
import { detectToolchain, detectTools, envSections } from '../lib/env.js';
import { readProject } from '../lib/project.js';
import { checkPackages } from '../lib/remote.js';
import { statusRows } from '../lib/status.js';
import { printHeader, printRows, summarize } from '../lib/ui.js';

// One command for "is everything OK?": the machine (env), the build state (status)
// and the code (check), with one summary at the end.
export async function doctor(options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const appDeps = project.deps.filter((dep) => !dep.dev).map((dep) => dep.name);
  const directory = options.offline ? {} : await checkPackages(appDeps);

  const installed = detectTools(project.root);
  const tools = { ...installed, ...(await detectToolchain(project, installed)) };
  const setup = envSections(project, tools);
  // env and status both compare Podfile.lock with the installed pods: show that problem once.
  const podsReported = setup.some(([, rows]) => rows.some((row) => row.name === 'ios/Podfile.lock' && row.status !== 'ok'));
  const sections = [
    ...setup,
    ['Build', statusRows(project).filter((row) => !(podsReported && row.name === 'iOS pods'))],
    ['Code', checkRows(runChecks(project, { directory }))],
  ];

  printHeader(project);
  for (const [title, rows] of sections) printRows(title, rows);

  const rows = sections.flatMap(([, sectionRows]) => sectionRows);
  console.log(`\n${summarize(rows)}`);
  console.log(pc.dim('Details: rn-buddy env, rn-buddy status and rn-buddy check. Stuck on an error? rn-buddy why "<error>"'));
  if (rows.some((row) => row.status === 'fail')) process.exitCode = 1;
}
