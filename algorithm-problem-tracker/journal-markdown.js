/* global kramed, katex */
(() => {
  'use strict';
  const cache = new Map();
  const allowed = new Set('P BR HR STRONG EM DEL S BLOCKQUOTE PRE CODE UL OL LI H1 H2 H3 H4 H5 H6 TABLE THEAD TBODY TR TH TD A IMG SPAN SUP SUB'.split(' '));
  function closeTypingFence(text) {
    let open = '';
    for (const line of text.split(/\r?\n/)) {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      if (!open && !(match[1][0] === '`' && match[2].includes('`'))) open = match[1];
      else if (open && match[1][0] === open[0] && match[1].length >= open.length && !match[2].trim()) open = '';
    }
    return open ? text + '\n' + open : text;
  }
  function render(input) {
    const text = String(input || '');
    if (cache.has(text)) return cache.get(text);
    const math = [], marker = 'JOURNALMATH' + Math.random().toString(36).slice(2).toUpperCase();
    // Protect complete formulas before Markdown can interpret underscores, stars or backslashes.
    // Fenced/indented/inline code and escaped dollars must remain literal.
    const protectedText = closeTypingFence(text).replace(/(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\2[ \t]*$|^(?: {4}|\t).*(?:\n(?: {4}|\t).*)*|(`+)[^\n]*?\3|\\\$)|(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\\n])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/gm, (all, code, fence, ticks, formula) => {
      if (code) return code;
      return marker + (math.push(formula) - 1) + 'END';
    });
    const template = document.createElement('template');
    template.innerHTML = kramed(protectedText, { gfm: true, sanitize: true, breaks: false });
    [...template.content.querySelectorAll('*')].forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(document.createTextNode(el.textContent)); return; }
      for (const attr of [...el.attributes]) if (!['href', 'src', 'alt', 'title'].includes(attr.name)) el.removeAttribute(attr.name);
      for (const attr of ['href', 'src']) if (el.hasAttribute(attr)) {
        try {
          if (!['http:', 'https:'].includes(new URL(el.getAttribute(attr), location.href).protocol)) el.removeAttribute(attr);
        } catch { el.removeAttribute(attr); }
      }
      if (el.tagName === 'A') { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      if (el.tagName === 'IMG') el.loading = 'lazy';
    });
    // Replace text nodes only, never inject rendered math into URL/title attributes or code.
    const pattern = new RegExp(marker + '(\\d+)END', 'g');
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.textContent.includes(marker)) continue;
      if (node.parentElement?.closest('code, pre')) {
        node.textContent = node.textContent.replace(pattern, (_, index) => math[Number(index)]);
        continue;
      }
      const fragment = document.createDocumentFragment();
      let end = 0;
      for (const match of node.textContent.matchAll(pattern)) {
        fragment.append(node.textContent.slice(end, match.index));
        const formula = math[Number(match[1])];
        const span = document.createElement('span');
        span.className = 'math-source';
        const display = formula.startsWith('$$') || formula.startsWith('\\[');
        const delimiter = formula.startsWith('$') && !display ? 1 : 2;
        try {
          katex.render(formula.slice(delimiter, -delimiter), span, {
            displayMode: display, throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20
          });
        } catch {
          span.classList.add('math-error'); span.textContent = formula;
          span.title = '公式未完成或包含不支持的命令，暂时保留 LaTeX 原文。';
        }
        fragment.append(span);
        end = match.index + match[0].length;
      }
      fragment.append(node.textContent.slice(end));
      node.replaceWith(fragment);
    }
    // A formula-like string in a link attribute is text, not a render target.
    for (const el of template.content.querySelectorAll('*')) {
      for (const attr of ['href', 'src', 'alt', 'title']) if (el.hasAttribute(attr)) {
        el.setAttribute(attr, el.getAttribute(attr).replace(pattern, (_, index) => math[Number(index)]));
      }
    }
    const html = template.innerHTML;
    if (cache.size >= 160) cache.delete(cache.keys().next().value);
    cache.set(text, html);
    return html;
  }
  window.JournalMarkdown = { render };
})();
