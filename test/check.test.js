import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkRows,
  checkSource,
  duplicateReact,
  envFileFindings,
  isIgnored,
  isJsxStart,
  maskSource,
  packageFindings,
  runChecks,
} from '../src/lib/check.js';
import { readProject } from '../src/lib/project.js';
import { makeProject } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

// Findings of one rule for a snippet of code.
function find(rule, content, file = 'src/App.tsx') {
  return checkSource({ file, content }, [rule]);
}

test('maskSource blanks comments, and string contents in bare, keeping lines', () => {
  const content = "const a = 'x // y'; // note\n/* <div> */ const b = \"<p>\";\n<Text>Don't</Text>";
  const { code, bare } = maskSource(content);
  assert.equal(code.length, content.length);
  assert.equal(code.split('\n').length, 3);
  assert.match(code, /'x \/\/ y'/);
  assert.doesNotMatch(code, /note|<div>/);
  assert.doesNotMatch(bare, /x \/\/ y|<p>/);
  assert.match(bare, /<Text>Don't<\/Text>/, 'an apostrophe in JSX text does not start a string');
  assert.match(maskSource('<Text>http://example.com</Text>').code, /http:\/\/example\.com/);
});

test('isJsxStart tells JSX from comparisons and generics', () => {
  const at = (text) => isJsxStart(text, text.indexOf('<'));
  assert.equal(at('return <View>'), true);
  assert.equal(at('(\n  <View>'), true);
  assert.equal(at('cond && <View>'), true);
  assert.equal(at('useRef<View>(null)'), false);
  assert.equal(at('i < p && q > 3'), false);
});

test('scrollview-map: ScrollView with .map() children', () => {
  const bad = `return (
  <ScrollView contentContainerStyle={styles.list} onScroll={(e) => track(e)}>
    {items.map((item) => <Row key={item.id} item={item} />)}
  </ScrollView>
);`;
  const found = find('scrollview-map', bad);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
  assert.equal(found[0].level, 'warn');
  assert.match(found[0].hint, /FlatList/);

  assert.equal(find('scrollview-map', '<ScrollView><Text>About</Text></ScrollView>\nconst x = items.map(f);').length, 0);
  assert.equal(find('scrollview-map', '<ScrollView>\n  {/* items.map(render) */}\n</ScrollView>').length, 0, 'comment');
  assert.equal(find('scrollview-map', '<ScrollView />\n{items.map(f)}').length, 0, 'self-closing');
});

test('flatlist-key: FlatList without keyExtractor', () => {
  const found = find('flatlist-key', '<FlatList data={todos} renderItem={renderTodo} />');
  assert.equal(found.length, 1);
  assert.equal(found[0].level, 'info');
  assert.equal(find('flatlist-key', '<FlatList data={todos} keyExtractor={(t) => t.id} renderItem={renderTodo} />').length, 0);
  assert.equal(find('flatlist-key', '// <FlatList data={todos} />').length, 0, 'comment');
});

test('web-elements: HTML tags and onClick in JSX files', () => {
  const found = find('web-elements', 'return (\n  <div className="box">\n    <button onClick={() => go()}>Go</button>\n  </div>\n);');
  assert.deepEqual(
    found.map((f) => [f.line, f.message.split(' ')[0]]),
    [
      [2, '<div>'],
      [3, '<button>'],
      [3, 'onClick'],
    ],
  );
  assert.equal(found[0].level, 'fail');
  assert.match(found[0].hint, /<View>/);

  assert.equal(find('web-elements', '<View><Text>Hi</Text></View>').length, 0);
  assert.equal(find('web-elements', '// <div>old</div>\nconst s = "<p>hi</p>";').length, 0, 'comments and strings');
  assert.equal(find('web-elements', 'for (let i = 0; i < p && q > 0; i++) {}').length, 0, 'comparison');
  assert.equal(find('web-elements', '<div>web</div>', 'src/App.web.tsx').length, 0, '.web file');
  assert.equal(find('web-elements', "'use dom';\nexport default () => <div>dom</div>;").length, 0, 'Expo DOM component');
  assert.equal(find('web-elements', 'const el = <div />', 'src/util.ts').length, 0, '.ts files have no JSX');
});

test('image-size: remote images need a size', () => {
  const styles = 'const styles = StyleSheet.create({ avatar: { width: 40, height: 40 }, round: { borderRadius: 8 } });';
  assert.equal(find('image-size', "<Image source={{ uri: 'https://x.dev/a.png' }} />").length, 1);
  assert.equal(find('image-size', `<Image source={{ uri: url }} style={styles.round} />\n${styles}`).length, 1);
  assert.equal(find('image-size', "<Image source={{ uri }} style={{ borderRadius: 4 }} />").length, 1);

  assert.equal(find('image-size', `<Image source={{ uri: url }} style={styles.avatar} />\n${styles}`).length, 0);
  assert.equal(find('image-size', '<Image source={{ uri: url }} style={{ width: 80, aspectRatio: 1 }} />').length, 0);
  assert.equal(find('image-size', '<Image source={{ uri: url }} width={80} height={80} />').length, 0);
  assert.equal(find('image-size', '<Image source={{ uri: url }} style={props.style} />').length, 0, 'unknown style');
  assert.equal(find('image-size', "<Image source={require('./logo.png')} />").length, 0, 'local image');
  assert.equal(find('image-size', "// <Image source={{ uri: 'https://x.dev/a.png' }} />").length, 0, 'comment');
});

test('deprecated-core: moved APIs imported from react-native', () => {
  const found = find('deprecated-core', "import { View, AsyncStorage, SafeAreaView as Safe } from 'react-native';");
  assert.deepEqual(
    found.map((f) => [f.level, f.message.split(' ')[0], f.hint]),
    [
      ['fail', 'AsyncStorage', 'Use @react-native-async-storage/async-storage instead'],
      ['warn', 'SafeAreaView', 'Use react-native-safe-area-context instead'],
    ],
  );
  assert.equal(find('deprecated-core', "const { Clipboard } = require('react-native');").length, 1);
  assert.equal(find('deprecated-core', "import { SafeAreaView } from 'react-native-safe-area-context';").length, 0);
  assert.equal(find('deprecated-core', "// import { AsyncStorage } from 'react-native';").length, 0, 'comment');
});

test('localhost-url: suggests 10.0.2.2 and device connect with the port', () => {
  const found = find('localhost-url', "const API = 'http://localhost:3000/api';\nfetch(`http://127.0.0.1/x`);");
  assert.equal(found.length, 2);
  assert.match(found[0].hint, /10\.0\.2\.2:3000/);
  assert.match(found[0].hint, /rn-buddy device connect --port 3000/);
  assert.equal(found[1].line, 2);
  assert.equal(find('localhost-url', "// const API = 'http://localhost:3000';").length, 0, 'comment');
  assert.equal(find('localhost-url', "const API = 'https://api.example.com';").length, 0);
});

test('cleartext-url: plain http, but not localhost or XML namespaces', () => {
  const found = find('cleartext-url', "const API = 'http://api.example.com/v1';\nconst LAN = 'http://192.168.1.20:3000';");
  assert.equal(found.length, 2);
  assert.match(found[0].hint, /https/);
  assert.match(found[1].hint, /while developing/);
  assert.equal(find('cleartext-url', '<Svg xmlns="http://www.w3.org/2000/svg" />').length, 0);
  assert.equal(find('cleartext-url', "fetch('http://localhost:3000')").length, 0);
  assert.equal(find('cleartext-url', "fetch('https://api.example.com')").length, 0);
  assert.equal(find('cleartext-url', '/* see http://example.com */').length, 0, 'comment');
});

test('secrets: known key formats and secret-looking assignments', () => {
  const content = [
    "const stripe = 'sk_live_51Habcdefghijklmnop';",
    "const aws = 'AKIAIOSFODNN7EXAMPLE';",
    "const github = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';",
    "const slack = 'xoxb-1234567890-abcdefghij';",
    "const pem = '-----BEGIN RSA PRIVATE KEY-----';",
    "const config = { apiKey: 'AIzaSyA1234567890abcdefghijklmnopqrstuv' };",
    "const CLIENT_SECRET = 'a8f9d7s6f5g4h3j2k1';",
  ].join('\n');
  const found = find('secrets', content);
  assert.deepEqual(
    found.map((f) => f.line),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(found.find((f) => f.line === 6).level, 'warn', 'Google keys are meant to ship, restricted');
  assert.equal(found.find((f) => f.line === 7).level, 'fail');
  assert.doesNotMatch(found[0].message, /abcdefghijklmnop/, 'the secret is masked');

  const safe = [
    "const TOKEN_KEY = '@app/auth_token';",
    "const passwordLabel = 'Enter your password';",
    "const tokenUrl = 'https://auth.example.com/token';",
    "const STORAGE_TOKEN = 'auth_token_storage';",
    'const apiKey = process.env.API_KEY;',
    "// const API_KEY = 'sk_live_51Habcdefghijklmnop';",
  ].join('\n');
  assert.deepEqual(find('secrets', safe), []);
});

test('inline-list-props: inline renderItem functions', () => {
  assert.equal(find('inline-list-props', '<FlatList data={d} renderItem={({ item }) => <Row item={item} />} />').length, 1);
  assert.equal(find('inline-list-props', '<SectionList sections={s} renderItem={function ({ item }) { return null; }} />').length, 1);
  assert.equal(find('inline-list-props', '<FlatList data={d} renderItem={renderRow} />').length, 0);
});

test('text-outside-text: raw text directly inside <View>', () => {
  const found = find('text-outside-text', 'return <View style={styles.box}>Hello</View>;');
  assert.equal(found.length, 1);
  assert.equal(found[0].level, 'fail');
  assert.equal(find('text-outside-text', '<View><Text>Hello</Text></View>').length, 0);
  assert.equal(find('text-outside-text', '<View>\n  {title}\n</View>').length, 0);
  assert.equal(find('text-outside-text', 'const ref = useRef<View>(null);').length, 0, 'TypeScript generic');
  assert.equal(find('text-outside-text', '<View />Hello').length, 0, 'self-closing');
});

test('isIgnored understands the template .gitignore patterns', () => {
  const template = '# Android\n*.keystore\n!debug.keystore\n.env*\n/build\n';
  assert.equal(isIgnored(template, 'android/app/demo-upload.keystore'), true);
  assert.equal(isIgnored(template, 'android/app/debug.keystore'), false);
  assert.equal(isIgnored(template, '.env'), true);
  assert.equal(isIgnored('node_modules/\n', '.env'), false);
  assert.equal(isIgnored('/.env\n', '.env'), true);
});

test('envFileFindings warns when .env is not ignored', () => {
  assert.equal(envFileFindings(makeProject({ '.env': 'KEY=1', '.gitignore': 'node_modules/\n' })).length, 1);
  assert.equal(envFileFindings(makeProject({ '.env': 'KEY=1' })).length, 1);
  assert.equal(envFileFindings(makeProject({ '.env': 'KEY=1', '.gitignore': '.env\n' })).length, 0);
  assert.equal(envFileFindings(makeProject({ '.gitignore': '' })).length, 0);
});

test('packageFindings: legacy names, directory data, and nested react copies', () => {
  const root = makeProject({
    'package.json': {
      name: 'Demo',
      dependencies: {
        'react-native': '0.81.0',
        'react-native-vector-icons': '^10.0.0',
        'old-lib': '1.0.0',
        '@react-native-community/async-storage': '1.0.0',
      },
      devDependencies: { 'dev-only': '1.0.0' },
    },
    'node_modules/react/package.json': { version: '19.1.0' },
    'node_modules/some-lib/node_modules/react/package.json': { version: '18.2.0' },
    'node_modules/@scope/same/node_modules/react/package.json': { version: '19.1.0' },
  });
  const directory = { 'old-lib': { unmaintained: true, newArchitecture: 'unsupported' }, 'dev-only': { unmaintained: true } };
  const findings = packageFindings(readProject(root), { directory });
  assert.deepEqual(findings.map((f) => f.rule).sort(), [
    'duplicate-react',
    'legacy-package',
    'legacy-package',
    'new-arch-package',
    'unmaintained-package',
  ]);
  assert.deepEqual(duplicateReact(root), [
    { file: 'node_modules/some-lib/node_modules/react', version: '18.2.0', rootVersion: '19.1.0' },
  ]);
  assert.equal(findings.find((f) => f.rule === 'unmaintained-package').file, 'package.json');
});

test('runChecks on a fake project, and checkRows for doctor', () => {
  const root = makeProject({
    'package.json': { name: 'Demo', dependencies: { 'react-native': '0.81.0' } },
    'App.tsx': "import { SafeAreaView } from 'react-native';\nconsole.log('start');\nexport default () => <div />;",
    'src/api.ts': "export const API = 'http://localhost:4000';\nconsole.log('a'); console.log('b');",
    'src/clean.tsx': 'export const Ok = () => <View><Text>ok</Text></View>;',
    'src/App.test.tsx': '<div />',
    'node_modules/x/index.js': '<div />',
  });
  const findings = runChecks(readProject(root));
  assert.deepEqual(
    findings.map((f) => [f.rule, f.file, f.line]),
    [
      ['deprecated-core', 'App.tsx', 1],
      ['web-elements', 'App.tsx', 3],
      ['localhost-url', 'src/api.ts', 1],
      ['console-log', null, null],
    ],
  );
  assert.match(findings.at(-1).message, /3 console\.log calls in 2 files/);

  const rows = checkRows(findings);
  assert.deepEqual(
    rows.map((row) => [row.name, row.status]),
    [
      ['HTML elements', 'fail'],
      ['Old core APIs', 'warn'],
      ['localhost URLs', 'warn'],
      ['console.log', 'ok'],
    ],
  );
  assert.match(rows[0].message, /\(App\.tsx:3\)$/);
  assert.ok(rows[0].hint);
  assert.deepEqual(checkRows([]), [{ name: 'Code', status: 'ok', message: 'no common React Native mistakes found' }]);
});

test('checkRows groups many findings of one rule', () => {
  const finding = (line) => ({ rule: 'secrets', level: line === 5 ? 'fail' : 'warn', file: 'src/a.ts', line, message: `m${line}`, hint: 'h' });
  const [row] = checkRows([1, 2, 3, 4, 5].map(finding));
  assert.equal(row.status, 'fail');
  assert.equal(row.message, '5× m5 (src/a.ts:1, src/a.ts:2, src/a.ts:3 +2 more)');
});

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('rn-buddy check prints findings by file and exits 1 on ✖', () => {
  const root = makeProject({
    'package.json': { name: 'Demo', dependencies: { 'react-native': '0.81.0' } },
    'src/screens/Home.tsx': "export const Home = () => (\n  <View>Hello</View>\n);\nfetch('http://localhost:3000/todos');",
  });
  const { status, stdout } = rnBuddy('check', '--offline', '--dir', root);
  assert.equal(status, 1);
  assert.match(stdout, /Demo · React Native 0\.81\.0/);
  assert.match(stdout, /src\/screens\/Home\.tsx\n {2}✖ src\/screens\/Home\.tsx:2 {2}Text directly inside <View>/);
  assert.match(stdout, /⚠ src\/screens\/Home\.tsx:4 {2}http:\/\/localhost:3000\/todos/);
  assert.match(stdout, /→ Android emulator: http:\/\/10\.0\.2\.2:3000/);
  assert.match(stdout, /✖ 1 to fix {2}⚠ 1 to check {2}\(1 source file checked\)/);
  assert.match(stdout, /--offline/);
});

test('rn-buddy check on clean code exits 0', () => {
  const root = makeProject({
    'package.json': { name: 'Demo', dependencies: { 'react-native': '0.81.0' } },
    'App.tsx': 'export default () => <View><Text>Hi</Text></View>;',
  });
  const { status, stdout } = rnBuddy('check', '--offline', '--dir', root);
  assert.equal(status, 0);
  assert.match(stdout, /✔ No common React Native mistakes found in 1 file\./);
});
