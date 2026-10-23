import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { podCommand } from './add.js';
import { readText } from './native.js';
import { plistString } from './plist.js';
import { isExpo, LOCKFILES, packageManager } from './project.js';

// What `clean` can clear, from light to heavy. The order is also the menu order.
export const TARGETS = [
  {
    key: 'metro',
    label: 'Metro cache',
    what: 'Metro and haste-map caches, node_modules/.cache',
    fixes: 'changes not showing up, "Unable to resolve module" after install',
  },
  {
    key: 'watchman',
    label: 'Watchman',
    what: 'forget and re-add the watch on this folder',
    fixes: 'Metro not noticing file changes',
  },
  {
    key: 'android',
    label: 'Android build',
    what: 'android/build, android/app/build, android/.gradle, .cxx',
    fixes: 'Gradle and CMake errors, old native code after an install',
  },
  {
    key: 'ios',
    label: 'iOS build',
    what: 'ios/build, Xcode DerivedData for this app',
    fixes: 'Xcode build errors, old native code after an install',
  },
  {
    key: 'pods',
    label: 'iOS Pods',
    what: 'ios/Pods, then pod install again',
    fixes: 'pod errors, "No such module", missing pods',
  },
  { key: 'deps', label: 'node_modules', what: 'delete, then install again', fixes: 'broken or half-finished installs' },
];

const ANDROID_DIRS = ['android/build', 'android/app/build', 'android/.gradle', 'android/.cxx', 'android/app/.cxx'];
const METRO_TEMP = /^(metro-|haste-map-)/;

const LOCKFILE_WARNING = {
  js: 'The lockfile pins the exact version of every package. Without it the install can pick newer versions that may not work together. Delete it only if you mean to update everything.',
  pods: 'Podfile.lock pins the version of every pod. Without it pod install can pick newer pods that may not build. Delete it only if you mean to update the pods.',
};

// The --metro, --android, ... flags (or --all) as target keys, in TARGETS order.
export function targetsFromOptions(options = {}) {
  return TARGETS.map((target) => target.key).filter((key) => options.all || options[key]);
}

// The menu answer: "1,3", "1 3" or "a". Empty means nothing chosen.
export function parseChoice(answer) {
  const parts = answer.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (parts.some((part) => part === 'a' || part === 'all')) return TARGETS.map((target) => target.key);
  const chosen = new Set();
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isInteger(number) || number < 1 || number > TARGETS.length) {
      throw new Error(`"${part}" is not on the list. Choose numbers from 1 to ${TARGETS.length} (like 1,3), or a for all.`);
    }
    chosen.add(TARGETS[number - 1].key);
  }
  return TARGETS.map((target) => target.key).filter((key) => chosen.has(key));
}

// The Xcode project name (ios/<AppName>.xcworkspace or .xcodeproj), or null.
export function xcodeAppName(root) {
  const ios = path.join(root, 'ios');
  if (!existsSync(ios)) return null;
  const entries = readdirSync(ios);
  const file = entries.find((name) => name.endsWith('.xcworkspace')) ?? entries.find((name) => name.endsWith('.xcodeproj'));
  return file ? file.replace(/\.(xcworkspace|xcodeproj)$/, '') : null;
}

export function derivedDataRoot(home = os.homedir()) {
  return path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');
}

// Xcode builds each app in DerivedData/<AppName>-<random letters>. Every project created from
// the template with the same name gets such a folder, so the name isn't enough: the folder's
// info.plist says which workspace it belongs to, and only this project's folders are returned.
export function derivedDataDirs(root, home = os.homedir()) {
  const name = xcodeAppName(root);
  const dir = derivedDataRoot(home);
  if (!name || !existsSync(dir)) return [];
  const ios = realPath(path.join(root, 'ios'));
  return readdirSync(dir)
    .filter((entry) => entry.startsWith(`${name}-`) && /^[a-z]{20,}$/.test(entry.slice(name.length + 1)))
    .map((entry) => path.join(dir, entry))
    .filter((folder) => {
      const workspace = plistString(readText(path.join(folder, 'info.plist')) ?? '', 'WorkspacePath');
      return Boolean(workspace) && realPath(path.dirname(workspace)) === ios;
    });
}

// Resolves symlinks such as macOS's /tmp → /private/tmp, so paths compare reliably.
function realPath(file) {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

// Metro's caches in the temp folder, plus node_modules/.cache (babel-loader and friends).
// rn-buddy's own cache is kept: it remembers the last native build for `status`.
export function metroCaches(root, tmpdir = os.tmpdir()) {
  const temp = existsSync(tmpdir) ? readdirSync(tmpdir).filter((name) => METRO_TEMP.test(name)) : [];
  const cache = path.join(root, 'node_modules', '.cache');
  const local = existsSync(cache) ? readdirSync(cache).filter((name) => name !== 'rn-buddy') : [];
  return [
    ...temp.map((name) => ({ path: path.join(tmpdir, name), kind: 'metro' })),
    ...local.map((name) => ({ path: path.join(cache, name), kind: 'project' })),
  ];
}

// Everything `clean` will do, worked out before anything is deleted:
// {
//   targets:   ['metro', ...]
//   deletions: [{ target, path, display, exists, size, kind, lockfile?, warning? }]
//   commands:  [{ target, command, args, cwd, optional? }]   reinstalls, run after deleting
//   notes:     [string]                                         targets skipped and why
// }
export function planClean(project, targets, options = {}) {
  const { root, pkg } = project;
  const { platform = process.platform, home = os.homedir(), tmpdir = os.tmpdir(), lockfiles = false } = options;
  const plan = { targets, deletions: [], commands: [], notes: [] };
  const remove = (target, file, kind = 'project', extra = {}) =>
    plan.deletions.push(entry({ root, home, tmpdir }, target, file, kind, extra));
  const has = (file) => existsSync(path.join(root, file));

  if (targets.includes('metro')) {
    const caches = metroCaches(root, tmpdir);
    for (const cache of caches) remove('metro', cache.path, cache.kind);
    if (caches.length === 0) plan.notes.push('Metro cache: nothing to clean.');
  }

  if (targets.includes('android')) {
    if (has('android')) for (const dir of ANDROID_DIRS) remove('android', path.join(root, dir));
    else plan.notes.push(`No android/ folder: nothing to clean for Android${isExpo(pkg) ? ' (Expo creates it with npx expo prebuild)' : ''}.`);
  }

  if (targets.includes('ios')) {
    if (has('ios')) {
      remove('ios', path.join(root, 'ios', 'build'));
      if (platform !== 'darwin') {
        plan.notes.push('Xcode DerivedData only exists on macOS: skipped.');
      } else {
        const dirs = derivedDataDirs(root, home);
        for (const dir of dirs) remove('ios', dir, 'derivedData');
        if (dirs.length === 0) {
          plan.deletions.push({
            target: 'ios',
            path: null,
            display: `Xcode DerivedData for ${xcodeAppName(root) ?? 'this app'}`,
            exists: false,
            size: 0,
            kind: 'derivedData',
          });
        }
      }
    } else {
      plan.notes.push(`No ios/ folder: nothing to clean for iOS${isExpo(pkg) ? ' (Expo creates it with npx expo prebuild)' : ''}.`);
    }
  }

  if (targets.includes('pods')) {
    if (platform !== 'darwin') {
      plan.notes.push('CocoaPods only runs on macOS: skipped the iOS Pods.');
    } else if (!has('ios/Podfile')) {
      plan.notes.push('No ios/Podfile: nothing to clean for the iOS Pods.');
    } else {
      remove('pods', path.join(root, 'ios', 'Pods'));
      if (lockfiles) remove('pods', path.join(root, 'ios', 'Podfile.lock'), 'project', { lockfile: true, warning: LOCKFILE_WARNING.pods });
    }
  }

  if (targets.includes('deps')) {
    remove('deps', path.join(root, 'node_modules'));
    if (lockfiles) {
      for (const file of Object.keys(LOCKFILES).filter(has)) {
        remove('deps', path.join(root, file), 'project', { lockfile: true, warning: LOCKFILE_WARNING.js });
      }
    }
    plan.commands.push({ target: 'deps', command: packageManager(root, pkg), args: ['install'], cwd: root });
  }

  // pod install reads node_modules, so it runs after the JS install.
  if (targets.includes('pods') && platform === 'darwin' && has('ios/Podfile')) {
    plan.commands.push({ target: 'pods', ...podCommand(root, platform) });
  }

  if (targets.includes('watchman')) {
    if (options.hasWatchman ?? commandExists('watchman')) {
      plan.commands.push({ target: 'watchman', command: 'watchman', args: ['watch-del', root], cwd: root, optional: true });
      plan.commands.push({ target: 'watchman', command: 'watchman', args: ['watch-project', root], cwd: root, optional: true });
    } else {
      plan.notes.push('Watchman is not installed: nothing to reset. (It is optional; Metro works without it.)');
    }
  }

  if (lockfiles && !targets.includes('deps') && !targets.includes('pods')) {
    plan.notes.push('--lockfiles only applies together with --deps or --pods: no lockfile will be deleted.');
  }
  return plan;
}

export function totalSize(plan) {
  return plan.deletions.filter((item) => item.exists).reduce((sum, item) => sum + item.size, 0);
}

export function hasWork(plan) {
  return plan.deletions.some((item) => item.exists) || plan.commands.length > 0;
}

// A last check before deleting: inside the project (never the project itself), Metro's
// temp caches, or this app's DerivedData folder. Anything else is refused.
export function isSafeToDelete(root, item) {
  if (!item.path) return false;
  const target = path.resolve(item.path);
  const relative = path.relative(path.resolve(root), target);
  if (item.kind === 'project') return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (item.kind === 'metro') return METRO_TEMP.test(path.basename(target));
  if (item.kind === 'derivedData') {
    return path.basename(path.dirname(target)) === 'DerivedData' && path.basename(path.dirname(path.dirname(target))) === 'Xcode';
  }
  return false;
}

// Deletes, then runs the reinstall commands. `run(command, args, cwd, { quiet })` returns
// true on success and `remove(path)` deletes; tests pass fakes.
// Result: { removed: [item], failed: [{ item, error }], steps: [{ ...command, ok: true | false | null }] }
export function applyClean({ root }, plan, { run = runCommand, remove = removePath } = {}) {
  const removed = [];
  const failed = [];
  for (const item of plan.deletions.filter((d) => d.exists)) {
    if (!isSafeToDelete(root, item)) {
      failed.push({ item, error: 'outside the project, refused' });
      continue;
    }
    try {
      remove(item.path);
      removed.push(item);
    } catch (error) {
      failed.push({ item, error: error.code === 'EACCES' || error.code === 'EPERM' ? 'permission denied' : error.message });
    }
  }

  const steps = [];
  let stopped = false;
  for (const step of plan.commands) {
    if (stopped) {
      steps.push({ ...step, ok: null });
      continue;
    }
    const ok = step.target === 'pods' ? installPods(root, step, run) : run(step.command, step.args, step.cwd);
    steps.push({ ...step, ok });
    // Without node_modules, pod install can't work either: stop at the first real failure.
    if (!ok && !step.optional) stopped = true;
  }
  return { removed, failed, steps };
}

// What to run once the caches are gone.
export function nextSteps(project, targets, platform = process.platform) {
  const { root, pkg } = project;
  const expo = isExpo(pkg);
  const android = existsSync(path.join(root, 'android'));
  const ios = existsSync(path.join(root, 'ios')) && platform === 'darwin';
  const manager = packageManager(root, pkg);
  const steps = [];

  const native = targets.some((key) => ['android', 'ios', 'pods', 'deps'].includes(key));
  if (native && expo && !android && !ios) {
    steps.push('Start the app again with a clean cache: npx expo start -c');
    return steps;
  }
  if (native) {
    const runs = [];
    if (android && (targets.includes('android') || targets.includes('deps'))) runs.push(expo ? 'npx expo run:android' : `${manager} run android`);
    if (ios && ['ios', 'pods', 'deps'].some((key) => targets.includes(key))) runs.push(expo ? 'npx expo run:ios' : `${manager} run ios`);
    if (runs.length > 0) steps.push(`Rebuild the app: ${runs.join(' / ')}. The first build after a clean takes longer.`);
  }
  if (targets.includes('metro') || targets.includes('watchman') || targets.includes('deps')) {
    steps.push(`Start Metro with a clean cache: ${expo ? 'npx expo start -c' : 'npx react-native start --reset-cache'}`);
  }
  return steps;
}

// Size of a file or folder in bytes, without following symlinks. 0 when unreadable.
export function diskSize(target) {
  let total = 0;
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    try {
      const stats = lstatSync(current);
      total += stats.size;
      if (stats.isDirectory()) for (const name of readdirSync(current)) stack.push(path.join(current, name));
    } catch {
      // gone or unreadable: count it as empty
    }
  }
  return total;
}

function entry(places, target, file, kind, extra) {
  const exists = existsSync(file);
  return { target, path: file, display: displayPath(places, file), exists, size: exists ? diskSize(file) : 0, kind, ...extra };
}

// Paths in the project are shown relative to it, the temp folder as $TMPDIR (with Metro's
// long hashes cut short) and the home folder as ~.
function displayPath({ root, home, tmpdir }, file) {
  const inside = (dir) => {
    const relative = path.relative(dir, file);
    return !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : null;
  };
  if (inside(root) !== null) return inside(root);
  if (inside(tmpdir) !== null) {
    const name = inside(tmpdir);
    return `$TMPDIR/${name.length > 32 ? `${name.slice(0, 30)}…` : name}`;
  }
  if (inside(home) !== null) return path.join('~', inside(home));
  return file;
}

// `bundle exec pod install` needs the gems from the Gemfile, so install them first if they're missing.
function installPods(root, step, run) {
  if (step.command === 'bundle' && !run('bundle', ['check'], root, { quiet: true })) {
    if (!run('bundle', ['install'], root)) return false;
  }
  return run(step.command, step.args, step.cwd);
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  return !result.error && result.status === 0;
}

function removePath(target) {
  rmSync(target, { recursive: true, force: true });
}

export function runCommand(command, args, cwd, { quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' });
  return !result.error && result.status === 0;
}
