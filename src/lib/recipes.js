import { api, envVars, state, storage } from './recipes/data.js';
import { drawer, navigation, tabs } from './recipes/navigation.js';
import { permissions } from './recipes/permissions.js';
import { imports, lint, testing } from './recipes/tooling.js';
import { animations, fonts, icons, svg } from './recipes/ui.js';

// A recipe installs packages, creates starter files from src/templates/recipes/<name>/
// and makes the native and config edits the library's docs ask for. Fields:
//   summary, docs
//   packages, devPackages   names, or 'name@range' to pin; or a function of the context (below)
//   files                   'path/with/{tsx}' (template: <recipe>/<basename>.tpl), or
//                           { path, template?, content?(ctx), when?(ctx) }
//   edits                   see src/lib/recipes/edits.js; or a function of the context
//   args                    recipe options (`add permissions camera`): { label, choices, parse }
//   vars(ctx)               values for {{name}} in the templates and next.md
//   expoGo                  false when it needs native code that Expo Go doesn't have
//   expo                    fields that replace the ones above in Expo projects
// The context is { root, pkg, typescript, expo, expoPrebuild, args, undo, has(name), exists(file), reactNativeMinor }.
export const RECIPES = {
  navigation,
  tabs,
  drawer,
  state,
  api,
  storage,
  icons,
  svg,
  fonts,
  animations,
  permissions,
  'env-vars': envVars,
  imports,
  testing,
  lint,
};

// How `rn-buddy add` lists them.
export const RECIPE_GROUPS = [
  { title: 'Navigation', recipes: ['navigation', 'tabs', 'drawer'] },
  { title: 'Data', recipes: ['state', 'api', 'storage'] },
  { title: 'UI', recipes: ['icons', 'svg', 'fonts', 'animations'] },
  { title: 'Native features', recipes: ['permissions', 'env-vars'] },
  { title: 'Tooling', recipes: ['imports', 'testing', 'lint'] },
];

// The recipe that installs a package, so `add react-native-screens` can point to `add navigation`.
// The smallest recipe wins: react-native-reanimated → animations, not drawer.
export function recipeFor(packageName) {
  const names = Object.keys(RECIPES).filter((name) => recipePackages(RECIPES[name]).includes(packageName));
  return names.sort((a, b) => recipePackages(RECIPES[a]).length - recipePackages(RECIPES[b]).length)[0] ?? null;
}

// Package names a recipe can install (outside of Expo), without version ranges.
export function recipePackages(recipe) {
  const list = (value) => (typeof value === 'function' ? value({}) : (value ?? []));
  return [...list(recipe.packages), ...list(recipe.devPackages)].map(packageName);
}

// 'eslint@^8.19.0' → 'eslint', '@react-native/eslint-config@0.81' → '@react-native/eslint-config'.
export function packageName(spec) {
  const at = spec.indexOf('@', 1);
  return at === -1 ? spec : spec.slice(0, at);
}
