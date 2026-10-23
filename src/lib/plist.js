// Tiny helpers for XML property lists such as ios/<App>/Info.plist. They only touch keys of the
// top-level <dict>, work line by line and keep the file's formatting (Xcode uses tabs).
// Setters return the new content, or null when the file doesn't look like we expect.

export function plistString(content, key) {
  const lines = content.split('\n');
  const index = keyLine(lines, key);
  if (index === -1) return null;
  const value = lines[valueLine(lines, index)]?.trim() ?? '';
  if (value === '<string/>') return '';
  const match = value.match(/^<string>([\s\S]*)<\/string>$/);
  return match ? unescapeXml(match[1]) : null;
}

export function setPlistString(content, key, value) {
  const lines = content.split('\n');
  const index = keyLine(lines, key);
  if (index !== -1) {
    const at = valueLine(lines, index);
    if (!/^\s*(<string>[\s\S]*<\/string>|<string\/>)\s*$/.test(lines[at] ?? '')) return null;
    lines[at] = lines[at].replace(/<string>[\s\S]*<\/string>|<string\/>/, `<string>${escapeXml(value)}</string>`);
    return lines.join('\n');
  }
  return insertKey(lines, key, (indent) => [`${indent}<string>${escapeXml(value)}</string>`]);
}

export function plistArray(content, key) {
  const lines = content.split('\n');
  const index = keyLine(lines, key);
  if (index === -1) return null;
  const start = valueLine(lines, index);
  if (lines[start]?.trim() === '<array/>') return [];
  if (lines[start]?.trim() !== '<array>') return null;
  const values = [];
  for (let i = start + 1; i < lines.length && lines[i].trim() !== '</array>'; i++) {
    const match = lines[i].trim().match(/^<string>([\s\S]*)<\/string>$/);
    if (match) values.push(unescapeXml(match[1]));
  }
  return values;
}

export function setPlistArray(content, key, values) {
  const lines = content.split('\n');
  const index = keyLine(lines, key);
  const block = (indent) => [
    `${indent}<array>`,
    ...values.map((value) => `${indent}${unit(lines)}<string>${escapeXml(value)}</string>`),
    `${indent}</array>`,
  ];
  if (index === -1) return insertKey(lines, key, block);

  const start = valueLine(lines, index);
  const indent = lines[index].match(/^\s*/)[0];
  if (lines[start]?.trim() === '<array/>') {
    lines.splice(start, 1, ...block(indent));
    return lines.join('\n');
  }
  if (lines[start]?.trim() !== '<array>') return null;
  const end = lines.findIndex((line, i) => i > start && line.trim() === '</array>');
  if (end === -1) return null;
  lines.splice(start, end - start + 1, ...block(indent));
  return lines.join('\n');
}

export function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function unescapeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// The indentation of the top-level keys: the first <key> after the root <dict>.
function topIndent(lines) {
  const root = lines.findIndex((line) => line.trim() === '<dict>');
  if (root === -1) return null;
  const first = lines.slice(root + 1).find((line) => line.trim().startsWith('<key>'));
  return first ? first.match(/^\s*/)[0] : `${lines[root].match(/^\s*/)[0]}\t`;
}

function keyLine(lines, key) {
  const indent = topIndent(lines);
  if (indent === null) return -1;
  return lines.findIndex((line) => line === `${indent}<key>${key}</key>` || line === `${indent}<key>${key}</key>\r`);
}

// The value is on the next non-empty line (Xcode never puts it on the key's line).
function valueLine(lines, index) {
  let i = index + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  return i;
}

// One level of indentation, as the file uses it.
function unit(lines) {
  return lines.some((line) => line.startsWith('\t')) ? '\t' : '  ';
}

// Adds a key in alphabetical order among the top-level keys, the way Xcode sorts them.
function insertKey(lines, key, valueLines) {
  const indent = topIndent(lines);
  if (indent === null) return null;
  const root = lines.findIndex((line) => line.trim() === '<dict>');
  const close = lines.findLastIndex((line) => line.trim() === '</dict>');
  if (close <= root) return null;
  let at = close;
  for (let i = root + 1; i < close; i++) {
    const match = lines[i].match(/^(\s*)<key>(.*)<\/key>\s*$/);
    if (match && match[1] === indent && match[2] > key) {
      at = i;
      break;
    }
  }
  lines.splice(at, 0, `${indent}<key>${key}</key>`, ...valueLines(indent));
  return lines.join('\n');
}
