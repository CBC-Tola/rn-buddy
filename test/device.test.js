import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  androidSdk,
  androidTools,
  findTarget,
  lanIp,
  listDevices,
  parseAdbDevices,
  parseAvds,
  parseDevicectl,
  parseDevicectlUdids,
  parsePorts,
  parseSimulators,
  pickableTargets,
  reverseCommands,
  runCommands,
  runInvocation,
  runTargets,
  startCommands,
  startTargets,
  waitForEmulator,
} from '../src/lib/device.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

const ADB_DEVICES = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1
R58M123ABC             device usb:1-1 product:panther model:Pixel_7 device:panther transport_id:2
0123456789ABCDEF       unauthorized usb:1-2 transport_id:3
192.168.1.20:5555      offline transport_id:4

`;

const AVDS = `INFO    | Storing crashdata in: /tmp/android-tola/emu-crash-35.2.10.db
Pixel_8_API_35
Medium_Phone_API_36
`;

const SIMCTL = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
      { udid: 'AAAA-17', name: 'iPhone 15', state: 'Shutdown', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-18-4': [
      { udid: 'BBBB-18', name: 'iPhone 16', state: 'Shutdown', isAvailable: true },
      { udid: 'CCCC-18', name: 'iPhone 16 Pro', state: 'Booted', isAvailable: true },
      { udid: 'DDDD-18', name: 'iPhone 15', state: 'Shutdown', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-4': [
      { udid: 'EEEE-W', name: 'Apple Watch Series 10', state: 'Shutdown', isAvailable: true },
    ],
  },
});

const DEVICECTL = `Devices:
Name            Hostname                        Identifier                             State                Model
-------------   -----------------------------   ------------------------------------   ------------------   --------------------------
Tola's iPhone   Tolas-iPhone.coredevice.local   9A1B2C3D-0000-1111-2222-333344445555   available (paired)   iPhone 15 Pro (iPhone16,1)
Studio Mac      Studio.coredevice.local         11112222-3333-4444-5555-666677778888   connected            Mac Studio (Mac14,13)
`;

// A fake `run` that answers like the real tools.
function fakeRun(outputs, calls = []) {
  return (command, args) => {
    const key = [path.basename(command), ...args].join(' ');
    calls.push(key);
    const answer = outputs[key];
    if (answer === undefined) return { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } };
    return { status: 0, stdout: answer, stderr: '', error: null };
  };
}

const ALL_TOOLS = {
  'adb devices -l': ADB_DEVICES,
  'adb -s emulator-5554 emu avd name': 'Pixel_8_API_35\r\nOK\r\n',
  'emulator -list-avds': AVDS,
  'xcrun simctl list devices available --json': SIMCTL,
  'xcrun devicectl list devices': DEVICECTL,
};

test('parseAdbDevices reads serial, state and model', () => {
  const devices = parseAdbDevices(ADB_DEVICES);
  assert.deepEqual(
    devices.map((d) => [d.serial, d.state, d.model, d.emulator, d.wifi]),
    [
      ['emulator-5554', 'device', 'sdk gphone64 arm64', true, false],
      ['R58M123ABC', 'device', 'Pixel 7', false, false],
      ['0123456789ABCDEF', 'unauthorized', null, false, false],
      ['192.168.1.20:5555', 'offline', null, false, true],
    ],
  );
  assert.deepEqual(parseAdbDevices('List of devices attached\n\n'), []);
  assert.equal(parseAdbDevices('ABC no permissions (user in plugdev group); see [http://x]\n')[0].state, 'no permissions');
});

test('parseAvds skips emulator log lines', () => {
  assert.deepEqual(parseAvds(AVDS), ['Pixel_8_API_35', 'Medium_Phone_API_36']);
});

test('parseSimulators keeps iOS only, booted first, newest iOS first', () => {
  const sims = parseSimulators(SIMCTL);
  assert.deepEqual(
    sims.map((s) => `${s.name} ${s.runtime} ${s.state}`),
    ['iPhone 16 Pro iOS 18.4 Booted', 'iPhone 16 iOS 18.4 Shutdown', 'iPhone 15 iOS 18.4 Shutdown', 'iPhone 15 iOS 17.5 Shutdown'],
  );
  assert.deepEqual(parseSimulators('not json'), []);
});

test('parseDevicectl reads the table and keeps iPhones and iPads', () => {
  assert.deepEqual(parseDevicectl(DEVICECTL), [
    { name: "Tola's iPhone", udid: '9A1B2C3D-0000-1111-2222-333344445555', state: 'available (paired)', model: 'iPhone 15 Pro (iPhone16,1)' },
  ]);
  assert.deepEqual(parseDevicectl('No devices found.\n'), []);
});

test('parseDevicectlUdids maps the CoreDevice identifier to the hardware UDID', () => {
  const json = JSON.stringify({
    result: { devices: [{ identifier: '9A1B2C3D-0000-1111-2222-333344445555', hardwareProperties: { udid: '00008101-001468603E11001E' } }, { identifier: 'X' }] },
  });
  assert.deepEqual([...parseDevicectlUdids(json)], [['9A1B2C3D-0000-1111-2222-333344445555', '00008101-001468603E11001E']]);
  assert.equal(parseDevicectlUdids('not json').size, 0);
});

test('listDevices uses the hardware UDID for phones, and falls back to the table identifier', () => {
  const json = JSON.stringify({
    result: { devices: [{ identifier: '9A1B2C3D-0000-1111-2222-333344445555', hardwareProperties: { udid: '00008101-001468603E11001E' } }] },
  });
  const opts = { env: {}, platform: 'darwin', exists: () => false };
  const withJson = listDevices({ ...opts, run: fakeRun({ ...ALL_TOOLS, 'xcrun devicectl list devices --quiet --json-output /dev/stdout': json }) });
  assert.equal(withJson.ios.phones[0].udid, '00008101-001468603E11001E');
  const without = listDevices({ ...opts, run: fakeRun(ALL_TOOLS) });
  assert.equal(without.ios.phones[0].udid, '9A1B2C3D-0000-1111-2222-333344445555');
});

test('androidSdk and androidTools find the SDK like Android Studio installs it', () => {
  assert.equal(androidSdk({ ANDROID_HOME: '/sdk' }), '/sdk');
  assert.equal(androidSdk({ ANDROID_SDK_ROOT: '/old' }), '/old');
  assert.equal(androidSdk({}, 'darwin', '/Users/tola'), '/Users/tola/Library/Android/sdk');
  assert.equal(androidSdk({}, 'linux', '/home/tola'), '/home/tola/Android/Sdk');

  const tools = androidTools({ ANDROID_HOME: '/sdk' }, 'darwin', (file) => file === '/sdk/platform-tools/adb');
  assert.equal(tools.adb, '/sdk/platform-tools/adb');
  assert.equal(tools.emulator, 'emulator');
});

test('listDevices puts everything together, with AVD names for running emulators', () => {
  const { android, ios } = listDevices({ run: fakeRun(ALL_TOOLS), env: {}, platform: 'darwin', exists: () => false });
  assert.equal(android.devices[0].avd, 'Pixel_8_API_35');
  assert.deepEqual(android.avds, ['Pixel_8_API_35', 'Medium_Phone_API_36']);
  assert.equal(ios.simulators.length, 4);
  assert.equal(ios.phones[0].name, "Tola's iPhone");

  const targets = startTargets({ android, ios });
  assert.deepEqual(
    targets.filter((t) => t.running).map((t) => t.name),
    ['Pixel_8_API_35', 'iPhone 16 Pro'],
  );
});

test('listDevices: missing tools and other platforms', () => {
  const calls = [];
  const none = listDevices({ run: fakeRun({}, calls), env: {}, platform: 'linux', exists: () => false });
  assert.equal(none.android.missing.adb, true);
  assert.equal(none.android.missing.emulator, true);
  assert.equal(none.ios.supported, false);
  assert.ok(!calls.some((call) => call.startsWith('xcrun')));

  const noXcode = listDevices({ run: fakeRun({ 'adb devices -l': '' }), env: {}, platform: 'darwin', exists: () => false });
  assert.equal(noXcode.ios.missing, true);
  assert.deepEqual(noXcode.ios.phones, []);
});

test('findTarget: exact, partial, loose and ambiguous names', () => {
  const { android, ios } = listDevices({ run: fakeRun(ALL_TOOLS), env: {}, platform: 'darwin', exists: () => false });
  const targets = startTargets({ android, ios });

  assert.equal(findTarget('Pixel_8_API_35', targets).match.kind, 'emulator');
  assert.equal(findTarget('pixel 8', targets).match.name, 'Pixel_8_API_35');
  assert.equal(findTarget('medium', targets).match.name, 'Medium_Phone_API_36');
  assert.equal(findTarget('iphone 16 pro', targets).match.id, 'CCCC-18');
  // "iPhone 16" is an exact name, even though "iPhone 16 Pro" contains it.
  assert.equal(findTarget('iPhone 16', targets).match.id, 'BBBB-18');
  // The same name on two iOS versions: the newest wins.
  assert.equal(findTarget('iphone 15', targets).match.id, 'DDDD-18');
  assert.equal(findTarget('AAAA-17', targets).match.runtime, 'iOS 17.5');
  assert.deepEqual(findTarget('iphone', targets).matches.map((t) => t.name), ['iPhone 16 Pro', 'iPhone 16', 'iPhone 15', 'iPhone 15']);
  assert.deepEqual(findTarget('galaxy', targets).matches, []);
});

test('startCommands boot an emulator detached, or a simulator then the Simulator app', () => {
  const tools = { emulator: '/sdk/emulator/emulator' };
  assert.deepEqual(startCommands({ kind: 'emulator', id: 'Pixel_8_API_35' }, tools), [
    { command: '/sdk/emulator/emulator', args: ['-avd', 'Pixel_8_API_35'], detached: true },
  ]);
  assert.deepEqual(startCommands({ kind: 'simulator', id: 'CCCC-18' }, tools), [
    { command: 'xcrun', args: ['simctl', 'boot', 'CCCC-18'] },
    { command: 'open', args: ['-a', 'Simulator'] },
  ]);
});

test('reverseCommands forward Metro and extra ports on every ready device', () => {
  const devices = parseAdbDevices(ADB_DEVICES);
  const steps = reverseCommands(devices, [3000, 8081], '/sdk/platform-tools/adb');
  assert.deepEqual(
    steps.map((s) => s.args.join(' ')),
    [
      '-s emulator-5554 reverse tcp:8081 tcp:8081',
      '-s emulator-5554 reverse tcp:3000 tcp:3000',
      '-s R58M123ABC reverse tcp:8081 tcp:8081',
      '-s R58M123ABC reverse tcp:3000 tcp:3000',
    ],
  );
  assert.equal(steps[0].command, '/sdk/platform-tools/adb');
});

test('parsePorts accepts numbers and comma lists', () => {
  assert.deepEqual(parsePorts(['3000', '4000,5000']), [3000, 4000, 5000]);
  assert.deepEqual(parsePorts(undefined), []);
  assert.throws(() => parsePorts(['api']), /not a port number/);
  assert.throws(() => parsePorts(['70000']), /not a port number/);
});

test('lanIp picks the first private IPv4 that is not internal', () => {
  const interfaces = {
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    en5: [{ address: '169.254.10.2', family: 'IPv4', internal: false }],
    utun3: [{ address: '100.64.1.5', family: 'IPv4', internal: false }],
    en0: [
      { address: 'fe80::1', family: 'IPv6', internal: false },
      { address: '192.168.1.23', family: 'IPv4', internal: false },
    ],
  };
  assert.equal(lanIp(interfaces), '192.168.1.23');
  assert.equal(lanIp({ utun3: interfaces.utun3 }), '100.64.1.5');
  assert.equal(lanIp({ lo0: interfaces.lo0 }), null);
});

test('runCommands use the package manager, and Expo', () => {
  assert.equal(runCommands().iosOn('iPhone 16'), 'npm run ios -- --simulator "iPhone 16"');
  assert.equal(runCommands({ manager: 'yarn' }).iosOn('iPhone 16'), 'yarn ios --simulator "iPhone 16"');
  assert.equal(runCommands({ manager: 'pnpm' }).android, 'pnpm android');
  assert.equal(runCommands({ expo: true }).androidOn('emulator-5554'), 'npx expo run:android --device emulator-5554');
});

test('runTargets lists what is ready, with the platform of each', () => {
  const found = listDevices({ run: fakeRun(ALL_TOOLS), env: {}, platform: 'darwin', exists: () => false });
  const targets = runTargets(found);
  assert.deepEqual(
    targets.map((t) => [t.platform, t.kind, t.name, t.running]),
    [
      ['android', 'emulator', 'Pixel_8_API_35', true],
      ['android', 'phone', 'Pixel 7', true],
      ['android', 'emulator', 'Medium_Phone_API_36', false],
      ['ios', 'phone', "Tola's iPhone", true],
      ['ios', 'simulator', 'iPhone 16 Pro', true],
      ['ios', 'simulator', 'iPhone 16', false],
      ['ios', 'simulator', 'iPhone 15', false],
      ['ios', 'simulator', 'iPhone 15', false],
    ],
  );
  // Unauthorized and offline phones are left out; older iOS versions are not offered in the list.
  assert.ok(!targets.some((t) => ['0123456789ABCDEF', '192.168.1.20:5555'].includes(t.id)));
  assert.deepEqual(
    pickableTargets(targets).filter((t) => t.kind === 'simulator').map((t) => t.id),
    ['CCCC-18', 'BBBB-18', 'DDDD-18'],
  );
});

test('runInvocation picks the command from the device platform', () => {
  const android = { platform: 'android', kind: 'phone', name: 'Pixel 7', id: 'R58M123ABC' };
  const sim = { platform: 'ios', kind: 'simulator', name: 'iPhone 16 Pro', id: 'CCCC-18' };
  const phone = { platform: 'ios', kind: 'phone', name: "Tola's iPhone", id: '00008101-001468603E11001E' };
  assert.deepEqual(runInvocation(android), { command: 'npm', args: ['run', 'android', '--', '--device', 'R58M123ABC'] });
  assert.deepEqual(runInvocation(sim, { manager: 'yarn' }), { command: 'yarn', args: ['ios', '--simulator', 'iPhone 16 Pro'] });
  assert.deepEqual(runInvocation(phone), { command: 'npm', args: ['run', 'ios', '--', '--device', '00008101-001468603E11001E'] });
  assert.deepEqual(runInvocation(sim, { expo: true }), { command: 'npx', args: ['expo', 'run:ios', '--device', 'iPhone 16 Pro'] });
  assert.deepEqual(runInvocation(android, { expo: true }), { command: 'npx', args: ['expo', 'run:android', '--device', 'R58M123ABC'] });
});

test('waitForEmulator returns the serial once the emulator has booted', async () => {
  let polls = 0;
  const run = (command, args) => {
    const key = args.join(' ');
    if (key === 'devices -l') return { status: 0, stdout: polls++ < 2 ? 'List of devices attached\n' : ADB_DEVICES, stderr: '' };
    if (key === '-s emulator-5554 emu avd name') return { status: 0, stdout: 'Pixel_8_API_35\r\nOK\r\n', stderr: '' };
    if (key === '-s emulator-5554 shell getprop sys.boot_completed') return { status: 0, stdout: polls < 4 ? '\n' : '1\r\n', stderr: '' };
    return { status: 1, stdout: '', stderr: '' };
  };
  const sleep = async () => {};
  assert.equal(await waitForEmulator('Pixel_8_API_35', { adb: 'adb' }, { run, sleep }), 'emulator-5554');
  assert.equal(await waitForEmulator('Other_AVD', { adb: 'adb' }, { run, sleep, timeout: 0 }), null);
});

function rnBuddy(...args) {
  // An empty PATH and SDK folder: no adb, emulator or xcrun, like a fresh machine.
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { NO_COLOR: '1', PATH: '', ANDROID_HOME: '/nonexistent-sdk', HOME: process.env.HOME },
  });
}

test('CLI: rn-buddy device without the tools explains what to install', () => {
  const root = makeProject({ 'package.json': { name: 'DemoApp', dependencies: { 'react-native': '0.88.0' } } });
  const { status, stdout } = rnBuddy('device', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /DemoApp · React Native 0\.88\.0/);
  assert.match(stdout, /⚠ adb +not found\n +→ Install Android platform-tools with Android Studio/);
});

test('CLI: rn-buddy device connect prints the addresses to use', () => {
  const root = makeProject({ 'package.json': { name: 'DemoApp' } });
  const { status, stdout } = rnBuddy('device', 'connect', '--port', '3000', '--dir', root);
  assert.equal(status, 1);
  assert.match(stdout, /adb not found/);
  assert.match(stdout, /Android emulator +http:\/\/10\.0\.2\.2:3000/);
  assert.match(stdout, /iOS simulator +http:\/\/localhost:3000/);
  assert.match(stdout, /Configure Bundler/);

  const bad = rnBuddy('device', 'reboot', '--dir', root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Unknown action "reboot"/);
});

test('CLI: rn-buddy run says what is missing when there is nothing to run on', () => {
  const root = makeProject({ 'package.json': { name: 'DemoApp', dependencies: { 'react-native': '0.88.0' } } });
  for (const args of [[], ['pixel']]) {
    const { status, stdout } = rnBuddy('run', ...args, '--dir', root);
    assert.equal(status, 1);
    assert.match(stdout, /adb not found/);
    assert.match(stdout, /No device, emulator or simulator to run on/);
  }
});
