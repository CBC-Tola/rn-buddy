import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SCREENS_DOCS = 'https://reactnavigation.org/docs/getting-started#configuring-react-native-screens-on-android';
const PREDICTIVE_BACK_DOCS = 'https://reactnavigation.org/docs/getting-started#opting-out-of-predictive-back-on-android';

// A recipe installs packages, creates starter files from src/templates/recipes/<name>/
// and makes the native edits the library's docs ask for.
// `files` use the same {tsx}/{ts} placeholders as the templates.
export const RECIPES = {
  navigation: {
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
  },
  state: {
    summary: 'Share state between screens with Zustand',
    docs: 'https://zustand.docs.pmnd.rs/getting-started/introduction',
    packages: ['zustand'],
    files: ['src/store/useCounterStore.{ts}'],
    edits: [],
  },
  api: {
    summary: 'Load data from an API with TanStack Query',
    docs: 'https://tanstack.com/query/latest/docs/framework/react/react-native',
    packages: ['@tanstack/react-query'],
    files: ['src/services/api.{ts}', 'src/services/queryClient.{ts}', 'src/hooks/useTodos.{ts}'],
    edits: [],
  },
};

// The recipe that installs a package, so `add react-native-screens` can point to `add navigation`.
export function recipeFor(packageName) {
  return Object.keys(RECIPES).find((name) => RECIPES[name].packages.includes(packageName)) ?? null;
}

// An edit finds its file and returns the changed content: the same content when it was
// already done, or null when the file looks different from what we expect, so the
// user has to make the change by hand (`manual` says how).

// react-native-screens needs its fragment factory in MainActivity, or the app can
// crash when Android restores it after killing it in the background.
function screensMainActivity() {
  return {
    description: 'react-native-screens setup, so Android can restore the app without crashing',
    manual: `Add RNScreensFragmentFactory to MainActivity: ${SCREENS_DOCS}`,
    find: (root) => findFile(path.join(root, 'android', 'app', 'src', 'main'), /^MainActivity\.(kt|java)$/),
    apply(content, file) {
      if (content.includes('RNScreensFragmentFactory')) return content;
      if (content.includes('onCreate')) return null;

      const kotlin = file.endsWith('.kt');
      const lines = content.split('\n');
      const classLine = kotlin
        ? /^(open )?class MainActivity\s*:\s*ReactActivity\(\)\s*\{\s*$/
        : /^public class MainActivity extends ReactActivity\s*\{\s*$/;
      const classIndex = lines.findIndex((line) => classLine.test(line));
      const lastImport = lines.findLastIndex((line) => line.startsWith('import '));
      if (classIndex === -1 || lastImport === -1) return null;

      const imports = kotlin
        ? ['import android.os.Bundle', 'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory']
        : ['import android.os.Bundle;', 'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory;'];
      const method = kotlin
        ? [
            '  override fun onCreate(savedInstanceState: Bundle?) {',
            '    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()',
            '    super.onCreate(savedInstanceState)',
            '  }',
          ]
        : [
            '  @Override',
            '  protected void onCreate(Bundle savedInstanceState) {',
            '    getSupportFragmentManager().setFragmentFactory(new RNScreensFragmentFactory());',
            '    super.onCreate(savedInstanceState);',
            '  }',
          ];
      // The class comes after the imports, so insert the method first to keep the import index valid.
      lines.splice(classIndex + 1, 0, '', ...method);
      lines.splice(lastImport + 1, 0, ...imports.filter((line) => !lines.includes(line)));
      return lines.join('\n');
    },
  };
}

// React Navigation doesn't support Android's predictive back gesture yet.
function disablePredictiveBack() {
  return {
    description: "turn off predictive back, which React Navigation doesn't support yet",
    manual: `Set android:enableOnBackInvokedCallback="false" on <application>: ${PREDICTIVE_BACK_DOCS}`,
    find: (root) => {
      const file = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
      return existsSync(file) ? file : null;
    },
    apply(content) {
      if (content.includes('android:enableOnBackInvokedCallback="false"')) return content;
      if (content.includes('enableOnBackInvokedCallback') || !/<application\s/.test(content)) return null;
      return content.replace(/<application(\s+)/, '<application$1android:enableOnBackInvokedCallback="false"$1');
    },
  };
}

// Depth-first search for a file whose name matches `pattern`, skipping build output.
function findFile(dir, pattern) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && pattern.test(entry.name)) return path.join(dir, entry.name);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'build') continue;
    const found = findFile(path.join(dir, entry.name), pattern);
    if (found) return found;
  }
  return null;
}
