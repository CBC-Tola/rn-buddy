import pc from 'picocolors';
import { readFingerprint, saveFingerprint } from '../lib/fingerprint.js';
import { readProject } from '../lib/project.js';
import { shouldSaveFingerprint, statusRows } from '../lib/status.js';
import { ICONS, ok, printHeader, printRows } from '../lib/ui.js';

export function status(options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const rows = statusRows(project);

  printHeader(project);
  printRows('Since the last build', rows);

  console.log('');
  const builds = rows.filter((row) => /build$/.test(row.name) && row.status !== 'skip');
  if (rows.some((row) => row.status === 'warn' || row.status === 'fail')) {
    console.log(`${ICONS.ok} JS changes only otherwise: reload with r in Metro`);
  } else if (builds.length === 0 && rows.some((row) => row.never)) {
    console.log(pc.dim('Build the app once, then rn-buddy status can tell you when a rebuild is needed.'));
  } else {
    ok('JS changes only: reload with r in Metro, no rebuild needed');
  }
  console.log(pc.dim('Reload or rebuild? rn-buddy learn reload-vs-rebuild explains the difference.'));

  // Remember the native packages of the last build, so the next run can tell what changed.
  const first = !readFingerprint(project.root);
  if (shouldSaveFingerprint(project) && saveFingerprint(project.root) && first) {
    console.log(pc.dim('Saved the list of native packages in node_modules/.cache/rn-buddy to spot changes next time.'));
  }
  if (rows.some((row) => row.status === 'fail')) process.exitCode = 1;
}
