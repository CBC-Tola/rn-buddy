import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { explain } from './commands/explain.js';

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

  program.parseAsync(argv).catch((error) => {
    console.error(pc.red(`✖ ${error.message}`));
    process.exitCode = 1;
  });
}
