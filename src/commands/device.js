import pc from 'picocolors';
import {
  findTarget,
  lanIp,
  listDevices,
  METRO_PORT,
  parsePorts,
  reverseCommands,
  runCommands,
  runTool,
  startCommands,
  startDetached,
  startTargets,
} from '../lib/device.js';
import { isExpo, packageManager, readProject } from '../lib/project.js';
import { ok, printHeader, printRows, printStep, warn } from '../lib/ui.js';

const ADB_MISSING = 'Install Android platform-tools with Android Studio (SDK Manager), then set ANDROID_HOME';
const EMULATOR_MISSING = 'Install the Android Emulator with Android Studio (SDK Manager → SDK Tools), then set ANDROID_HOME';
const XCODE_MISSING = 'Install Xcode from the App Store, then run: sudo xcode-select -s /Applications/Xcode.app';

export async function device(action = 'list', name, options = {}) {
  const project = readProjectOrNull(options.dir);
  if (project) printHeader(project);
  const commands = runCommands({
    manager: project ? packageManager(project.root, project.pkg) : 'npm',
    expo: project ? isExpo(project.pkg) : false,
  });

  if (action === 'list') return list(commands);
  if (action === 'start') return start(name, commands);
  if (action === 'connect') return connect(parsePorts(options.port));
  throw new Error(`Unknown action "${action}". Use rn-buddy device, rn-buddy device start <name> or rn-buddy device connect.`);
}

function list(commands) {
  const found = listDevices();
  const { android, ios } = found;

  printRows('Android', androidRows(android));
  if (ios.supported) printRows('iOS', iosRows(ios));

  const next = nextSteps(found, commands);
  if (next.length > 0) {
    console.log(`\n${pc.bold('Run the app')}`);
    const width = Math.max(...next.map(([command]) => command.length));
    for (const [command, why] of next) console.log(`  ${pc.cyan(command.padEnd(width))}  ${pc.dim(why)}`);
  }
  if (commands.android.startsWith('npx expo')) {
    console.log(pc.dim('  With Expo Go instead of a development build: npx expo start, then press a or i'));
  }
  if (android.devices.some((d) => !d.emulator)) {
    console.log(pc.dim('\nAndroid phone on USB? rn-buddy device connect lets it reach Metro and your API.'));
  }
}

function androidRows({ missing, devices, avds }) {
  const rows = [];
  if (missing.adb) rows.push({ name: 'adb', status: 'warn', message: 'not found', hint: ADB_MISSING });
  for (const d of devices) {
    const label = d.emulator ? d.avd ?? d.model ?? d.serial : d.model ?? d.serial;
    const kind = d.emulator ? 'emulator' : d.wifi ? 'phone (Wi-Fi)' : 'phone (USB)';
    rows.push(deviceRow(label, kind, d));
  }
  const running = new Set(devices.map((d) => d.avd).filter(Boolean));
  for (const avd of avds.filter((name) => !running.has(name))) {
    rows.push({ name: avd, status: 'skip', message: 'emulator · not running', hint: `rn-buddy device start ${avd}` });
  }
  if (missing.emulator && !missing.adb) {
    rows.push({ name: 'emulator', status: 'warn', message: 'not found', hint: EMULATOR_MISSING });
  } else if (!missing.emulator && avds.length === 0) {
    rows.push({
      name: 'Emulators',
      status: 'skip',
      message: 'none yet',
      hint: 'Create one in Android Studio: Device Manager → Create Virtual Device',
    });
  }
  if (!missing.adb && devices.length === 0 && avds.length > 0) {
    rows.push({
      name: 'Phones',
      status: 'skip',
      message: 'none connected',
      hint: 'Plug in a phone with USB debugging on (Settings → Developer options)',
    });
  }
  return rows;
}

function deviceRow(label, kind, { serial, state }) {
  if (state === 'device') return { name: label, status: 'ok', message: `${kind} · ready  ${pc.dim(serial)}` };
  if (state === 'unauthorized') {
    return {
      name: label,
      status: 'warn',
      message: `${kind} · unauthorized`,
      hint: 'Unlock the phone and tap Allow on the "Allow USB debugging?" prompt',
    };
  }
  if (state === 'offline') {
    return { name: label, status: 'warn', message: `${kind} · offline`, hint: 'Unplug it and plug it back in, or run: adb kill-server' };
  }
  if (state === 'no permissions') {
    return {
      name: label,
      status: 'warn',
      message: `${kind} · no permissions`,
      hint: 'On Linux, add a udev rule for the phone: https://developer.android.com/studio/run/device',
    };
  }
  return { name: label, status: 'warn', message: `${kind} · ${state}` };
}

// Booted simulators, then the rest on the newest iOS version; older iOS versions are only counted.
function iosRows({ missing, simulators, phones }) {
  if (missing) return [{ name: 'Simulators', status: 'warn', message: 'xcrun simctl not found', hint: XCODE_MISSING }];
  const rows = phones.map((p) => ({
    name: p.name,
    status: /unavailable/i.test(p.state) ? 'warn' : 'ok',
    message: `iPhone · ${p.state || 'connected'}${p.model ? pc.dim(`  ${p.model}`) : ''}`,
    hint: /unavailable/i.test(p.state) ? 'Unlock it, connect it with a cable and tap Trust This Computer' : undefined,
  }));
  if (simulators.length === 0) {
    rows.push({
      name: 'Simulators',
      status: 'warn',
      message: 'none installed',
      hint: 'Xcode → Settings → Components: install an iOS simulator runtime',
    });
    return rows;
  }
  const newest = simulators.filter((s) => s.state !== 'Booted')[0]?.version;
  const shown = simulators.filter((s) => s.state === 'Booted' || s.version === newest);
  for (const sim of shown) {
    rows.push(
      sim.state === 'Booted'
        ? { name: sim.name, status: 'ok', message: `simulator · ${sim.runtime} · booted` }
        : { name: sim.name, status: 'skip', message: `simulator · ${sim.runtime}` },
    );
  }
  const hidden = simulators.length - shown.length;
  if (hidden > 0) {
    rows.push({ name: `+ ${hidden} more`, status: 'skip', message: 'on older iOS versions (xcrun simctl list devices)' });
  }
  return rows;
}

function nextSteps({ android, ios }, commands) {
  const steps = [];
  const ready = android.devices.filter((d) => d.state === 'device');
  if (ready.length === 1) steps.push([commands.android, 'build and open the app on the running Android device']);
  else if (ready.length > 1) steps.push([commands.androidOn(ready[0].serial), 'pick the Android device with --device <id>']);
  else if (android.avds.length > 0) steps.push([`rn-buddy device start ${android.avds[0]}`, `then ${commands.android}`]);

  const booted = ios.simulators.find((s) => s.state === 'Booted');
  const sim = booted ?? ios.simulators[0];
  if (sim) steps.push([commands.iosOn(sim.name), booted ? 'run on the booted simulator' : 'boots this simulator and runs the app']);
  const phone = ios.phones.find((p) => !/unavailable/i.test(p.state));
  if (phone) steps.push([commands.iosPhone(phone.name), 'run on your iPhone (needs a signing team in Xcode)']);
  return steps;
}

function start(name, commands) {
  if (!name) throw new Error('Which one? Use rn-buddy device start <name>. Run rn-buddy device to see the names.');
  const found = listDevices();
  const targets = startTargets(found);
  if (targets.length === 0) {
    console.log('');
    if (found.android.missing.emulator) warn(`emulator not found. ${EMULATOR_MISSING}`);
    if (found.ios.supported && found.ios.missing) warn(`xcrun not found. ${XCODE_MISSING}`);
    warn('No emulators or simulators to start. Create one in Android Studio (Device Manager) or Xcode (Settings → Components).');
    process.exitCode = 1;
    return;
  }

  const { match, matches } = findTarget(name, targets);
  if (!match) {
    console.log(`\n${matches.length ? `"${name}" matches more than one:` : `Nothing called "${name}". You can start:`}`);
    for (const t of matches.length ? matches : targets) {
      console.log(`  ${t.name}${pc.dim(` · ${t.kind}${t.runtime ? ` · ${t.runtime}` : ''}${t.running ? ' · running' : ''}`)}`);
    }
    console.log(pc.dim('\nUse a longer part of the name, in quotes if it has spaces.'));
    process.exitCode = 1;
    return;
  }

  console.log('');
  const label = `${match.name}${match.runtime ? ` (${match.runtime})` : ''}`;
  if (match.running && match.kind === 'emulator') {
    ok(`${label} is already running.`);
  } else {
    for (const step of startCommands(match, found.android.tools)) {
      console.log(pc.dim(`$ ${[shortTool(step.command), ...step.args].join(' ')}`));
      if (step.detached) {
        startDetached(step.command, step.args);
        continue;
      }
      const result = runTool(step.command, step.args, { timeout: 60000 });
      // Booting a simulator that is already booted is fine: we still bring the Simulator app forward.
      if (result.status !== 0 && !/current state: Booted/i.test(result.stderr)) {
        warn(`That didn't work: ${(result.stderr || result.error?.message || '').trim().split('\n')[0]}`);
        process.exitCode = 1;
        return;
      }
    }
    ok(match.kind === 'emulator' ? `Starting ${label}. It takes a little while to boot.` : `Started ${label}.`);
  }
  const run = match.kind === 'emulator' ? commands.android : commands.iosOn(match.name);
  console.log(pc.dim(`→ When it's on the home screen, run: ${run}`));
}

function connect(ports) {
  const { android } = listDevices({ ios: false });
  const ip = lanIp();
  const apiPort = ports[0] ?? 3000;

  console.log(`\n${pc.bold('Android phone over USB')}`);
  if (android.missing.adb) {
    warn(`adb not found. ${ADB_MISSING}.`);
    process.exitCode = 1;
  } else {
    for (const d of android.devices.filter((d) => d.state === 'unauthorized')) {
      warn(`${d.serial}: unlock the phone and tap Allow on the "Allow USB debugging?" prompt, then run this again.`);
    }
    const steps = reverseCommands(android.devices, ports, android.tools.adb);
    if (steps.length === 0) {
      console.log(pc.dim('  No Android device connected. Plug in the phone with USB debugging on (Settings → Developer options).'));
    } else {
      console.log(
        pc.dim(`  adb reverse makes localhost:<port> on the device reach localhost:<port> on this computer, over the cable.`),
      );
      for (const step of steps) {
        console.log(pc.dim(`  $ adb ${step.args.join(' ')}`));
        const result = runTool(step.command, step.args);
        const what = `localhost:${step.port}${step.port === METRO_PORT ? ' (Metro)' : ''}`;
        if (result.status === 0) ok(`${step.serial}: ${what} now reaches this computer`);
        else {
          warn(`${step.serial}: adb reverse failed: ${(result.stderr || '').trim().split('\n')[0]}`);
          process.exitCode = 1;
        }
      }
      console.log(pc.dim('  → Run it again after unplugging the phone or restarting adb.'));
    }
  }

  console.log(`\n${pc.bold('Reaching your computer from the app')} ${pc.dim(`(e.g. an API on port ${apiPort})`)}`);
  const usb = `after adb reverse (rn-buddy device connect${ports.length ? '' : ` --port ${apiPort}`})`;
  const rows = [
    ['Android emulator', `http://10.0.2.2:${apiPort}`, "10.0.2.2 is the emulator's name for your computer"],
    ['iOS simulator', `http://localhost:${apiPort}`, "the simulator shares your computer's network"],
    ['Android over USB', `http://localhost:${apiPort}`, usb],
    ip
      ? ['Phone on Wi-Fi', `http://${ip}:${apiPort}`, 'your computer on the local network; same Wi-Fi needed']
      : ['Phone on Wi-Fi', pc.yellow('no network address found'), 'connect this computer to Wi-Fi'],
  ];
  const width = Math.max(...rows.map(([, url]) => url.length));
  for (const [label, url, why] of rows) printStep(label, [`${url.padEnd(width)}  ${pc.dim(why)}`], 18);
  console.log(pc.dim('  → The server must listen on all addresses (0.0.0.0), not only localhost, for phones on Wi-Fi.'));

  console.log(`\n${pc.bold('iPhone')}`);
  console.log('  Debug builds find Metro over Wi-Fi by themselves when the iPhone and this computer are on the same network.');
  console.log(
    `  If it can't connect: shake the phone → Dev Menu → Configure Bundler, ` +
      `and enter ${ip ?? "your computer's IP"} and port ${METRO_PORT}.`,
  );
}

function shortTool(command) {
  return command.split(/[\\/]/).pop();
}

// `device` also works outside a project; it then shows npm commands.
function readProjectOrNull(dir) {
  try {
    return readProject(dir ?? process.cwd());
  } catch {
    return null;
  }
}
