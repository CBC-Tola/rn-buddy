import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Each command lives in src/commands/<file>.js and is loaded only when it runs,
// so `rn-buddy why` doesn't pay for loading `upgrade`.
function load(file, name = file) {
  return async (...args) => (await import(`./commands/${file}.js`))[name](...args.slice(0, -1));
}

const DIR = ['-d, --dir <path>', 'project folder (default: current folder)'];

export function run(argv) {
  const program = new Command();

  program.name('rn-buddy').description(pkg.description).version(pkg.version);
  program.commandsGroup('Understand your project');

  program
    .command('explain')
    .description('Explain the packages and files of a React Native project')
    .argument('[name]', 'explain one package, file or folder in detail')
    .option(...DIR)
    .option('--offline', 'skip online lookups for packages rn-buddy does not know')
    .option('--outdated', 'show which packages have newer versions, and whether updating is safe')
    .action(load('explain'));

  program
    .command('structure')
    .description('Show the folder tree of your project, with what each folder and file is for')
    .argument('[folder]', 'show only this folder, e.g. src; leave out for the whole project')
    .option(...DIR)
    .option('-L, --depth <levels>', 'how many levels to open (default: 3)')
    .option('--folders', 'show folders only, no files')
    .action(load('structure'));

  program
    .command('learn')
    .description('Short lessons: reload vs rebuild, Metro, autolinking, the New Architecture, ...')
    .argument('[topic]', 'the lesson to show; leave out to list them')
    .action(load('learn'));

  program.commandsGroup('When something is wrong');

  program
    .command('why')
    .description('Explain an error message and how to fix it')
    .argument('[error...]', 'the error text; or pipe a build log into rn-buddy why')
    .option(...DIR)
    .option('-f, --file <path>', 'read the error from a log file')
    .action(load('why'));

  program
    .command('doctor')
    .description('Run env, status and check together: is everything OK?')
    .option(...DIR)
    .option('--offline', 'skip the React Native Directory check of your packages')
    .action(load('doctor'));

  program
    .command('env')
    .description('Check Node, Java, Ruby, the Android SDK, Xcode and lockfiles for a React Native project')
    .option(...DIR)
    .option('--fix', 'fix what can be fixed safely (asks first)')
    .option('-y, --yes', 'with --fix: make the changes without asking')
    .option('--dry-run', 'with --fix: show the fix plan without changing anything')
    .option('--json', 'print the results as JSON')
    .option('--report', 'print a short summary to paste into a bug report')
    .action(load('env'));

  program
    .command('status')
    .description('Do I need to rebuild the app, run pod install or reset the Metro cache?')
    .option(...DIR)
    .action(load('status'));

  program
    .command('clean')
    .description('Clear caches and build folders safely (Metro, Gradle, Xcode, Pods, node_modules)')
    .option(...DIR)
    .option('--metro', 'the Metro bundler cache')
    .option('--watchman', 'Watchman file watches')
    .option('--android', 'Android build folders')
    .option('--ios', 'iOS build folders and Xcode DerivedData for this app')
    .option('--pods', 'ios/Pods, then pod install again')
    .option('--deps', 'node_modules, then install again')
    .option('--all', 'all of the above')
    .option('--lockfiles', 'also delete lockfiles (rarely a good idea)')
    .option('--dry-run', 'show what would be deleted without deleting it')
    .option('-y, --yes', 'delete without asking')
    .action(load('clean'));

  program
    .command('check')
    .description('Find common React Native mistakes in your code and packages')
    .option(...DIR)
    .option('--offline', 'skip the React Native Directory check of your packages')
    .action(load('check'));

  program.commandsGroup('Change your project');

  program
    .command('add')
    .description('Install a recipe or any package the right way')
    .argument('[name]', 'a recipe or a package name; leave out to list recipes')
    .argument('[args...]', 'recipe options, e.g. rn-buddy add permissions camera location')
    .option(...DIR)
    .option('-D, --dev', 'install the package as a devDependency')
    .option('--undo', 'remove what a recipe added (files you changed since are kept)')
    .option('--dry-run', 'show what would change without changing anything')
    .option('-y, --yes', 'make the changes without asking')
    .option('--offline', 'skip the npm and React Native Directory checks')
    .action(load('add'));

  program
    .command('app')
    .description('Show or change the app name, bundle ID, icon, splash screen and version')
    .argument('[action]', 'name, id, icon, splash or version; leave out to show the current values')
    .argument('[value]', 'the new value: a name, an ID, an image, or major/minor/patch/<version>')
    .option(...DIR)
    .option('--bg <color>', 'splash: background color', '#ffffff')
    .option('--dry-run', 'show what would change without changing anything')
    .option('-y, --yes', 'make the changes without asking')
    .action(load('app'));

  program
    .command('upgrade')
    .description('Upgrade React Native with a plan: packages, libraries and native files')
    .argument('[version]', 'the version to upgrade to (default: the latest)')
    .option(...DIR)
    .option('--dry-run', 'show the plan without changing anything')
    .option('-y, --yes', 'make the changes without asking')
    .action(load('upgrade'));

  program.commandsGroup('Run and ship');

  program
    .command('run')
    .description('Run the app on a device, emulator or simulator, and pick the platform for you')
    .argument('[device]', 'the device name (or part of it) or id; leave out to choose from a list')
    .option(...DIR)
    .action(load('run'));

  program
    .command('device')
    .description('List and start emulators, simulators and phones; connect a phone to Metro')
    .argument('[action]', 'list (default), start or connect')
    .argument('[name]', 'start: the emulator or simulator to start')
    .option(...DIR)
    .option('-p, --port <port...>', 'connect: extra ports to forward, e.g. your API server')
    .action(load('device'));

  program
    .command('release')
    .description('Make your first release build, or check the app before releasing')
    .argument('[target]', 'check, android or ios')
    .option(...DIR)
    .option('--dry-run', 'show what would change without changing anything')
    .option('-y, --yes', 'make the changes without asking')
    .action(load('release'));

  program
    .command('new')
    .description('Create a React Native app and set it up with rn-buddy recipes')
    .argument('<name>', 'the app name, e.g. MyApp')
    .option('-r, --recipes <names>', 'recipes to add, comma separated, e.g. navigation,state,api')
    .option('-y, --yes', "don't ask questions")
    .action(load('new', 'createApp'));

  program.parseAsync(argv).catch((error) => {
    console.error(pc.red(`✖ ${error.message}`));
    process.exitCode = 1;
  });
}
