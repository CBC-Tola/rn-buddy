import path from 'node:path';
import pc from 'picocolors';
import { checkLockfiles, checkTools, detectTools } from '../lib/env.js';
import { readProject } from '../lib/project.js';

const ICONS = { ok: pc.green('✔'), warn: pc.yellow('⚠'), fail: pc.red('✖'), skip: pc.dim('–') };

export function env(options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const { root, pkg } = project;
  const tools = checkTools(project, detectTools(root));
  const lockfiles = checkLockfiles(project);

  const reactNative = pkg.dependencies?.['react-native'];
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (reactNative ? pc.dim(` · React Native ${reactNative}`) : ''));
  console.log(pc.dim(root));

  printSection('Tools', tools);
  printSection('Lockfiles', lockfiles);

  const rows = [...tools, ...lockfiles];
  const count = (status) => rows.filter((row) => row.status === status).length;
  const summary = [
    `${ICONS.ok} ${count('ok')} ok`,
    count('warn') && `${ICONS.warn} ${count('warn')} to check`,
    count('fail') && `${ICONS.fail} ${count('fail')} to fix`,
  ]
    .filter(Boolean)
    .join('  ');
  console.log(`\n${summary}`);

  if (count('fail') > 0) {
    console.log(pc.dim('Fix the ✖ items first: the app will not build until you do.'));
    process.exitCode = 1;
  }
}

function printSection(title, rows) {
  console.log(`\n${pc.bold(title)}`);
  const width = Math.max(...rows.map((row) => row.name.length));
  const versionWidth = Math.max(0, ...rows.map((row) => row.version?.length ?? 0));
  for (const row of rows) {
    const version = versionWidth ? `${(row.version ?? '').padEnd(versionWidth)}  ` : '';
    const message = row.status === 'skip' ? pc.dim(row.message) : row.message;
    console.log(`  ${ICONS[row.status]} ${row.name.padEnd(width)}  ${version}${message}`);
    if (row.hint) console.log(`    ${' '.repeat(width)}  ${pc.dim(`→ ${row.hint}`)}`);
  }
}
