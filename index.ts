import yargs from 'yargs';
import { DEF_OPTIONS, processConfig } from './src/config';
import { processDirectory } from './src/compile';
import { version } from './package.json';

let argv = async () => await yargs(process.argv.slice(2))
    .usage('Usage: htms <command> [options]')
    .command('build', 'Build a directory of source files')
    .example('htms build -i src/ -o out/', 'build the src/ directory to the out/ directory')
    .alias('i', 'input')
    .nargs('i', 1)
    .default('i', 'src')
    .describe('i', 'Input directory')
    .alias('o', 'output')
    .nargs('o', 1)
    .default('o', 'out')
    .describe('o', 'Output directory')
    .alias('c', 'config')
    .nargs('c', 1)
    .default('c', 'none')
    .example('htms build -c config.nix', 'use config.nix as the configurator')
    .help('h')
    .alias('h', 'help')
    .alias('V', 'version')
    .epilog('Trevor Nichols 2025')
    .version(version)
    .parse()

argv().then(async a => {
    let conf = (a.c != "none") ? await processConfig(a.c) : (_: string) => DEF_OPTIONS
    processDirectory(a.i, a.o, conf)
})
