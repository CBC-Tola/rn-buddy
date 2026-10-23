import { addPlugin, removePlugin } from './babel.js';
import { editJson, projectFile } from './edits.js';

const RESOLVER_DOCS = 'https://github.com/tleunen/babel-plugin-module-resolver';
const TESTING_DOCS = 'https://oss.callstack.com/react-native-testing-library/';

export const imports = {
  summary: "Absolute imports: '@/components/Button' instead of '../../components/Button'",
  docs: RESOLVER_DOCS,
  devPackages: ['babel-plugin-module-resolver'],
  files: [],
  edits: [moduleResolver(), tsconfigPaths()],
  // Expo's Metro reads the paths from tsconfig.json by itself (SDK 50+), no Babel plugin needed.
  expo: { docs: 'https://docs.expo.dev/guides/typescript/#path-aliases', devPackages: [], edits: [tsconfigPaths()] },
};

export const testing = {
  summary: 'Test your components with React Native Testing Library and Jest',
  docs: TESTING_DOCS,
  // RNTL 14 renders with test-renderer (React Test Renderer is deprecated).
  devPackages: ['@testing-library/react-native', 'test-renderer'],
  files: [
    { path: 'jest.setup.{ts}', content: jestSetup },
    { path: '__tests__/HomeScreen.test.{tsx}', when: (ctx) => hasHomeScreen(ctx) },
    { path: '__tests__/Example.test.{tsx}', when: (ctx) => !hasHomeScreen(ctx) },
  ],
  edits: [jestConfig()],
};

const ESLINT_CONFIGS = [
  ...['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'],
  ...['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts'],
];
const PRETTIER_CONFIGS = [
  ...['.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.json', '.prettierrc.yml'],
  ...['.prettierrc.yaml', '.prettierrc.toml', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs'],
];

export const lint = {
  summary: 'Find mistakes with ESLint and format code with Prettier',
  docs: 'https://reactnative.dev/docs/typescript',
  // The React Native template already ships these: usually nothing to install.
  // It uses ESLint 8 with .eslintrc.js; ESLint 9+ wants a different config file, so stay on 8.
  devPackages: (ctx) => [
    'eslint@^8.19.0',
    ctx.reactNativeMinor ? `@react-native/eslint-config@${ctx.reactNativeMinor}` : '@react-native/eslint-config',
    'prettier',
  ],
  files: [
    {
      path: '.eslintrc.js',
      template: 'lint/eslintrc.js.tpl',
      when: (ctx) => ctx.undo || !hasConfig(ctx, ESLINT_CONFIGS, 'eslintConfig'),
    },
    prettierConfig(),
  ],
  edits: [lintScripts('eslint .')],
  // Expo: `npx expo lint` installs and configures ESLint (eslint-config-expo) the first time.
  expo: {
    docs: 'https://docs.expo.dev/guides/using-eslint/',
    devPackages: ['prettier'],
    files: [prettierConfig()],
    edits: [lintScripts('expo lint')],
  },
};

// Our config files say "added by rn-buddy", so undo never deletes the template's own copy.
function prettierConfig() {
  return {
    path: '.prettierrc.js',
    template: 'lint/prettierrc.js.tpl',
    when: (ctx) => ctx.undo || !hasConfig(ctx, PRETTIER_CONFIGS, 'prettier'),
  };
}

function hasConfig(ctx, files, packageKey) {
  return files.some((file) => ctx.exists(file)) || ctx.pkg[packageKey] !== undefined;
}

function hasHomeScreen(ctx) {
  return ctx.exists('src/screens/HomeScreen.tsx') || ctx.exists('src/screens/HomeScreen.js');
}

// --- imports ------------------------------------------------------------------------------

const RESOLVER_ITEM = (indent) => `[
${indent}  'module-resolver',
${indent}  {
${indent}    root: ['./src'],
${indent}    extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.ts', '.tsx', '.json'],
${indent}    alias: { '@': './src' },
${indent}  },
${indent}]`;

function moduleResolver() {
  return {
    id: 'babel-module-resolver',
    description: "module-resolver plugin: '@/...' means src/ (before Reanimated's plugin, which stays last)",
    manual: `Add ['module-resolver', { root: ['./src'], alias: { '@': './src' } }] to plugins in babel.config.js: ${RESOLVER_DOCS}`,
    find: projectFile('babel.config.js'),
    apply: (content) => addPlugin(content, 'module-resolver', RESOLVER_ITEM),
    undo: (content) => removePlugin(content, 'module-resolver', RESOLVER_ITEM('')),
  };
}

// TypeScript (and your editor) need the same alias as Babel. TypeScript 6 deprecates
// `baseUrl`, so paths are relative to tsconfig.json instead.
function tsconfigPaths() {
  const target = ['./src/*'];
  return {
    id: 'tsconfig-paths',
    optional: true,
    description: "paths: { '@/*': ['./src/*'] }, so TypeScript and your editor understand '@/...'",
    manual: 'Add "paths": { "@/*": ["./src/*"] } to compilerOptions in tsconfig.json',
    find: projectFile('tsconfig.json'),
    apply: (content) =>
      editJson(content, (data) => {
        data.compilerOptions ??= {};
        const options = data.compilerOptions;
        if (typeof options !== 'object') return false;
        if (options.baseUrl && !['.', './'].includes(options.baseUrl)) return false;
        const current = options.paths?.['@/*'];
        if (current) return ['./src/*', 'src/*'].includes(current[0]) ? undefined : false;
        options.paths = { ...options.paths, '@/*': target };
      }),
    undo: (content) =>
      editJson(content, (data) => {
        const options = data.compilerOptions;
        if (JSON.stringify(options?.paths?.['@/*']) !== JSON.stringify(target)) return;
        delete options.paths['@/*'];
        if (Object.keys(options.paths).length === 0) delete options.paths;
        if (Object.keys(options).length === 0) delete data.compilerOptions;
      }),
  };
}

// --- testing ------------------------------------------------------------------------------

// Mocks that libraries ship for Jest, where their native code doesn't exist.
const JEST_MOCKS = [
  ['react-native-safe-area-context', [
    "import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';",
    "jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);",
  ]],
  ['react-native-gesture-handler', ["import 'react-native-gesture-handler/jestSetup';"]],
  ['react-native-reanimated', ["require('react-native-reanimated').setUpTests();"]],
  ['@react-native-async-storage/async-storage', [
    "jest.mock('@react-native-async-storage/async-storage', () =>",
    "  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),",
    ');',
  ]],
  ['react-native-permissions', ["jest.mock('react-native-permissions', () => require('react-native-permissions/mock'));"]],
  // react-native-config ships no mock: tests get these values instead of your .env.
  ['react-native-config', ["jest.mock('react-native-config', () => ({ API_URL: 'https://example.com' }));"]],
];

// jest.setup for the native packages this project has. MMKV mocks itself in Jest.
export function jestSetup(ctx) {
  const mocks = JEST_MOCKS.filter(([name]) => ctx.has(name));
  const body = mocks.length
    ? mocks.map(([name, lines]) => `// ${name}\n${lines.join('\n')}`).join('\n\n')
    : '// No mocks needed yet. When a test fails with a native module error, mock that package here.';
  return `// Runs before each test file (setupFilesAfterEnv in jest.config.js).
// Native code doesn't run in Jest, so packages with native code are replaced by the mocks they ship.

${body}
`;
}

const NAVIGATION_TRANSFORM = "  transformIgnorePatterns: ['node_modules/(?!(@react-native|react-native|@react-navigation)/)'],";
const REANIMATED_RESOLVER = "  resolver: 'react-native-reanimated/jest/resolver',";

function jestConfig() {
  const lines = (ctx) => [
    `  setupFilesAfterEnv: ['<rootDir>/jest.setup.${ctx.typescript ? 'ts' : 'js'}'],`,
    // React Navigation ships modern JavaScript that Jest has to transform.
    ...(ctx.has('@react-navigation/native') ? [NAVIGATION_TRANSFORM] : []),
    // Reanimated's web implementation instead of the native one.
    ...(ctx.has('react-native-reanimated') ? [REANIMATED_RESOLVER] : []),
  ];
  return {
    id: 'jest-config',
    description: 'load jest.setup before the tests',
    manual: "Add setupFilesAfterEnv: ['<rootDir>/jest.setup.js'] to your Jest config (jest.config.js or \"jest\" in package.json)",
    find: projectFile('jest.config.js'),
    apply(content, file, ctx) {
      if (/setupFilesAfterEnv/.test(content)) return content.includes('jest.setup') ? content : null;
      const close = /^\};?[ \t]*\n?$/m.exec(content);
      if (!/^module\.exports\s*=\s*\{[ \t]*$/m.test(content) || !close) return null;
      const add = lines(ctx).filter((line) => !content.includes(line.trim().split(':')[0] + ':'));
      let before = content.slice(0, close.index);
      if (!/[,{]\s*$/.test(before)) before = before.replace(/\s*$/, ',\n');
      return `${before}${add.join('\n')}\n${content.slice(close.index)}`;
    },
    undo(content) {
      let result = content.replace(/^ {2}setupFilesAfterEnv: \['<rootDir>\/jest\.setup\.(ts|js)'\],\n/m, '');
      for (const line of [NAVIGATION_TRANSFORM, REANIMATED_RESOLVER]) result = result.replace(`${line}\n`, '');
      return result;
    },
  };
}

// --- lint -----------------------------------------------------------------------------------

function lintScripts(lintCommand) {
  return {
    id: 'lint-scripts',
    description: `"lint" and "format" scripts: npm run lint, npm run format`,
    manual: `Add "lint": "${lintCommand}" and "format": "prettier --write ." to "scripts" in package.json`,
    find: projectFile('package.json'),
    apply: (content) =>
      editJson(content, (data) => {
        data.scripts ??= {};
        data.scripts.lint ??= lintCommand;
        data.scripts.format ??= 'prettier --write .';
      }),
    // "lint" is part of the React Native template, so undo only removes "format".
    undo: (content) =>
      editJson(content, (data) => {
        if (data.scripts?.format === 'prettier --write .') delete data.scripts.format;
      }),
  };
}
