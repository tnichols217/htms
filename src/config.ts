import path from 'path';
import {globSync} from 'glob';

export const DEF_OPTIONS = {
    template: {
        prefix: '<!DOCTYPE html><html>',
        postfix: '</html>',
        attribute: "{{([^{}]+)}}",
        nesting: "{{{}}}"
    },
    format: {
        pretty: true,
        minify: false,
        prettierConfig: {
            tabWidth: 4,
            useTabs: false,
            singleQuote: false
        }
    },
    md: {
        config: {
            html:         true,
            xhtmlOut:     true,
            breaks:       true,
            langPrefix:   'language-',
            linkify:      true,
            typographer:  true,
            quotes: '“”‘’'
        },
        extensions: {
            sub: false,
            sup: false,
            footnote: false,
            deflist: false,
            abbr: false,
            emoji: false,
            container: false,
            ins: false,
            mark: false,
            katex: false
        },
        katex: {
            displayMode: false,
            output: "htmlAndMathml",
            throwOnError: false,
            errorColor: "#cc0000",
            trust: true
        }
    },
    files: {
        extensions: {
            html: ".html",
            md: ".md",
            ignore: [".htms"]
        },
        md_renderer: "render.htms",
    },
    imports: {
        tag: "IMPORT",
        source: "src",
        alias: "as"
    }
}

export type Option = typeof DEF_OPTIONS;
export type OptionFile = Map<string, Option>[];
export type GetOption = (filePath: string) => Option;

export const deepMerge = <T extends object>(...objects: T[]): T => {
    const isObject = (item: any) => item && typeof item === 'object' && !Array.isArray(item)
    if (objects.length < 2) return objects[0]
    const source = objects.shift() as T

    if (isObject(source) && isObject(objects[0])) {
        for (const key in objects[0]) {
            if (isObject(objects[0][key])) {
                if (!source[key]) Object.assign(source, { [key]: {} })
                deepMerge<object>(source[key] as object, objects[0][key] as object)
            } else {
                Object.assign(source, { [key]: objects[0][key] })
            }
        }
    }
    objects[0] = source
    return deepMerge(...objects)
}

export const processConfig = async (cfgfile: string): Promise<GetOption> => {
    cfgfile = path.normalize(cfgfile);
    let text = "{}"
    if (cfgfile.endsWith(".nix")) {
        const proc = Bun.spawn(["nix", "--experimental-features", "nix-command", "eval", "--json", "--file", cfgfile]);
        text = await new Response(proc.stdout).text();
    } else {
        text = await Bun.file(cfgfile).text()
    }
    try {
        const options: OptionFile = JSON.parse(text)
        let files = new Map<string, Option[]>()
        options.forEach(o => Object.entries(o).forEach(k => globSync(k[0]).forEach(file => files.set(file, [...(files.get(file) || []), k[1]]))))
        let files_condensed = Object.fromEntries(files.entries().map(([file, op]) => {
            let f = path.parse(file)
            return [ path.resolve(f.dir, f.base), deepMerge(DEF_OPTIONS, ...op) ]
        }))
        return (filename: string) => {
            return files_condensed[path.normalize(filename)] || DEF_OPTIONS
        }
    }
    catch (e) {
        console.error("Config: ", text)
        throw e
    }
}
