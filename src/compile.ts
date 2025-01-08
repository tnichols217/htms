import {parseHTML} from 'linkedom';
import prettier from 'prettier';
import path from 'path';
import fs from "node:fs/promises";
import { type GetOption, type Option, fileProcessor } from './config';
import { getMDRenderer } from './md';
import * as sass from 'sass';

export const processAttributes = (doc: Document, obj: Element, config: Option, attrs: NamedNodeMap | null, children: NodeListOf<ChildNode> | null): Element => {
    if (attrs != null) {
        Array.from(obj.attributes).forEach(a => {
            obj.removeAttribute(a.name)
            obj.setAttribute(
                a.name.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || ""),
                a.value.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || "")
            )
        })
    }

    obj.replaceChildren(...Array.from(obj.childNodes).map(c => {
        if (c.nodeName.startsWith("#")) {
            if (c.textContent?.includes(config.template.nesting)) {
                if (children != null) {
                    let newEl = doc.createElement("div")
                    newEl.replaceChildren(...Array.from(children).map(c => c.cloneNode(true)))
                    return newEl
                } else {
                    c.textContent = c.textContent.replace(config.template.nesting, "")
                }
            } else if (attrs != null) {
                c.textContent = c?.textContent?.replace(new RegExp(config.template.attribute), (_, v) => attrs.getNamedItem(v)?.value || "") || ""
            }
            return c
        } else {
            return processAttributes(doc, c as Element, config, attrs, children)
        }
    }))
    return obj
}

export const processObject = async (doc: Document, obj: ChildNode[], fp: path.ParsedPath, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, refs = new Map<string, string>()): Promise<DocumentFragment> => {
    let imports = obj.filter(a => a.nodeName == config.imports.tag) as Element[]
    let ref_copy = new Map<string, string>(refs)
    imports.forEach(i => {
            let src = i.getAttribute(config.imports.source)
            src = src?.startsWith("/") ? path.resolve(config.files.root, src.slice(1)) : path.resolve(fp.dir, src || "")
            return ref_copy.set(
                i.getAttribute(config.imports.alias)?.toUpperCase() || "",
                src
            )
        }
    )

    // process attributes
    obj.filter(c => !c.nodeName.startsWith("#")).map(c => c as Element).forEach(c => processAttributes(doc, c, config, attrs, children))

    // process children
    obj = await Promise.all(obj.map(
        async c => {
            if (c.nodeName.startsWith("#")) {
                return c
            }
            (c as Element).replaceChildren(
                ...Array.from(
                    (await processObject(
                        doc, Array.from(c.childNodes), fp, config, attrs, children, ref_copy
                    )).childNodes
                )
            )
            return c
        }
    ))

    let ret = doc.createDocumentFragment();

    (await Promise.all((obj.filter(a => a.nodeName != config.imports.tag) as Element[]).map(async c => {
        let tag = c.nodeName
        let ref = ref_copy.get(tag)
        if (ref != null) {
            let subFile = await processFile(ref, config, c.attributes, c.childNodes)
            return Array.from(subFile.document.childNodes).map(c => c.cloneNode(true))
        }
        return [c.cloneNode(true)]
    }))).flat(1).forEach(c => ret.appendChild(c))

    return ret
}

export const processFile = async (filepath: string, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, isMD = false): Promise<Window> => {
    filepath = path.normalize(filepath)
    let fp = path.parse(filepath)
    const file = Bun.file(filepath)
    let text = await file.text()
    if (isMD) {
        text = getMDRenderer(config).render(text)
    }
    
    let doc = parseHTML(text)

    doc.document.replaceChildren(...Array.from((await processObject(doc.document, Array.from(doc.document.childNodes), fp, config, attrs, children)).children))

    return doc
}

export const processFileString = async (filepath: string, config: Option, isMD = false, children = null as NodeListOf<ChildNode> | null): Promise<string> => {
    filepath = path.normalize(filepath);
    let htmlString = (await processFile(filepath, config, null, children, isMD)).document.toString()
    if (config.format.pretty) {
        htmlString = await prettier.format(config.template.prefix + htmlString + config.template.postfix, Object.assign({},
            config.format.prettierConfig,
            {
                parser: "html"
            }
        ));
    }
    return htmlString
}

export const processDirectory = async (dirpath: string, outpath: string, config: GetOption) => {
    dirpath = path.normalize(dirpath);
    outpath = path.normalize(outpath);
    let files = await fs.readdir(dirpath, { recursive: true });
    fs.mkdir(outpath, { recursive: true })
    await Promise.all(files.map(async f => {
        let p = path.resolve(dirpath, f)
        let pa = path.parse(p)
        let conf = config(p)
        let ext = pa.ext.toLowerCase()
        let typ = conf.files.extensions.mapping[ext] || conf.files.extensions.mapping.default
        typ = Object.values(fileProcessor).find(a => a == typ) || conf.files.extensions.mapping.default
        switch (typ) {
            case fileProcessor.html: {
                return processFileString(p, conf)
                .then(async o => {
                    let op = path.resolve(outpath, f)
                    await fs.mkdir(path.parse(op).dir, { recursive: true })
                        await fs.writeFile(op, o)
                    })
            }
            case fileProcessor.md: {
                let renderer = path.resolve(pa.dir, conf.files.md_renderer)
                let md = await processFile(p, conf, null, null, true)
                let fo = path.parse(f)
                return processFileString(renderer, conf, false, md.document.childNodes)
                    .then(async o => {
                        let op = path.resolve(outpath, fo.name + conf.files.extensions.html)
                        await fs.mkdir(path.parse(op).dir, { recursive: true })
                        await fs.writeFile(op, o)
                    })
            }
            case fileProcessor.ignore:
                return
            case fileProcessor.sass: {
                console.log(`Compiling SASS file: ${p}`)
                let c = sass.compile(p)
                let fo = path.parse(f)
                let op = path.resolve(outpath, fo.name + conf.files.extensions.css)
                await fs.mkdir(path.parse(op).dir, { recursive: true })
                await fs.writeFile(op, c.css.toString())
                return
            }
            case fileProcessor.less:
            case fileProcessor.copy:
            case fileProcessor.css:
            case fileProcessor.js:
            case fileProcessor.ts: {
                if (await fs.stat(p).then(s => s.isDirectory())) return
                let outp = path.resolve(outpath, f)
                await fs.mkdir(path.parse(outp).dir, { recursive: true })
                await fs.copyFile(p, outp)
                return
            }
        }
    }))
}
