import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { categories, lookupFile, lookupPackage } from '../src/lib/notes.js';

test('finds a package by exact name', () => {
  assert.equal(lookupPackage('react-native-screens').category, 'Navigation');
});

test('wildcard entries fill in {rest} everywhere', () => {
  const entry = lookupPackage('@react-native-community/cli-platform-ios');
  assert.equal(entry.note, 'Adds ios commands to the CLI (`npm run ios`)');
  assert.equal(lookupPackage('@types/react').note, 'TypeScript type definitions for react');
});

test('exact name wins over a matching wildcard', () => {
  assert.equal(lookupPackage('@react-native-community/cli').category, 'CLI & Native tooling');
  assert.match(lookupPackage('@react-native-community/cli').note, /react-native` command/);
});

test('unknown packages and files return null', () => {
  assert.equal(lookupPackage('some-unknown-package'), null);
  assert.equal(lookupFile('mystery.txt'), null);
});

test('finds file notes', () => {
  assert.match(lookupFile('Gemfile'), /CocoaPods/);
});

test('every package entry uses a known category', () => {
  const data = JSON.parse(readFileSync(new URL('../src/data/explain.json', import.meta.url), 'utf8'));
  for (const [name, entry] of Object.entries(data.packages)) {
    assert.ok(categories.includes(entry.category), `${name} has unknown category "${entry.category}"`);
    assert.ok(entry.note, `${name} has no note`);
  }
});
