import pc from 'picocolors';
import { RULE_TITLES, runChecks } from '../lib/check.js';
import { readProject } from '../lib/project.js';
import { checkPackages } from '../lib/remote.js';
import { readSources } from '../lib/sources.js';
import { ICONS, printHeader } from '../lib/ui.js';

const LEVEL_ICONS = { fail: ICONS.fail, warn: ICONS.warn, info: pc.cyan('ℹ') };

export async function check(options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const appDeps = project.deps.filter((dep) => !dep.dev).map((dep) => dep.name);
  const directory = options.offline ? {} : await checkPackages(appDeps);
  const sources = readSources(project.root);
  const findings = runChecks(project, { directory, sources });

  printHeader(project);
  printFindings(findings);

  const count = (level) => findings.filter((finding) => finding.level === level).length;
  console.log('');
  if (findings.length === 0) {
    console.log(`${ICONS.ok} No common React Native mistakes found in ${sources.length} file${sources.length === 1 ? '' : 's'}.`);
  } else {
    const summary = [
      count('fail') && `${ICONS.fail} ${count('fail')} to fix`,
      count('warn') && `${ICONS.warn} ${count('warn')} to check`,
      count('info') && `${LEVEL_ICONS.info} ${count('info')} tip${count('info') === 1 ? '' : 's'}`,
    ].filter(Boolean);
    const files = `${sources.length} source file${sources.length === 1 ? '' : 's'} checked`;
    console.log(`${summary.join('  ')}  ${pc.dim(`(${files})`)}`);
  }
  if (options.offline) console.log(pc.dim('Skipped the React Native Directory check of your packages (--offline).'));
  if (sources.length === 0) {
    console.log(pc.dim('No source files found: rn-buddy looks at App.tsx, index.js, src/, app/, components/ and screens/.'));
  }

  if (count('fail') > 0) {
    console.log(pc.dim('Fix the ✖ items first: they crash the app or leak secrets.'));
    process.exitCode = 1;
  }
}

// Grouped by file, with "file:line" so terminals and editors can open the spot.
// Each hint is printed once per file, not on every line a rule matches.
function printFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = finding.file ?? 'Project';
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  for (const [file, list] of groups) {
    console.log(`\n${pc.bold(file)}`);
    const hinted = new Set();
    for (const finding of list) {
      const where = finding.file && finding.line ? `${pc.dim(`${finding.file}:${finding.line}`)}  ` : '';
      console.log(`  ${LEVEL_ICONS[finding.level]} ${where}${finding.message} ${pc.dim(`[${RULE_TITLES[finding.rule] ?? finding.rule}]`)}`);
      if (finding.hint && !hinted.has(finding.hint)) {
        console.log(`    ${pc.dim(`→ ${finding.hint}`)}`);
        hinted.add(finding.hint);
      }
    }
  }
}
