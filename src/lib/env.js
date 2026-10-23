import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { LOCKFILES } from './project.js';

// The JDK the React Native docs recommend for Android builds.
// https://reactnative.dev/docs/set-up-your-environment
export const RECOMMENDED_JDK = '17';

const POD_INSTALL = '(cd ios && bundle exec pod install)';

// Every check returns a row: { name, status: 'ok' | 'warn' | 'fail' | 'skip', message, version?, hint? }

// Versions installed on this machine. Commands run inside the project folder so
// version managers (rbenv, jenv, ...) pick the version the project asks for.
// Gradle builds Android with JAVA_HOME when it's set, so that java wins over PATH.
export function detectTools(root, env = process.env) {
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', 'java') : 'java';
  return {
    node: semver.clean(process.version),
    java: commandVersion(java, ['-version'], root),
    javaHome: env.JAVA_HOME ?? null,
    ruby: commandVersion('ruby', ['-v'], root),
    bundler: commandVersion('bundle', ['-v'], root),
    gemsInstalled: gemsInstalled(root),
  };
}

// Whether `bundle check` finds every gem in the Gemfile. null when there is no Gemfile or no Bundler.
function gemsInstalled(root) {
  if (!existsSync(path.join(root, 'Gemfile'))) return null;
  const result = spawnSync('bundle', ['check'], { cwd: root });
  return result.error ? null : result.status === 0;
}

export function checkTools({ root, pkg }, tools, platform = process.platform) {
  return [checkNode(root, pkg, tools.node), checkJava(root, tools), checkRuby(root, tools.ruby, platform)].filter(
    Boolean,
  );
}

export function checkLockfiles({ root, pkg }, platform = process.platform, tools = {}) {
  const jsLockfile = checkJsLockfile(root, pkg);
  const manager = LOCKFILES[jsLockfile.name] ?? 'npm';
  const rows = [
    jsLockfile,
    existsSync(path.join(root, 'node_modules'))
      ? { name: 'node_modules', status: 'ok', message: 'installed' }
      : { name: 'node_modules', status: 'warn', message: 'not installed', hint: `Run ${manager} install` },
  ];

  if (existsSync(path.join(root, 'Gemfile'))) {
    const gemfileLock = checkGemfileLock(root, platform, tools);
    rows.push(gemfileLock);
    if (gemfileLock.status === 'ok' && tools.gemsInstalled === false && platform === 'darwin') {
      rows.push({
        name: 'Ruby gems',
        status: 'warn',
        message: 'not installed, so pod install will fail',
        hint: 'Run bundle install',
      });
    }
  }
  rows.push(checkPods(root, platform));
  return rows.filter(Boolean);
}

// Bundler 1.x calls String#untaint, which Ruby 3.2 removed. Newer Bundlers switch to the
// version in "BUNDLED WITH" and crash, so `bundle install` and `pod install` both fail.
function checkGemfileLock(root, platform, { ruby, bundler }) {
  const lock = readText(path.join(root, 'Gemfile.lock'));
  if (!lock) return { name: 'Gemfile.lock', status: 'warn', message: 'not found', hint: 'Run bundle install and commit Gemfile.lock' };

  const bundledWith = lock.match(/^BUNDLED WITH\s+(\S+)/m)?.[1];
  if (platform === 'darwin' && bundledWith && ruby && semver.coerce(bundledWith)?.major < 2 && semver.gte(ruby, '3.2.0')) {
    return {
      name: 'Gemfile.lock',
      status: 'fail',
      message: `made with Bundler ${bundledWith}, which doesn't run on Ruby ${ruby}`,
      hint: `Run BUNDLE_VERSION=system bundle update --bundler${bundler ? `=${bundler}` : ''}`,
    };
  }
  return { name: 'Gemfile.lock', status: 'ok', message: 'Ruby gem versions are locked' };
}

// The `ruby "..."` line of a Gemfile as a node-semver range:
// `ruby ">= 2.6.10"` → ">=2.6.10", `ruby "~> 3.2"` → "^3.2", `ruby "~> 3.2.1"` → "~3.2.1".
export function gemfileRuby(root) {
  const line = readText(path.join(root, 'Gemfile'))?.match(/^\s*ruby\s+(.+)$/m)?.[1];
  if (!line) return null;
  const parts = [...line.matchAll(/["']([^"']+)["']/g)].map(([, part]) => rubyRequirement(part.trim()));
  return parts.join(' ') || null;
}

function rubyRequirement(text) {
  const [, operator = '', version] = text.match(/^(~>|>=|<=|>|<|=)?\s*(.*)$/);
  if (operator !== '~>') return `${operator}${version}`;
  return (version.split('.').length >= 3 ? '~' : '^') + version;
}

function checkNode(root, pkg, version) {
  return versionRow('Node', version, [
    { range: pkg.engines?.node, source: 'package.json engines', strict: true },
    { range: readJson(path.join(root, 'node_modules', 'react-native', 'package.json'))?.engines?.node, source: 'react-native', strict: true },
    { range: readVersionFile(root, '.nvmrc'), source: '.nvmrc' },
    { range: readVersionFile(root, '.node-version'), source: '.node-version' },
  ], (wanted) => `Install Node ${wanted.range}, e.g. nvm install ${semver.minVersion(wanted.range).major}`);
}

function checkRuby(root, version, platform) {
  if (!existsSync(path.join(root, 'Gemfile'))) return null;
  if (platform !== 'darwin') return { name: 'Ruby', status: 'skip', message: 'only needed to build the iOS app (macOS)' };

  return versionRow('Ruby', version, [
    { range: gemfileRuby(root), source: 'Gemfile', strict: true },
    { range: readVersionFile(root, '.ruby-version')?.replace(/^ruby-/, ''), source: '.ruby-version' },
  ], (wanted) => (wanted ? `Install Ruby ${wanted.range}, e.g. with rbenv` : 'Install Ruby, e.g. with rbenv'));
}

function checkJava(root, { java, javaHome }) {
  if (!existsSync(path.join(root, 'android'))) return null;

  const pinned = readVersionFile(root, '.java-version');
  const wanted = semver.coerce(pinned ?? RECOMMENDED_JDK).major;
  const source = pinned ? '.java-version' : 'React Native docs';
  const from = javaHome ? 'JAVA_HOME' : '`java` on PATH';
  const install = `Install JDK ${wanted} and point JAVA_HOME at it: https://reactnative.dev/docs/set-up-your-environment`;

  if (!java) return { name: 'Java', status: 'fail', message: `not found (${source} wants ${wanted})`, hint: install };

  const parsed = semver.parse(java);
  const major = parsed.major === 1 ? parsed.minor : parsed.major; // Java 8 reports itself as 1.8
  if (major === wanted) return { name: 'Java', version: java, status: 'ok', message: `matches ${wanted} (${source}), from ${from}` };
  if (major < wanted) {
    return { name: 'Java', version: java, status: 'fail', message: `${source} wants ${wanted}, ${from} is older`, hint: install };
  }
  return {
    name: 'Java',
    version: java,
    status: 'warn',
    message: `${source} wants ${wanted}, ${from} is newer`,
    hint: pinned
      ? `Gradle uses ${from}. Point it at JDK ${wanted}, or update .java-version if ${major} builds fine`
      : `Usually fine. If the Android build fails, ${install.charAt(0).toLowerCase()}${install.slice(1)}`,
  };
}

// Compares an installed version with every requirement that has a valid range.
// A strict mismatch (the build will fail) is a "fail"; a version file mismatch is a "warn".
function versionRow(name, version, requirements, hint) {
  const wanted = requirements.filter((req) => req.range && semver.validRange(req.range));
  if (!version) return { name, status: 'fail', message: 'not found', hint: hint(wanted[0]) };
  if (wanted.length === 0) return { name, version, status: 'ok', message: 'no version required by this project' };

  const mismatches = wanted.filter((req) => !semver.satisfies(version, req.range));
  const failed = mismatches.find((req) => req.strict) ?? mismatches[0];
  if (!failed) {
    return { name, version, status: 'ok', message: `matches ${wanted.map((req) => `${req.range} (${req.source})`).join(', ')}` };
  }
  return {
    name,
    version,
    status: failed.strict ? 'fail' : 'warn',
    message: `${failed.source} wants ${failed.range}`,
    hint: hint(failed),
  };
}

function checkJsLockfile(root, pkg) {
  const found = Object.keys(LOCKFILES).filter((file) => existsSync(path.join(root, file)));
  const managers = [...new Set(found.map((file) => LOCKFILES[file]))];

  if (found.length === 0) {
    return {
      name: 'JS lockfile',
      status: 'warn',
      message: 'none found',
      hint: 'Run npm install and commit package-lock.json so everyone installs the same versions',
    };
  }
  if (managers.length > 1) {
    return {
      name: found.join(', '),
      status: 'fail',
      message: `lockfiles from ${managers.join(' and ')}`,
      hint: 'Use one package manager: delete the other lockfiles, then reinstall',
    };
  }

  const [name] = found;
  const declared = pkg.packageManager?.split('@')[0];
  if (declared && declared !== managers[0]) {
    return {
      name,
      status: 'warn',
      message: `but package.json "packageManager" says ${declared}`,
      hint: `Install with ${declared}, or remove "packageManager" from package.json`,
    };
  }
  if (name === 'package-lock.json' && !npmLockInSync(root, pkg)) {
    return {
      name,
      status: 'warn',
      message: 'out of date with package.json',
      hint: 'Run npm install, then commit package-lock.json',
    };
  }
  return { name, status: 'ok', message: name === 'package-lock.json' ? 'npm, matches package.json' : managers[0] };
}

// npm 7+ copies the dependency lists of package.json into the lockfile's root
// entry, so a difference means package.json changed after the last install.
function npmLockInSync(root, pkg) {
  const locked = readJson(path.join(root, 'package-lock.json'))?.packages?.[''];
  if (!locked) return true; // npm 6 lockfile: can't tell
  return ['dependencies', 'devDependencies', 'optionalDependencies'].every((field) =>
    sameEntries(pkg[field], locked[field]),
  );
}

// CocoaPods copies Podfile.lock to Pods/Manifest.lock on every pod install,
// so when they differ the installed pods don't match the lockfile.
function checkPods(root, platform) {
  if (!existsSync(path.join(root, 'ios', 'Podfile'))) return null;
  const name = 'ios/Podfile.lock';
  if (platform !== 'darwin') return { name, status: 'skip', message: 'only needed to build the iOS app (macOS)' };

  const lock = readText(path.join(root, 'ios', 'Podfile.lock'));
  if (!lock) return { name, status: 'warn', message: 'not found', hint: `Run ${POD_INSTALL}` };
  if (lock !== readText(path.join(root, 'ios', 'Pods', 'Manifest.lock'))) {
    return { name, status: 'warn', message: 'ios/Pods is not in sync with it', hint: `Run ${POD_INSTALL}` };
  }
  return { name, status: 'ok', message: 'matches the installed pods' };
}

// First version number a command prints (java prints to stderr),
// or null when the command is missing or fails.
function commandVersion(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return semver.coerce(`${result.stdout}${result.stderr}`)?.version ?? null;
}

// First non-empty line of a version file such as .nvmrc, or null.
function readVersionFile(root, name) {
  return readText(path.join(root, name))?.split('\n').map((line) => line.trim()).find(Boolean) ?? null;
}

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function sameEntries(a = {}, b = {}) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
