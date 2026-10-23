import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { distance, listLessons, parseLesson, readLesson, suggestLessons } from '../src/lib/lessons.js';

const bin = fileURLToPath(new URL('../bin/rn-buddy.js', import.meta.url));

function rnBuddy(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

// Other commands point to these ids (`rn-buddy learn <id>`), so they must keep existing.
const REFERENCED = [
  'reload-vs-rebuild',
  'metro',
  'autolinking',
  'new-architecture',
  'debug-vs-release',
  'pods',
  'gradle',
  'expo-go',
];

test('parses a lesson: title, summary paragraph and body', () => {
  const lesson = parseLesson('demo', '# Demo lesson\n\nWhat it is\nabout.\n\n## Part one\n\nText.\n');
  assert.deepEqual(lesson, { id: 'demo', title: 'Demo lesson', summary: 'What it is about.', body: '## Part one\n\nText.' });
});

test('every referenced lesson exists', () => {
  const ids = listLessons().map((lesson) => lesson.id);
  for (const id of REFERENCED) assert.ok(ids.includes(id), `missing lesson ${id}`);
});

test('every lesson has a title, a one-line summary, sections and related commands', () => {
  const lessons = listLessons();
  assert.ok(lessons.length >= 15);
  for (const { id, title, summary, body } of lessons) {
    assert.ok(title && !title.startsWith('#'), id);
    assert.ok(summary.length > 20 && summary.length < 130, `${id}: summary should be one short sentence`);
    assert.match(body, /^## /, `${id}: body should start with a ## section`);
    assert.match(body, /## Related\n[\s\S]*rn-buddy /, `${id}: needs a Related section with rn-buddy commands`);
    const lines = body.split('\n').length;
    assert.ok(lines < 70, `${id} is ${lines} lines: keep lessons short`);
    // Fences must be balanced, or the rest of the lesson prints as code.
    assert.equal((body.match(/^```/gm) ?? []).length % 2, 0, id);
  }
});

test('lessons are listed in learning order', () => {
  const ids = listLessons().map((lesson) => lesson.id);
  assert.equal(ids[0], 'reload-vs-rebuild');
  assert.ok(ids.indexOf('metro') < ids.indexOf('upgrading'));
});

test('reads one lesson and refuses paths', () => {
  assert.equal(readLesson('metro').title, 'Metro');
  assert.equal(readLesson('METRO').id, 'metro');
  assert.equal(readLesson('nope'), null);
  assert.equal(readLesson('../../package'), null);
  assert.equal(readLesson('metro.md'), null);
});

test('suggests close lesson ids', () => {
  const ids = listLessons().map((lesson) => lesson.id);
  assert.deepEqual(suggestLessons('reload', ids), ['reload-vs-rebuild']);
  assert.equal(suggestLessons('metor', ids)[0], 'metro');
  assert.equal(suggestLessons('pod', ids)[0], 'pods');
  assert.ok(suggestLessons('new-arch', ids).includes('new-architecture'));
  assert.ok(suggestLessons('release', ids).includes('debug-vs-release'));
  assert.deepEqual(suggestLessons('kubernetes', ids), []);
  assert.equal(distance('metro', 'metor'), 2);
});

test('rn-buddy learn lists lessons', () => {
  const { status, stdout } = rnBuddy('learn');
  assert.equal(status, 0);
  assert.match(stdout, /^Lessons\n/);
  assert.match(stdout, / {2}reload-vs-rebuild +When a change shows up by itself/);
  assert.match(stdout, / {2}metro +The bundler/);
});

test('rn-buddy learn <id> prints the lesson', () => {
  const { status, stdout } = rnBuddy('learn', 'reload-vs-rebuild');
  assert.equal(status, 0);
  assert.match(stdout, /^Reload vs rebuild\n/);
  assert.match(stdout, /\nWhen you must rebuild\n {2}- /);
  assert.match(stdout, /rn-buddy status/);
  assert.doesNotMatch(stdout, /^## /m);
});

test('rn-buddy learn <unknown> suggests lessons and fails', () => {
  const { status, stderr } = rnBuddy('learn', 'metor');
  assert.equal(status, 1);
  assert.match(stderr, /No lesson called "metor"\. Did you mean "metro"/);
});
