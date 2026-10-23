import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { checkTools, detectTools, RECOMMENDED_JDK } from './env.js';
import { androidAppGradle, androidRootGradle, appDelegate, mainActivity, readText } from './native.js';
import { hasNativeCode, installedVersion, isExpo, packageManager } from './project.js';
import { recipeFor } from './recipes.js';

const data = JSON.parse(readFileSync(new URL('../data/errors.json', import.meta.url), 'utf8'));

export const AREAS = data.areas;
export const LEARN_TOPICS = data.learn;
export const CLEAN_LEVELS = data.clean;
export const ERRORS = data.errors.map(compile);

export const ISSUES_URL = 'https://github.com/CBC-Tola/rn-buddy/issues';

const ERROR_WORDS = /\b(error|exception|failed|failure|fatal|cannot|can't|could not|couldn't|unable to|not found|denied|invalid)\b/i;

// Patterns are strings in the JSON so contributors don't have to write code.
function compile(entry) {
  return { ...entry, regexes: entry.patterns.map((pattern) => new RegExp(pattern, entry.flags ?? 'i')) };
}

// Build tools color their output; the codes get in the way of the patterns.
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g, '');
}

// Every entry that matches the text, best first, one per entry:
// [{ entry, groups, index, line, text }]. `line` is 1-based, `text` the line that matched.
// Specific errors come first, in the order they appear: in a build log the first real error is
// usually the cause, and the later ones follow from it. Then wrappers ("BUILD FAILED"), which
// only say that something failed, then warnings, which are rarely why a build broke.
export function findMatches(input, entries = ERRORS) {
  const text = stripAnsi(input).replace(/\r\n?/g, '\n');
  const matches = [];
  for (const entry of entries) {
    // Patterns are listed most specific first, so the first one that matches gives the details
    // (the module name, the file); the earliest position in the log decides the order.
    const found = entry.regexes.map((regex) => regex.exec(text)).filter(Boolean);
    if (found.length === 0) continue;
    const index = Math.min(...found.map((match) => match.index));
    const line = text.slice(0, index).split('\n').length;
    matches.push({ entry, groups: definedGroups(found[0].groups), index, line, text: text.split('\n')[line - 1].trim() });
  }
  const rank = (match) => ({ wrapper: 1, warning: 2 })[match.entry.kind] ?? 0;
  return matches.sort((a, b) => rank(a) - rank(b) || a.index - b.index);
}

function definedGroups(groups = {}) {
  return Object.fromEntries(Object.entries(groups).filter(([, value]) => value !== undefined));
}

// The lines of a log that look most like the real error, for when nothing matched
// or only a wrapper did. Compiler errors first ("e: ..." from Kotlin, "error: ..." from
// Xcode and javac), then Gradle's "What went wrong:" block, then anything error-like.
export function errorLines(input, max = 5) {
  const lines = stripAnsi(input).replace(/\r\n?/g, '\n').split('\n');
  const wrappers = ERRORS.filter((entry) => entry.kind === 'wrapper').flatMap((entry) => entry.regexes);
  const found = [];
  const add = (line) => {
    const text = line.trim().replace(/^[>❌*\s]+/, '').trim();
    if (!text || found.includes(text) || wrappers.some((regex) => regex.test(text))) return;
    found.push(text.length > 200 ? `${text.slice(0, 197)}...` : text);
  };

  lines.filter((line) => /^\s*(e:|error:|❌)|\s(error|fatal error):\s/i.test(line) && !/warning:/i.test(line)).forEach(add);
  lines.forEach((line, i) => {
    if (!/^\*?\s*What went wrong:/.test(line.trim())) return;
    for (const next of lines.slice(i + 1)) {
      if (!next.trim() || /^\*\s/.test(next.trim())) break;
      add(next);
    }
  });
  lines
    .filter((line) => ERROR_WORDS.test(line))
    .filter((line) => !/^\s*(warning|warn)\b|\bwarning:/i.test(line))
    .forEach(add);
  return found.slice(0, max);
}

// Fills {name} placeholders. Unknown names are left as they are.
export function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (all, name) => (vars[name] == null ? all : String(vars[name])));
}

const INSTALL = { npm: 'npm install', yarn: 'yarn add', pnpm: 'pnpm add', bun: 'bun add' };
const REINSTALL = { npm: 'npm install', yarn: 'yarn install', pnpm: 'pnpm install', bun: 'bun install' };

// Commands that depend on the project: its package manager, Expo or the React Native CLI,
// Bundler or a global CocoaPods. Without a project, the React Native template's defaults.
export function projectVars(project) {
  const root = project?.root;
  const manager = project ? packageManager(root, project.pkg) : 'npm';
  const expo = Boolean(project && isExpo(project.pkg));
  const podExec = !root || existsSync(path.join(root, 'Gemfile')) ? 'bundle exec pod' : 'pod';
  const appId = root && readText(androidAppGradle(root))?.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1];
  return {
    install: expo ? 'npx expo install' : INSTALL[manager] ?? 'npm install',
    reinstall: REINSTALL[manager] ?? 'npm install',
    start: expo ? 'npx expo start' : 'npx react-native start',
    resetCache: expo ? 'npx expo start --clear' : 'npx react-native start --reset-cache',
    runAndroid: expo ? 'npx expo run:android' : 'npx react-native run-android',
    runIos: expo ? 'npx expo run:ios' : 'npx react-native run-ios',
    podExec,
    podInstall: `(cd ios && ${podExec} install)`,
    appId: appId ?? '<your.app.id>',
  };
}

// Turns a match into the answer to print: { id, area, kind, title, likely, causes, facts, fixes, then, learn, clean, docs }.
// `context`: { project (or null), env, platform, tools } where `tools` is the result of detectTools, or a
// function that returns it, so Java is only run when a probe needs it. Tests pass fakes.
export function explainMatch({ entry, groups }, context = {}) {
  const ctx = { project: null, env: process.env, platform: process.platform, ...context };
  const expo = Boolean(ctx.project && isExpo(ctx.project.pkg));
  const base = expo && entry.expo ? { ...entry, ...entry.expo } : entry;
  const probe = entry.probe ? (PROBES[entry.probe]?.(ctx, groups, entry) ?? {}) : {};
  const vars = { ...projectVars(ctx.project), ...entry.defaults, ...groups, ...probe.vars };
  const text = (value) => (value ? fill(value, vars) : null);

  return {
    id: entry.id,
    area: entry.area,
    kind: entry.kind ?? 'error',
    title: text(base.title),
    likely: text(probe.cause),
    causes: base.causes.map(text),
    facts: (probe.facts ?? []).map(text),
    fixes: (probe.fixes ?? base.fixes).map(text),
    then: 'then' in probe ? text(probe.then) : text(base.then),
    learn: entry.learn ?? null,
    clean: entry.clean ?? null,
    docs: entry.docs ?? null,
  };
}

// Just the title, without looking at the project: for the "also found" list.
export function matchTitle({ entry, groups }) {
  return fill(entry.title, { ...projectVars(null), ...entry.defaults, ...groups });
}

// Probes look at the project to pick the likely cause. Each returns
// { cause?, facts?, fixes?, then?, vars? } or null when it can't tell.
export const PROBES = {
  module: probeModule,
  nativeModule: probeNativeModule,
  expoGo: probeExpoGo,
  expoSdk: probeExpoSdk,
  pods: probePods,
  java: probeJava,
  androidSdk: probeAndroidSdk,
  androidTools: probeAndroidTools,
  ndk: probeNdk,
  appName: probeAppName,
  duplicateReact: probeDuplicateReact,
};

const OUT_OF_SYNC = `ios/Pods doesn't match ios/Podfile.lock: pod install wasn't run after the last change.`;
const SOURCE_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '.ios.tsx', '.android.tsx', '.ios.js', '.android.js'];

// "Unable to resolve module X": is X a file of the project, a Node.js built-in, or a package,
// and is that package in package.json and in node_modules?
function probeModule({ project }, { module: spec, from }) {
  if (!spec) return null;
  if (/^(\.|\/|[A-Za-z]:[\\/])/.test(spec)) return probeRelativeImport(project, spec, from);

  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const vars = { module: name };
  if (name.startsWith('node:') || builtinModules.includes(name)) {
    return {
      vars,
      cause: `${name} is a Node.js built-in module. Your app runs on the phone, which doesn't have Node's modules.`,
      fixes: [
        'Find the package that imports it (the file after "from" in the error) and use a React Native alternative',
        'Or remove the import if the code only runs on a server',
      ],
      then: null,
    };
  }
  if (!project) return { vars };

  const { root, deps } = project;
  const declared = deps.some((dep) => dep.name === name);
  const installed = installedVersion(root, name) !== null;
  const recipe = recipeFor(name);
  if (!declared && !installed) {
    return {
      vars,
      cause: `It's imported in your code but not installed (it's not in package.json).`,
      fixes: [`\`rn-buddy add ${recipe ?? name}\``, `or: \`{install} ${name}\``],
    };
  }
  if (!installed) {
    return {
      vars,
      cause: `It's in package.json but not in node_modules: the packages weren't installed since it was added.`,
      fixes: ['`{reinstall}`'],
    };
  }
  if (spec !== name && !resolveFile(path.join(root, 'node_modules', spec))) {
    return {
      vars,
      cause: `${name} is installed, but it has no file ${spec.slice(name.length + 1)}. The import path is wrong, or changed in this version.`,
      fixes: [`Check the import path in ${name}'s docs`],
    };
  }
  if (!declared) {
    return {
      vars,
      cause: `It's in node_modules only because another package needs it, not in your package.json.`,
      fixes: [`Add it to your own dependencies: \`{install} ${name}\``],
    };
  }
  return {
    vars,
    cause: `${name} is installed, so Metro's cache is probably out of date (it was installed while Metro was running).`,
    fixes: ['Restart Metro with a clean cache: `{resetCache}`'],
    then: null,
  };
}

function probeRelativeImport(project, spec, from) {
  const fixes = [`Fix the import path${from ? ` in ${shortPath(project, from)}` : ''}: check the spelling and the upper/lower case`];
  if (!from) return null;
  const importer = path.isAbsolute(from) ? from : path.resolve(project?.root ?? process.cwd(), from.trim());
  const dir = path.dirname(importer);
  if (!existsSync(dir)) return null; // a log from another computer
  const target = path.resolve(dir, spec);
  if (resolveFile(target)) {
    return {
      cause: `The file exists, so Metro's cache is probably out of date (it was added or renamed while Metro was running).`,
      fixes: ['Restart Metro with a clean cache: `{resetCache}`'],
      then: null,
    };
  }
  const caseOnly = caseMismatch(target);
  if (caseOnly) {
    return {
      cause: `The file is called ${caseOnly}, but the import says ${path.basename(spec)}. Upper/lower case must match exactly.`,
      fixes,
    };
  }
  return { cause: `There's no file ${spec} next to ${shortPath(project, importer)}.`, fixes };
}

function resolveFile(target) {
  return [
    ...SOURCE_EXTENSIONS.map((ext) => target + ext),
    ...SOURCE_EXTENSIONS.filter(Boolean).map((ext) => path.join(target, `index${ext}`)),
  ].some((file) => existsExactly(file) && !isDirectory(file));
}

// existsSync, but with the exact upper/lower case on every part of the path: macOS and Windows
// ignore case, so Metro can fail on Android or in CI for a file that "exists" on your Mac.
function existsExactly(file) {
  if (!existsSync(file)) return false;
  const { root } = path.parse(file);
  let dir = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    if (!readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

// The name of a file that matches `target` apart from upper/lower case, or null.
function caseMismatch(target) {
  const dir = path.dirname(target);
  if (!existsSync(dir)) return null;
  const wanted = path.basename(target).toLowerCase();
  return (
    readdirSync(dir).find((name) => {
      const lower = name.toLowerCase();
      return name !== path.basename(target) && SOURCE_EXTENSIONS.some((ext) => lower === wanted + ext);
    }) ?? null
  );
}

// "X could not be found", "X is null", "doesn't seem to be linked": which package is it,
// is it installed, and do the pods know about it? Mostly: the app wasn't rebuilt.
function probeNativeModule(ctx, groups) {
  const { project } = ctx;
  if (!project) return null;
  const { root, pkg } = project;
  if (isExpo(pkg) && !existsSync(path.join(root, 'android')) && !existsSync(path.join(root, 'ios'))) {
    return probeExpoGo(ctx, groups);
  }

  const rebuild = ['Rebuild the app: `{runAndroid}` or `{runIos}`'];
  const iosRebuild = existsSync(path.join(root, 'ios', 'Podfile')) ? ['iOS: `{podInstall}`', ...rebuild] : rebuild;
  const name = guessPackage(project, groups.module);
  if (name) {
    if (installedVersion(root, name) === null) {
      return { cause: `${name} is in package.json but not installed.`, fixes: ['`{reinstall}`', ...iosRebuild] };
    }
    const pod = missingPod(root, name);
    if (pod) {
      return {
        cause: `${name} isn't in ios/Podfile.lock: pod install wasn't run after installing it (iOS).`,
        fixes: ['`{podInstall}`', 'Then rebuild: `{runIos}`'],
      };
    }
    if (hasNativeCode(root, name)) {
      return {
        cause: `${name} has native code. It's installed, so the app you're running was built before it was added: reloading only updates JavaScript.`,
        fixes: iosRebuild,
      };
    }
  }
  if (podsOutOfSync(root)) {
    return { cause: OUT_OF_SYNC, fixes: iosRebuild };
  }
  return null;
}

// The package that provides a native module: the name itself when it's a package, or the
// installed native package whose podspec or name looks like the module name
// (RNCAsyncStorage → @react-native-async-storage/async-storage).
function guessPackage({ root, deps }, moduleName) {
  if (!moduleName) return null;
  if (deps.some((dep) => dep.name === moduleName)) return moduleName;
  const wanted = normalize(moduleName);
  const candidates = deps.filter((dep) => !dep.dev && hasNativeCode(root, dep.name));
  const byPodspec = candidates.find((dep) => podspecs(root, dep.name).some((spec) => normalize(spec) === wanted));
  if (byPodspec) return byPodspec.name;
  const byName = candidates.find((dep) => {
    const short = normalize(dep.name.split('/').pop().replace(/^react-native-/, '')).replace(/s$/, '');
    return short.length >= 4 && wanted.includes(short);
  });
  return byName?.name ?? null;
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function podspecs(root, name) {
  const dir = path.join(root, 'node_modules', name);
  return existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.podspec')).map((file) => file.slice(0, -8)) : [];
}

// The pod a package brings when Podfile.lock exists but doesn't list it.
function missingPod(root, name) {
  const lock = readText(path.join(root, 'ios', 'Podfile.lock'));
  if (!lock) return null;
  return podspecs(root, name).find((pod) => !lock.includes(`- ${pod} (`) && !lock.includes(`- ${pod}/`)) ?? null;
}

// CocoaPods copies Podfile.lock to Pods/Manifest.lock on every pod install.
function podsOutOfSync(root) {
  const lock = readText(path.join(root, 'ios', 'Podfile.lock'));
  return Boolean(lock) && lock !== readText(path.join(root, 'ios', 'Pods', 'Manifest.lock'));
}

// Expo Go or a development build? expo-dev-client in package.json means a development build.
function probeExpoGo(ctx, groups) {
  const { project } = ctx;
  if (!project) return null;
  if (!isExpo(project.pkg)) return probeNativeModule(ctx, groups);

  const devBuild = ['`npx expo run:android` or `npx expo run:ios` (or in the cloud: `eas build --profile development`)'];
  if (!project.deps.some((dep) => dep.name === 'expo-dev-client')) {
    return {
      cause: `This project has no expo-dev-client, so it probably runs in Expo Go, which doesn't have this native code.`,
      fixes: ['Make a development build: `npx expo install expo-dev-client`', ...devBuild.map((fix) => `Then ${fix}`)],
      then: 'Start with `npx expo start` and open the app in the development build, not Expo Go',
    };
  }
  return {
    cause: `This project uses a development build. The one on your device was made before this native code was added.`,
    fixes: [`Make a new development build: ${devBuild[0]}`],
  };
}

function probeExpoSdk({ project }) {
  if (!project || !isExpo(project.pkg)) return null;
  const range = project.pkg.dependencies?.expo ?? project.pkg.devDependencies?.expo;
  const version = installedVersion(project.root, 'expo') ?? semver.coerce(range)?.version;
  if (!version) return null;
  return { facts: [`Expo SDK ${semver.major(version)} (expo ${version})`] };
}

// Pods errors: has pod install ever run, and do ios/Pods match Podfile.lock?
function probePods({ project, platform }, groups) {
  if (!project) return null;
  const { root, pkg } = project;
  if (!existsSync(path.join(root, 'ios', 'Podfile'))) {
    if (isExpo(pkg)) {
      return { cause: `There's no ios folder: Expo makes it when you build.`, fixes: ['`npx expo run:ios` (or `npx expo prebuild`)'] };
    }
    return null;
  }
  const lock = readText(path.join(root, 'ios', 'Podfile.lock'));
  const fixes = ['`{podInstall}`', 'Then build the workspace: `{runIos}`'];
  if (platform !== 'darwin') {
    return { cause: 'iOS apps can only be built on a Mac.', fixes: ['Build the iOS app on a Mac, or in the cloud (e.g. EAS Build)'] };
  }
  if (!lock) return { cause: `ios/Podfile.lock doesn't exist: pod install has never run for this project.`, fixes };
  if (!existsSync(path.join(root, 'ios', 'Pods'))) return { cause: `ios/Pods doesn't exist: pod install hasn't run on this computer.`, fixes };
  if (podsOutOfSync(root)) return { cause: OUT_OF_SYNC, fixes };

  const pod = groups.pod;
  const pinned = pod && lock.match(new RegExp(`^\\s*- ${escapeRegExp(pod)} \\(([^)]+)\\)`, 'm'))?.[1];
  if (pinned) {
    return {
      cause: `ios/Podfile.lock pins ${pod} ${pinned}, and a package now needs another version.`,
      fixes: [`Let CocoaPods update it: \`(cd ios && {podExec} update ${pod})\``, 'Still failing? `(cd ios && {podExec} install --repo-update)`'],
    };
  }
  return { facts: ['ios/Pods matches ios/Podfile.lock'] };
}

// Java errors: is JAVA_HOME a real JDK, and which Java does this project want (reuses `env`'s check)?
function probeJava({ project, env, platform, tools }, groups) {
  const facts = [];
  if (groups.major) facts.push(`Class file version ${groups.major} means Java ${Number(groups.major) - 44}`);
  const javaHome = env.JAVA_HOME;
  const javaBin = javaHome && path.join(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java');
  const install = `Install JDK ${RECOMMENDED_JDK} and point JAVA_HOME at it: https://reactnative.dev/docs/set-up-your-environment`;

  if (javaHome && !existsSync(javaBin)) {
    return {
      facts,
      cause: `JAVA_HOME is ${javaHome}, but there's no Java in it (no bin/java).`,
      fixes: [install, platform === 'darwin' ? `See the JDKs you have: \`/usr/libexec/java_home -V\`` : null].filter(Boolean),
    };
  }

  const root = project?.root ?? process.cwd();
  const installed = typeof tools === 'function' ? tools(root) : tools ?? detectTools(root, env);
  if (!installed?.java) {
    return { facts, cause: `No Java found${javaHome ? ' in JAVA_HOME' : ' on your PATH'}.`, fixes: [install] };
  }
  const from = javaHome ? 'JAVA_HOME' : '`java` on your PATH';
  facts.push(`Your terminal uses Java ${installed.java}, from ${from}`);
  const hasAndroid = project && existsSync(path.join(root, 'android'));
  const row = hasAndroid ? checkTools(project, installed, platform).find((check) => check.name === 'Java') : null;
  const major = semver.coerce(installed.java)?.major;

  if (row ? row.status !== 'ok' : String(major) !== RECOMMENDED_JDK) {
    return {
      facts,
      cause: row ? `${row.message}.` : `This project's Android build expects JDK ${RECOMMENDED_JDK}.`,
      fixes: [row?.hint ?? install, 'Then stop old Gradle daemons: `cd android && ./gradlew --stop`'],
    };
  }
  return {
    facts,
    cause: `Java ${installed.java} is right for this project, so the build probably ran with another JDK: Android Studio uses its own Gradle JDK setting, and an old Gradle daemon keeps the JDK it started with.`,
    fixes: [
      'Stop old Gradle daemons: `cd android && ./gradlew --stop`',
      'Android Studio: Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK → JDK 17',
    ],
  };
}

// The usual place of the Android SDK on each platform.
export function defaultSdkDir(env = process.env, platform = process.platform) {
  const home = env.HOME ?? os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Android', 'sdk');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
  return path.join(home, 'Android', 'Sdk');
}

// sdk.dir from android/local.properties (Windows paths are escaped: C\:\\Users\\...).
function localSdkDir(root) {
  const line = readText(path.join(root, 'android', 'local.properties'))?.match(/^\s*sdk\.dir\s*=\s*(.+?)\s*$/m)?.[1];
  return line ? line.replace(/\\(.)/g, '$1') : null;
}

function exportLine(name, value, platform) {
  return platform === 'win32' ? `setx ${name} "${value}"` : `export ${name}=${value}`;
}

// "SDK location not found": ANDROID_HOME and android/local.properties, where Gradle looks.
function probeAndroidSdk({ project, env, platform }) {
  const home = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  const sdkDir = project ? localSdkDir(project.root) : null;
  const usual = defaultSdkDir(env, platform);
  const profile = platform === 'win32' ? 'a new terminal' : 'your shell profile (~/.zshrc or ~/.bashrc), then open a new terminal';
  const setHome = (dir) => `Set ANDROID_HOME in ${profile}: \`${exportLine('ANDROID_HOME', dir, platform)}\``;
  const localProps = (dir) => `Or put \`sdk.dir=${dir.replaceAll('\\', '\\\\')}\` in android/local.properties`;

  if (sdkDir && !existsSync(sdkDir)) {
    return {
      cause: `android/local.properties says sdk.dir=${sdkDir}, but that folder doesn't exist.`,
      fixes: [`Fix the path in android/local.properties${existsSync(usual) ? `: \`sdk.dir=${usual}\`` : ''}`],
    };
  }
  if (home && !existsSync(home)) {
    return {
      cause: `ANDROID_HOME is ${home}, but that folder doesn't exist.`,
      fixes: [existsSync(usual) ? setHome(usual) : 'Install the Android SDK with Android Studio (SDK Manager), then set ANDROID_HOME to its folder'],
    };
  }
  if (home) {
    return {
      facts: [`ANDROID_HOME is ${home}`],
      cause: `ANDROID_HOME is set in this terminal, so the build probably ran where it isn't: another terminal, or an IDE started from the Dock.`,
      fixes: [`Put it in android/local.properties so every build finds it: \`sdk.dir=${home.replaceAll('\\', '\\\\')}\``],
    };
  }
  if (existsSync(usual)) {
    return {
      cause: `ANDROID_HOME isn't set${project ? ' and android/local.properties has no sdk.dir' : ''}, but the SDK is installed at ${usual}.`,
      fixes: [setHome(usual), localProps(usual)],
    };
  }
  return {
    cause: `The Android SDK isn't installed in the usual place (${usual}), and ANDROID_HOME isn't set.`,
    fixes: ['Install Android Studio and the SDK: https://reactnative.dev/docs/set-up-your-environment', setHome(usual)],
  };
}

// "adb: command not found": is the SDK there, and is platform-tools on the PATH?
function probeAndroidTools(ctx) {
  const { env, platform } = ctx;
  const home = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!home || !existsSync(home)) return probeAndroidSdk(ctx);
  const onPath = (env.PATH ?? '').split(path.delimiter).some((dir) => path.resolve(dir) === path.join(home, 'platform-tools'));
  if (onPath) return { facts: [`ANDROID_HOME is ${home}, and platform-tools is on your PATH`] };
  const pathLine =
    platform === 'win32'
      ? 'Add %ANDROID_HOME%\\platform-tools and %ANDROID_HOME%\\emulator to Path in the Environment Variables settings'
      : 'Add to your shell profile: `export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools`, then open a new terminal';
  return { cause: `ANDROID_HOME is set (${home}), but its platform-tools and emulator folders aren't on your PATH.`, fixes: [pathLine] };
}

// NDK errors: which version android/build.gradle asks for, and is it installed and complete?
function probeNdk({ project, env }, groups) {
  const fromGradle = project && readText(androidRootGradle(project.root))?.match(/ndkVersion\s*=\s*["']([^"']+)["']/)?.[1];
  const ndk = groups.ndk ?? fromGradle;
  if (!ndk) return null;
  const vars = { ndk };
  const home = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!home || !existsSync(home)) return { vars };
  const dir = path.join(home, 'ndk', ndk);
  if (!existsSync(dir)) return { vars, cause: `NDK ${ndk} isn't installed in ${path.join(home, 'ndk')}.` };
  if (!existsSync(path.join(dir, 'source.properties'))) {
    return {
      vars,
      cause: `${dir} exists but has no source.properties: the download was interrupted.`,
      fixes: [`Delete ${dir}, then install NDK ${ndk} again in Android Studio → SDK Manager → SDK Tools (Show Package Details)`],
    };
  }
  return { vars, facts: [`NDK ${ndk} is installed`] };
}

// "X has not been registered": does the name match app.json and the native side?
function probeAppName({ project }, { app }) {
  if (!project || !app || isExpo(project.pkg)) return null;
  const { root } = project;
  const appJson = readJsonFile(path.join(root, 'app.json'))?.name;
  const nativeNames = [
    ['MainActivity', readText(mainActivity(root))?.match(/getMainComponentName\(\)[^"]*"([^"]+)"/)?.[1]],
    ['AppDelegate', readText(appDelegate(root))?.match(/(?:withModuleName|moduleName)\s*[:=]\s*@?"([^"]+)"/)?.[1]],
  ].filter(([, name]) => name);

  const files = nativeNames.map(([file]) => file).join(' and ');
  if (appJson && appJson !== app) {
    return {
      cause: `The native app asks for "${app}", but app.json (which index.js registers) says "${appJson}".`,
      fixes: [`Use the same name: set "name" in app.json to "${app}", or rename it in ${files || 'MainActivity and AppDelegate'}`],
    };
  }
  const mismatch = nativeNames.find(([, name]) => name !== app);
  if (mismatch) {
    return {
      cause: `${mismatch[0]} asks for "${mismatch[1]}", but the error is about "${app}": the app you're running isn't this project.`,
      fixes: ['Stop Metro and start it in the folder of the app you are running: `{resetCache}`'],
    };
  }
  if (appJson) {
    return {
      facts: [`app.json and the native app both use "${app}"`],
      cause: `The names match, so either Metro runs from another folder, or an earlier error stopped index.js: look for the first red error.`,
    };
  }
  return null;
}

// Two copies of React break hooks. A copy nested in another package's node_modules is the usual culprit.
function probeDuplicateReact({ project }) {
  if (!project) return null;
  const nodeModules = path.join(project.root, 'node_modules');
  if (!existsSync(nodeModules)) return null;
  const packages = readdirSync(nodeModules).flatMap((name) =>
    name.startsWith('@') && isDirectory(path.join(nodeModules, name))
      ? readdirSync(path.join(nodeModules, name)).map((sub) => `${name}/${sub}`)
      : [name],
  );
  const nested = packages.find((name) => existsSync(path.join(nodeModules, name, 'node_modules', 'react', 'package.json')));
  if (!nested) return null;
  return {
    cause: `There are two copies of React: ${nested} has its own in node_modules/${nested}/node_modules/react.`,
    fixes: [`Update ${nested}, or make it use your React: \`npm dedupe\`, then reinstall: \`{reinstall}\``],
  };
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isDirectory(file) {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function shortPath(project, file) {
  return project && file.startsWith(project.root) ? path.relative(project.root, file) : file;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
