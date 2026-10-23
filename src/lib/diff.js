// A small unified-diff parser and applier for the `git diff` output that rn-diff-purge publishes.
//
// parseDiff(text) returns one entry per file:
// {
//   oldPath, newPath,                          null for /dev/null
//   status: 'modified' | 'added' | 'deleted' | 'renamed',
//   binary: true for "GIT binary patch" / "Binary files ... differ" (no hunks then),
//   mode:   the new file mode, e.g. '100755', or null
//   hunks:  [{ oldStart, oldLines, newStart, newLines, header, lines: [{ type: ' ' | '-' | '+', text, noNewline? }] }]
// }

// How far (in lines) a hunk may have moved in the user's file and still be applied.
export const MAX_OFFSET = 50;

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let skipping = false;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      file = { oldPath: match?.[1] ?? null, newPath: match?.[2] ?? null, status: 'modified', binary: false, mode: null, hunks: [] };
      files.push(file);
      hunk = null;
      skipping = false;
      continue;
    }
    if (!file || skipping) continue;

    // Inside a hunk, the line counts say where it ends, so "--- x" is a removed line, not a header.
    if (hunk && (hunk.oldLeft > 0 || hunk.newLeft > 0)) {
      const type = line === '' ? ' ' : line[0];
      if (type === ' ' || type === '-' || type === '+') {
        hunk.lines.push({ type, text: line.slice(1) });
        if (type !== '+') hunk.oldLeft -= 1;
        if (type !== '-') hunk.newLeft -= 1;
        continue;
      }
    }
    if (line.startsWith('\\')) {
      // "\ No newline at end of file" belongs to the line just before it.
      const last = hunk?.lines.at(-1);
      if (last) last.noNewline = true;
      continue;
    }

    const header = HUNK.exec(line);
    if (header) {
      hunk = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        header: header[5],
        lines: [],
      };
      hunk.oldLeft = hunk.oldLines;
      hunk.newLeft = hunk.newLines;
      file.hunks.push(hunk);
      continue;
    }

    hunk = null;
    if (line.startsWith('new file mode ')) {
      file.status = 'added';
      file.mode = line.slice('new file mode '.length);
    } else if (line.startsWith('deleted file mode')) {
      file.status = 'deleted';
    } else if (line.startsWith('new mode ')) {
      file.mode = line.slice('new mode '.length);
    } else if (line.startsWith('rename from ')) {
      file.status = 'renamed';
      file.oldPath = line.slice('rename from '.length);
    } else if (line.startsWith('rename to ')) {
      file.status = 'renamed';
      file.newPath = line.slice('rename to '.length);
    } else if (line.startsWith('--- ')) {
      const target = line.slice(4);
      if (target === '/dev/null') {
        file.status = 'added';
        file.oldPath = null;
      } else file.oldPath = target.replace(/^a\//, '');
    } else if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      if (target === '/dev/null') {
        file.status = 'deleted';
        file.newPath = null;
      } else file.newPath = target.replace(/^b\//, '');
    } else if (line === 'GIT binary patch' || /^Binary files .* differ$/.test(line)) {
      file.binary = true;
      skipping = true;
    }
  }

  for (const entry of files) {
    for (const h of entry.hunks) {
      delete h.oldLeft;
      delete h.newLeft;
    }
    if (entry.status === 'added') entry.oldPath = null;
    if (entry.status === 'deleted') entry.newPath = null;
  }
  return files;
}

// Applies hunks to a file's content. Every hunk must match its context exactly, but may have
// moved up to `maxOffset` lines. A hunk whose new lines are already there counts as done.
// Returns { content, failed: [hunk index], applied, already }; content is only useful when failed is empty.
export function applyHunks(content, hunks, { maxOffset = MAX_OFFSET } = {}) {
  const crlf = content.includes('\r\n');
  const text = crlf ? content.replace(/\r\n/g, '\n') : content;
  let eol = text.endsWith('\n');
  const lines = text === '' ? [] : (eol ? text.slice(0, -1) : text).split('\n');

  const failed = [];
  let applied = 0;
  let already = 0;
  let delta = 0;
  let floor = 0;
  hunks.forEach((hunk, index) => {
    const before = hunk.lines.filter((line) => line.type !== '+').map((line) => line.text);
    const after = hunk.lines.filter((line) => line.type !== '-').map((line) => line.text);
    const base = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart - 1;
    const expected = Math.max(floor, base + delta);

    const at = findBlock(lines, before, expected, floor, maxOffset);
    if (at === -1) {
      const done = before.length > 0 ? findBlock(lines, after, expected, floor, maxOffset) : -1;
      if (done === -1) {
        failed.push(index);
        return;
      }
      already += 1;
      delta = done - base + after.length - before.length;
      floor = done + after.length;
      return;
    }

    lines.splice(at, before.length, ...after);
    applied += 1;
    delta = at - base + after.length - before.length;
    floor = at + after.length;

    const oldNoEol = hunk.lines.some((line) => line.type !== '+' && line.noNewline);
    const newNoEol = hunk.lines.some((line) => line.type !== '-' && line.noNewline);
    if (newNoEol) eol = false;
    else if (oldNoEol) eol = true;
  });

  let result = lines.join('\n') + (eol && lines.length > 0 ? '\n' : '');
  if (crlf) result = result.replace(/\n/g, '\r\n');
  return { content: result, failed, applied, already };
}

// The content of a file the diff adds (its "+" lines).
export function addedContent(fileDiff) {
  return sideContent(fileDiff, '+');
}

// The content of a file the diff deletes (its "-" lines).
export function removedContent(fileDiff) {
  return sideContent(fileDiff, '-');
}

// A hunk as diff text lines, for showing the change to make by hand.
export function formatHunk(hunk) {
  const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`);
  return [
    `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@${hunk.header ? ` ${hunk.header}` : ''}`,
    ...hunk.lines.map((line) => `${line.type}${line.text}`),
  ];
}

function sideContent(fileDiff, type) {
  const lines = fileDiff.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.type === type));
  if (lines.length === 0) return '';
  return lines.map((line) => line.text).join('\n') + (lines.at(-1).noNewline ? '' : '\n');
}

// The position nearest to `expected` where `block` matches `lines` exactly, or -1.
function findBlock(lines, block, expected, floor, maxOffset) {
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    for (const at of offset === 0 ? [expected] : [expected - offset, expected + offset]) {
      if (at < floor || at + block.length > lines.length) continue;
      if (block.every((text, i) => lines[at + i] === text)) return at;
    }
  }
  return -1;
}
