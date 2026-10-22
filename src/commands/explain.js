import { readdirSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { categories, lookupFile, lookupPackage } from '../lib/notes.js';
import { hasNativeCode, hasNodeModules, readProject } from '../lib/project.js';
import { checkPackages, describeOnline, directoryInfo, npmDescription } from '../lib/remote.js';

const HIDDEN_FILES = new Set(['.git', '.DS_Store']);
const MAX_NAME_WIDTH = 46;
const POD_INSTALL = '(cd ios && bundle exec pod install)';

export async function explain(name, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  if (name) {
    await explainPackage(project, name, options);
  } else {
    await explainProject(project, options);
  }
}

async function explainProject({ root, pkg, deps }, { offline = false }) {
  const appDeps = deps.filter((dep) => !dep.dev).map((dep) => dep.name);
  const [status, rows] = await Promise.all([
    offline ? {} : checkPackages(appDeps),
    Promise.all(
      deps.map(async (dep) => {
        const known = lookupPackage(dep.name);
        const online = !known && !offline ? await describeOnline(dep.name) : null;
        return {
          ...dep,
          category: known?.category ?? 'Other',
          note: known?.note ?? online?.note ?? null,
          source: online?.source ?? null,
          native: hasNativeCode(root, dep.name),
        };
      }),
    ),
  ]);
  for (const row of rows) row.unmaintained = Boolean(status[row.name]?.unmaintained);

  const reactNative = pkg.dependencies?.['react-native'];
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (reactNative ? pc.dim(` · React Native ${reactNative}`) : ''));
  console.log(pc.dim(root));

  console.log(`\n${pc.bold('Packages')}`);
  const width = columnWidth(rows.map((row) => row.name));
  for (const category of categories) {
    const group = rows.filter((row) => row.category === category);
    if (group.length === 0) continue;

    console.log(pc.cyan(category));
    for (const row of group) {
      const note = row.note ? row.note + (row.source ? pc.dim(` (${row.source})`) : '') : pc.dim('No description found');
      const tags = [
        row.unmaintained && pc.red('[unmaintained]'),
        row.native && pc.yellow('[native]'),
        row.dev && pc.dim('[dev]'),
      ]
        .filter(Boolean)
        .join(' ');
      console.log(`  ${row.name.padEnd(width)}  ${note}${tags ? `  ${tags}` : ''}`);
    }
  }

  console.log(`\n${pc.bold('Files')}`);
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => !HIDDEN_FILES.has(entry.name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort((a, b) => a.localeCompare(b));
  const fileWidth = columnWidth(entries);
  for (const entry of entries) {
    const note = lookupFile(entry.replace(/\/$/, '')) ?? pc.dim('—');
    console.log(`  ${entry.padEnd(fileWidth)}  ${note}`);
  }

  console.log('');
  if (rows.some((row) => row.unmaintained)) {
    console.log(`${pc.red('[unmaintained]')} React Native Directory marks it unmaintained: look for an alternative.`);
  }
  if (rows.some((row) => row.native)) {
    console.log(`${pc.yellow('[native]')} has iOS/Android code: after installing one, run ${pc.bold(POD_INSTALL)} and rebuild the app.`);
  }
  if (!hasNodeModules(root)) {
    console.log(pc.yellow('node_modules not found. Run `npm install` so rn-buddy can detect native packages.'));
  }
  console.log(pc.dim('Tip: rn-buddy explain <package> shows details for one package.'));
}

async function explainPackage({ root, deps }, name, { offline = false }) {
  const dep = deps.find((d) => d.name === name);
  const known = lookupPackage(name);
  const [lib, npmDesc, status] = offline
    ? [null, null, {}]
    : await Promise.all([directoryInfo(name), npmDescription(name), checkPackages([name])]);
  const check = status[name];
  const description = lib?.description ?? npmDesc;
  const native = hasNativeCode(root, name) ?? lib?.hasNativeCode ?? null;

  const usage = dep ? `${dep.version} · ${dep.dev ? 'devDependency' : 'dependency'}` : 'not in this project';
  console.log(`${pc.bold(name)}  ${pc.dim(usage)}\n`);

  line('What it is', known?.note ?? description ?? pc.dim('No description found'));
  if (known && description) line('Description', description);
  line('Category', known?.category ?? 'Other');

  if (native === true) line('Native code', `yes. After installing, run ${POD_INSTALL} and rebuild the app`);
  if (native === false) line('Native code', 'no, plain JavaScript (no rebuild needed)');

  if (check) {
    const newArch = check.newArchitecture;
    line('New Arch', newArch === 'supported' ? pc.green('supported') : pc.yellow(newArch ?? 'not confirmed'));
  }
  if (check?.unmaintained || lib?.unmaintained) {
    line('Maintained', pc.red('no, marked unmaintained; look for an alternative'));
  }
  if (lib?.weeklyDownloads) line('Downloads', `${formatCount(lib.weeklyDownloads)} / week`);
  if (lib?.repo) line('Repo', lib.repo);
  if (!lib && !check && !offline) {
    line('Directory', pc.dim('not listed on reactnative.directory (common for plain JS packages)'));
  }
  line('npm', `https://www.npmjs.com/package/${name}`);
}

function line(label, value) {
  console.log(`  ${pc.dim(label.padEnd(12))} ${value}`);
}

function columnWidth(names) {
  return Math.min(MAX_NAME_WIDTH, Math.max(0, ...names.map((name) => name.length)));
}

function formatCount(count) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
}
