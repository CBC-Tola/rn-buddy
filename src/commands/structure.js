import { existsSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { readProject } from '../lib/project.js';
import { applyStructure, planStructure } from '../lib/structure.js';
import { isTypeScript } from '../lib/templates.js';

export function structure(options = {}) {
  const { root, pkg } = readProject(options.dir ?? process.cwd());
  const dryRun = Boolean(options.dryRun);
  const featureBased = Boolean(options.featureBased);
  const plan = planStructure(root, { featureBased });
  if (!dryRun) applyStructure(root, plan);

  const reactNative = pkg.dependencies?.['react-native'];
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (reactNative ? pc.dim(` · React Native ${reactNative}`) : ''));
  console.log(pc.dim(root));

  const language = isTypeScript(root) ? 'TypeScript' : 'JavaScript';
  const preset = featureBased ? 'feature-based, ' : '';
  console.log(`\n${pc.bold('Folder layout')} ${pc.dim(`(${preset}${language} examples)`)}`);
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
    // An older type-based src/README.md is kept, so point to the feature-based rules instead.
    const start = featureBased && plan[0].exists ? 'src/features/README.md' : 'src/README.md';
    console.log(pc.dim(`Start with ${start}: it shows which folder imports which.`));
  }

  if (featureBased) printFeatureNotes(root, plan);

  const app = ['App.tsx', 'App.js'].find((file) => existsSync(path.join(root, file)));
  if (app && !dryRun) {
    console.log(pc.dim(`Tip: you can move ${app} to src/${app} and import it in index.js with './src/App'.`));
  }
}

// Feature-based on top of an existing type-based src/: both can live together while code moves,
// but the old src/README.md (kept as is) still describes the type-based layout.
function printFeatureNotes(root, plan) {
  const typeBased = ['screens', 'hooks', 'store'].filter((folder) => existsSync(path.join(root, 'src', folder)));
  if (typeBased.length > 0) {
    console.log(
      pc.dim(
        `src/ already has type-based folders (${typeBased.map((f) => `${f}/`).join(', ')}). They can stay while you move code into features/, one feature at a time.`,
      ),
    );
  }
  if (plan[0].exists) {
    console.log(pc.dim('src/README.md was kept as is, so it may still describe the type-based layout.'));
  }
}
