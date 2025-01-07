import markdownit from 'markdown-it';
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import abbr from 'markdown-it-abbr'
import attrs from 'markdown-it-attrs'
import { full as emoji } from 'markdown-it-emoji'
import container from 'markdown-it-container'
import ins from 'markdown-it-ins'
import mark from 'markdown-it-mark'
import katex from '@vscode/markdown-it-katex'
import type { Option } from './config';

export const getMDRenderer = (config: Option) => {
    const md = new markdownit(config.md.config);
    if (config.md.extensions.sub) md.use(sub);
    if (config.md.extensions.sup) md.use(sup);
    if (config.md.extensions.footnote) md.use(footnote);
    if (config.md.extensions.deflist) md.use(deflist);
    if (config.md.extensions.abbr) md.use(abbr);
    if (config.md.extensions.attrs) md.use(attrs);
    if (config.md.extensions.emoji) md.use(emoji);
    if (config.md.extensions.container) md.use(container);
    if (config.md.extensions.ins) md.use(ins);
    if (config.md.extensions.mark) md.use(mark);
    if (config.md.extensions.katex) md.use(katex, config.md.katex);
    return md;
}
