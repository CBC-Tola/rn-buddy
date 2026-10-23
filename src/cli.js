import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { env } from './commands/env.js';
import { explain } from './commands/explain.js';
import { structure } from './commands/structure.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function run(argv) {
  const program = new Command();

  program.name('rn-buddy').description(pkg.description).version(pkg.version);

  program
    .command('explain')
    .description('Explain the packages and files of a React Native project')
    .argument('[package]', 'explain one package in detail')
    .option('-d, --dir <path>', 'project folder (default: current folder)')
    .option('--offline', 'skip online lookups for packages rn-buddy does not know')
    .action((name, options) => explain(name, options));

  program
    .command('env')
    .description('Check Node, Java and Ruby versions and lockfiles for a React Native project')
    .option('-d, --dir <path>', 'project folder (default: current folder)')
    .action((options) => env(options));

  program
    .command('structure')
    .description('Add a src/ folder layout with a README in each folder')
    .option('-d, --dir <path>', 'project folder (default: current folder)')
    .option('--dry-run', 'show what would be created without writing files')
    .action((options) => structure(options));

  program.parseAsync(argv).catch((error) => {
    console.error(pc.red(`✖ ${error.message}`));
    process.exitCode = 1;
  });
}
