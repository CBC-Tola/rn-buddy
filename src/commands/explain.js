import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import pc from 'picocolors';
import {
  categories,
  explainSettings,
  importedFiles,
  lookupFile,
  lookupPackage,
  lookupPath,
  normalizePath,
  planOutdated,
  resolveImport,
  settingsKind,
  SOURCE_FILE,
  sourcePackages,
} from '../lib/notes.js';
import { hasNativeCode, hasNodeModules, installedVersion, isExpo, packageManager, readProject } from '../lib/project.js';
import { checkPackages, describeOnline, directoryInfo, npmDescription, npmDistTags } from '../lib/remote.js';
import { listSourceFiles } from '../lib/sources.js';
import { ICONS, printHeader, printRows } from '../lib/ui.js';

const HIDDEN_FILES = new Set(['.git', '.DS_Store']);
const MAX_NAME_WIDTH = 46;
const MAX_FOLDER_ENTRIES = 8;
const POD_INSTALL = '(cd ios && bundle exec pod install)';
const PREBUILD = 'npx expo prebuild';
const NPM_REQUESTS_AT_ONCE = 8;

export async function explain(name, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  project.expo = isExpo(project.pkg);
  if (options.outdated) {
    await explainOutdated(project, name, options);
  } else if (!name) {
    await explainProject(project, options);
  } else if (isProjectPath(project, name)) {
    await explainPath(project, name, options);
  } else if (isMissingPath(project, name)) {
    explainMissingPath(project, name);
  } else {
    await explainPackage(project, name, options);
  }
}

// A name is a file or folder when it exists in the project and isn't one of its dependencies
// (a dependency wins, so `explain react` still explains the package).
function isProjectPath({ root, deps }, name) {
  return !deps.some((dep) => dep.name === name) && existsSync(path.resolve(root, name));
}

// A path that isn't there: one rn-buddy has a note for (android/, app.json, ...) or one that
// can't be a package name (src/screens/Home.tsx). Package names are "name" or "@scope/name".
function isMissingPath({ deps, expo }, name) {
  if (deps.some((dep) => dep.name === name)) return false;
  const relative = normalizePath(name);
  if (lookupPath(relative, { expo }) || /^(android|ios)(\/|$)/.test(relative)) return true;
  return relative.includes('/') && !name.startsWith('@');
}

async function explainProject(project, { offline = false }) {
  const { root, deps, expo } = project;
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

  printHeader(project);

  console.log(`\n${pc.bold('Packages')}`);
  const width = columnWidth(rows.map((row) => row.name));
  for (const category of categories) {
    const group = rows.filter((row) => row.category === category);
    if (group.length === 0) continue;

    console.log(pc.cyan(category));
    for (const row of group) {
      const note = row.note ? row.note + (row.source ? pc.dim(` (${row.source})`) : '') : pc.dim('No description found');
      console.log(`  ${row.name.padEnd(width)}  ${note}${packageTags(row)}`);
    }
  }

  console.log(`\n${pc.bold('Files')}`);
  const entries = folderEntries(root);
  const fileWidth = columnWidth(entries);
  for (const entry of entries) {
    const note = lookupFile(entry.replace(/\/$/, ''), { expo }) ?? pc.dim('—');
    console.log(`  ${entry.padEnd(fileWidth)}  ${note}`);
  }

  console.log('');
  if (expo && !existsSync(path.join(root, 'android')) && !existsSync(path.join(root, 'ios'))) {
    console.log(`No android/ or ios/ folder yet: ${pc.bold(PREBUILD)} generates them from app.json (EAS Build does it in the cloud).`);
  }
  if (rows.some((row) => row.unmaintained)) {
    console.log(`${pc.red('[unmaintained]')} React Native Directory marks it unmaintained: look for an alternative.`);
  }
  if (rows.some((row) => row.native)) console.log(`${pc.yellow('[native]')} ${nativeHint(expo)}`);
  if (!hasNodeModules(root)) {
    console.log(pc.yellow('node_modules not found. Run `npm install` so rn-buddy can detect native packages.'));
  }
  console.log(pc.dim('Tip: rn-buddy explain <package|file> shows details for one; --outdated shows newer versions.'));
}

function packageTags(row) {
  const tags = [
    row.unmaintained && pc.red('[unmaintained]'),
    row.native && pc.yellow('[native]'),
    row.dev && pc.dim('[dev]'),
    row.missing && pc.yellow('[not in package.json]'),
  ].filter(Boolean);
  return tags.length ? `  ${tags.join(' ')}` : '';
}

function nativeHint(expo) {
  return expo
    ? 'has iOS/Android code: install it with `npx expo install`, then make a new development build (Expo Go only has Expo SDK modules).'
    : `has iOS/Android code: after installing one, run ${pc.bold(POD_INSTALL)} and rebuild the app.`;
}

async function explainPackage({ root, deps, expo }, name, { offline = false }) {
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

  if (native === true) line('Native code', nativeLine(name, expo));
  if (native === false) line('Native code', 'no, plain JavaScript (no rebuild needed)');
  if (expo && !dep) line('Install', `npx expo install ${name}  ${pc.dim('(picks the version that fits your Expo SDK)')}`);

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

function nativeLine(name, expo) {
  if (!expo) return `yes. After installing, run ${POD_INSTALL} and rebuild the app`;
  if (name === 'expo' || name.startsWith('expo-')) return 'yes. Expo Go includes it; in a development build, rebuild after installing it';
  return 'yes. Not in Expo Go: install it with `npx expo install`, then make a new development build';
}

async function explainPath(project, name, options) {
  const { root, expo } = project;
  const target = path.resolve(root, name);
  const relative = normalizePath(path.relative(root, target));
  const isFolder = statSync(target).isDirectory();
  const note = lookupPath(relative, { expo });
  const kind = isFolder ? null : settingsKind(relative);
  const source = !isFolder && SOURCE_FILE.test(relative) && !/^(node_modules|android|ios)\//.test(relative);

  console.log(`${pc.bold(isFolder ? `${relative}/` : relative)}  ${pc.dim(isFolder ? 'folder' : 'file')}\n`);
  // A folder's own README (like the ones `rn-buddy structure` writes) says more than a general note.
  const what = (isFolder ? readmeSummary(target) : null) ?? note;
  if (what) {
    line('What it is', what);
  } else if (source && relative.includes('/')) {
    const folder = path.posix.dirname(relative);
    const folderNote = readmeSummary(path.join(root, folder)) ?? lookupPath(folder, { expo });
    line('In folder', `${folder}/` + (folderNote ? `  ${pc.dim(folderNote)}` : ''));
  } else {
    line('What it is', pc.dim('No description found'));
  }

  if (isFolder) {
    const entries = folderEntries(target);
    const shown = entries.slice(0, MAX_FOLDER_ENTRIES).join(', ');
    const more = entries.length > MAX_FOLDER_ENTRIES ? pc.dim(` and ${entries.length - MAX_FOLDER_ENTRIES} more`) : '';
    line('Contains', entries.length ? shown + more : pc.dim('nothing yet'));
  }
  if (expo && /^(android|ios)(\/|$)/.test(relative)) {
    console.log(pc.dim(`\n→ Expo: ${PREBUILD} generates this from app.json. Change native settings in app.json and config plugins;`));
    console.log(pc.dim(`  edits made here are lost when the native folders are generated again (${PREBUILD} --clean).`));
  }
  if (/^app\.config\.[jt]s$/.test(relative)) {
    console.log(pc.dim('\n→ This config is code, so rn-buddy can\'t go through it line by line. `npx expo config` prints the result.'));
  }

  if (kind) printSettings(kind, readFileSync(target, 'utf8'));
  if (source) await printSource(project, relative, readFileSync(target, 'utf8'), options);
}

// For paths that aren't in the project: say what they would be, and why they're missing.
function explainMissingPath({ root, expo }, name) {
  const relative = normalizePath(name);
  console.log(`${pc.bold(relative)}  ${pc.dim('not in this project')}\n`);
  line('What it is', lookupPath(relative, { expo }) ?? pc.dim('No description found'));

  const top = relative.split('/')[0];
  if (expo && (top === 'android' || top === 'ios') && !existsSync(path.join(root, top))) {
    console.log(`\nExpo projects don't have ${top}/ until you run ${pc.bold(PREBUILD)}: it generates the native folders from app.json.`);
    console.log(pc.dim('→ Most Expo apps never need them: native settings go in app.json and config plugins,'));
    console.log(pc.dim('  and EAS Build runs prebuild in the cloud.'));
  } else if (relative.startsWith('src/') && !existsSync(path.join(root, 'src'))) {
    console.log(pc.dim('\n→ rn-buddy structure creates the src/ folders with a README in each.'));
  }
}

// The settings of a config file, each with its current value and what it does.
function printSettings(kind, content) {
  const rows = explainSettings(kind, content);
  console.log(`\n${pc.bold('Settings')}`);
  if (rows.length === 0) {
    console.log(pc.dim('  none found'));
    return;
  }
  const width = columnWidth(rows.map((row) => row.key));
  for (const row of rows) {
    const at = row.line ? pc.dim(`  line ${row.line}`) : '';
    console.log(`  ${row.key.padEnd(width)}  ${pc.cyan(row.value)}${at}`);
    console.log(`  ${' '.repeat(width)}  ${row.note ?? pc.dim('no note')}`);
  }
}

// What a source file imports (packages and files) and which files import it.
async function printSource({ root, deps, expo }, relative, content, { offline = false }) {
  const packages = await Promise.all(
    sourcePackages(content).map(async (name) => {
      const known = lookupPackage(name);
      const builtin = builtinModules.includes(name) || name.startsWith('node:');
      const online = !known && !builtin && !offline ? await describeOnline(name) : null;
      return {
        name,
        note: known?.note ?? online?.note ?? (builtin ? 'Built into Node.js (works in config files, not in the app)' : null),
        source: online?.source ?? null,
        native: hasNativeCode(root, name),
        missing: !builtin && !deps.some((dep) => dep.name === name),
      };
    }),
  );
  const files = importedFiles(content).map((specifier) => ({ specifier, file: resolveImport(root, relative, specifier) }));
  const appFiles = listSourceFiles(root).map(normalizePath);
  const isAppFile = appFiles.includes(relative);

  // Config files like metro.config.js: only the packages are interesting.
  if (!isAppFile && files.length === 0) {
    if (packages.length) printPackages(packages);
    return;
  }

  printPackages(packages);

  console.log(`\n${pc.bold('Files it imports')}`);
  if (files.length === 0) console.log(pc.dim('  none'));
  const fileWidth = columnWidth(files.map(({ specifier, file }) => file ?? specifier));
  for (const { specifier, file } of files) {
    const shown = (file ?? specifier).padEnd(fileWidth);
    console.log(`  ${shown}  ${file ? pc.dim(`(${specifier})`) : pc.yellow('not found')}`);
  }

  if (!isAppFile) return;
  const importers = appFiles.filter(
    (file) =>
      file !== relative &&
      importedFiles(readFileSync(path.join(root, file), 'utf8')).some((spec) => resolveImport(root, file, spec) === relative),
  );
  console.log(`\n${pc.bold('Imported by')}`);
  for (const file of importers) console.log(`  ${file}`);
  if (importers.length === 0) {
    const why = /^index\.[jt]sx?$/.test(relative)
      ? 'no other file: it is the entry point the native app starts'
      : expo && relative.startsWith('app/')
        ? 'no other file: Expo Router loads it because of where it is in app/'
        : 'no other file yet';
    console.log(pc.dim(`  ${why}`));
  }

  if (packages.some((pkg) => pkg.native)) console.log(`\n${pc.yellow('[native]')} ${nativeHint(expo)}`);
}

function printPackages(packages) {
  console.log(`\n${pc.bold('Packages it imports')}`);
  if (packages.length === 0) console.log(pc.dim('  none'));
  const width = columnWidth(packages.map((pkg) => pkg.name));
  for (const pkg of packages) {
    const note = pkg.note ? pkg.note + (pkg.source ? pc.dim(` (${pkg.source})`) : '') : pc.dim('No description found');
    console.log(`  ${pkg.name.padEnd(width)}  ${note}${packageTags(pkg)}`);
  }
}

// --- explain --outdated ---------------------------------------------------------------------

async function explainOutdated(project, name, { offline = false }) {
  const { root, pkg, deps, expo } = project;
  printHeader(project);

  if (offline) {
    console.log(`\n--outdated asks npm for the latest versions, so it needs the internet. Run it again without --offline.`);
    return;
  }
  const selected = name ? deps.filter((dep) => dep.name === name) : deps;
  if (name && selected.length === 0) throw new Error(`${name} is not in package.json, so there is nothing to compare.`);
  if (selected.length === 0) {
    console.log(pc.dim('\nNo packages in package.json.'));
    return;
  }

  const tags = await mapLimit(selected, NPM_REQUESTS_AT_ONCE, (dep) => npmDistTags(dep.name));
  if (tags.every((tag) => !tag)) {
    console.log(`\n${ICONS.warn} Couldn't reach npm. Check your internet connection and try again.`);
    return;
  }
  const latest = Object.fromEntries(selected.map((dep, i) => [dep.name, tags[i]?.latest]).filter(([, version]) => version));
  const rows = planOutdated(selected, {
    installed: (dep) => installedVersion(root, dep),
    latest,
    native: (dep) => hasNativeCode(root, dep),
    expo,
  });

  const updates = rows.filter((row) => row.kind && row.kind !== 'current').sort((a, b) => Number(b.safe) - Number(a.safe));
  const unknown = rows.filter((row) => !row.kind);
  const current = rows.filter((row) => row.kind === 'current');

  printRows(
    'Updates',
    updates.map((row) => ({
      name: row.name,
      status: row.safe ? 'ok' : 'warn',
      version: `${row.current} → ${row.latest}`,
      message: `${row.kind.padEnd(5)}  ${row.advice}${row.dev ? pc.dim('  [dev]') : ''}`,
      hint: row.hint,
    })),
  );
  printRows(
    'Not checked',
    unknown.map((row) => ({
      name: row.name,
      status: 'skip',
      version: row.range,
      message: row.latest ? `can't compare with ${row.latest} (not a version number)` : 'not found on npm',
    })),
  );

  const safe = updates.filter((row) => row.safe);
  const careful = updates.length - safe.length;
  console.log(
    `\n${[
      current.length && `${ICONS.ok} ${current.length} up to date`,
      safe.length && `${ICONS.ok} ${safe.length} safe to update`,
      careful && `${ICONS.warn} ${careful} to read first`,
      unknown.length && `${ICONS.skip} ${unknown.length} not checked`,
    ]
      .filter(Boolean)
      .join('  ')}`,
  );

  for (const command of updateCommands(safe, packageManager(root, pkg), expo)) console.log(pc.cyan(`$ ${command}`));
  if (expo) {
    console.log(pc.dim('→ Expo: `npx expo install --check` lists the packages that don\'t match your Expo SDK.'));
  } else if (updates.some((row) => row.name === 'react-native')) {
    console.log(pc.dim('→ `rn-buddy upgrade` updates react-native, react and @react-native/* together, native files included.'));
  }
  if (safe.length) console.log(pc.dim('→ Patch and minor updates should not break anything: run the app afterwards to make sure.'));
}

// The commands that install the safe updates, dependencies and devDependencies separately.
function updateCommands(rows, manager, expo) {
  const install = manager === 'npm' ? 'npm install' : `${manager} add`;
  const commands = [];
  const app = rows.filter((row) => !row.dev).map((row) => row.name);
  const dev = rows.filter((row) => row.dev).map((row) => `${row.name}@latest`);
  if (app.length && expo) commands.push(`npx expo install ${app.join(' ')}`);
  else if (app.length) commands.push(`${install} ${app.map((name) => `${name}@latest`).join(' ')}`);
  if (dev.length) commands.push(`${install} -D ${dev.join(' ')}`);
  return commands;
}

// Like Promise.all(items.map(fn)), but only `limit` requests at a time.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// --- helpers --------------------------------------------------------------------------------

function folderEntries(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => !HIDDEN_FILES.has(entry.name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort((a, b) => a.localeCompare(b));
}

// First paragraph of a folder's README.md (like the ones `rn-buddy structure` creates).
function readmeSummary(folder) {
  const readme = path.join(folder, 'README.md');
  if (!existsSync(readme)) return null;
  return readFileSync(readme, 'utf8').split('\n').find((text) => text.trim() && !text.startsWith('#')) ?? null;
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
