import { existsSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { readProject } from '../lib/project.js';
import { applyStructure, planStructure } from '../lib/structure.js';
import { isTypeScript } from '../lib/templates.js';

export function structure(options = {}) {
  const { root, pkg } = readProject(options.dir ?? process.cwd());
  const dryRun = Boolean(options.dryRun);
  const plan = planStructure(root);
  if (!dryRun) applyStructure(root, plan);

  const reactNative = pkg.dependencies?.['react-native'];
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (reactNative ? pc.dim(` · React Native ${reactNative}`) : ''));
  console.log(pc.dim(root));

  const language = isTypeScript(root) ? 'TypeScript' : 'JavaScript';
  console.log(`\n${pc.bold('Folder layout')} ${pc.dim(`(${language} examples)`)}`);
  const width = Math.max(...plan.map((item) => item.file.length));
  for (const item of plan) {
    const icon = item.exists ? pc.dim('–') : pc.green('+');
    const note = item.exists ? pc.dim('already exists, kept as is') : item.summary;
    console.log(`  ${icon} ${item.file.padEnd(width)}  ${note}`);
  }

  const created = plan.filter((item) => !item.exists).length;
  console.log('');
  if (created === 0) {
    console.log('Nothing to do: every folder already has a README.');
  } else if (dryRun) {
    console.log(`Would create ${created} README${created === 1 ? '' : 's'}. Run again without --dry-run to create them.`);
  } else {
    console.log(`Created ${created} README${created === 1 ? '' : 's'}. Existing files were not changed.`);
    console.log(pc.dim('Start with src/README.md: it shows which folder imports which.'));
  }

  const app = ['App.tsx', 'App.js'].find((file) => existsSync(path.join(root, file)));
  if (app && !dryRun) {
    console.log(pc.dim(`Tip: you can move ${app} to src/${app} and import it in index.js with './src/App'.`));
  }
}
