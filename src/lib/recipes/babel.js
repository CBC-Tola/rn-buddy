// Edits to babel.config.js. Only the shapes of the React Native and Expo templates are handled:
// a one-line `presets: [...]`, and optionally a `plugins: [...]` array without comments.
// Every function returns the new content, or null when the file looks different (do it by hand).

export const WORKLETS_PLUGIN = 'react-native-worklets/plugin';
// Reanimated 3's plugin name. Reanimated 4 moved the plugin to react-native-worklets.
const REANIMATED_PLUGIN = 'react-native-reanimated/plugin';

// The plugin a `plugins` entry refers to: 'name' or ['name', { options }].
export function pluginName(item) {
  return /^\[?\s*['"]([^'"]+)['"]/.exec(item)?.[1] ?? null;
}

export function babelPlugins(content) {
  const found = findPlugins(content);
  return found && !found.comments ? found.items.map(pluginName) : null;
}

// Puts the worklets plugin last in `plugins`: Reanimated's docs say it must be the last one,
// because it rewrites code that other plugins produce.
export function addWorkletsPlugin(content) {
  return editPlugins(content, (items, quote) => {
    const index = items.findIndex((item) => pluginName(item) === WORKLETS_PLUGIN);
    if (index !== -1 && index === items.length - 1) return items;
    const plugin = index === -1 ? `${quote}${WORKLETS_PLUGIN}${quote}` : items[index];
    return [...items.filter((item) => ![WORKLETS_PLUGIN, REANIMATED_PLUGIN].includes(pluginName(item))), plugin];
  });
}

export function removeWorkletsPlugin(content) {
  return removePlugin(content, WORKLETS_PLUGIN, `'${WORKLETS_PLUGIN}'`);
}

// Adds a plugin, before the worklets/Reanimated plugin so that one stays last.
// `item(indent)` returns the entry's code for the given indentation.
export function addPlugin(content, name, item) {
  return editPlugins(content, (items, quote, indent) => {
    if (items.some((existing) => pluginName(existing) === name)) return items;
    const text = item(indent).replaceAll("'", quote);
    const last = items.findIndex((existing) => [WORKLETS_PLUGIN, REANIMATED_PLUGIN].includes(pluginName(existing)));
    return last === -1 ? [...items, text] : [...items.slice(0, last), text, ...items.slice(last)];
  });
}

// Removes a plugin, but only when its entry is still exactly what rn-buddy added.
export function removePlugin(content, name, expected) {
  const found = findPlugins(content);
  if (!found) return content;
  if (found.comments) return null;
  const item = found.items.find((existing) => pluginName(existing) === name);
  if (!item) return content;
  const normalize = (text) => text.replace(/\s+/g, '').replaceAll('"', "'");
  if (normalize(item) !== normalize(expected)) return null;
  return editPlugins(content, (items) => items.filter((existing) => existing !== item));
}

// Runs `transform(items, quote, itemIndent)` on the plugins array and writes it back.
// Creates the array after `presets` when it's missing; removes it when it ends up empty.
function editPlugins(content, transform) {
  const found = findPlugins(content);
  if (found?.comments) return null;
  const presets = /^([ \t]*)presets\s*:\s*\[[^\n]*\](,?)[ \t]*$/m.exec(content);
  const quote = presets && presets[0].includes('"') ? '"' : "'";

  if (!found) {
    if (!presets) return null;
    const indent = presets[1];
    const items = transform([], quote, `${indent}  `);
    if (items.length === 0) return content;
    const end = presets.index + presets[0].length;
    const line = presets[2] ? presets[0] : presets[0].replace(/\][ \t]*$/, '],');
    return `${content.slice(0, presets.index)}${line}\n${renderPlugins(indent, items)},${content.slice(end)}`;
  }

  const items = transform(found.items, quote, `${found.indent}  `);
  if (items.length === found.items.length && items.every((item, i) => item === found.items[i])) return content;
  if (items.length === 0) {
    // Drop the whole `plugins: [],` line(s).
    const after = content.slice(found.close + 1).replace(/^,?[ \t]*\n?/, '');
    return content.slice(0, found.lineStart) + after;
  }
  return content.slice(0, found.lineStart) + renderPlugins(found.indent, items) + content.slice(found.close + 1);
}

function renderPlugins(indent, items) {
  return `${indent}plugins: [\n${items.map((item) => `${indent}  ${item},`).join('\n')}\n${indent}]`;
}

// { lineStart, indent, close, items } for the `plugins: [...]` array, { comments: true } when it has
// comments (we'd lose them), or null when there is none.
function findPlugins(content) {
  const match = /^([ \t]*)plugins\s*:\s*\[/m.exec(content);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  const close = closingBracket(content, open);
  if (close === -1) return { comments: true };
  const inner = content.slice(open + 1, close);
  if (/(^|[^:])\/\/|\/\*/.test(inner)) return { comments: true };
  const items = splitTopLevel(inner)
    .map((item) => item.trim())
    .filter(Boolean);
  return { lineStart: match.index, indent: match[1], close, items };
}

// Index of the bracket that closes the one at `open`, skipping strings.
function closingBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'" || char === '"' || char === '`') {
      i = endOfString(text, i);
      if (i === -1) return -1;
    } else if ('[{('.includes(char)) depth += 1;
    else if (']})'.includes(char)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function endOfString(text, start) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === text[start]) return i;
  }
  return -1;
}

// Splits "a, [b, c], 'd'" at the commas that aren't nested.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'" || char === '"' || char === '`') {
      i = endOfString(text, i);
      if (i === -1) break;
    } else if ('[{('.includes(char)) depth += 1;
    else if (']})'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
