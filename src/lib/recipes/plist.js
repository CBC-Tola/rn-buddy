// Small, careful edits to ios/<App>/Info.plist: add or remove keys of the top-level <dict>,
// keeping the file's indentation. Each returns the new content, or null when the file
// doesn't look like a plist we understand.

// Sets string keys that are missing or empty (the React Native template ships an empty
// NSLocationWhenInUseUsageDescription). Keys that already have a value are kept.
export function setPlistStrings(content, entries) {
  let result = content;
  const missing = [];
  for (const { key, value } of entries) {
    const existing = stringValue(result, key);
    if (existing === undefined) missing.push(key, value);
    else if (existing.match && existing.value.trim() === '') {
      result = result.replace(existing.match, `<key>${key}</key>${existing.space}<string>${xml(value)}</string>`);
    }
  }
  if (missing.length === 0) return result;

  const lines = [];
  for (let i = 0; i < missing.length; i += 2) {
    lines.push(`<key>${missing[i]}</key>`, `<string>${xml(missing[i + 1])}</string>`);
  }
  return insertTopLevel(result, lines);
}

// Removes string keys, but only when their value is still exactly what rn-buddy wrote.
export function removePlistStrings(content, entries) {
  let result = content;
  for (const { key, value } of entries) {
    const pattern = new RegExp(`^[ \\t]*<key>${escape(key)}</key>\\s*<string>${escape(xml(value))}</string>[ \\t]*\\n`, 'm');
    result = result.replace(pattern, '');
  }
  return result;
}

// Adds a string to an array key (UIAppFonts), creating the key when it's missing.
export function addPlistArrayString(content, key, value) {
  const array = findArray(content, key);
  if (array === null) return null;
  if (array === undefined) {
    const indent = indentOf(content);
    return insertTopLevel(content, [`<key>${key}</key>`, '<array>', `${indent}<string>${xml(value)}</string>`, '</array>']);
  }
  if (array.body.includes(`<string>${xml(value)}</string>`)) return content;
  const itemIndent = /\n([ \t]*)<string>/.exec(array.body)?.[1] ?? `${array.indent}${indentOf(content)}`;
  const close = array.start + array.text.lastIndexOf('</array>');
  const lineStart = content.lastIndexOf('\n', close) + 1;
  const before = content.slice(lineStart, close).trim() === '' ? lineStart : close;
  const item = `${itemIndent}<string>${xml(value)}</string>`;
  const insert = before === lineStart ? `${item}\n` : `\n${item}\n${array.indent}`;
  return content.slice(0, before) + insert + content.slice(before);
}

// Removes a string from an array key, and the key itself when the array ends up empty.
export function removePlistArrayString(content, key, value) {
  const array = findArray(content, key);
  if (!array) return content;
  const body = array.body.replace(new RegExp(`\\n?[ \\t]*<string>${escape(xml(value))}</string>`), '');
  if (body === array.body) return content;
  if (body.trim() === '') {
    const start = content.lastIndexOf('\n', array.start) + 1;
    const end = array.start + array.text.length;
    return content.slice(0, start) + content.slice(end).replace(/^[ \t]*\n/, '');
  }
  return content.replace(array.text, array.text.replace(array.body, body));
}

// The string value of a key: undefined when the key is missing, { match: null } when it isn't a string.
function stringValue(content, key) {
  if (!content.includes(`<key>${key}</key>`)) return undefined;
  const match = new RegExp(`<key>${escape(key)}</key>(\\s*)(?:<string>([^<]*)</string>|<string/>)`).exec(content);
  return match ? { match: match[0], space: match[1], value: match[2] ?? '' } : { match: null };
}

// { start, text, body, indent } of `<key>key</key> <array>...</array>`, undefined when the key is
// missing, null when the key holds something else.
function findArray(content, key) {
  if (!content.includes(`<key>${key}</key>`)) return undefined;
  const match = new RegExp(`([ \\t]*)<key>${escape(key)}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(content);
  if (!match) return null;
  return { start: match.index + match[1].length, text: match[0].slice(match[1].length), body: match[2], indent: match[1] };
}

// Inserts lines before the closing </dict> of the top-level dict, with the file's indentation.
function insertTopLevel(content, lines) {
  const end = content.lastIndexOf('</plist>');
  const close = end === -1 ? -1 : content.lastIndexOf('</dict>', end);
  if (close === -1) return null;
  const indent = /<dict>\s*?\n([ \t]*)<key>/.exec(content)?.[1] ?? '\t';
  const lineStart = content.lastIndexOf('\n', close) + 1;
  const text = lines.map((line) => `${indent}${line}\n`).join('');
  if (content.slice(lineStart, close).trim() !== '') return `${content.slice(0, close)}\n${text}${content.slice(close)}`;
  return content.slice(0, lineStart) + text + content.slice(lineStart);
}

function indentOf(content) {
  return /<dict>\s*?\n([ \t]*)<key>/.exec(content)?.[1] ?? '\t';
}

function xml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
