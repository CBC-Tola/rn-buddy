import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyPlan,
  compatibilityIssues,
  hasChanges,
  installCommands,
  planPackage,
  planRecipe,
  podCommand,
} from '../src/lib/add.js';
import { readProject } from '../src/lib/project.js';
import { recipeFor } from '../src/lib/recipes.js';
import { makeProject } from './helpers.js';

const MAIN_ACTIVITY_KT = `package com.demo

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "Demo"
}
`;

const MAIN_ACTIVITY_JAVA = `package com.demo;

import com.facebook.react.ReactActivity;

public class MainActivity extends ReactActivity {
  @Override
  protected String getMainComponentName() {
    return "Demo";
  }
}
`;

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
      android:name=".MainApplication"
      android:label="@string/app_name">
    </application>
</manifest>
`;

const MAIN_ACTIVITY_PATH = 'android/app/src/main/java/com/demo/MainActivity.kt';

const ANDROID = {
  [MAIN_ACTIVITY_PATH]: MAIN_ACTIVITY_KT,
  'android/app/src/main/AndroidManifest.xml': MANIFEST,
};

function project(files) {
  return readProject(makeProject({ 'package.json': {}, ...files }));
}

function fakeRun(failing = []) {
  const calls = [];
  const run = (command, args, cwd) => {
    const line = [command, ...args].join(' ');
    calls.push({ line, cwd });
    return !failing.includes(line);
  };
  return { run, calls };
}

test('navigation recipe: installs what is missing and skips what is installed', () => {
  const plan = planRecipe(
    project({ 'package.json': { dependencies: { 'react-native-safe-area-context': '^5.0.0' } } }),
    'navigation',
  );
  assert.deepEqual(
    plan.install.map((pkg) => pkg.name),
    ['@react-navigation/native', '@react-navigation/native-stack', 'react-native-screens'],
  );
  assert.deepEqual(plan.installed, ['react-native-safe-area-context']);
  assert.deepEqual(installCommands(plan), [
    {
      command: 'npm',
      args: ['install', '@react-navigation/native', '@react-navigation/native-stack', 'react-native-screens'],
    },
  ]);
});

test('recipe files use TypeScript or JavaScript to match the project', () => {
  const ts = planRecipe(project({ 'tsconfig.json': {} }), 'navigation');
  assert.deepEqual(
    ts.files.map((f) => f.file),
    ['src/navigation/index.tsx', 'src/screens/HomeScreen.tsx', 'src/screens/DetailsScreen.tsx'],
  );
  assert.match(ts.files[0].content, /StaticParamList<typeof RootStack>/);
  assert.match(ts.next, /App\.tsx/);

  const js = planRecipe(project({}), 'navigation');
  assert.equal(js.files[0].file, 'src/navigation/index.js');
  assert.doesNotMatch(js.files[0].content, /StaticParamList|declare global|<!--/);

  const store = planRecipe(project({}), 'state').files[0];
  assert.equal(store.file, 'src/store/useCounterStore.js');
  assert.match(store.content, /^export const useCounterStore = create\(\(set\) => \(\{$/m);
});

test('every recipe template renders without leftover markers', () => {
  for (const recipe of ['navigation', 'state', 'api']) {
    for (const files of [{ 'tsconfig.json': {} }, {}]) {
      const plan = planRecipe(project(files), recipe);
      for (const { file, content } of plan.files) assert.doesNotMatch(content, /\{tsx?\}|\{:|<!--/, file);
      assert.doesNotMatch(plan.next, /\{tsx?\}|\{:|<!--/, `${recipe} next steps`);
    }
  }
});

test('existing files are kept', () => {
  const plan = planRecipe(project({ 'src/screens/HomeScreen.js': 'mine' }), 'navigation');
  assert.equal(plan.files.find((f) => f.file === 'src/screens/HomeScreen.js').exists, true);
});

test('MainActivity.kt gets the react-native-screens fragment factory', () => {
  const [activity] = planRecipe(project(ANDROID), 'navigation').edits;
  assert.equal(activity.status, 'apply');
  assert.equal(activity.file, path.join('android', 'app', 'src', 'main', 'java', 'com', 'demo', 'MainActivity.kt'));
  assert.match(activity.content, /import com\.facebook\.react\.ReactActivityDelegate\nimport android\.os\.Bundle\nimport com\.swmansion\.rnscreens\.fragment\.restoration\.RNScreensFragmentFactory\n/);
  assert.match(
    activity.content,
    /class MainActivity : ReactActivity\(\) \{\n\n {2}override fun onCreate\(savedInstanceState: Bundle\?\) \{\n {4}supportFragmentManager\.fragmentFactory = RNScreensFragmentFactory\(\)\n {4}super\.onCreate\(savedInstanceState\)\n {2}\}\n/,
  );
});

test('MainActivity.java is supported too', () => {
  const files = { 'android/app/src/main/java/com/demo/MainActivity.java': MAIN_ACTIVITY_JAVA };
  const [activity] = planRecipe(project(files), 'navigation').edits;
  assert.equal(activity.status, 'apply');
  assert.match(activity.content, /import android\.os\.Bundle;\n/);
  assert.match(activity.content, /getSupportFragmentManager\(\)\.setFragmentFactory\(new RNScreensFragmentFactory\(\)\);/);
});

test('MainActivity edit: already done, or by hand when there is a custom onCreate', () => {
  const done = MAIN_ACTIVITY_KT.replace('import com.facebook.react.ReactActivity\n', 'import com.facebook.react.ReactActivity\nimport com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory\n');
  assert.equal(planRecipe(project({ ...ANDROID, [MAIN_ACTIVITY_PATH]: done }), 'navigation').edits[0].status, 'done');

  const custom = MAIN_ACTIVITY_KT.replace('{\n\n', '{\n  override fun onCreate(savedInstanceState: Bundle?) {}\n');
  const edit = planRecipe(project({ ...ANDROID, [MAIN_ACTIVITY_PATH]: custom }), 'navigation').edits[0];
  assert.equal(edit.status, 'manual');
  assert.match(edit.manual, /reactnavigation\.org/);
});

test('AndroidManifest.xml turns off predictive back', () => {
  const manifest = planRecipe(project(ANDROID), 'navigation').edits[1];
  assert.equal(manifest.status, 'apply');
  assert.match(manifest.content, /<application\n {6}android:enableOnBackInvokedCallback="false"\n {6}android:name="\.MainApplication"/);

  const optedIn = MANIFEST.replace('<application', '<application android:enableOnBackInvokedCallback="true"');
  assert.equal(planRecipe(project({ ...ANDROID, 'android/app/src/main/AndroidManifest.xml': optedIn }), 'navigation').edits[1].status, 'manual');
});

test('no android folder means no Android edits', () => {
  assert.deepEqual(planRecipe(project({}), 'navigation').edits, []);
});

test('installs with the package manager of the lockfile', () => {
  const yarn = planPackage(project({ 'yarn.lock': '' }), 'prettier', { dev: true });
  assert.deepEqual(installCommands(yarn), [{ command: 'yarn', args: ['add', '--dev', 'prettier'] }]);
  const npm = planPackage(project({}), 'prettier', { dev: true });
  assert.deepEqual(installCommands(npm), [{ command: 'npm', args: ['install', '--save-dev', 'prettier'] }]);
});

test('an installed package has nothing to do', () => {
  const plan = planPackage(project({ 'package.json': { dependencies: { zustand: '^5.0.0' } } }), 'zustand');
  assert.equal(hasChanges(plan), false);
  assert.deepEqual(plan.installed, ['zustand']);
});

test('pod install runs through Bundler on macOS only', () => {
  const root = makeProject({ 'package.json': {}, 'ios/Podfile': '', Gemfile: '' });
  assert.deepEqual(podCommand(root, 'darwin'), { command: 'bundle', args: ['exec', 'pod', 'install'], cwd: path.join(root, 'ios') });
  assert.equal(podCommand(root, 'linux'), null);
  assert.equal(podCommand(makeProject({ 'package.json': {} }), 'darwin'), null);
});

test('applyPlan installs, writes files and edits, then installs pods for native code', () => {
  const proj = project({
    ...ANDROID,
    'ios/Podfile': '',
    Gemfile: '',
    'node_modules/react-native-screens/android/': '',
  });
  const plan = planRecipe(proj, 'navigation');
  const { run, calls } = fakeRun(['bundle check']);
  const result = applyPlan(proj, plan, { run, platform: 'darwin' });

  assert.deepEqual(
    calls.map((call) => call.line),
    [
      'npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context',
      'bundle check',
      'bundle install',
      'bundle exec pod install',
    ],
  );
  assert.equal(calls[3].cwd, path.join(proj.root, 'ios'));
  assert.deepEqual(result.native, ['react-native-screens']);
  assert.equal(result.podsOk, true);
  assert.ok(existsSync(path.join(proj.root, 'src', 'navigation', 'index.js')));
  assert.match(readFileSync(path.join(proj.root, MAIN_ACTIVITY_PATH), 'utf8'), /RNScreensFragmentFactory/);
});

test('applyPlan stops before writing anything when the install fails', () => {
  const proj = project({});
  const plan = planRecipe(proj, 'state');
  const { run } = fakeRun(['npm install zustand']);
  assert.throws(() => applyPlan(proj, plan, { run }), /`npm install zustand` failed/);
  assert.equal(existsSync(path.join(proj.root, 'src')), false);
});

test('compatibility: missing packages fail, peer and maintenance problems warn', () => {
  const proj = project({
    'package.json': { dependencies: { react: '19.0.0', 'react-native': '0.79.0' } },
    'node_modules/react-native/package.json': { version: '0.79.2' },
  });
  const plan = planPackage(proj, 'old-lib');
  assert.deepEqual(compatibilityIssues(proj, plan, { 'old-lib': null }, {}).map((i) => i.level), ['fail']);

  const issues = compatibilityIssues(
    proj,
    plan,
    { 'old-lib': { version: '2.0.0', peerDependencies: { 'react-native': '>=0.80' } } },
    { 'old-lib': { unmaintained: true, newArchitecture: 'unsupported' } },
  );
  assert.deepEqual(issues.map((i) => i.level), ['warn', 'warn', 'warn']);
  assert.match(issues[0].message, /needs react-native >=0\.80, but this project has 0\.79\.2/);
});

test('packages that belong to a recipe point to it', () => {
  assert.equal(recipeFor('react-native-screens'), 'navigation');
  assert.equal(recipeFor('zustand'), 'state');
  assert.equal(recipeFor('lodash'), null);
});
