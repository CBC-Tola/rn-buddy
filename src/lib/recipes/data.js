import { addAfterApplyPlugin, addGitignoreLine, appGradle, projectFile, removeLine } from './edits.js';

const CONFIG_DOCS = 'https://github.com/lugg/react-native-config';
// Templates of dotfiles have no leading dot, so no tool hides or ignores them.
const ENV_FILES = [
  { path: '.env', template: 'env-vars/env.tpl' },
  { path: '.env.example', template: 'env-vars/env.example.tpl' },
  'src/config.{ts}',
];
const DOTENV_GRADLE = 'apply from: project(\':react-native-config\').projectDir.getPath() + "/dotenv.gradle"';

export const state = {
  summary: 'Share state between screens with Zustand',
  docs: 'https://zustand.docs.pmnd.rs/getting-started/introduction',
  packages: ['zustand'],
  files: ['src/store/useCounterStore.{ts}'],
  edits: [],
};

export const api = {
  summary: 'Load data from an API with TanStack Query',
  docs: 'https://tanstack.com/query/latest/docs/framework/react/react-native',
  packages: ['@tanstack/react-query'],
  files: ['src/services/api.{ts}', 'src/services/queryClient.{ts}', 'src/hooks/useTodos.{ts}'],
  edits: [],
};

export const storage = {
  summary: 'Save data on the device with MMKV (fast, synchronous)',
  docs: 'https://github.com/mrousavy/react-native-mmkv',
  // MMKV 4 is a Nitro Module: it needs react-native-nitro-modules next to it.
  packages: ['react-native-mmkv', 'react-native-nitro-modules'],
  files: ['src/services/storage.{ts}'],
  edits: [],
  expoGo: false,
};

// Expo has .env support built in (EXPO_PUBLIC_ variables), so it doesn't need react-native-config.
export const envVars = {
  summary: 'Read settings from a .env file with react-native-config',
  docs: CONFIG_DOCS,
  packages: ['react-native-config'],
  files: [...ENV_FILES, { path: 'react-native-config.d.ts', when: (ctx) => ctx.typescript }],
  edits: [gitignoreEnv(), dotenvGradle()],
  expoGo: false,
  expo: {
    docs: 'https://docs.expo.dev/guides/environment-variables/',
    packages: [],
    files: ENV_FILES,
    edits: [gitignoreEnv()],
    expoGo: true,
  },
};

function gitignoreEnv() {
  return {
    id: 'gitignore-env',
    description: 'ignore .env, so your values stay out of git (.env.example is the shared template)',
    manual: 'Add a line with .env to .gitignore',
    find: projectFile('.gitignore'),
    apply: (content) => addGitignoreLine(content, '.env', 'Local settings (rn-buddy add env-vars)'),
    // Keeping .env ignored is the safe choice, so undo leaves it.
    undo: (content) => content,
  };
}

// react-native-config reads .env during the Android build with this Gradle script.
function dotenvGradle() {
  return {
    id: 'dotenv-gradle',
    packages: ['react-native-config'],
    platform: 'android',
    description: 'read .env during the Android build (dotenv.gradle)',
    manual: `Add this line after the apply plugin lines of android/app/build.gradle: ${DOTENV_GRADLE}`,
    find: appGradle,
    apply: (content) => addAfterApplyPlugin(content, DOTENV_GRADLE),
    undo: (content) => removeLine(content, DOTENV_GRADLE),
  };
}
