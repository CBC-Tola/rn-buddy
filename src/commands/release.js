import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { isExpo, readProject } from '../lib/project.js';
import {
  AAB_PATH,
  SIGNING_DOCS,
  applyAndroidRelease,
  buildCommand,
  formatCommand,
  iosReleaseRows,
  passwordsFilled,
  planAndroidRelease,
  releaseCheckRows,
  runCommand,
} from '../lib/release.js';
import { xcworkspace } from '../lib/native.js';
import { ICONS, confirm, ok, printHeader, printRows, printStep, summarize, warn } from '../lib/ui.js';

const TARGETS = ['check', 'android', 'ios'];

export async function release(target, options = {}) {
  if (!target) {
    printIntro();
    return;
  }
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown release target "${target}". Use rn-buddy release check, android or ios.`);
  }

  const project = readProject(options.dir ?? process.cwd());
  printHeader(project);
  if (target === 'check') releaseCheck(project);
  else if (target === 'ios') releaseIos(project);
  else await releaseAndroid(project, options);
}

function printIntro() {
  console.log(`${pc.bold('rn-buddy release')}  Get your app ready for Google Play and the App Store

  ${pc.cyan('check')}    a checklist before you release: version, icon, permissions, URLs, secrets, signing
  ${pc.cyan('android')}  first Android release: upload key, signing config, then the .aab for Google Play
  ${pc.cyan('ios')}      what to check, then the Xcode steps to archive and upload to TestFlight

${pc.dim('Start with rn-buddy release check. release android takes --dry-run to see the plan first.')}`);
}

function releaseCheck(project) {
  const rows = releaseCheckRows(project);
  printRows('Before you release', rows);
  console.log(`\n${summarize(rows)}`);
  if (isExpo(project.pkg)) console.log(pc.dim('Expo: build for the stores with npx eas-cli build, then npx eas-cli submit.'));
  else console.log(pc.dim('Next: rn-buddy release android, rn-buddy release ios'));
  if (rows.some((row) => row.status === 'fail')) {
    console.log(pc.dim('Fix the ✖ items first: the stores reject the build or the app breaks for users.'));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

async function releaseAndroid(project, options) {
  const { root, pkg } = project;
  const hasAndroid = existsSync(path.join(root, 'android'));
  if (isExpo(pkg) && !hasAndroid) {
    printExpoGuide('android');
    return;
  }
  if (!hasAndroid) throw new Error(`No android/ folder in ${root}, so there is no Android app to release.`);
  if (isExpo(pkg)) {
    warn('Expo project: if you use npx expo prebuild, it rewrites android/ and these changes are lost. npx eas-cli build -p android signs the app for you.');
  }

  const plan = planAndroidRelease(project);
  printPlan(project, plan);

  const changes = plan.steps.filter((step) => step.status === 'apply');
  const build = buildCommand(root);
  if (options.dryRun) {
    console.log(pc.dim('\nDry run: nothing was changed.'));
    return;
  }
  if (changes.length > 0) {
    if (!options.yes && !(await confirm())) {
      console.log('Cancelled. Nothing was changed.');
      return;
    }
    console.log('');
    applyAndroidRelease(project, plan);
    for (const step of changes) {
      if (step.id === 'keystore') ok(`Created ${step.file}`);
      else ok(`${step.id === 'properties' ? 'Wrote' : 'Edited'} ${tildify(step.file)}`);
    }
  }
  for (const step of plan.steps.filter((s) => s.status === 'manual')) {
    console.log(pc.yellow(`⚠ Do this by hand: ${step.manual}`));
  }

  const propsFile = tildify(path.join(plan.gradleHome, 'gradle.properties'));
  if (!existsSync(plan.keystorePath)) return;
  if (!passwordsFilled(plan.names, plan.gradleHome)) {
    console.log(`\n${pc.bold('Next')}`);
    console.log(`  1. Open ${pc.cyan(propsFile)} and replace ${pc.bold('CHANGE_ME')} (twice) with the password you gave keytool.`);
    console.log(pc.dim('     PKCS12 keystores use the same password for the store and the key.'));
    console.log(`  2. Run ${pc.bold('rn-buddy release android')} again to build the .aab.`);
    printBackup(plan);
    return;
  }

  if (plan.steps.some((s) => s.id === 'gradle' && s.status === 'manual')) {
    console.log(pc.dim(`\nAfter the build.gradle change, build with: ${formatCommand(build, root)}`));
    printBackup(plan);
    return;
  }
  if (!options.yes && !(await askBuild())) {
    console.log(pc.dim(`\nBuild it when you're ready: ${formatCommand(build, root)}`));
    printBackup(plan);
    return;
  }

  console.log(pc.dim(`\n$ ${formatCommand(build, root)}`));
  const result = runCommand(build.command, build.args, { cwd: build.cwd, interactive: true });
  if (result.ok && existsSync(path.join(root, AAB_PATH))) {
    console.log('');
    ok(`Built ${AAB_PATH}`);
    console.log(`\n${pc.bold('Next')}`);
    console.log('  1. Try the release build on a phone first: npx react-native run-android --mode release');
    console.log('  2. Upload the .aab in Google Play Console → your app → Test and release → Internal testing.');
  } else {
    console.log(pc.yellow('\n⚠ The build failed. Copy the first error into rn-buddy why "<error>" to find out why.'));
    process.exitCode = 1;
  }
  printBackup(plan);
}

async function askBuild() {
  try {
    return await confirm('Build the release .aab now? It takes a few minutes.');
  } catch {
    return false; // not a terminal: just print the command
  }
}

function printPlan({ root }, plan) {
  console.log(`\n${pc.bold('release android')}  Sign your app for Google Play ${pc.dim(`(${SIGNING_DOCS})`)}\n`);
  for (const step of plan.steps) {
    const file = tildify(step.file);
    if (step.status === 'done') {
      printStep('Done', [`${file} ${pc.dim(step.id === 'keystore' ? 'already exists' : 'already set up')}`]);
    } else if (step.status === 'manual') {
      printStep('Edit', [`${file}`, pc.yellow(`⚠ do by hand: it doesn't look like the React Native template`)]);
    } else if (step.id === 'keystore') {
      printStep('Create', [file, pc.dim(`  ${step.description}`), pc.dim(`  $ ${showJavaHome(formatCommand(step.command, root))}`)]);
    } else if (step.id === 'properties') {
      printStep('Write', [file, pc.dim(`  ${step.description}`), ...step.lines.map((line) => pc.dim(`  ${line}`))]);
    } else {
      printStep('Edit', [file, pc.dim(`  ${step.description}`)]);
    }
  }
  printStep('Then', [`${formatCommand(buildCommand(root), root)} ${pc.dim(`builds ${AAB_PATH}`)}`]);
}

function printBackup(plan) {
  console.log(`\n${ICONS.warn} ${pc.bold('Back up')} android/app/${plan.names.keystore} and its password (a password manager works).`);
  console.log(pc.dim('  It is not in git. With Play App Signing (the default) Google keeps the real signing key, so a lost'));
  console.log(pc.dim('  upload key can be reset from Play Console, but that takes days. Without it, you could never update the app.'));
}

// ---------------------------------------------------------------------------

function releaseIos(project) {
  const { root, pkg } = project;
  if (isExpo(pkg) && !existsSync(path.join(root, 'ios'))) {
    printExpoGuide('ios');
    return;
  }
  if (!existsSync(path.join(root, 'ios'))) throw new Error(`No ios/ folder in ${root}, so there is no iOS app to release.`);

  const rows = iosReleaseRows(project);
  printRows('Before you archive', rows);
  console.log(`\n${summarize(rows)}`);

  const workspace = xcworkspace(root);
  const open = workspace ? `open ${path.relative(root, workspace)}` : 'open ios/<App>.xcworkspace';
  console.log(`\n${pc.bold('Steps in Xcode')} ${pc.dim('(rn-buddy can only guide you: signing needs your Apple account)')}`);
  [
    `Open the workspace, not the .xcodeproj: ${pc.cyan(open)}`,
    'Select the app target → Signing & Capabilities → Team: your Apple Developer account (paid, for the App Store).',
    'In the device menu at the top, choose "Any iOS Device (arm64)".',
    'Product → Archive. This makes a release build with the JS bundled in; it takes a few minutes.',
    'In the Organizer window that opens: Distribute App → App Store Connect → Upload.',
    'In App Store Connect → your app → TestFlight, the build shows up after processing (about 15 minutes).',
  ].forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log(pc.dim('\nRun rn-buddy release check first. Each upload needs a higher build number: rn-buddy app version patch.'));
  if (rows.some((row) => row.status === 'fail')) process.exitCode = 1;
}

function printExpoGuide(platform) {
  const store = platform === 'ios' ? 'App Store / TestFlight' : 'Google Play';
  console.log(`\n${pc.bold(`release ${platform}`)}  Expo project: EAS Build makes the store build in the cloud\n`);
  printStep('Build', [`npx eas-cli build --platform ${platform}`]);
  printStep('Upload', [`npx eas-cli submit --platform ${platform} ${pc.dim(`sends it to ${store}`)}`]);
  console.log(
    pc.dim(
      platform === 'ios'
        ? '\nEAS asks for your Apple account and creates the certificates and profiles for you.'
        : '\nEAS creates the upload keystore and keeps it safe for you. The first upload to Google Play must be done by hand in Play Console.',
    ),
  );
  console.log(pc.dim('Run rn-buddy release check first. Docs: https://docs.expo.dev/build/setup/'));
}

// "$JAVA_HOME/bin/keytool" reads better than a long JDK path, and works when typed.
function showJavaHome(line) {
  const javaHome = process.env.JAVA_HOME;
  return javaHome ? line.replace(path.join(javaHome, 'bin', 'keytool'), '$JAVA_HOME/bin/keytool') : line;
}

function tildify(file) {
  const home = os.homedir();
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}
