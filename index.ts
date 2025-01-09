import yargs from 'yargs';
import { processConfig } from './src/config';
import { processDirectory } from './src/compile';
import { version } from './package.json';
import chokidar from 'chokidar';

type yarg = {
    i: string,
    o: string,
    c: string,
}

let lock = false

const build = async <T extends yarg>(a:T) => {
    if (lock) return
    lock = true
    console.log("Building...")
    let t = performance.now()
    processDirectory(a.i, a.o, await processConfig(a.c, a.i))
    console.log(`Done building (${Math.round((performance.now()-t)*100)/100} ms)`)
    lock = false
}

await yargs(process.argv.slice(2))
    .scriptName('htms')
    .usage('Usage: htms <command> [options]')
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
    .command(['build', 'b'], 'Build a directory of source files', i => i, build)
    .command(['watch', 'w'], 'Watch a directory of source files, and build upon changes', i => i,
        async a => {
            await build(a)
            let watcher = chokidar.watch(a.i)
            watcher.on("ready", () => {
                watcher
                    .on("add", () => build(a))
                    .on("change", () => build(a))
                    .on("unlink", () => build(a))
            })
        }
    )
    .example('htms build -i src/ -o out/', 'build the src/ directory to the out/ directory')
    .version(version)
    .parse()
