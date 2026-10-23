import pc from 'picocolors';
import { listLessons, readLesson, suggestLessons } from '../lib/lessons.js';
import { printMarkdown } from '../lib/ui.js';

export function learn(topic, options = {}) {
  if (!topic) {
    printList();
    return;
  }

  const lesson = readLesson(topic);
  if (!lesson) {
    const suggestions = suggestLessons(topic, listLessons().map((item) => item.id));
    const hint = suggestions.length > 0 ? ` Did you mean ${suggestions.map((id) => `"${id}"`).join(' or ')}?` : '';
    throw new Error(`No lesson called "${topic}".${hint} Run rn-buddy learn to see all lessons.`);
  }
  printLesson(lesson);
}

function printList() {
  const lessons = listLessons();
  console.log(pc.bold('Lessons'));
  const width = Math.max(...lessons.map((lesson) => lesson.id.length));
  for (const lesson of lessons) {
    console.log(`  ${pc.cyan(lesson.id.padEnd(width))}  ${lesson.summary}`);
  }
  console.log(`\n${pc.bold('rn-buddy learn <lesson>')}   read one, e.g. ${pc.bold('rn-buddy learn reload-vs-rebuild')}`);
  console.log(pc.dim('Lessons are short (one screen or two) and work offline.'));
}

function printLesson({ title, summary, body }) {
  console.log(pc.bold(title));
  console.log(pc.dim(summary));
  // Each "## Heading" starts a section: the heading in bold, its text indented below it.
  const [intro, ...sections] = body.split(/^## /m);
  if (intro.trim()) printMarkdown(inline(intro));
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n');
    console.log(`\n${pc.bold(heading.trim())}`);
    if (rest.join('').trim()) printMarkdown(inline(rest.join('\n')));
  }
}

// `code` in cyan and **words** in bold, outside code blocks.
function inline(text) {
  let inCode = false;
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('```')) inCode = !inCode;
      if (inCode || line.startsWith('```')) return line;
      return line.replace(/`([^`]+)`/g, (_, code) => pc.cyan(code)).replace(/\*\*([^*]+)\*\*/g, (_, words) => pc.bold(words));
    })
    .join('\n');
}
