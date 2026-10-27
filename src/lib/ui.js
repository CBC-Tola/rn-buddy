import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import pc from 'picocolors';

// Output helpers shared by the commands, so every command looks the same.

export const ICONS = { ok: pc.green('✔'), warn: pc.yellow('⚠'), fail: pc.red('✖'), skip: pc.dim('–') };

// "DemoApp · React Native 0.88.0" and the project folder, at the top of every command.
export function printHeader({ root, pkg }) {
  const reactNative = pkg.dependencies?.['react-native'];
  const expo = pkg.dependencies?.expo;
  const versions = [reactNative && `React Native ${reactNative}`, expo && `Expo ${expo}`].filter(Boolean).join(' · ');
  console.log(pc.bold(pkg.name ?? path.basename(root)) + (versions ? pc.dim(` · ${versions}`) : ''));
  console.log(pc.dim(root));
}

// "  Label        value", the layout `explain <package>` uses.
export function printLine(label, value, width = 12) {
  console.log(`  ${pc.dim(label.padEnd(width))} ${value}`);
}

// A labelled block of lines, the layout of `add`'s plan:
//   Install   a
//             b
export function printStep(label, lines, width = 10) {
  lines.forEach((text, i) => console.log(`  ${pc.dim((i === 0 ? label : '').padEnd(width))}${text}`));
}

// Rows of { name, status, message, version?, hint? } under a bold title, like `env`.
export function printRows(title, rows) {
  if (rows.length === 0) return;
  console.log(`\n${pc.bold(title)}`);
  const width = Math.max(...rows.map((row) => row.name.length));
  const versionWidth = Math.max(0, ...rows.map((row) => row.version?.length ?? 0));
  for (const row of rows) {
    const version = versionWidth ? `${(row.version ?? '').padEnd(versionWidth)}  ` : '';
    const message = row.status === 'skip' ? pc.dim(row.message) : row.message;
    console.log(`  ${ICONS[row.status]} ${row.name.padEnd(width)}  ${version}${message}`);
    if (row.hint) console.log(`    ${' '.repeat(width)}  ${pc.dim(`→ ${row.hint}`)}`);
  }
}

// "✔ 6 ok  ⚠ 1 to check  ✖ 1 to fix" for a list of rows.
export function summarize(rows) {
  const count = (status) => rows.filter((row) => row.status === status).length;
  return [
    `${ICONS.ok} ${count('ok')} ok`,
    count('warn') && `${ICONS.warn} ${count('warn')} to check`,
    count('fail') && `${ICONS.fail} ${count('fail')} to fix`,
  ]
    .filter(Boolean)
    .join('  ');
}

export function ok(message) {
  console.log(`${ICONS.ok} ${message}`);
}

export function warn(message) {
  console.log(pc.yellow(`⚠ ${message}`));
}

// Asks a yes/no question, yes by default. Throws outside a terminal, so scripts
// have to pass --yes (or --dry-run) on purpose.
export async function confirm(question = 'Make these changes?') {
  const answer = await ask(`\n${question} ${pc.dim('(Y/n)')} `);
  return !/^n/i.test(answer.trim());
}

// With { cancellable: true }, Esc, Ctrl+C and Ctrl+D close the question and return null.
export async function ask(question, { cancellable = false } = {}) {
  if (!process.stdin.isTTY) {
    throw new Error('Not running in a terminal. Add --yes to make these changes, or --dry-run to only see them.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  if (!cancellable) {
    const answer = await prompt.question(question);
    prompt.close();
    return answer;
  }
  return new Promise((resolve) => {
    const finish = (answer) => {
      // Resolve first: closing the prompt triggers the 'close' handler, which would resolve null.
      resolve(answer);
      process.stdin.off('keypress', onKey);
      prompt.close();
    };
    const onKey = (_, key) => {
      if (key?.name === 'escape') finish(null);
    };
    process.stdin.on('keypress', onKey);
    prompt.once('SIGINT', () => finish(null));
    prompt.once('close', () => finish(null));
    prompt.question(question).then(finish, () => finish(null));
  });
}

// Prints markdown such as a recipe's next.md: code blocks indented and colored, fences dropped.
export function printMarkdown(text) {
  let inCode = false;
  for (const line of text.trim().split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    console.log(inCode ? `    ${pc.cyan(line)}` : line ? `  ${line}` : '');
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
