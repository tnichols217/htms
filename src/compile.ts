import {parseHTML} from 'linkedom';
import prettier from 'prettier';
import path from 'path';
import fs from "node:fs/promises";
import { type GetOption, type Option } from './config';
import { getMDRenderer } from './md';

export const processAttributes = (obj: Element, config: Option, attrs: NamedNodeMap | null, children: NodeListOf<ChildNode> | null): Element => {
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

export const processObject = async (doc: Document, obj: Element[], fp: path.ParsedPath, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, refs = new Map<string, string>()): Promise<DocumentFragment> => {
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

export const processFile = async (filepath: string, config: Option, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, isMD = false): Promise<Window> => {
    filepath = path.normalize(filepath)
    let fp = path.parse(filepath)
    const file = Bun.file(filepath)
    let text = await file.text()
    if (isMD) {
        text = getMDRenderer(config).render(text)
    }
    
    let doc = parseHTML(text)

    doc.document.replaceChildren(...Array.from((await processObject(doc.document, Array.from(doc.document.children), fp, config, attrs, children)).children))

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
        switch (ext) {
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
                if (conf.files.extensions.ignore.includes(ext)) return
                let outp = path.resolve(outpath, f)
                if (await fs.stat(p).then(s => s.isDirectory())) return
                fs.copyFile(p, outp)
        }
    }))
}
