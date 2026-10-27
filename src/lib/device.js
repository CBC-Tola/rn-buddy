import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Metro, the bundler that serves your JS to the app, listens on this port.
export const METRO_PORT = 8081;

// `run(command, args, { timeout })` returns { status, stdout, stderr, error } like spawnSync,
// so tests can pass a fake. `start(command, args)` starts a program and doesn't wait for it.
export function runTool(command, args, { timeout = 15000 } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, shell: process.platform === 'win32' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error ?? null };
}

export function startDetached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// The Android SDK folder: ANDROID_HOME, ANDROID_SDK_ROOT, or where Android Studio installs it.
export function androidSdk(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.ANDROID_HOME) return env.ANDROID_HOME;
  if (env.ANDROID_SDK_ROOT) return env.ANDROID_SDK_ROOT;
  if (platform === 'darwin') return path.join(home, 'Library', 'Android', 'sdk');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
  return path.join(home, 'Android', 'Sdk');
}

// adb and emulator from the SDK, or the bare name so the PATH is used.
export function androidTools(env = process.env, platform = process.platform, exists = existsSync) {
  const sdk = androidSdk(env, platform);
  const exe = platform === 'win32' ? '.exe' : '';
  const pick = (folder, name) => {
    const file = path.join(sdk, folder, name + exe);
    return exists(file) ? file : name;
  };
  return { sdk, adb: pick('platform-tools', 'adb'), emulator: pick('emulator', 'emulator') };
}

// `adb devices -l`:
//   List of devices attached
//   emulator-5554   device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1
//   R58M123ABC      unauthorized usb:1-1 transport_id:2
export function parseAdbDevices(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices') && !line.startsWith('*'))
    .map((line) => {
      const match = line.match(/^(\S+)\s+(no permissions|\S+)(.*)$/);
      if (!match) return null;
      const [, serial, state, rest] = match;
      const model = rest.match(/\bmodel:(\S+)/)?.[1]?.replace(/_/g, ' ') ?? null;
      return { serial, state, model, emulator: serial.startsWith('emulator-'), wifi: /:\d+$/.test(serial) };
    })
    .filter(Boolean);
}

// `emulator -list-avds` prints one AVD name per line, sometimes after INFO/WARNING lines.
export function parseAvds(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(INFO|WARNING|ERROR)\b/.test(line) && !line.includes(' | '));
}

// `xcrun simctl list devices available --json`: iOS simulators only, booted first, newest iOS first.
export function parseSimulators(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const simulators = [];
  for (const [runtime, devices] of Object.entries(data.devices ?? {})) {
    const match = runtime.match(/SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/);
    if (!match) continue;
    const version = match.slice(1).filter(Boolean).join('.');
    for (const device of devices) {
      if (device.isAvailable === false) continue;
      simulators.push({ name: device.name, udid: device.udid, state: device.state, runtime: `iOS ${version}`, version });
    }
  }
  return simulators.sort(
    (a, b) => Number(b.state === 'Booted') - Number(a.state === 'Booted') || compareVersions(b.version, a.version),
  );
}

// `xcrun devicectl list devices` prints a table; its JSON only goes to a file. The dashes line
// under the header gives the column widths:
//   Name            Hostname                        Identifier       State                Model
//   -------------   -----------------------------   --------------   ------------------   ---------------------------
//   Tola's iPhone   Tolas-iPhone.coredevice.local   00008110-0012…   available (paired)   iPhone 15 Pro (iPhone16,1)
export function parseDevicectl(text) {
  const lines = text.split('\n');
  const dashes = lines.findIndex((line) => /^-+(\s+-+)+\s*$/.test(line));
  if (dashes < 1) return [];
  const header = lines[dashes - 1];
  const columns = [...lines[dashes].matchAll(/-+/g)].map((match) => match.index);
  const names = columns.map((start, i) => header.slice(start, columns[i + 1]).trim().toLowerCase());
  return lines
    .slice(dashes + 1)
    .filter((line) => line.trim())
    .map((line) => {
      const row = Object.fromEntries(names.map((name, i) => [name, line.slice(columns[i], columns[i + 1]).trim()]));
      return { name: row.name, udid: row.identifier, state: row.state ?? '', model: row.model ?? '' };
    })
    .filter((device) => device.name && /iPhone|iPad/i.test(`${device.model} ${device.name}`));
}

// `xcrun devicectl list devices --json-output` has what the table lacks: the hardware UDID that
// `react-native run-ios --device` expects (00008101-001468603E11001E), not the CoreDevice identifier
// shown in the table. Returns a Map of CoreDevice identifier -> hardware UDID.
export function parseDevicectlUdids(json) {
  try {
    const devices = JSON.parse(json).result?.devices ?? [];
    return new Map(devices.filter((d) => d.identifier && d.hardwareProperties?.udid).map((d) => [d.identifier, d.hardwareProperties.udid]));
  } catch {
    return new Map();
  }
}

// Everything we can find. Missing tools give { missing: true } instead of throwing.
// `platform` decides whether to look for iOS at all (macOS only).
// `ios: false` skips the iOS lookups when only Android matters (`device connect`).
export function listDevices({
  run = runTool,
  env = process.env,
  platform = process.platform,
  exists = existsSync,
  ios: withIos = true,
} = {}) {
  const tools = androidTools(env, platform, exists);
  const android = { tools, missing: { adb: false, emulator: false }, devices: [], avds: [] };

  const adb = run(tools.adb, ['devices', '-l']);
  if (isMissing(adb)) android.missing.adb = true;
  else android.devices = parseAdbDevices(adb.stdout);

  // A running emulator only shows as emulator-5554: ask it for its AVD name.
  for (const device of android.devices.filter((d) => d.emulator && d.state === 'device')) {
    const name = run(tools.adb, ['-s', device.serial, 'emu', 'avd', 'name'], { timeout: 5000 });
    device.avd = name.status === 0 ? name.stdout.split('\n')[0].trim() || null : null;
  }

  const avds = run(tools.emulator, ['-list-avds']);
  if (isMissing(avds)) android.missing.emulator = true;
  else android.avds = parseAvds(avds.stdout);

  const ios = { supported: platform === 'darwin' && withIos, missing: false, simulators: [], phones: [] };
  if (ios.supported) {
    const simctl = run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
    if (isMissing(simctl) || simctl.status !== 0) ios.missing = true;
    else ios.simulators = parseSimulators(simctl.stdout);
    // devicectl comes with Xcode 15+; any failure just means no phones to show.
    const devicectl = run('xcrun', ['devicectl', 'list', 'devices'], { timeout: 10000 });
    if (!isMissing(devicectl) && devicectl.status === 0) {
      ios.phones = parseDevicectl(devicectl.stdout);
      if (ios.phones.length > 0) {
        const json = run('xcrun', ['devicectl', 'list', 'devices', '--quiet', '--json-output', '/dev/stdout'], { timeout: 10000 });
        const udids = json.status === 0 ? parseDevicectlUdids(json.stdout) : new Map();
        // The table's identifier stays as a fallback when the JSON isn't available.
        for (const phone of ios.phones) phone.udid = udids.get(phone.udid) ?? phone.udid;
      }
    }
  }
  return { android, ios };
}

// Emulators and simulators `device start` can start.
export function startTargets({ android, ios }) {
  const running = new Set(android.devices.map((device) => device.avd).filter(Boolean));
  return [
    ...android.avds.map((name) => ({ kind: 'emulator', name, id: name, running: running.has(name) })),
    ...ios.simulators.map((sim) => ({
      kind: 'simulator',
      name: sim.name,
      id: sim.udid,
      runtime: sim.runtime,
      version: sim.version,
      running: sim.state === 'Booted',
    })),
  ];
}

// Finds what the user meant: exact name or ID first, then a case-insensitive part of the name,
// ignoring spaces, dashes and underscores ("pixel 8" finds Pixel_8_API_35).
// Returns { match } or { matches } when it's ambiguous or nothing matched (then matches is []).
export function findTarget(query, targets) {
  const lower = query.toLowerCase();
  const loose = (text) => text.toLowerCase().replace(/[\s_\-()]+/g, '');
  const tries = [
    (t) => t.id === query || t.name === query,
    (t) => t.name.toLowerCase() === lower,
    (t) => t.name.toLowerCase().includes(lower),
    (t) => loose(t.name).includes(loose(query)),
  ];
  for (const test of tries) {
    const matches = targets.filter(test);
    if (matches.length === 1) return { match: matches[0] };
    if (matches.length > 1) {
      // The same simulator name on several iOS versions: take the newest iOS.
      if (matches.every((t) => t.kind === 'simulator' && t.name === matches[0].name)) {
        return { match: [...matches].sort((a, b) => compareVersions(b.version, a.version))[0] };
      }
      return { matches };
    }
  }
  return { matches: [] };
}

// The commands that start an emulator or simulator.
export function startCommands(target, tools) {
  if (target.kind === 'emulator') return [{ command: tools.emulator, args: ['-avd', target.id], detached: true }];
  return [
    { command: 'xcrun', args: ['simctl', 'boot', target.id] },
    { command: 'open', args: ['-a', 'Simulator'] },
  ];
}

// `adb reverse` makes localhost:<port> on the phone go to localhost:<port> on this computer, over USB.
export function reverseCommands(devices, ports, adb = 'adb') {
  const all = [...new Set([METRO_PORT, ...ports])];
  return devices
    .filter((device) => device.state === 'device')
    .flatMap((device) =>
      all.map((port) => ({
        serial: device.serial,
        port,
        command: adb,
        args: ['-s', device.serial, 'reverse', `tcp:${port}`, `tcp:${port}`],
      })),
    );
}

export function parsePorts(values = []) {
  return values.flatMap((value) => String(value).split(',')).map((value) => {
    const port = Number(value.trim());
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`"${value}" is not a port number. Use a number like 3000, e.g. rn-buddy device connect --port 3000`);
    }
    return port;
  });
}

// The computer's address on the local network: the first non-internal IPv4, preferring private
// ranges (192.168.x, 10.x, 172.16-31.x) over others such as VPNs, and skipping 169.254.x (no network).
export function lanIp(interfaces = os.networkInterfaces()) {
  const addresses = Object.values(interfaces)
    .flat()
    .filter((entry) => entry && (entry.family === 'IPv4' || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address)
    .filter((address) => !address.startsWith('169.254.'));
  const isPrivate = (address) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
  return addresses.find(isPrivate) ?? addresses[0] ?? null;
}

// How to run the app, for the project's package manager. npm needs `--` before extra arguments.
export function runCommands({ manager = 'npm', expo = false } = {}) {
  if (expo) {
    return {
      android: 'npx expo run:android',
      androidOn: (device) => `npx expo run:android --device ${quote(device)}`,
      ios: 'npx expo run:ios',
      iosOn: (device) => `npx expo run:ios --device ${quote(device)}`,
      iosPhone: (device) => `npx expo run:ios --device ${quote(device)}`,
    };
  }
  const script = (name) => (manager === 'npm' ? `npm run ${name}` : `${manager} ${name}`);
  const extra = manager === 'npm' ? ' --' : '';
  return {
    android: script('android'),
    androidOn: (device) => `${script('android')}${extra} --device ${quote(device)}`,
    ios: script('ios'),
    iosOn: (device) => `${script('ios')}${extra} --simulator ${quote(device)}`,
    iosPhone: (device) => `${script('ios')}${extra} --device ${quote(device)}`,
  };
}

export function isMissing(result) {
  return result.error?.code === 'ENOENT';
}

function quote(text) {
  return /^[\w.-]+$/.test(text) ? text : `"${text}"`;
}

function compareVersions(a = '0', b = '0') {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
