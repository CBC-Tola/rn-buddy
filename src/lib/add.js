import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { hasNativeCode, installedVersion, packageManager } from './project.js';
import { RECIPES } from './recipes.js';
import { isTypeScript, renderTemplate } from './templates.js';

const TEMPLATES = new URL('../templates/recipes/', import.meta.url);

const INSTALL = {
  npm: { add: ['install'], dev: '--save-dev' },
  yarn: { add: ['add'], dev: '--dev' },
  pnpm: { add: ['add'], dev: '--save-dev' },
  bun: { add: ['add'], dev: '--dev' },
};

// A plan is everything `add` will do, worked out before anything changes:
// {
//   recipe, manager, docs, next,
//   install:   [{ name, dev }]                  packages to install
//   installed: [name]                           packages the project already has
//   files:     [{ file, content, exists }]      starter files (existing ones are kept)
//   edits:     [{ file, description, status: 'apply' | 'done' | 'manual', content?, manual? }]
// }
export function planRecipe(project, name) {
  const recipe = RECIPES[name];
  const typescript = isTypeScript(project.root);
  return {
    recipe: name,
    manager: packageManager(project.root, project.pkg),
    docs: recipe.docs,
    next: renderTemplate(readFileSync(new URL(`${name}/next.md`, TEMPLATES), 'utf8'), typescript),
    ...splitInstalled(project, recipe.packages.map((pkgName) => ({ name: pkgName, dev: false }))),
    files: recipe.files.map((file) => recipeFile(project.root, name, file, typescript)),
    edits: recipe.edits.map((edit) => planEdit(project.root, edit)).filter(Boolean),
  };
}

export function planPackage(project, name, { dev = false } = {}) {
  return {
    recipe: null,
    manager: packageManager(project.root, project.pkg),
    docs: null,
    next: null,
    ...splitInstalled(project, [{ name, dev }]),
    files: [],
    edits: [],
  };
}

export function hasChanges(plan) {
  return (
    plan.install.length > 0 || plan.files.some((file) => !file.exists) || plan.edits.some((edit) => edit.status === 'apply')
  );
}

// One install command for dependencies and one for devDependencies.
export function installCommands({ manager, install }) {
  const { add, dev } = INSTALL[manager] ?? INSTALL.npm;
  return [install.filter((pkg) => !pkg.dev), install.filter((pkg) => pkg.dev)]
    .filter((group) => group.length > 0)
    .map((group) => ({ command: manager, args: [...add, ...(group[0].dev ? [dev] : []), ...group.map((pkg) => pkg.name)] }));
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
  for (const { name } of plan.install) {
    const manifest = latest[name];
    if (!manifest) {
      issues.push({ level: 'fail', message: `${name} was not found on npm. Check the name and your internet connection.` });
      continue;
    }
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
  for (const edit of plan.edits) {
    if (edit.status === 'apply') writeFileSync(path.join(root, edit.file), edit.content);
  }

  const native = plan.install.filter((pkg) => hasNativeCode(root, pkg.name)).map((pkg) => pkg.name);
  const pods = native.length > 0 ? podCommand(root, platform) : null;
  return { native, pods, podsOk: pods ? installPods(root, pods, run) : null };
}

// `bundle exec pod install` needs the gems from the Gemfile, so install them first if they're missing.
function installPods(root, pods, run) {
  if (pods.command === 'bundle' && !run('bundle', ['check'], root, { quiet: true })) {
    if (!run('bundle', ['install'], root)) return false;
  }
  return run(pods.command, pods.args, pods.cwd);
}

function splitInstalled({ deps }, packages) {
  const installed = new Set(deps.map((dep) => dep.name));
  return {
    install: packages.filter((pkg) => !installed.has(pkg.name)),
    installed: packages.filter((pkg) => installed.has(pkg.name)).map((pkg) => pkg.name),
  };
}

function recipeFile(root, recipe, file, typescript) {
  const template = `${path.basename(file).replace('{tsx}', 'tsx').replace('{ts}', 'ts')}.tpl`;
  const target = renderTemplate(file, typescript);
  return {
    file: target,
    content: renderTemplate(readFileSync(new URL(`${recipe}/${template}`, TEMPLATES), 'utf8'), typescript),
    exists: existsSync(path.join(root, target)),
  };
}

// Native edits only matter when the project has that platform folder.
function planEdit(root, edit) {
  if (!existsSync(path.join(root, 'android'))) return null;
  const { description, manual } = edit;
  const target = edit.find(root);
  if (!target) return { file: null, description, status: 'manual', manual };

  const file = path.relative(root, target);
  const before = readFileSync(target, 'utf8');
  const after = edit.apply(before, target);
  if (after === null) return { file, description, status: 'manual', manual };
  if (after === before) return { file, description, status: 'done' };
  return { file, description, status: 'apply', content: after };
}

function projectVersion({ root, pkg }, name) {
  return installedVersion(root, name) ?? semver.coerce(pkg.dependencies?.[name])?.version ?? null;
}

function runCommand(command, args, cwd, { quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}
