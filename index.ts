import {parseHTML} from 'linkedom';
import prettier from 'prettier';
import path from 'path';
import fs from "node:fs/promises";
import markdownit from 'markdown-it';

const md = markdownit({
    html:         true,
    xhtmlOut:     true,
    breaks:       true,
    langPrefix:   'language-',
    linkify:      true,
    typographer:  true,
    quotes: '“”‘’'
});

let processAttributes = (obj: Element, attrs: NamedNodeMap | null, children: NodeListOf<ChildNode> | null): Element => {
    if (attrs != null) {
        Array.from(obj.attributes).forEach(a => {
            obj.removeAttribute(a.name)
            obj.setAttribute(
                a.name.replace(/{{([^{}]+)}}/g, (_, v) => attrs.getNamedItem(v)?.value || ""),
                a.value.replace(/{{([^{}]+)}}/g, (_, v) => attrs.getNamedItem(v)?.value || ""))
        })
    }

    if (obj.children.length == 0) {
        if (obj.textContent?.includes("{{{}}}")) {
            if (children != null) {
                obj.replaceChildren(...Array.from(children).map(c => c.cloneNode(true)))
            } else {
                obj.textContent = obj.textContent.replace("{{{}}}", "")
            }
        } else if (attrs != null) {
            obj.textContent = obj?.textContent?.replace(/{{([^{}]+)}}/g, (_, v) => attrs.getNamedItem(v)?.value || "") || ""
        }
    } else {
        Array.from(obj.children).map(c => processAttributes(c, attrs, children))
    }
    return obj
}

let processObject = async (doc: Document, obj: Element[], fp: path.ParsedPath, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, refs = new Map<string, string>()): Promise<DocumentFragment> => {
    let imports = obj.filter(a => a.tagName == 'IMPORT')
    let ref_copy = new Map<string, string>(refs)
    imports.forEach(i => 
        ref_copy.set(
            i.getAttribute('as')?.toUpperCase() || "",
            path.resolve(fp.dir, i.getAttribute('src') || "")
        )
    )

    // process attributes
    obj.forEach(c => processAttributes(c, attrs, children))

    // process children
    obj = await Promise.all(obj.map(
        async c => {
            if (c.children.length != 0) {
                c.replaceChildren(
                    ...Array.from(
                        (await processObject(
                            doc, Array.from(c.children), fp, attrs, children, ref_copy
                        )).children
                    )
                )
            }
            return c
        }
    ))

    let ret = doc.createDocumentFragment();

    (await Promise.all(obj.filter(a => a.tagName != 'IMPORT').map(async c => {
        let tag = c.tagName
        let ref = ref_copy.get(tag)
        if (ref != null) {
            let subFile = await processFile(ref, c.attributes, c.childNodes)
            return Array.from(subFile.document.children).map(c => c.cloneNode(true))
        }
        return [c.cloneNode(true)]
    }))).flat(1).forEach(c => ret.appendChild(c))

    return ret
}

let processFile = async (filepath: string, attrs = null as NamedNodeMap | null, children = null as NodeListOf<ChildNode> | null, isMD = false): Promise<Window> => {
    filepath = path.normalize(filepath)
    let fp = path.parse(filepath)
    const file = Bun.file(filepath)
    let text = await file.text()
    text = isMD ? md.render(text) : text
    
    let doc = parseHTML(text)

    doc.document.replaceChildren(...Array.from((await processObject(doc.document, Array.from(doc.document.children), fp, attrs, children)).children))

    return doc
}

let processFileString = async (filepath: string, prefix = "<!DOCTYPE html><html>", postfix = "</html>", isMD = false, children = null as NodeListOf<ChildNode> | null): Promise<string> => {
    filepath = path.normalize(filepath);
    let htmlString = (await processFile(filepath, null, children, isMD)).document.toString()
    const formattedHtml = await prettier.format(prefix + htmlString + postfix, {
        parser: "html",
        tabWidth: 4,
        useTabs: false,
        singleQuote: false
    });
    return formattedHtml
}

let processDirectory = async (dirpath: string, outpath: string, prefix = "<!DOCTYPE html><html>", postfix = "</html>") => {
    dirpath = path.normalize(dirpath);
    outpath = path.normalize(outpath);
    let files = await fs.readdir(dirpath, { recursive: true });
    fs.mkdir(outpath, { recursive: true })
    await Promise.all(files.map(async f => {
        let p = path.resolve(dirpath, f)
        let pa = path.parse(p)
        switch (pa.ext.toLowerCase()) {
            case ".html":
                return processFileString(p, prefix, postfix)
                    .then(o => 
                        fs.writeFile(path.resolve(outpath, f), o)
                    )
            case ".md":
                let renderer = path.resolve(pa.dir, "render.htms")
                let md = await processFile(p, null, null, true)
                return processFileString(renderer, prefix, postfix, false, md.document.childNodes)
                    .then(async o => {
                        let op = path.resolve(outpath, f.substring(0, f.length-3) + ".html")
                        await fs.mkdir(path.parse(op).dir, { recursive: true })
                        await fs.writeFile(op, o)
                    })
            default:
        }
    }))
}

processDirectory("test/src/", "test/out/")

// console.log(md.render(await Bun.file("test/src/main.html").text()))
