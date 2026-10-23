import { addWorkletsPlugin, removeWorkletsPlugin } from './babel.js';
import { manifestFile, projectFile } from './edits.js';
import { mainActivity } from '../native.js';

const SCREENS_DOCS = 'https://reactnavigation.org/docs/getting-started#configuring-react-native-screens-on-android';
const PREDICTIVE_BACK_DOCS = 'https://reactnavigation.org/docs/getting-started#opting-out-of-predictive-back-on-android';
const REANIMATED_DOCS = 'https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/';

// The packages every React Navigation navigator needs. `tabs` and `drawer` include them, so
// they work without running `add navigation` first (installed ones are skipped).
const NAVIGATION_CORE = ['@react-navigation/native', 'react-native-screens', 'react-native-safe-area-context'];

export const navigation = {
  summary: 'Move between screens with React Navigation (native stack)',
  docs: 'https://reactnavigation.org/docs/getting-started',
  packages: [
    '@react-navigation/native',
    '@react-navigation/native-stack',
    'react-native-screens',
    'react-native-safe-area-context',
  ],
  files: ['src/navigation/index.{tsx}', 'src/screens/HomeScreen.{tsx}', 'src/screens/DetailsScreen.{tsx}'],
  edits: [screensMainActivity(), disablePredictiveBack()],
};

export const tabs = {
  summary: 'Tabs at the bottom of the screen with React Navigation',
  docs: 'https://reactnavigation.org/docs/bottom-tab-navigator',
  packages: ['@react-navigation/bottom-tabs', ...NAVIGATION_CORE],
  files: ['src/navigation/Tabs.{tsx}', 'src/screens/FeedScreen.{tsx}', 'src/screens/SettingsScreen.{tsx}'],
  edits: [screensMainActivity(), disablePredictiveBack()],
};

export const drawer = {
  summary: 'A side menu (drawer) with React Navigation',
  docs: 'https://reactnavigation.org/docs/drawer-navigator',
  // The drawer animates with Reanimated and follows your finger with Gesture Handler.
  packages: [
    '@react-navigation/drawer',
    ...NAVIGATION_CORE,
    'react-native-gesture-handler',
    'react-native-reanimated',
    'react-native-worklets',
  ],
  files: [
    'src/navigation/Drawer.{tsx}',
    { path: 'src/screens/FeedScreen.{tsx}', template: 'tabs/FeedScreen.tsx.tpl' },
    { path: 'src/screens/SettingsScreen.{tsx}', template: 'tabs/SettingsScreen.tsx.tpl' },
  ],
  edits: [screensMainActivity(), disablePredictiveBack(), workletsBabel()],
  // babel-preset-expo adds the worklets plugin by itself.
  expo: { edits: [] },
};

// Reanimated 4 moved its Babel plugin to react-native-worklets. It must be the last plugin.
export function workletsBabel() {
  return {
    id: 'babel-worklets',
    packages: ['react-native-reanimated', 'react-native-worklets'],
    description: "add Reanimated's Babel plugin (react-native-worklets/plugin), last in plugins",
    manual: `Add 'react-native-worklets/plugin' as the last entry of plugins in babel.config.js: ${REANIMATED_DOCS}`,
    find: projectFile('babel.config.js'),
    apply: addWorkletsPlugin,
    undo: removeWorkletsPlugin,
  };
}

// react-native-screens needs its fragment factory in MainActivity, or the app can
// crash when Android restores it after killing it in the background.
function screensMainActivity() {
  const imports = {
    kotlin: ['import android.os.Bundle', 'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory'],
    java: ['import android.os.Bundle;', 'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory;'],
  };
  const methods = {
    kotlin: [
      '  override fun onCreate(savedInstanceState: Bundle?) {',
      '    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()',
      '    super.onCreate(savedInstanceState)',
      '  }',
    ],
    java: [
      '  @Override',
      '  protected void onCreate(Bundle savedInstanceState) {',
      '    getSupportFragmentManager().setFragmentFactory(new RNScreensFragmentFactory());',
      '    super.onCreate(savedInstanceState);',
      '  }',
    ],
  };
  const language = (file) => (file.endsWith('.kt') ? 'kotlin' : 'java');

  return {
    id: 'screens-main-activity',
    packages: ['react-native-screens'],
    platform: 'android',
    description: 'react-native-screens setup, so Android can restore the app without crashing',
    manual: `Add RNScreensFragmentFactory to MainActivity: ${SCREENS_DOCS}`,
    find: mainActivity,
    apply(content, file) {
      if (content.includes('RNScreensFragmentFactory')) return content;
      if (content.includes('onCreate')) return null;

      const kotlin = language(file) === 'kotlin';
      const lines = content.split('\n');
      const classLine = kotlin
        ? /^(open )?class MainActivity\s*:\s*ReactActivity\(\)\s*\{\s*$/
        : /^public class MainActivity extends ReactActivity\s*\{\s*$/;
      const classIndex = lines.findIndex((line) => classLine.test(line));
      const lastImport = lines.findLastIndex((line) => line.startsWith('import '));
      if (classIndex === -1 || lastImport === -1) return null;

      // The class comes after the imports, so insert the method first to keep the import index valid.
      lines.splice(classIndex + 1, 0, '', ...methods[language(file)]);
      lines.splice(lastImport + 1, 0, ...imports[language(file)].filter((line) => !lines.includes(line)));
      return lines.join('\n');
    },
    // Only when the method is still exactly what rn-buddy added.
    undo(content, file) {
      const method = `\n\n${methods[language(file)].join('\n')}\n`;
      if (!content.includes('RNScreensFragmentFactory')) return content;
      if (!content.includes(method)) return null;
      const [bundle, factory] = imports[language(file)];
      let result = content.replace(method, '\n').replace(`${factory}\n`, '');
      if (!/\bBundle\b/.test(result.replace(`${bundle}\n`, ''))) result = result.replace(`${bundle}\n`, '');
      return result;
    },
  };
}

// React Navigation doesn't support Android's predictive back gesture yet.
function disablePredictiveBack() {
  return {
    id: 'predictive-back',
    packages: ['@react-navigation/native'],
    platform: 'android',
    description: "turn off predictive back, which React Navigation doesn't support yet",
    manual: `Set android:enableOnBackInvokedCallback="false" on <application>: ${PREDICTIVE_BACK_DOCS}`,
    find: manifestFile,
    apply(content) {
      if (content.includes('android:enableOnBackInvokedCallback="false"')) return content;
      if (content.includes('enableOnBackInvokedCallback') || !/<application\s/.test(content)) return null;
      return content.replace(/<application(\s+)/, '<application$1android:enableOnBackInvokedCallback="false"$1');
    },
    undo(content) {
      if (!content.includes('android:enableOnBackInvokedCallback="false"')) return content;
      const result = content.replace(/<application(\s+)android:enableOnBackInvokedCallback="false"\s+/, '<application$1');
      return result.includes('enableOnBackInvokedCallback') ? null : result;
    },
  };
}
