import {parseHTML} from 'linkedom';
import prettier from 'prettier';
import path from 'path';
import fs from "node:fs/promises";
import markdownit from 'markdown-it';
import yargs from 'yargs';
import {globSync} from 'glob';

const def_options = {
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
        html:         true,
        xhtmlOut:     true,
        breaks:       true,
        langPrefix:   'language-',
        linkify:      true,
        typographer:  true,
        quotes: '“”‘’'
    },
    files: {
        extensions: {
            html: ".html",
            md: ".md"
        },
        md_renderer: "render.htms",
    },
    imports: {
        tag: "IMPORT",
        source: "src",
        alias: "as"
    }
}

type Option = typeof def_options;
type OptionFile = Map<string, Option>[];
type GetOption = (filePath: string) => Option;

let processAttributes = (obj: Element, config: Option, attrs: NamedNodeMap | null, children: NodeListOf<ChildNode> | null): Element => {
    if (attrs != null) {
        Array.from(obj.attributes).forEach(a => {
            obj.removeAttribute(a.name)
            obj.setAttribute(
                a.name.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || ""),
                a.value.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || "")
            )
        })
    }

    if (obj.children.length == 0) {
        if (obj.textContent?.includes(config.template.nesting)) {
            if (children != null) {
                obj.replaceChildren(...Array.from(children).map(c => c.cloneNode(true)))
            } else {
                obj.textContent = obj.textContent.replace(config.template.nesting, "")
            }
        } else if (attrs != null) {
            obj.textContent = obj?.textContent?.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || "") || ""
        }
    } else {
        Array.from(obj.children).map(c => processAttributes(c, config, attrs, children))
    }
    return obj
}

let processObject = async (doc: Document, obj: Element[], fp: path.ParsedPath, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, refs = new Map<string, string>()): Promise<DocumentFragment> => {
    let imports = obj.filter(a => a.tagName == config.imports.tag)
    let ref_copy = new Map<string, string>(refs)
    imports.forEach(i => 
        ref_copy.set(
            i.getAttribute(config.imports.alias)?.toUpperCase() || "",
            path.resolve(fp.dir, i.getAttribute(config.imports.source) || "")
        )
    )

    // process attributes
    obj.forEach(c => processAttributes(c, config, attrs, children))

    // process children
    obj = await Promise.all(obj.map(
        async c => {
            if (c.children.length != 0) {
                c.replaceChildren(
                    ...Array.from(
                        (await processObject(
                            doc, Array.from(c.children), fp, config, attrs, children, ref_copy
                        )).children
                    )
                )
            }
            return c
        }
    ))

    let ret = doc.createDocumentFragment();

    (await Promise.all(obj.filter(a => a.tagName != config.imports.tag).map(async c => {
        let tag = c.tagName
        let ref = ref_copy.get(tag)
        if (ref != null) {
            let subFile = await processFile(ref, config, c.attributes, c.childNodes)
            return Array.from(subFile.document.children).map(c => c.cloneNode(true))
        }
        return [c.cloneNode(true)]
    }))).flat(1).forEach(c => ret.appendChild(c))

    return ret
}

let processFile = async (filepath: string, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, isMD = false): Promise<Window> => {
    filepath = path.normalize(filepath)
    let fp = path.parse(filepath)
    const file = Bun.file(filepath)
    let text = await file.text()
    if (isMD) {
        const md = markdownit(config.md);
        text = md.render(text)
    }
    
    let doc = parseHTML(text)

    doc.document.replaceChildren(...Array.from((await processObject(doc.document, Array.from(doc.document.children), fp, config, attrs, children)).children))

    return doc
}

let processFileString = async (filepath: string, config: Option, isMD = false, children = null as NodeListOf<ChildNode> | null): Promise<string> => {
    filepath = path.normalize(filepath);
    let htmlString = (await processFile(filepath, config, null, children, isMD)).document.toString()
    const formattedHtml = await prettier.format(config.template.prefix + htmlString + config.template.postfix, Object.assign({},
        config.format.prettierConfig,
        {
            parser: "html"
        }
    ));
    return formattedHtml
}

let processDirectory = async (dirpath: string, outpath: string, config: GetOption) => {
    dirpath = path.normalize(dirpath);
    outpath = path.normalize(outpath);
    let files = await fs.readdir(dirpath, { recursive: true });
    fs.mkdir(outpath, { recursive: true })
    await Promise.all(files.map(async f => {
        let p = path.resolve(dirpath, f)
        let pa = path.parse(p)
        let conf = config(p)
        switch (pa.ext.toLowerCase()) {
            case conf.files.extensions.html:
                return processFileString(p, conf)
                    .then(o => 
                        fs.writeFile(path.resolve(outpath, f), o)
                    )
            case conf.files.extensions.md:
                let renderer = path.resolve(pa.dir, conf.files.md_renderer)
                let md = await processFile(p, conf, null, null, true)
                return processFileString(renderer, conf, false, md.document.childNodes)
                    .then(async o => {
                        let op = path.resolve(outpath, f.substring(0, f.length-3) + conf.files.extensions.html)
                        await fs.mkdir(path.parse(op).dir, { recursive: true })
                        await fs.writeFile(op, o)
                    })
            default:
        }
    }))
}

let deepMerge = <T extends object>(...objects: T[]): T => {
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

let processConfig = async (cfgfile: string): Promise<GetOption> => {
    cfgfile = path.normalize(cfgfile);
    const proc = Bun.spawn(["nix", "eval", "--json", "--file", cfgfile]);
    const text = await new Response(proc.stdout).text();
    const options: OptionFile = JSON.parse(text)
    let files = new Map<string, Option[]>()
    options.forEach(o => Object.entries(o).forEach(k => globSync(k[0]).forEach(file => files.set(file, [...(files.get(file) || []), k[1]]))))
    let files_condensed = Object.fromEntries(files.entries().map(([file, op]) => {
        let f = path.parse(file)
        return [ path.resolve(f.dir, f.base), deepMerge(def_options, ...op) ]
    }))
    return (filename: string) => {
        return files_condensed[path.normalize(filename)] || def_options
    }
}

let argv = await yargs(process.argv.slice(2))
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
    .help('h')
    .alias('h', 'help')
    .epilog('Trevor Nichols 2024')
    .parse();

let conf = (argv.c != "none") ? await processConfig(argv.c) : (_: string) => def_options
processDirectory(argv.i, argv.o, conf)
