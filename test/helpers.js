import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Creates a throwaway project folder. `files` maps relative paths to contents;
// a path ending in "/" creates an empty folder.
export function makeProject(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rn-buddy-test-'));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    if (file.endsWith('/')) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
    }
  }
  return root;
}
