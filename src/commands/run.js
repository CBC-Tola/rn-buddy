import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import {
  findTarget,
  listDevices,
  pickableTargets,
  runInvocation,
  runTargets,
  runTool,
  startCommands,
  startDetached,
  waitForEmulator,
} from '../lib/device.js';
import { isExpo, packageManager, readProject } from '../lib/project.js';
import { ask, printHeader, warn } from '../lib/ui.js';

export async function run(name, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  printHeader(project);
  const expo = isExpo(project.pkg);
  const invocationOptions = { manager: packageManager(project.root, project.pkg), expo };

  const found = listDevices();
  const targets = runTargets(found);
  if (targets.length === 0) return noDevices(found);

  const target = name ? lookup(name, targets, found) : await choose(pickableTargets(targets), found);
  if (!target) return;

  // The platform follows the device. A bare React Native project needs that platform's folder.
  if (!expo && !existsSync(path.join(project.root, target.platform))) {
    throw new Error(`This project has no ${target.platform}/ folder, so it can't run on ${target.name}.`);
  }

  console.log('');
  let id = target.id;
  if (target.platform === 'android' && !target.running) {
    id = await bootEmulator(target, found.android.tools);
    if (!id) return;
  }

  const { command, args } = runInvocation({ ...target, id }, invocationOptions);
  console.log(pc.dim(`$ ${[command, ...args].join(' ')}`));
  const result = spawnSync(command, args, { cwd: project.root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    warn(`Could not run ${command}: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}

function noDevices({ android, ios }) {
  console.log('');
  if (android.missing.adb) warn('adb not found. Install Android platform-tools with Android Studio (SDK Manager), then set ANDROID_HOME.');
  if (ios.supported && ios.missing) warn('xcrun not found. Install Xcode from the App Store.');
  warn('No device, emulator or simulator to run on. Plug in a phone with USB debugging on, or create an emulator in Android Studio or Xcode.');
  console.log(pc.dim('→ rn-buddy device shows what rn-buddy can see.'));
  process.exitCode = 1;
}

// rn-buddy run "Pixel 8": one device, by (part of) its name or its id.
function lookup(name, targets, found) {
  const { match, matches } = findTarget(name, targets);
  if (match) return match;
  console.log(`\n${matches.length ? `"${name}" matches more than one:` : `Nothing called "${name}". You can run on:`}`);
  for (const t of matches.length ? matches : pickableTargets(targets)) console.log(`  ${describe(t)}`);
  if (found.android.devices.some((d) => d.state !== 'device')) {
    console.log(pc.dim('\nA phone that is unauthorized or offline is not listed. rn-buddy device says why.'));
  }
  console.log(pc.dim('\nUse a longer part of the name, in quotes if it has spaces.'));
  process.exitCode = 1;
  return null;
}

// rn-buddy run: a numbered list; the answer is its number or part of a name.
async function choose(targets, found) {
  if (!process.stdin.isTTY) {
    throw new Error('Not running in a terminal. Name the device: rn-buddy run <device name or id>. rn-buddy device lists them.');
  }
  if (targets.length === 1) {
    console.log(`\nOnly one device: ${describe(targets[0])}`);
    return targets[0];
  }

  console.log('');
  const width = String(targets.length).length;
  targets.forEach((t, i) => console.log(`  ${pc.cyan(String(i + 1).padStart(width))}  ${describe(t)}`));
  if (found.android.devices.some((d) => d.state !== 'device')) {
    console.log(pc.dim('\n  A phone that is unauthorized or offline is not listed. rn-buddy device says why.'));
  }

  for (;;) {
    const reply = await ask(`\nRun on which one? ${pc.dim(`(1-${targets.length}, Enter or Esc to cancel)`)} `, { cancellable: true });
    const answer = reply?.trim();
    if (!answer) {
      console.log(pc.dim(reply === null ? '\nCancelled.' : 'Cancelled.'));
      return null;
    }
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= targets.length) return targets[index - 1];
    const { match } = findTarget(answer, targets);
    if (match) return match;
    warn(`"${answer}" is not on the list. Type a number from 1 to ${targets.length}, or part of a name.`);
  }
}

function describe(t) {
  const kind = t.kind === 'phone' && t.platform === 'ios' ? 'iPhone' : t.kind;
  const details = [t.platform === 'android' ? 'Android' : 'iOS', kind, t.runtime, t.running ? 'running' : null].filter(Boolean);
  return `${t.name}${pc.dim(` · ${details.join(' · ')}`)}`;
}

// An Android emulator that isn't running: start it, wait until it has booted, return its adb serial.
async function bootEmulator(target, tools) {
  for (const step of startCommands({ kind: 'emulator', id: target.id }, tools)) {
    console.log(pc.dim(`$ ${[shortTool(step.command), ...step.args].join(' ')}`));
    startDetached(step.command, step.args);
  }
  console.log(`Starting ${target.name}. Waiting for it to boot...`);
  const serial = await waitForEmulator(target.name, tools, { run: runTool });
  if (!serial) {
    warn(`${target.name} didn't finish booting in 3 minutes. Start it with rn-buddy device start, then run this again.`);
    process.exitCode = 1;
  }
  return serial;
}

function shortTool(command) {
  return command.split(/[\\/]/).pop();
}
