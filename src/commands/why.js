import { fstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { errorLines, explainMatch, findMatches, matchTitle, REPORT_EMAIL } from '../lib/errors.js';
import { readProject } from '../lib/project.js';
import { printStep } from '../lib/ui.js';

const WIDTH = 14;
const MAX_OTHERS = 5;
const STDIN_WAIT = 1000;

export async function why(errorWords = [], options = {}) {
  const text = await readInput(errorWords, options);
  if (!text.trim()) {
    printUsage();
    return;
  }

  const project = tryReadProject(options.dir ?? process.cwd());
  const matches = findMatches(text);
  if (matches.length === 0) {
    printNoMatch(text);
    process.exitCode = 1;
    return;
  }

  const [best, ...others] = matches;
  const longInput = text.trim().split('\n').length > 3;
  if (longInput) console.log(pc.dim(`Line ${best.line}: ${shorten(best.text, 120)}`));
  printAnswer(explainMatch(best, { project }));

  if (best.entry.kind === 'wrapper') printErrorLines(text);
  // Wrappers only say "it failed", so they're noise next to a real error.
  const rest = best.entry.kind === 'wrapper' ? others : others.filter((match) => match.entry.kind !== 'wrapper');
  if (rest.length > 0) {
    console.log(`\n${pc.bold('Also found in this log')}`);
    for (const match of rest.slice(0, MAX_OTHERS)) {
      console.log(`  ${pc.yellow('•')} ${matchTitle(match)} ${pc.dim(`(line ${match.line})`)}`);
    }
    console.log(pc.dim('  → Fix the first one, then build again: the others often go away with it.'));
  }
}

// The error comes from the arguments, a log file, or a pipe: `run-android 2>&1 | rn-buddy why`.
async function readInput(words, { file }) {
  if (file) {
    try {
      return readFileSync(path.resolve(file), 'utf8');
    } catch (error) {
      throw new Error(`Can't read ${file}: ${error.code === 'ENOENT' ? 'file not found' : error.message}`);
    }
  }
  if (words.length > 0) return words.join(' ');
  return process.stdin.isTTY ? '' : readStdin();
}

// Reads a piped log to the end. A pipe or file is read until it closes; other inputs
// (a socket left open by an editor or a script) only count if something arrives soon,
// so `rn-buddy why` with nothing piped shows the help instead of waiting forever.
function readStdin() {
  const stat = fstatSync(0);
  if (!stat.isFIFO() && !stat.isFile() && !stat.isSocket()) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = stat.isSocket()
      ? setTimeout(() => {
          if (data) return;
          process.stdin.destroy();
          resolve('');
        }, STDIN_WAIT)
      : null;
    const done = () => {
      clearTimeout(timer);
      resolve(data);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

// `why` also works outside a project; it just can't check the project then.
function tryReadProject(dir) {
  try {
    return readProject(dir);
  } catch {
    return null;
  }
}

function printAnswer(answer) {
  console.log(pc.bold(answer.title));
  console.log('');
  if (answer.likely) {
    printBlock('Likely cause', [answer.likely]);
  } else {
    printBlock(answer.causes.length > 1 ? 'Causes' : 'Cause', answer.causes, { bullets: true });
  }
  if (answer.facts.length > 0) printBlock('Checked', answer.facts);
  // "x" / "or: y" reads as one fix; separate fixes get bullets.
  printBlock('Fix', answer.fixes, { bullets: !answer.fixes.some((fix) => fix.startsWith('or:')) });
  if (answer.then) printBlock('Then', [answer.then]);

  const more = [
    answer.learn && ['Learn more', `\`rn-buddy learn ${answer.learn}\``],
    answer.clean && ['Tip', `If it keeps happening: \`rn-buddy clean --${answer.clean}\``],
    answer.docs && ['Docs', answer.docs],
  ].filter(Boolean);
  if (more.length > 0) {
    console.log('');
    for (const [label, value] of more) printBlock(label, [value]);
  }
}

// A labelled block, each item wrapped to the terminal width with a hanging indent.
function printBlock(label, items, { bullets = false } = {}) {
  const bullet = bullets && items.length > 1;
  const width = Math.min(process.stdout.columns || 100, 100) - WIDTH - 2 - (bullet ? 2 : 0);
  const lines = items.flatMap((item) =>
    wrap(item, width).map((line, i) => (bullet ? `${i === 0 ? pc.dim('•') : ' '} ` : '') + code(line)),
  );
  printStep(label, lines, WIDTH);
}

// Breaks at spaces, but never inside a `command`, so it can still be copied in one piece.
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.match(/[^\s`]*`[^`]*`\S*|\S+/g) ?? []) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return line ? [...lines, line] : lines;
}

// `commands` in the database are shown in color, without the backticks.
function code(text) {
  return text.replace(/`([^`]+)`/g, (all, command) => pc.cyan(command));
}

function printErrorLines(text) {
  const lines = errorLines(text);
  if (lines.length === 0) return;
  console.log(`\n${pc.bold('Lines that look like the real error')}`);
  for (const line of lines) console.log(`  ${pc.red('>')} ${line}`);
  console.log(pc.dim(`  → Paste one into rn-buddy why "<line>" to see what it means.`));
}

function printNoMatch(text) {
  console.log(pc.bold("rn-buddy doesn't know this error yet."));
  printErrorLines(text);
  console.log('');
  console.log(pc.dim('→ Search for the first error line (the first one is usually the cause, the rest follow from it).'));
  console.log(pc.dim('→ Check your setup: rn-buddy doctor, or rn-buddy env.'));
  console.log(pc.dim(`→ Help add it: email the error to ${REPORT_EMAIL}`));
}

function printUsage() {
  console.log(pc.bold('rn-buddy why') + pc.dim('  explains an error message and how to fix it'));
  console.log('');
  console.log('Give it the error in one of these ways:');
  console.log(`  ${pc.cyan('rn-buddy why "Unable to resolve module @react-navigation/native"')}`);
  console.log(`  ${pc.cyan('npx react-native run-android 2>&1 | rn-buddy why')}   ${pc.dim('a whole build log')}`);
  console.log(`  ${pc.cyan('rn-buddy why --file build.log')}`);
}

function shorten(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
