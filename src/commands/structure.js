import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { isExpo, readProject } from '../lib/project.js';
import { buildTree, countTree, DEFAULT_DEPTH, renderTree } from '../lib/tree.js';
import { printHeader } from '../lib/ui.js';

export function structure(name, options = {}) {
  const project = readProject(options.dir ?? process.cwd());
  const { root } = project;
  const depth = parseDepth(options.depth);

  const folder = name ? path.resolve(root, name) : root;
  const relative = path.relative(root, folder).split(path.sep).join('/');
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${name} is outside the project.`);
  if (!existsSync(folder)) throw new Error(`There is no ${relative}/ in this project.`);
  if (!statSync(folder).isDirectory()) throw new Error(`${relative} is a file, not a folder. rn-buddy explain ${relative} describes it.`);

  printHeader(project);
  const tree = buildTree(folder, { root, depth, folders: Boolean(options.folders), expo: isExpo(project.pkg) });

  console.log(`\n${pc.bold(relative ? `${relative}/` : './')}`);
  if (tree.children.length === 0) {
    console.log(pc.dim('  empty'));
    return;
  }
  for (const line of renderTree(tree, { color: pc.cyan, dim: pc.dim })) console.log(line);

  const { folders, files } = countTree(tree);
  const parts = [`${folders} folder${folders === 1 ? '' : 's'}`];
  if (!options.folders) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  console.log(`\n${parts.join(', ')}${pc.dim(` · ${depth} level${depth === 1 ? '' : 's'} deep`)}`);
  if (depth === DEFAULT_DEPTH) console.log(pc.dim('→ Go deeper with --depth 5, or look at one folder: rn-buddy structure src'));
}

function parseDepth(value) {
  if (value === undefined) return DEFAULT_DEPTH;
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 1) throw new Error(`"${value}" is not a depth. Use a number like 2, e.g. rn-buddy structure --depth 2`);
  return depth;
}
