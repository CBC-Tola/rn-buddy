import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { hasNativeCode, installedVersion, isExpo, packageManager } from './project.js';
import { packageName, RECIPES } from './recipes.js';
import { importedPackages, readSources } from './sources.js';
import { isTypeScript, renderTemplate } from './templates.js';

const TEMPLATES = new URL('../templates/recipes/', import.meta.url);

const INSTALL = {
  npm: { add: ['install'], dev: '--save-dev', remove: ['uninstall'] },
  yarn: { add: ['add'], dev: '--dev', remove: ['remove'] },
  pnpm: { add: ['add'], dev: '--save-dev', remove: ['remove'] },
  bun: { add: ['add'], dev: '--dev', remove: ['remove'] },
};

// Everything a recipe's definition can look at (see src/lib/recipes.js).
export function recipeContext(project, args = [], { undo = false } = {}) {
  const { root, pkg, deps } = project;
  const expo = isExpo(pkg);
  const platforms = { android: nativeFolder(root, 'android', expo), ios: nativeFolder(root, 'ios', expo) };
  const installed = new Set(deps.map((dep) => dep.name));
  const adding = new Set();
  const reactNative = installedVersion(root, 'react-native') ?? semver.coerce(pkg.dependencies?.['react-native'])?.version;
  return {
    root,
    pkg,
    args,
    undo,
    expo,
    // Expo with generated native folders: native changes go through config plugins in app.json.
    expoPrebuild: expo && !platforms.android && !platforms.ios,
    platforms,
    typescript: isTypeScript(root),
    reactNativeMinor: reactNative ? `${semver.major(reactNative)}.${semver.minor(reactNative)}` : null,
    adding,
    has: (name) => installed.has(name) || adding.has(name),
    exists: (file) => existsSync(path.join(root, file)),
  };
}

// A plan is everything `add` will do, worked out before anything changes:
// {
//   recipe, args, manager, docs, next, expo, expoPrebuild, expoGo,
//   install:   [{ name, spec, dev }]            packages to install (spec may pin a version)
//   installed: [name]                           packages the project already has
//   files:     [{ file, content, exists }]      starter files (existing ones are kept)
//   edits:     [{ id, file, description, status: 'apply' | 'done' | 'manual', content?, manual? }]
// }
export function planRecipe(project, name, args = []) {
  const ctx = recipeContext(project, recipeArgs(name, args));
  const recipe = resolveRecipe(name, ctx);
  const packages = recipe.packageList;
  for (const pkg of packages) ctx.adding.add(pkg.name);
  const vars = recipe.vars?.(ctx) ?? {};

  return {
    recipe: name,
    args: ctx.args,
    manager: packageManager(project.root, project.pkg),
    docs: recipe.docs,
    next: renderRecipeTemplate(readFileSync(new URL(`${name}/next.md`, TEMPLATES), 'utf8'), ctx, vars),
    expo: ctx.expo,
    expoPrebuild: ctx.expoPrebuild,
    expoGo: recipe.expoGo ?? true,
    ...splitInstalled(project, packages),
    files: recipe.fileList.map((file) => recipeFile(ctx, name, file, vars)),
    edits: recipe.editList.map((edit) => planEdit(ctx, edit)).filter(Boolean),
  };
}

export function planPackage(project, name, { dev = false } = {}) {
  return {
    recipe: null,
    manager: packageManager(project.root, project.pkg),
    docs: null,
    next: null,
    expo: isExpo(project.pkg),
    ...splitInstalled(project, [{ name, spec: name, dev }]),
    files: [],
    edits: [],
  };
}

// Checks a recipe's options: `add permissions camera` needs at least one, other recipes take none.
export function recipeArgs(name, args) {
  const recipe = RECIPES[name];
  if (!recipe.args) {
    if (args.length > 0) throw new Error(`The ${name} recipe has no options. Run: rn-buddy add ${name}`);
    return [];
  }
  const parsed = recipe.args.parse(args);
  if (parsed.length === 0) {
    throw new Error(`Say which ${recipe.args.label}s to add, e.g. rn-buddy add ${name} ${Object.keys(recipe.args.choices)[0]}`);
  }
  return parsed;
}

export function hasChanges(plan) {
  if (plan.undo) {
    return (
      plan.uninstall.length > 0 ||
      plan.files.some((file) => file.status === 'delete') ||
      plan.edits.some((edit) => edit.status === 'apply')
    );
  }
  return (
    plan.install.length > 0 || plan.files.some((file) => !file.exists) || plan.edits.some((edit) => edit.status === 'apply')
  );
}

// One install command for dependencies and one for devDependencies. Expo projects use
// `npx expo install`, which picks the versions that match the Expo SDK.
export function installCommands({ manager, install, expo = false }) {
  const { add, dev } = INSTALL[manager] ?? INSTALL.npm;
  return [install.filter((pkg) => !pkg.dev), install.filter((pkg) => pkg.dev)]
    .filter((group) => group.length > 0)
    .map((group) => {
      const specs = group.map((pkg) => pkg.spec ?? pkg.name);
      const isDev = group[0].dev;
      if (expo) return { command: 'npx', args: ['expo', 'install', ...specs, ...(isDev ? ['--', dev] : [])] };
      return { command: manager, args: [...add, ...(isDev ? [dev] : []), ...specs] };
    });
}

export function uninstallCommand({ manager, uninstall }) {
  if (uninstall.length === 0) return null;
  return { command: manager, args: [...(INSTALL[manager] ?? INSTALL.npm).remove, ...uninstall] };
}

// iOS needs `pod install` after adding native code, which only works on macOS.
export function podCommand(root, platform = process.platform) {
  if (platform !== 'darwin' || !existsSync(path.join(root, 'ios', 'Podfile'))) return null;
  const bundler = existsSync(path.join(root, 'Gemfile'));
  return {
    command: bundler ? 'bundle' : 'pod',
    args: bundler ? ['exec', 'pod', 'install'] : ['install'],
    cwd: path.join(root, 'ios'),
  };
}

export function formatCommand({ command, args, cwd }, root) {
  const line = [command, ...args].join(' ');
  return cwd && cwd !== root ? `(cd ${path.relative(root, cwd)} && ${line})` : line;
}

// Problems to show before installing. `latest` maps each name to its latest package.json
// on npm (null when not found); `directory` is the React Native Directory check result.
export function compatibilityIssues(project, plan, latest, directory) {
  const issues = [];
  for (const { name, spec } of plan.install) {
    const manifest = latest[name];
    if (!manifest) {
      issues.push({ level: 'fail', message: `${name} was not found on npm. Check the name and your internet connection.` });
      continue;
    }
    // A pinned version or an Expo install doesn't use the latest version: its peers don't apply.
    if (!plan.expo && (!spec || spec === name)) {
      for (const peer of ['react', 'react-native']) {
        const range = manifest.peerDependencies?.[peer];
        const version = projectVersion(project, peer);
        if (range && version && !semver.satisfies(version, range, { includePrerelease: true })) {
          issues.push({
            level: 'warn',
            message: `${name}@${manifest.version} needs ${peer} ${range}, but this project has ${version}. Check its docs for a version that matches.`,
          });
        }
      }
    }
    if (directory[name]?.unmaintained) {
      issues.push({ level: 'warn', message: `${name} is marked unmaintained on React Native Directory. Look for an alternative.` });
    }
    if (directory[name]?.newArchitecture === 'unsupported') {
      issues.push({
        level: 'warn',
        message: `${name} doesn't support the New Architecture, which React Native uses by default since 0.76.`,
      });
    }
  }
  return issues;
}

// Runs the plan: install, then write files and edits, then pod install for new native code.
// `run(command, args, cwd)` returns true on success; tests pass a fake one.
// Edits are worked out again on the current file, because installing changes package.json.
export function applyPlan({ root }, plan, { run = runCommand, platform = process.platform } = {}) {
  for (const step of installCommands(plan)) {
    if (!run(step.command, step.args, root)) {
      throw new Error(`\`${formatCommand(step, root)}\` failed. Nothing else was changed.`);
    }
  }
  for (const { file, content, exists } of plan.files) {
    if (exists) continue;
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const skipped = writeEdits(root, plan.edits);

  const native = plan.install.filter((pkg) => hasNativeCode(root, pkg.name)).map((pkg) => pkg.name);
  const pods = native.length > 0 ? podCommand(root, platform) : null;
  return { native, pods, podsOk: pods ? installPods(root, pods, run) : null, skipped };
}

// --- undo ---------------------------------------------------------------------------------

// What `add --undo <recipe>` removes:
// {
//   recipe, undo: true, args, manager, expo, expoPrebuild,
//   uninstall: [name]                         packages to uninstall (devOnly: all of them are devDependencies)
//   kept:      [{ name, reason }]             recipe packages that stay (another recipe or your code uses them)
//   files:     [{ file, status: 'delete' | 'keep', reason? }]
//   edits:     [{ id, file, description, status: 'apply' | 'manual' | 'keep', content?, manual?, reason? }]
// }
export function planUndo(project, name, args = []) {
  const recipe = RECIPES[name];
  // `--undo permissions` without names: the ones rn-buddy finds in the project.
  const parsed = recipe.args && args.length === 0 ? (recipe.args.detect?.(project.root) ?? []) : recipeArgs(name, args);
  const ctx = recipeContext(project, parsed, { undo: true });
  const resolved = resolveRecipe(name, ctx);
  const vars = resolved.vars?.(ctx) ?? {};
  const installed = new Set(project.deps.map((dep) => dep.name));

  // Other recipes that look set up (all their packages installed) keep what they share with this one.
  const others = Object.keys(RECIPES)
    .filter((other) => other !== name)
    .map((other) => ({ name: other, recipe: resolveRecipe(other, recipeContext(project, [], { undo: true })) }))
    .filter(({ recipe: other }) => other.packageList.length > 0 && other.packageList.every((pkg) => installed.has(pkg.name)));
  const sharedBy = (test) => others.find(({ recipe: other }) => test(other))?.name;

  const files = [];
  for (const spec of resolved.fileList) {
    const { file, content, exists } = recipeFile(ctx, name, spec, vars);
    if (!exists) continue;
    const other = sharedBy((recipe) => recipe.fileList.some((f) => renderTemplate(filePath(f), ctx.typescript) === file));
    if (other) files.push({ file, status: 'keep', reason: `the ${other} recipe uses it` });
    else if (readFileSync(path.join(project.root, file), 'utf8') === content) files.push({ file, status: 'delete' });
    else files.push({ file, status: 'keep', reason: 'you changed it' });
  }
  const deleted = new Set(files.filter((f) => f.status === 'delete').map((f) => f.file));

  // Packages your own code imports stay installed (the starter files being deleted don't count).
  const imported = new Map();
  for (const { file, content } of readSources(project.root)) {
    if (deleted.has(file)) continue;
    for (const pkg of importedPackages(content)) if (!imported.has(pkg)) imported.set(pkg, file);
  }
  const uninstall = [];
  const kept = [];
  for (const { name: pkg } of resolved.packageList) {
    if (!installed.has(pkg)) continue;
    const other = sharedBy((recipe) => recipe.packageList.some((p) => p.name === pkg));
    if (other) kept.push({ name: pkg, reason: `the ${other} recipe uses it` });
    else if (imported.has(pkg)) kept.push({ name: pkg, reason: `imported in ${imported.get(pkg)}` });
    else uninstall.push(pkg);
  }
  // A kept package keeps its peer dependencies (react-native-reanimated needs react-native-worklets).
  for (const { name: keeper } of [...kept]) {
    for (const peer of peerDependencies(project.root, keeper)) {
      if (!uninstall.includes(peer)) continue;
      uninstall.splice(uninstall.indexOf(peer), 1);
      kept.push({ name: peer, reason: `${keeper} needs it` });
    }
  }

  // While your code still uses a library, its setup (Babel plugin, native config) has to stay.
  const inUse = (edit) => kept.find((pkg) => edit.packages?.includes(pkg.name) && !pkg.reason.startsWith('the '));

  const edits = [];
  for (const edit of resolved.editList) {
    if (!platformApplies(ctx, edit)) continue;
    const target = edit.find(ctx.root, ctx);
    if (!target) continue;
    const file = path.relative(ctx.root, target);
    if (deleted.has(file)) continue;
    const { id, description } = edit;
    const before = readFileSync(target, 'utf8');
    const applied = edit.apply(before, target, ctx) === before;
    const other = edit.id && sharedBy((recipe) => recipe.editList.some((e) => e.id === edit.id));
    const user = inUse(edit);
    if (other || user) {
      const reason = other ? `the ${other} recipe needs it` : `still needed: ${user.name} is ${user.reason}`;
      if (applied) edits.push({ id, file, description, status: 'keep', reason });
      continue;
    }
    const manual = `Undo by hand in ${file}: ${description}`;
    if (!edit.undo) {
      if (applied) edits.push({ id, file, description, status: 'manual', manual });
      continue;
    }
    const after = edit.undo(before, target, ctx);
    if (after === null) edits.push({ id, file, description, status: 'manual', manual });
    else if (after !== before) {
      edits.push({ id, file, description, status: 'apply', content: after, redo: (content) => edit.undo(content, target, ctx) });
    }
  }

  return {
    recipe: name,
    undo: true,
    args: ctx.args,
    manager: packageManager(project.root, project.pkg),
    expo: ctx.expo,
    expoPrebuild: ctx.expoPrebuild,
    uninstall,
    // Only build tools (devDependencies) removed: no native code changed, no pod install needed.
    devOnly: uninstall.every((pkg) => project.deps.find((dep) => dep.name === pkg)?.dev),
    kept,
    files,
    edits,
  };
}

// Uninstalls, deletes the unchanged starter files and reverts the edits, then pod install.
export function applyUndo({ root }, plan, { run = runCommand, platform = process.platform } = {}) {
  // Check for native code before the packages are gone from node_modules.
  const native = plan.uninstall.filter((name) => hasNativeCode(root, name));
  const command = uninstallCommand(plan);
  if (command && !run(command.command, command.args, root)) {
    throw new Error(`\`${formatCommand(command, root)}\` failed. Nothing else was changed.`);
  }
  for (const { file, status } of plan.files) {
    if (status !== 'delete') continue;
    rmSync(path.join(root, file), { force: true });
    removeEmptyFolders(root, path.dirname(path.join(root, file)));
  }
  const skipped = writeEdits(root, plan.edits);
  const pods = native.length > 0 ? podCommand(root, platform) : null;
  return { native, pods, podsOk: pods ? installPods(root, pods, run) : null, skipped };
}

// --- helpers ------------------------------------------------------------------------------

// The recipe as it applies to this project: Expo replacements merged in, functions called.
function resolveRecipe(name, ctx) {
  const base = RECIPES[name];
  const recipe = ctx.expo && base.expo ? { ...base, ...base.expo } : base;
  const value = (field) => (typeof recipe[field] === 'function' ? recipe[field](ctx) : (recipe[field] ?? []));
  const toPackage = (dev) => (spec) => ({ name: packageName(spec), spec, dev });
  return {
    ...recipe,
    packageList: [...value('packages').map(toPackage(false)), ...value('devPackages').map(toPackage(true))],
    fileList: value('files').filter((file) => typeof file === 'string' || !file.when || file.when(ctx)),
    editList: value('edits'),
  };
}

// Writes the 'apply' edits, worked out again on the file as it is now.
// Returns the edits that couldn't be made after all (the file changed in between).
function writeEdits(root, edits) {
  const skipped = [];
  for (const edit of edits) {
    if (edit.status !== 'apply') continue;
    const target = path.join(root, edit.file);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const content = current !== null && edit.redo ? edit.redo(current) : edit.content;
    if (content === null) skipped.push(edit);
    else if (content !== current) writeFileSync(target, content);
  }
  return skipped;
}

// Platform folders whose files we may edit. Expo projects usually generate android/ and ios/
// with `npx expo prebuild` (and git-ignore them): edits there would be lost.
function nativeFolder(root, folder, expo) {
  if (!existsSync(path.join(root, folder))) return false;
  if (!expo) return true;
  const gitignore = path.join(root, '.gitignore');
  if (!existsSync(gitignore)) return true;
  const lines = readFileSync(gitignore, 'utf8').split('\n').map((line) => line.trim());
  return ![folder, `/${folder}`, `${folder}/`, `/${folder}/`].some((line) => lines.includes(line));
}

function platformApplies(ctx, edit) {
  if (edit.platform === 'expo') return ctx.expoPrebuild;
  return !edit.platform || ctx.platforms[edit.platform];
}

function splitInstalled({ deps }, packages) {
  const installed = new Set(deps.map((dep) => dep.name));
  return {
    install: packages.filter((pkg) => !installed.has(pkg.name)),
    installed: packages.filter((pkg) => installed.has(pkg.name)).map((pkg) => pkg.name),
  };
}

function filePath(spec) {
  return typeof spec === 'string' ? spec : spec.path;
}

function recipeFile(ctx, recipe, spec, vars) {
  const file = filePath(spec);
  const target = renderTemplate(file, ctx.typescript);
  let content;
  if (spec.content) content = spec.content(ctx);
  else {
    const template = spec.template ?? `${recipe}/${path.basename(file).replace('{tsx}', 'tsx').replace('{ts}', 'ts')}.tpl`;
    content = renderRecipeTemplate(readFileSync(new URL(template, TEMPLATES), 'utf8'), ctx, vars);
  }
  return { file: target, content, exists: existsSync(path.join(ctx.root, target)) };
}

// Recipe templates use the `structure` placeholders (see templates.js), plus:
//   {{name}}           a value from the recipe's vars(ctx)
//   <!-- expo -->      at the end of a line: keep the line only in Expo projects
//   <!-- cli -->       at the end of a line: keep the line only in React Native CLI projects
export function renderRecipeTemplate(template, ctx, vars = {}) {
  const keep = ctx.expo ? '<!-- expo -->' : '<!-- cli -->';
  const text = template
    .replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
    .split('\n')
    .filter((line) => !/<!-- (expo|cli) -->$/.test(line) || line.endsWith(keep))
    .map((line) => line.replace(/\s*<!-- (expo|cli) -->$/, ''))
    .join('\n');
  return renderTemplate(text, ctx.typescript);
}

// An edit applies when its platform folder is there (and not generated by Expo).
// JS-side edits (babel.config.js, tsconfig.json, ...) always apply.
function planEdit(ctx, edit) {
  if (!platformApplies(ctx, edit)) return null;
  const { id, description, manual } = edit;
  const target = edit.find(ctx.root, ctx);
  const optional = typeof edit.optional === 'function' ? edit.optional(ctx) : edit.optional;
  if (!target) return optional ? null : { id, file: null, description, status: 'manual', manual };

  const file = path.relative(ctx.root, target);
  const before = readFileSync(target, 'utf8');
  const after = edit.apply(before, target, ctx);
  if (after === null) return { id, file, description, status: 'manual', manual };
  if (after === before) return { id, file, description, status: 'done' };
  return { id, file, description, status: 'apply', content: after, redo: (content) => edit.apply(content, target, ctx) };
}

// Deletes folders left empty by undo (src/hooks/ after its only file is gone), up to the project root.
function removeEmptyFolders(root, dir) {
  let current = dir;
  while (current.startsWith(root + path.sep) && existsSync(current) && readdirSync(current).length === 0) {
    rmdirSync(current);
    current = path.dirname(current);
  }
}

// `bundle exec pod install` needs the gems from the Gemfile, so install them first if they're missing.
function installPods(root, pods, run) {
  if (pods.command === 'bundle' && !run('bundle', ['check'], root, { quiet: true })) {
    if (!run('bundle', ['install'], root)) return false;
  }
  return run(pods.command, pods.args, pods.cwd);
}

function peerDependencies(root, name) {
  try {
    return Object.keys(JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).peerDependencies ?? {});
  } catch {
    return [];
  }
}

function projectVersion({ root, pkg }, name) {
  return installedVersion(root, name) ?? semver.coerce(pkg.dependencies?.[name])?.version ?? null;
}

function runCommand(command, args, cwd, { quiet = false } = {}) {
  // A missing tool (ENOENT) gives status null: reported as a failed step, not a stack trace.
  const result = spawnSync(command, args, { cwd, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}
