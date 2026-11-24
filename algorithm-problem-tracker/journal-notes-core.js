(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./journal-core'));
  else root.JournalNotes = factory(root.JournalCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(core) {
  function blocks(body, data) {
    const result = []; let text = [], fence = null;
    const flush = () => { if (text.length) result.push({ type: 'markdown', body: text.join('\n') }); text = []; };
    for (const line of String(body).split(/\r?\n/)) {
      const f = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null; text.push(line); continue; }
      if (fence || /^\s{4}|^\t/.test(line)) { text.push(line); continue; }
      const match = line.match(/^\s*(?:\{\{problem:\s*(https?:\/\/[^\s}]+)\s*\}\}|\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/\S+))\s*$/);
      if (!match) { text.push(line); continue; }
      const url = match[1] || match[2] || match[3], identity = core.identify(url);
      const problem = identity && data.problems.find(p => p.id === identity.id);
      // Unrelated external links remain ordinary Markdown.
      if (!problem && !identity?.contest && !/^(cf:|qoj:|luogu:)/.test(identity?.id || '') && !match[1]) { text.push(line); continue; }
      flush();
      const record = problem && data.records.filter(r => r.problemId === problem.id && r.body?.trim()).sort((a,b) => (b.date || '').localeCompare(a.date || '') || (b.order || 0) - (a.order || 0))[0];
      result.push({ type: 'problem', url, problem, record });
    }
    flush(); return result;
  }
  const label = s => String(s).replace(/[\[\]\\]/g, '\\$&').replace(/[\r\n]/g, ' ');
  function expand(body, data) {
    return blocks(body, data).map(b => {
      if (b.type === 'markdown') return b.body;
      if (!b.problem) return '> 尚未收录题目：' + b.url;
      const p = b.problem;
      return '### [' + label(p.title) + '](' + p.url + ')\n\n所属集合：' + p.collections.join(' / ') + '\n\n**一句话总结**\n\n' + (p.key || '关键点待补充') + '\n\n' + (b.record?.body || '题解待补充');
    }).join('\n\n');
  }
  return { blocks, expand };
});
