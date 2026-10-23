import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { infoPlist, podfile } from '../native.js';
import { addUsesPermissions, editJson, escape, manifestFile, removeUsesPermissions } from './edits.js';
import { removePlistStrings, setPlistStrings } from './plist.js';

const DOCS = 'https://github.com/zoontek/react-native-permissions';

// Each permission: what it's for, the name `setup_permissions` uses in the Podfile, the iOS
// usage strings (shown in the system dialog; a missing one crashes the app), the Android
// manifest lines, and the constants to use in JS.
// The usage strings are placeholders: the user should say why *their* app needs it.
export const PERMISSIONS = {
  camera: {
    about: 'take photos or video',
    ios: 'Camera',
    plist: { NSCameraUsageDescription: 'This app uses the camera to take photos.' },
    android: ['<uses-permission android:name="android.permission.CAMERA" />'],
    js: { ios: 'PERMISSIONS.IOS.CAMERA', android: 'PERMISSIONS.ANDROID.CAMERA' },
  },
  microphone: {
    about: 'record audio',
    ios: 'Microphone',
    plist: { NSMicrophoneUsageDescription: 'This app uses the microphone to record audio.' },
    android: ['<uses-permission android:name="android.permission.RECORD_AUDIO" />'],
    js: { ios: 'PERMISSIONS.IOS.MICROPHONE', android: 'PERMISSIONS.ANDROID.RECORD_AUDIO' },
  },
  location: {
    about: 'the location while the app is open',
    ios: 'LocationWhenInUse',
    plist: { NSLocationWhenInUseUsageDescription: 'This app uses your location to show places near you.' },
    android: [
      '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
      '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    ],
    js: { ios: 'PERMISSIONS.IOS.LOCATION_WHEN_IN_USE', android: 'PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION' },
  },
  'location-always': {
    about: 'the location in the background too (ask for location first)',
    ios: 'LocationAlways',
    plist: {
      NSLocationWhenInUseUsageDescription: 'This app uses your location to show places near you.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'This app uses your location in the background to track your trips.',
    },
    android: [
      '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
      '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
      '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />',
    ],
    js: { ios: 'PERMISSIONS.IOS.LOCATION_ALWAYS', android: 'PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION' },
  },
  photos: {
    about: 'read the photo library',
    ios: 'PhotoLibrary',
    plist: { NSPhotoLibraryUsageDescription: 'This app uses your photo library to choose pictures.' },
    android: [
      '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
      '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    ],
    js: { ios: 'PERMISSIONS.IOS.PHOTO_LIBRARY', android: 'PERMISSIONS.ANDROID.READ_MEDIA_IMAGES' },
  },
  contacts: {
    about: 'read the contacts',
    ios: 'Contacts',
    plist: { NSContactsUsageDescription: 'This app uses your contacts to find your friends.' },
    android: ['<uses-permission android:name="android.permission.READ_CONTACTS" />'],
    js: { ios: 'PERMISSIONS.IOS.CONTACTS', android: 'PERMISSIONS.ANDROID.READ_CONTACTS' },
  },
  calendars: {
    about: 'read and add calendar events',
    ios: 'Calendars',
    plist: { NSCalendarsFullAccessUsageDescription: 'This app uses your calendar to add your bookings.' },
    android: [
      '<uses-permission android:name="android.permission.READ_CALENDAR" />',
      '<uses-permission android:name="android.permission.WRITE_CALENDAR" />',
    ],
    js: { ios: 'PERMISSIONS.IOS.CALENDARS', android: 'PERMISSIONS.ANDROID.READ_CALENDAR' },
  },
  notifications: {
    about: 'show notifications (Android 13+ asks, iOS always asks)',
    ios: 'Notifications',
    plist: {},
    android: ['<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'],
    js: null,
  },
  bluetooth: {
    about: 'find and connect to Bluetooth devices',
    ios: 'Bluetooth',
    plist: { NSBluetoothAlwaysUsageDescription: 'This app uses Bluetooth to connect to your devices.' },
    android: [
      '<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />',
      '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
    ],
    js: { ios: 'PERMISSIONS.IOS.BLUETOOTH', android: 'PERMISSIONS.ANDROID.BLUETOOTH_CONNECT' },
  },
  motion: {
    about: 'step counting and physical activity',
    ios: 'Motion',
    plist: { NSMotionUsageDescription: 'This app uses motion data to count your steps.' },
    android: ['<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />'],
    js: { ios: 'PERMISSIONS.IOS.MOTION', android: 'PERMISSIONS.ANDROID.ACTIVITY_RECOGNITION' },
  },
  'face-id': {
    about: 'unlock with Face ID (iOS only)',
    ios: 'FaceID',
    plist: { NSFaceIDUsageDescription: 'This app uses Face ID to unlock your account.' },
    android: [],
    js: { ios: 'PERMISSIONS.IOS.FACE_ID', android: null },
  },
};

const ALIASES = {
  photo: 'photos',
  gallery: 'photos',
  mic: 'microphone',
  audio: 'microphone',
  notification: 'notifications',
  push: 'notifications',
  contact: 'contacts',
  calendar: 'calendars',
  faceid: 'face-id',
  'background-location': 'location-always',
};

// `rn-buddy add permissions camera Location photo` → ['camera', 'location', 'photos'].
export function parsePermissions(args) {
  const names = [];
  for (const arg of args) {
    const name = ALIASES[arg.toLowerCase()] ?? arg.toLowerCase();
    if (!PERMISSIONS[name]) {
      throw new Error(`Unknown permission "${arg}". Choose from: ${Object.keys(PERMISSIONS).join(', ')}.`);
    }
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const PODFILE_REQUIRE = /# Resolve react_native_pods\.rb with node to allow for hoisting\nrequire Pod::Executable\.execute_command\('node', \['-p',\n {2}'require\.resolve\(\n {4}"react-native\/scripts\/react_native_pods\.rb",\n {4}\{paths: \[process\.argv\[1\]\]\},\n {2}\)', __dir__\]\)\.strip\n/;

const NODE_REQUIRE = `def node_require(script)
  # Resolve script with node to allow for hoisting
  require Pod::Executable.execute_command('node', ['-p',
    "require.resolve(
      '#{script}',
      {paths: [process.argv[1]]},
    )", __dir__]).strip
end

node_require('react-native/scripts/react_native_pods.rb')
node_require('react-native-permissions/scripts/setup.rb')
`;
const SETUP_REQUIRE = "node_require('react-native-permissions/scripts/setup.rb')";

export const permissions = {
  summary: 'Ask for camera, location, photos, ... with react-native-permissions',
  docs: DOCS,
  packages: ['react-native-permissions'],
  files: ['src/hooks/usePermission.{ts}'],
  args: {
    label: 'permission',
    choices: PERMISSIONS,
    parse: parsePermissions,
    detect: (root) => detectPermissions(root),
  },
  vars: (ctx) => ({
    permissions: ctx.args.join(', '),
    example: example(ctx.args),
    usageStrings: ctx.args
      .flatMap((name) => Object.keys(PERMISSIONS[name].plist))
      .filter((key, i, keys) => keys.indexOf(key) === i)
      .map((key) => `- \`${key}\``)
      .join('\n'),
  }),
  // No permissions (undo found none to remove): no edits.
  edits: (ctx) => (ctx.args.length === 0 ? [] : [infoPlistEdit(ctx), manifestEdit(ctx), podfileEdit(ctx), appJsonEdit(ctx)]),
  expoGo: false,
};

// The JS example in next.md, for the first permission that uses `check`/`request`.
function example(names) {
  const name = names.find((key) => PERMISSIONS[key].js);
  if (!name) return 'const { status, request } = useNotificationPermission();';
  const { ios, android } = PERMISSIONS[name].js;
  return android
    ? `const permission = Platform.select({ ios: ${ios}, default: ${android} });\nconst { granted, request } = usePermission(permission);`
    : `const { granted, request } = usePermission(${ios});`;
}

function usageStrings(names) {
  return names.flatMap((name) => Object.entries(PERMISSIONS[name].plist).map(([key, value]) => ({ key, value })));
}

function manifestLines(names) {
  return [...new Set(names.flatMap((name) => PERMISSIONS[name].android))];
}

function infoPlistEdit({ args }) {
  const entries = usageStrings(args);
  return {
    id: `plist-${args.join('-')}`,
    packages: ['react-native-permissions'],
    platform: 'ios',
    optional: entries.length === 0,
    description: `usage descriptions for ${args.join(', ')} (edit the sentences: users see them)`,
    manual: `Add ${entries.map((entry) => entry.key).join(', ')} to Info.plist, with a sentence that says why the app needs it`,
    find: (root) => (entries.length === 0 ? null : infoPlist(root)),
    apply: (content) => setPlistStrings(content, entries),
    undo: (content) => removePlistStrings(content, entries),
  };
}

function manifestEdit({ args }) {
  const lines = manifestLines(args);
  return {
    id: `manifest-${args.join('-')}`,
    packages: ['react-native-permissions'],
    platform: 'android',
    optional: lines.length === 0,
    description: `<uses-permission> for ${args.join(', ')}`,
    manual: `Add to AndroidManifest.xml: ${lines.join(' ')}`,
    find: (root) => (lines.length === 0 ? null : manifestFile(root)),
    apply: (content) => addUsesPermissions(content, lines),
    undo: (content) => removeUsesPermissions(content, lines),
  };
}

// The Podfile tells react-native-permissions which iOS permission handlers to build.
function podfileEdit({ args }) {
  const names = args.map((name) => PERMISSIONS[name].ios);
  return {
    id: `podfile-${args.join('-')}`,
    packages: ['react-native-permissions'],
    platform: 'ios',
    description: `setup_permissions([${names.map((name) => `'${name}'`).join(', ')}])`,
    manual: `In ios/Podfile, require react-native-permissions/scripts/setup.rb and call setup_permissions([${names
      .map((name) => `'${name}'`)
      .join(', ')}]): ${DOCS}#ios`,
    find: podfile,
    apply: (content) => addSetupPermissions(content, names),
    undo: (content) => removeSetupPermissions(content, names),
  };
}

export function addSetupPermissions(content, names) {
  let result = content;
  if (!result.includes(SETUP_REQUIRE)) {
    if (result.includes('def node_require')) {
      const pods = /^node_require\(['"]react-native\/scripts\/react_native_pods\.rb['"]\)[ \t]*\n/m.exec(result);
      if (!pods) return null;
      const at = pods.index + pods[0].length;
      result = `${result.slice(0, at)}${SETUP_REQUIRE}\n${result.slice(at)}`;
    } else if (PODFILE_REQUIRE.test(result)) {
      result = result.replace(PODFILE_REQUIRE, NODE_REQUIRE);
    } else {
      return null;
    }
  }

  const block = /^setup_permissions\(\[\n?([\s\S]*?)\]\)[ \t]*\n/m.exec(result);
  if (block) {
    const listed = [...block[1].matchAll(/^\s*['"](\w+)['"]/gm)].map((match) => match[1]);
    const missing = names.filter((name) => !listed.includes(name));
    if (missing.length === 0) return result;
    const body = block[1].endsWith('\n') || block[1] === '' ? block[1] : `${block[1]}\n`;
    const updated = `setup_permissions([\n${body}${missing.map((name) => `  '${name}',\n`).join('')}])\n`;
    return result.replace(block[0], updated.replace('([\n\n', '([\n'));
  }

  const prepare = /^prepare_react_native_project!\n/m.exec(result);
  if (!prepare) return null;
  const at = prepare.index + prepare[0].length;
  const call = `\nsetup_permissions([\n${names.map((name) => `  '${name}',\n`).join('')}])\n`;
  return result.slice(0, at) + call + result.slice(at);
}

// Removes the names; removes the whole call (and its require) when nothing is left.
export function removeSetupPermissions(content, names) {
  const block = /^\n?setup_permissions\(\[\n?([\s\S]*?)\]\)[ \t]*\n/m.exec(content);
  if (!block) return content;
  let body = block[1];
  for (const name of names) body = body.replace(new RegExp(`^[ \\t]*['"]${escape(name)}['"],?[ \\t]*\\n`, 'm'), '');
  if (body === block[1]) return content;
  if (/['"]\w+['"]/.test(body)) return content.replace(block[0], block[0].replace(block[1], body));
  return content.replace(block[0], '').replace(`${SETUP_REQUIRE}\n`, '');
}

// Expo: the library's config plugin writes the Podfile and Info.plist during prebuild.
function appJsonEdit({ args }) {
  const names = args.map((name) => PERMISSIONS[name].ios);
  const entries = usageStrings(args);
  const android = manifestLines(args).map((line) => /android:name="([^"]+)"/.exec(line)[1]);
  return {
    id: `app-json-${args.join('-')}`,
    packages: ['react-native-permissions'],
    platform: 'expo',
    description: 'react-native-permissions config plugin, iOS usage descriptions and Android permissions',
    manual: `Add ["react-native-permissions", { "iosPermissions": ${JSON.stringify(names)} }] to "plugins" in your app config: ${DOCS}#expo`,
    find: appJson,
    apply: (content) =>
      editJson(content, (data) => {
        if (!data.expo || typeof data.expo !== 'object') return false;
        const expo = data.expo;
        expo.plugins ??= [];
        const index = expo.plugins.findIndex((plugin) => [plugin].flat()[0] === 'react-native-permissions');
        const current = index === -1 ? [] : ([expo.plugins[index]].flat()[1]?.iosPermissions ?? []);
        const merged = [...current, ...names.filter((name) => !current.includes(name))];
        if (index === -1) expo.plugins.push(['react-native-permissions', { iosPermissions: merged }]);
        else if (merged.length > current.length) {
          const [plugin, options = {}] = [expo.plugins[index]].flat();
          expo.plugins[index] = [plugin, { ...options, iosPermissions: merged }];
        }
        if (entries.length > 0) {
          expo.ios ??= {};
          expo.ios.infoPlist ??= {};
          for (const { key, value } of entries) if (!expo.ios.infoPlist[key]) expo.ios.infoPlist[key] = value;
        }
        if (android.length > 0) {
          expo.android ??= {};
          expo.android.permissions ??= [];
          for (const name of android) if (!expo.android.permissions.includes(name)) expo.android.permissions.push(name);
        }
      }),
    undo: (content) =>
      editJson(content, (data) => {
        const expo = data.expo;
        if (!expo) return;
        const index = (expo.plugins ?? []).findIndex((plugin) => [plugin].flat()[0] === 'react-native-permissions');
        if (index !== -1) {
          const [plugin, options = {}] = [expo.plugins[index]].flat();
          const left = (options.iosPermissions ?? []).filter((name) => !names.includes(name));
          if (left.length === 0) expo.plugins.splice(index, 1);
          else expo.plugins[index] = [plugin, { ...options, iosPermissions: left }];
          if (expo.plugins.length === 0) delete expo.plugins;
        }
        for (const { key, value } of entries) if (expo.ios?.infoPlist?.[key] === value) delete expo.ios.infoPlist[key];
        if (expo.android?.permissions) expo.android.permissions = expo.android.permissions.filter((name) => !android.includes(name));
        // Drop what is left empty: { ios: { infoPlist: {} } } means nothing.
        if (expo.ios?.infoPlist && Object.keys(expo.ios.infoPlist).length === 0) delete expo.ios.infoPlist;
        if (expo.ios && Object.keys(expo.ios).length === 0) delete expo.ios;
        if (expo.android?.permissions?.length === 0) delete expo.android.permissions;
        if (expo.android && Object.keys(expo.android).length === 0) delete expo.android;
      }),
  };
}

// app.json, unless the project uses app.config.js/ts (code: we can't edit that safely).
export function appJson(root) {
  if (['app.config.js', 'app.config.ts', 'app.config.mjs', 'app.config.cjs'].some((file) => existsSync(path.join(root, file)))) {
    return null;
  }
  const file = path.join(root, 'app.json');
  return existsSync(file) ? file : null;
}

// For `add --undo permissions` without names: the permissions rn-buddy set up, read from
// setup_permissions in the Podfile or the "iosPermissions" of the Expo plugin.
export function detectPermissions(root) {
  const byIos = Object.fromEntries(Object.entries(PERMISSIONS).map(([name, info]) => [info.ios, name]));
  const listed = [];
  const pods = podfile(root);
  const block = pods && /^setup_permissions\(\[([\s\S]*?)\]\)/m.exec(readFileSync(pods, 'utf8'));
  if (block) listed.push(...[...block[1].matchAll(/^\s*['"](\w+)['"]/gm)].map((match) => match[1]));
  const app = appJson(root);
  if (app) {
    try {
      const plugins = JSON.parse(readFileSync(app, 'utf8')).expo?.plugins ?? [];
      const plugin = plugins.find((entry) => [entry].flat()[0] === 'react-native-permissions');
      listed.push(...([plugin].flat()[1]?.iosPermissions ?? []));
    } catch {
      // Not valid JSON: nothing to detect.
    }
  }
  return [...new Set(listed.map((name) => byIos[name]).filter(Boolean))];
}
