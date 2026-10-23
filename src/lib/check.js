import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lineOf, readSources } from './sources.js';

// `rn-buddy check`: small regex rules for React Native beginner mistakes. No parser, so each
// rule stays simple and errs on the side of saying nothing.
//
// A finding: { rule, level: 'warn' | 'fail' | 'info', file, line, message, hint }
// `file` and `line` are null for project-wide findings (the console.log count).

const LEVELS = { fail: 3, warn: 2, info: 1 };

// Short names for the rules, used by checkRows (doctor) and the summary.
export const RULE_TITLES = {
  'web-elements': 'HTML elements',
  'text-outside-text': 'Text outside <Text>',
  'deprecated-core': 'Old core APIs',
  secrets: 'Secrets',
  'localhost-url': 'localhost URLs',
  'cleartext-url': 'http:// URLs',
  'scrollview-map': 'ScrollView + map',
  'image-size': 'Remote images',
  'flatlist-key': 'FlatList keys',
  'inline-list-props': 'Inline renderItem',
  'console-log': 'console.log',
  'duplicate-react': 'Two copies of React',
  'legacy-package': 'Old packages',
  'unmaintained-package': 'Unmaintained packages',
  'new-arch-package': 'New Architecture',
};

// ---------------------------------------------------------------------------
// Reading source code without a parser

// Two copies of the source with the same length and line numbers:
// - code: comments blanked out, so commented-out code and URLs in comments are ignored
// - bare: comments and the inside of strings blanked out, for rules that look at JSX
export function maskSource(content) {
  const code = content.split('');
  const bare = content.split('');
  const blank = (target, from, to) => {
    for (let i = from; i < to; i += 1) if (target[i] !== '\n') target[i] = ' ';
  };
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    // `//` after a colon is a URL in JSX text (<Text>http://...</Text>), not a comment.
    if (char === '/' && next === '/' && content[i - 1] !== ':') {
      const end = content.indexOf('\n', i);
      const stop = end === -1 ? content.length : end;
      blank(code, i, stop);
      blank(bare, i, stop);
      i = stop;
    } else if (char === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? content.length : end + 2;
      blank(code, i, stop);
      blank(bare, i, stop);
      i = stop;
    } else if (char === '`' || ((char === "'" || char === '"') && !/[\w$]/.test(content[i - 1] ?? ''))) {
      // A quote right after a letter is an apostrophe in JSX text (<Text>Don't</Text>).
      // Plain strings end at the line end, so a stray quote can't hide the rest of the file.
      let j = i + 1;
      while (j < content.length && content[j] !== char && (char === '`' || content[j] !== '\n')) {
        j += content[j] === '\\' ? 2 : 1;
      }
      blank(bare, i + 1, Math.min(j, content.length));
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return { code: code.join(''), bare: bare.join('') };
}

// Whether the `<` at `index` starts a JSX tag, not a comparison (`i < p`) or a
// TypeScript generic (`useRef<View>(null)`).
export function isJsxStart(text, index) {
  const before = text.slice(Math.max(0, index - 40), index);
  if (/[\w$.]$/.test(before)) return false;
  const trimmed = before.trimEnd();
  return trimmed === '' || /[(=>{}?:&|,[;]$/.test(trimmed) || /\b(return|yield|default)$/.test(trimmed);
}

// The JSX elements named by `names` (a regex source such as 'View|Animated\\.View'):
// [{ index, name, attrs, end, selfClosing }]. `end` is just after the opening tag's `>`.
// Works on `bare` text, so `>` inside strings can't end a tag early.
export function jsxElements(bare, names) {
  const elements = [];
  for (const match of bare.matchAll(new RegExp(`<(${names})(?=[\\s/>])`, 'g'))) {
    if (!isJsxStart(bare, match.index)) continue;
    const tag = openingTag(bare, match.index + match[0].length);
    if (!tag) continue;
    elements.push({ index: match.index, name: match[1], ...tag });
  }
  return elements;
}

// Reads attributes up to the `>` that closes the opening tag. Arrow functions in
// attributes (`onPress={() => go()}`) are inside braces, so their `>` is skipped.
function openingTag(bare, from) {
  let depth = 0;
  for (let i = from; i < bare.length; i += 1) {
    const char = bare[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '<' && depth === 0) return null;
    else if (char === '>' && depth === 0) {
      const attrs = bare.slice(from, i);
      return { attrs, end: i + 1, selfClosing: attrs.trimEnd().endsWith('/') };
    }
  }
  return null;
}

// The children of a non-self-closing element: from the end of its opening tag to its closing tag.
function elementBody(bare, element, names) {
  let depth = 1;
  const pattern = new RegExp(`<(${names})(?=[\\s/>])|</(${names})\\s*>`, 'g');
  pattern.lastIndex = element.end;
  for (const match of bare.matchAll(pattern)) {
    if (match.index < element.end) continue;
    if (match[2]) depth -= 1;
    else if (!openingTag(bare, match.index + match[0].length)?.selfClosing) depth += 1;
    if (depth === 0) return bare.slice(element.end, match.index);
  }
  return bare.slice(element.end);
}

// The value of a JSX attribute written with braces, e.g. style={...}, without the outer braces.
function attrValue(attrs, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*\\{`).exec(attrs);
  if (!match) return null;
  let depth = 1;
  for (let i = match.index + match[0].length; i < attrs.length; i += 1) {
    if (attrs[i] === '{') depth += 1;
    else if (attrs[i] === '}' && --depth === 0) return attrs.slice(match.index + match[0].length, i);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source rules. Each gets { file, content, code, bare } and returns [{ index, message, hint?, level? }].

const JSX_FILE = /\.(jsx|tsx|js)$/;
const LIST_HINT = 'FlatList only renders the rows on screen; ScrollView renders every item at once, which gets slow';

function scrollviewMap({ bare }) {
  const names = '(?:Animated\\.)?ScrollView';
  return jsxElements(bare, names)
    .filter((element) => !element.selfClosing && /\.map\s*\(/.test(elementBody(bare, element, names)))
    .map((element) => ({
      index: element.index,
      message: `<${element.name}> renders a list with .map(): fine for a few items, slow for long lists`,
      hint: `Use <FlatList data={items} renderItem={...} /> for long or growing lists. ${LIST_HINT}`,
    }));
}

function flatlistKey({ bare }) {
  return jsxElements(bare, '(?:Animated\\.)?FlatList')
    .filter(({ attrs }) => !/\bkeyExtractor\b/.test(attrs) && !/\{\s*\.\.\./.test(attrs))
    .map((element) => ({
      index: element.index,
      message: `<${element.name}> has no keyExtractor: it uses item.key or item.id, and the index when items have neither`,
      hint: 'Add keyExtractor={(item) => item.id} so rows keep their state when the list changes',
    }));
}

const WEB_ELEMENTS = {
  div: 'View',
  span: 'Text',
  p: 'Text',
  h1: 'Text',
  h2: 'Text',
  h3: 'Text',
  h4: 'Text',
  h5: 'Text',
  h6: 'Text',
  label: 'Text',
  img: 'Image',
  button: 'Pressable (or Button)',
  input: 'TextInput',
  textarea: 'TextInput multiline',
  ul: 'View or FlatList',
  ol: 'View or FlatList',
  li: 'View',
  form: 'View',
};

function webElements({ file, bare, code }) {
  // Expo DOM components ('use dom') and .web.js files really run in a browser.
  if (!JSX_FILE.test(file) || /\.web\.[jt]sx?$/.test(file) || /^\s*['"]use dom['"]/m.test(code)) return [];
  const findings = jsxElements(bare, Object.keys(WEB_ELEMENTS).join('|')).map((element) => ({
    index: element.index,
    message: `<${element.name}> is an HTML element: React Native has no HTML elements`,
    hint: `Use <${WEB_ELEMENTS[element.name]}> instead. React Native has View, Text, Image, Pressable and TextInput`,
  }));
  for (const match of bare.matchAll(/\bonClick\s*=\s*\{/g)) {
    findings.push({
      index: match.index,
      message: 'onClick does nothing in React Native',
      hint: 'Use onPress on a <Pressable> or <Button>',
    });
  }
  return findings;
}

function imageSize({ bare }) {
  return jsxElements(bare, '(?:Animated\\.)?Image')
    .filter(({ attrs }) => /\bsource\s*=\s*\{\s*\{[^}]*\buri\b/.test(attrs))
    .filter(({ attrs }) => !/\{\s*\.\.\./.test(attrs) && !/\b(width|height)\s*=/.test(attrs))
    .filter(({ attrs }) => hasNoSize(bare, attrValue(attrs, 'style')))
    .map((element) => ({
      index: element.index,
      message: `<${element.name}> loads a remote uri but has no width or height, so it shows up 0×0`,
      hint: 'Give it a size: style={{ width: 100, height: 100 }} (or aspectRatio with a width)',
    }));
}

// True only when we can see every style the image gets and none of them sets a size.
// style={styles.avatar} is looked up in the same file; anything else (props.style, a variable) is unknown.
function hasNoSize(bare, style) {
  if (style === null) return true;
  let text = style;
  let unknown = false;
  for (const [ref, key] of style.matchAll(/\b[\w$]+\.([\w$]+)/g)) {
    const definition = new RegExp(`\\b${key}\\s*:\\s*\\{([^{}]*)\\}`).exec(bare);
    if (definition) text += definition[1];
    else unknown = true;
    text = text.replace(ref, '');
  }
  if (/\b(width|height|aspectRatio|flex)\b/.test(text)) return false;
  // Whatever is left after removing objects and style references must be punctuation.
  let rest = style.replace(/\b[\w$]+\.[\w$]+/g, '');
  while (/\{[^{}]*\}/.test(rest)) rest = rest.replace(/\{[^{}]*\}/g, '');
  return !unknown && !/[A-Za-z_$]/.test(rest);
}

// Core APIs that moved to community packages. `removed` ones throw as soon as you use them.
// https://reactnative.dev/docs/components-and-apis and the "Removed from core" errors in react-native/index.js
export const MOVED_APIS = {
  AsyncStorage: { replacement: '@react-native-async-storage/async-storage', removed: true },
  NetInfo: { replacement: '@react-native-community/netinfo', removed: true },
  Picker: { replacement: '@react-native-picker/picker', removed: true },
  PickerIOS: { replacement: '@react-native-picker/picker', removed: true },
  Slider: { replacement: '@react-native-community/slider', removed: true },
  WebView: { replacement: 'react-native-webview', removed: true },
  CameraRoll: { replacement: '@react-native-camera-roll/camera-roll', removed: true },
  CheckBox: { replacement: '@react-native-community/checkbox', removed: true },
  DatePickerIOS: { replacement: '@react-native-community/datetimepicker', removed: true },
  DatePickerAndroid: { replacement: '@react-native-community/datetimepicker', removed: true },
  TimePickerAndroid: { replacement: '@react-native-community/datetimepicker', removed: true },
  ProgressViewIOS: { replacement: '@react-native-community/progress-view', removed: true },
  MaskedViewIOS: { replacement: '@react-native-masked-view/masked-view', removed: true },
  SegmentedControlIOS: { replacement: '@react-native-segmented-control/segmented-control', removed: true },
  ViewPagerAndroid: { replacement: 'react-native-pager-view', removed: true },
  ImagePickerIOS: { replacement: 'react-native-image-picker', removed: true },
  ImageEditor: { replacement: '@react-native-community/image-editor', removed: true },
  ListView: { replacement: 'FlatList or SectionList (from react-native)', removed: true },
  SwipeableListView: { replacement: 'FlatList (from react-native)', removed: true },
  Clipboard: { replacement: '@react-native-clipboard/clipboard', removed: false },
  SafeAreaView: { replacement: 'react-native-safe-area-context', removed: false },
  PushNotificationIOS: { replacement: '@react-native-community/push-notification-ios', removed: false },
  ProgressBarAndroid: { replacement: '@react-native-community/progress-bar-android', removed: false },
};

function deprecatedCore({ code }) {
  const findings = [];
  const patterns = [
    /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g,
    /\{([^}]*)\}\s*=\s*require\(\s*['"]react-native['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const listStart = match.index + match[0].indexOf('{') + 1;
      for (const name of match[1].matchAll(/(?:\btype\s+)?\b([\w$]+)\b(?:\s*(?:as|:)\s*[\w$]+)?/g)) {
        const api = MOVED_APIS[name[1]];
        if (!api) continue;
        findings.push({
          index: listStart + name.index,
          level: api.removed ? 'fail' : 'warn',
          message: api.removed
            ? `${name[1]} was removed from react-native: importing it from there fails as soon as it is used`
            : `${name[1]} from react-native is deprecated and will be removed`,
          hint: `Use ${api.replacement} instead`,
        });
      }
    }
  }
  return findings;
}

const LOCAL_URL = /\bhttps?:\/\/(localhost|127\.0\.0\.1)(:(\d+))?[^\s'"`)]*/g;

function localhostUrl({ code }) {
  return [...code.matchAll(LOCAL_URL)].map((match) => {
    const port = match[3] ?? '';
    const withPort = (host) => `http://${host}${port ? `:${port}` : ''}`;
    return {
      index: match.index,
      message: `${match[0]} means the phone itself, not your computer`,
      hint:
        `Android emulator: ${withPort('10.0.2.2')}. A real phone: your computer's LAN IP` +
        `${port ? `, or rn-buddy device connect --port ${port}` : ''}. The iOS simulator can use localhost`,
    };
  });
}

// XML namespaces look like URLs but are never fetched (react-native-svg uses http://www.w3.org/2000/svg).
const NOT_FETCHED = /^http:\/\/(www\.w3\.org|schemas\.|ns\.adobe\.com|purl\.org|xmlns\.com)/;
const PRIVATE_HOST = /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[\w-]+\.local\b)/;

function cleartextUrl({ code }) {
  return [...code.matchAll(/\bhttp:\/\/[\w.-]+[^\s'"`)]*/g)]
    .filter(([url]) => !/^http:\/\/(localhost|127\.0\.0\.1)\b/.test(url) && !NOT_FETCHED.test(url))
    .map((match) => ({
      index: match.index,
      message: `${match[0]} uses plain http://, which release builds block`,
      hint: PRIVATE_HOST.test(match[0])
        ? 'Fine while developing on your network; use https for the release build'
        : 'Use https://. Android blocks cleartext HTTP in release builds (usesCleartextTraffic) and iOS App Transport Security blocks it too',
    }));
}

const SECRET_HINT = 'Everything in your JS ships inside the app and can be read by anyone. Keep secret keys on a server';
const SECRET_PATTERNS = [
  { pattern: /\b[sr]k_live_[0-9A-Za-z]{10,}/g, what: 'a Stripe live secret key' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, what: 'an AWS access key' },
  { pattern: /\bgh[pousr]_[0-9A-Za-z]{30,}/g, what: 'a GitHub token' },
  { pattern: /\bgithub_pat_[0-9A-Za-z_]{30,}/g, what: 'a GitHub token' },
  { pattern: /\bxox[bap]-[0-9A-Za-z-]{10,}/g, what: 'a Slack token' },
  { pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, what: 'a private key' },
  {
    pattern: /\bAIza[0-9A-Za-z_-]{35}/g,
    what: 'a Google API key',
    level: 'warn',
    hint: 'Google and Firebase keys are made to ship in apps, but restrict this one to your app in the Google Cloud console',
  },
];

function secrets({ code }) {
  const findings = [];
  const seen = new Set();
  for (const { pattern, what, level, hint } of SECRET_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      seen.add(match.index);
      findings.push({ index: match.index, level, message: `${mask(match[0])} looks like ${what}`, hint: hint ?? SECRET_HINT });
    }
  }
  // apiKey: '...', CLIENT_SECRET = "...": only values that look random (letters and digits, no spaces or paths).
  const generic = /\b([\w$]*(?:api[_-]?key|secret|token|password)[\w$]*)\s*[:=]\s*(['"`])([^'"`\s]{12,})\2/gi;
  for (const match of code.matchAll(generic)) {
    const [, name, , value] = match;
    const valueIndex = match.index + match[0].length - value.length - 1;
    if (seen.has(valueIndex) || /url|uri|endpoint|path|label|placeholder|header|type|name/i.test(name)) continue;
    if (!/\d/.test(value) || !/[A-Za-z]/.test(value) || /[/@.:]/.test(value) || /^[a-z]+([_-][a-z0-9]+)*$/i.test(value)) continue;
    findings.push({ index: match.index, message: `${name} = ${mask(value)} looks like a secret`, hint: SECRET_HINT });
  }
  return findings;
}

function mask(value) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : `${value.slice(0, 4)}…`;
}

function inlineListProps({ bare }) {
  return jsxElements(bare, '(?:Animated\\.)?(?:FlatList|SectionList)')
    .filter(({ attrs }) => /\brenderItem\s*=\s*\{\s*(?:async\s*)?(?:\(|[\w$]+\s*=>|function\b)/.test(attrs))
    .map((element) => ({
      index: element.index,
      message: `<${element.name}> gets a new renderItem function on every render`,
      hint: 'For long lists, define renderItem outside the JSX (with useCallback, or a component outside this one)',
    }));
}

function textOutsideText({ file, bare }) {
  if (!JSX_FILE.test(file)) return [];
  return jsxElements(bare, '(?:Animated\\.)?View')
    .filter((element) => !element.selfClosing)
    .filter((element) => /^[^<{]*?\S/.test(bare.slice(element.end).match(/^[^<{]*/)[0]))
    .map((element) => ({
      index: element.index,
      message: `Text directly inside <${element.name}> crashes with "Text strings must be rendered within a <Text> component"`,
      hint: `Wrap it: <${element.name}><Text>...</Text></${element.name}>`,
    }));
}

export const SOURCE_RULES = {
  'web-elements': { level: 'fail', run: webElements },
  'text-outside-text': { level: 'fail', run: textOutsideText },
  'deprecated-core': { level: 'warn', run: deprecatedCore },
  secrets: { level: 'fail', run: secrets },
  'localhost-url': { level: 'warn', run: localhostUrl },
  'cleartext-url': { level: 'warn', run: cleartextUrl },
  'scrollview-map': { level: 'warn', run: scrollviewMap },
  'image-size': { level: 'warn', run: imageSize },
  'flatlist-key': { level: 'info', run: flatlistKey },
  'inline-list-props': { level: 'info', run: inlineListProps },
};

// Runs the source rules on one file. `rules` limits which ones (release check reuses a few).
export function checkSource({ file, content }, rules = Object.keys(SOURCE_RULES)) {
  const masked = { file, content, ...maskSource(content) };
  return rules.flatMap((rule) =>
    SOURCE_RULES[rule].run(masked).map(({ index, level, message, hint }) => ({
      rule,
      level: level ?? SOURCE_RULES[rule].level,
      file,
      line: lineOf(content, index),
      message,
      hint,
    })),
  );
}

export function countConsoleLogs(sources) {
  let count = 0;
  const files = new Set();
  for (const { file, content } of sources) {
    const found = maskSource(content).bare.match(/\bconsole\.log\s*\(/g)?.length ?? 0;
    count += found;
    if (found) files.add(file);
  }
  return { count, files: files.size };
}

// ---------------------------------------------------------------------------
// Project rules: .env in git, packages

// Packages that were renamed or replaced. Old names still install, but get no fixes.
export const LEGACY_PACKAGES = {
  'react-native-vector-icons': {
    message: 'react-native-vector-icons is the old, deprecated all-in-one package',
    hint: 'Use the per-font packages, e.g. @react-native-vector-icons/material-design-icons (Expo: @expo/vector-icons)',
  },
  '@react-native-community/async-storage': {
    message: '@react-native-community/async-storage is the old name of AsyncStorage',
    hint: 'Use @react-native-async-storage/async-storage',
  },
  '@react-native-community/masked-view': {
    message: '@react-native-community/masked-view is the old name of MaskedView',
    hint: 'Use @react-native-masked-view/masked-view',
  },
  '@react-native-community/picker': {
    message: '@react-native-community/picker is the old name of Picker',
    hint: 'Use @react-native-picker/picker',
  },
  '@react-native-community/viewpager': {
    message: '@react-native-community/viewpager was replaced',
    hint: 'Use react-native-pager-view',
  },
  '@react-native-community/cameraroll': {
    message: '@react-native-community/cameraroll is the old name of CameraRoll',
    hint: 'Use @react-native-camera-roll/camera-roll',
  },
  'react-native-camera': {
    message: 'react-native-camera is deprecated and not maintained',
    hint: 'Use react-native-vision-camera (Expo: expo-camera)',
  },
};

// `directory` is the React Native Directory result from checkPackages ({} when offline).
export function packageFindings({ root, pkg, deps }, { directory = {} } = {}) {
  const raw = readFileSync(path.join(root, 'package.json'), 'utf8');
  const lineOfDep = (name) => {
    const index = raw.indexOf(`"${name}"`);
    return index === -1 ? null : lineOf(raw, index);
  };
  const finding = (rule, name, level, message, hint) => ({ rule, level, file: 'package.json', line: lineOfDep(name), message, hint });
  const findings = [];

  for (const { name, dev } of deps) {
    const legacy = LEGACY_PACKAGES[name];
    if (legacy) findings.push(finding('legacy-package', name, 'warn', legacy.message, legacy.hint));
    if (dev) continue;
    if (directory[name]?.unmaintained) {
      findings.push(
        finding('unmaintained-package', name, 'warn', `${name} is marked unmaintained on React Native Directory`, 'Look for a maintained alternative: https://reactnative.directory'),
      );
    }
    if (directory[name]?.newArchitecture === 'unsupported') {
      findings.push(
        finding(
          'new-arch-package',
          name,
          'warn',
          `${name} doesn't support the New Architecture, which React Native uses by default since 0.76`,
          'Check its repo for a newer version, or look for an alternative',
        ),
      );
    }
  }

  for (const copy of duplicateReact(root)) {
    findings.push({
      rule: 'duplicate-react',
      level: 'warn',
      file: copy.file,
      line: null,
      message: `A second copy of react (${copy.version}, the app has ${copy.rootVersion})`,
      hint: 'Two Reacts cause "Invalid hook call". Update the package that brings it, or add react to "overrides" in package.json',
    });
  }
  return findings;
}

// Copies of react nested inside other packages with a different version than the app's.
// Looks only two levels deep (node_modules/x/node_modules/react, node_modules/@scope/x/node_modules/react).
export function duplicateReact(root) {
  const modules = path.join(root, 'node_modules');
  const rootVersion = reactVersion(path.join(modules, 'react'));
  if (!rootVersion) return [];
  const packages = [];
  for (const entry of safeList(modules)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) packages.push(...safeList(path.join(modules, entry)).map((name) => `${entry}/${name}`));
    else packages.push(entry);
  }
  return packages.flatMap((name) => {
    const version = reactVersion(path.join(modules, name, 'node_modules', 'react'));
    return version && version !== rootVersion
      ? [{ file: `node_modules/${name}/node_modules/react`, version, rootVersion }]
      : [];
  });
}

function reactVersion(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// A .env file next to a .gitignore that doesn't ignore it gets committed, secrets and all.
export function envFileFindings(root) {
  if (!existsSync(path.join(root, '.env'))) return [];
  const gitignore = path.join(root, '.gitignore');
  const content = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  if (isIgnored(content, '.env')) return [];
  return [
    {
      rule: 'secrets',
      level: 'warn',
      file: '.gitignore',
      line: null,
      message: '.env is not in .gitignore, so it gets committed with your keys',
      hint: 'Add .env to .gitignore and commit a .env.example without real values instead',
    },
  ];
}

// A small .gitignore matcher: enough for "*.keystore", "!debug.keystore", ".env*" and "/.env".
export function isIgnored(gitignore, file) {
  let ignored = false;
  for (const raw of gitignore.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    let pattern = (negate ? line.slice(1) : line).replace(/\/$/, '');
    const anchored = pattern.includes('/');
    pattern = pattern.replace(/^\//, '');
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\0/g, '.*')}$`,
    );
    const target = anchored ? file : path.posix.basename(file);
    if (regex.test(target)) ignored = !negate;
  }
  return ignored;
}

// ---------------------------------------------------------------------------

// Every finding for a project, sorted by file and line. Pure apart from reading the project:
// the React Native Directory data comes in as `directory`, so doctor and tests control the network.
export function runChecks(project, { directory = {}, sources = readSources(project.root) } = {}) {
  const findings = sources.flatMap((source) => checkSource(source));
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  findings.push(...envFileFindings(project.root), ...packageFindings(project, { directory }));

  const logs = countConsoleLogs(sources);
  if (logs.count > 0) {
    findings.push({
      rule: 'console-log',
      level: 'info',
      file: null,
      line: null,
      message: `${logs.count} console.log call${logs.count === 1 ? '' : 's'} in ${logs.files} file${logs.files === 1 ? '' : 's'}`,
      hint: 'They still run in release builds and slow the app down. Remove them before releasing',
    });
  }
  return findings;
}

// One env-style row per rule, worst first, for `rn-buddy doctor`:
// { name, status: 'ok' | 'warn' | 'fail', message, hint }
export function checkRows(findings) {
  if (findings.length === 0) return [{ name: 'Code', status: 'ok', message: 'no common React Native mistakes found' }];
  const byRule = new Map();
  for (const finding of findings) byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding]);

  const rows = [...byRule].map(([rule, list]) => {
    const worst = list.reduce((a, b) => (LEVELS[b.level] > LEVELS[a.level] ? b : a));
    const places = list.filter((f) => f.file).map((f) => (f.line ? `${f.file}:${f.line}` : f.file));
    const where = places.length > 3 ? `${places.slice(0, 3).join(', ')} +${places.length - 3} more` : places.join(', ');
    const message = list.length === 1 ? worst.message : `${list.length}× ${worst.message}`;
    return {
      name: RULE_TITLES[rule] ?? rule,
      status: worst.level === 'info' ? 'ok' : worst.level,
      message: where ? `${message} (${where})` : message,
      hint: worst.hint,
      level: LEVELS[worst.level],
    };
  });
  return rows.sort((a, b) => b.level - a.level).map(({ level, ...row }) => row);
}
