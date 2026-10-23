import { existsSync } from 'node:fs';
import path from 'node:path';
import { plistFonts, projectFile } from './edits.js';
import { workletsBabel } from './navigation.js';

const SVG_DOCS = 'https://github.com/kristerkari/react-native-svg-transformer';

export const icons = {
  summary: 'Vector icons (Ionicons) with @react-native-vector-icons',
  docs: 'https://github.com/oblador/react-native-vector-icons',
  // One package per icon family; the old all-in-one react-native-vector-icons is deprecated.
  packages: ['@react-native-vector-icons/ionicons'],
  files: ['src/components/IconButton.{tsx}'],
  edits: [
    {
      id: 'plist-ionicons',
      packages: ['@react-native-vector-icons/ionicons'],
      platform: 'ios',
      description: 'list Ionicons.ttf in UIAppFonts, so iOS loads the icon font',
      manual: 'Add Ionicons.ttf to UIAppFonts in Info.plist: npx rnvi-update-plist package.json ios/<App>/Info.plist',
      ...plistFonts(['Ionicons.ttf']),
    },
  ],
  // Expo: the regular import loads the font at runtime with expo-font, which also works in Expo Go.
  expo: { edits: [] },
};

export const svg = {
  summary: 'Import .svg files as components with react-native-svg',
  docs: SVG_DOCS,
  packages: ['react-native-svg'],
  devPackages: ['react-native-svg-transformer'],
  files: [
    'src/assets/logo.svg',
    'src/components/Logo.{tsx}',
    // TypeScript needs to be told what importing an .svg file gives you.
    { path: 'declarations.d.ts', when: (ctx) => ctx.typescript && (ctx.undo || !ctx.exists('declarations.d.ts')) },
    // Expo projects often have no metro.config.js: create one with the transformer set up.
    {
      path: 'metro.config.js',
      template: 'svg/metro.config.expo.js.tpl',
      when: (ctx) => ctx.expo && (ctx.undo || !ctx.exists('metro.config.js')),
    },
  ],
  edits: (ctx) => [svgMetro(ctx), svgDeclarations(ctx)],
};

export const fonts = {
  summary: 'Use your own fonts (.ttf/.otf) on iOS and Android',
  docs: 'https://github.com/unimonkiez/react-native-asset',
  devPackages: ['react-native-asset'],
  files: [
    'src/assets/fonts/README.md',
    { path: 'react-native.config.js', when: (ctx) => ctx.undo || !ctx.exists('react-native.config.js') },
  ],
  edits: [
    {
      id: 'fonts-config',
      optional: true,
      description: "add './src/assets/fonts/' to assets, so react-native-asset finds your fonts",
      manual: "Add assets: ['./src/assets/fonts/'] to react-native.config.js",
      find: projectFile('react-native.config.js'),
      apply(content) {
        if (content.includes('./src/assets/fonts')) return content;
        if (/\bassets\s*:/.test(content)) return null;
        const start = /^module\.exports\s*=\s*\{[ \t]*\n/m.exec(content);
        if (!start) return null;
        const at = start.index + start[0].length;
        return `${content.slice(0, at)}  assets: ['./src/assets/fonts/'],\n${content.slice(at)}`;
      },
      undo: (content) => content.replace(/^ {2}assets: \['\.\/src\/assets\/fonts\/'\],\n/m, ''),
    },
  ],
  // Expo loads fonts with expo-font instead (config plugin or useFonts).
  expo: { packages: ['expo-font'], devPackages: [], files: ['src/assets/fonts/README.md'], edits: [] },
};

export const animations = {
  summary: 'Smooth animations and gestures with Reanimated and Gesture Handler',
  docs: 'https://docs.swmansion.com/react-native-reanimated/',
  // Reanimated 4 runs its worklets with react-native-worklets, and needs the New Architecture.
  packages: ['react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler'],
  files: ['src/components/FadeInView.{tsx}'],
  edits: [workletsBabel()],
  // babel-preset-expo adds the worklets plugin by itself.
  expo: { edits: [] },
};

const METRO_REQUIRE = "const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');\n";
const METRO_DEFAULTS = 'const defaultConfig = getDefaultConfig(__dirname);\nconst { assetExts, sourceExts } = defaultConfig.resolver;\n';
const METRO_EMPTY = 'const config = {};';
const METRO_SVG = `const config = {
  // react-native-svg-transformer: import .svg files as React components.
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer/react-native'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg'],
  },
};`;
const METRO_EXPORT = 'module.exports = mergeConfig(getDefaultConfig(__dirname), config);';
const METRO_EXPORT_SVG = 'module.exports = mergeConfig(defaultConfig, config);';

const EXPO_CONFIG = 'const config = getDefaultConfig(__dirname);\n';
const EXPO_SVG = `
// react-native-svg-transformer: import .svg files as React components.
const { transformer, resolver } = config;
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
};
`;

// The transformer config from react-native-svg-transformer's README, applied to the
// template's metro.config.js (React Native or Expo). Anything else: by hand.
export function svgMetro(ctx) {
  return {
    id: 'metro-svg',
    packages: ['react-native-svg'],
    optional: ctx.expo,
    description: 'use react-native-svg-transformer for .svg files',
    manual: `Set up react-native-svg-transformer in metro.config.js: ${SVG_DOCS}#step-2-configure-the-react-native-packager`,
    find: projectFile('metro.config.js'),
    apply(content) {
      if (content.includes('react-native-svg-transformer')) return content;
      if (content.includes(METRO_REQUIRE) && content.includes(METRO_EMPTY) && content.includes(METRO_EXPORT)) {
        return content
          .replace(METRO_REQUIRE, `${METRO_REQUIRE}\n${METRO_DEFAULTS}`)
          .replace(METRO_EMPTY, METRO_SVG)
          .replace(METRO_EXPORT, METRO_EXPORT_SVG);
      }
      const expo = content.includes("require('expo/metro-config')") && content.includes(EXPO_CONFIG);
      if (expo && !/config\.(transformer|resolver)/.test(content)) {
        return content.replace(EXPO_CONFIG, EXPO_CONFIG + EXPO_SVG);
      }
      return null;
    },
    undo(content) {
      if (!content.includes('react-native-svg-transformer')) return content;
      if (content.includes(EXPO_SVG)) return content.replace(EXPO_SVG, '');
      if (![METRO_DEFAULTS, METRO_SVG, METRO_EXPORT_SVG].every((part) => content.includes(part))) return null;
      return content
        .replace(`\n${METRO_DEFAULTS}`, '')
        .replace(METRO_SVG, METRO_EMPTY)
        .replace(METRO_EXPORT_SVG, METRO_EXPORT);
    },
  };
}

const SVG_DECLARATION = `
declare module '*.svg' {
  import React from 'react';
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
`;

// An existing declarations.d.ts gets the .svg declaration added at the end.
function svgDeclarations(ctx) {
  return {
    id: 'svg-declarations',
    optional: true,
    description: "declare '*.svg' modules for TypeScript",
    manual: `Add to declarations.d.ts: ${SVG_DECLARATION.trim().replaceAll('\n', ' ')}`,
    find: (root) => {
      const file = path.join(root, 'declarations.d.ts');
      return ctx.typescript && existsSync(file) ? file : null;
    },
    apply: (content) => (/['"]\*\.svg['"]/.test(content) ? content : `${content.trimEnd()}\n${SVG_DECLARATION}`),
    undo: (content) => content.replace(SVG_DECLARATION, '\n').replace(/\n+$/, '\n'),
  };
}
