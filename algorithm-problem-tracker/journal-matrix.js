(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./journal-core'));
  else root.JournalMatrix = factory(root.JournalCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';
  // Each ordered tag list is a single path; cards live only at its terminal node.
  function build(problems, includeEmpty = false, allProblems = problems) {
    const roots = new Map();
    const node = name => ({ name, count: 0, solved: 0, problems: [], children: new Map() });
    function add(problem, visible) {
      const path = core.tagPath(problem.tags);
      if (!path.length) path.push('待分类');
      let siblings = roots, current;
      for (const name of path) {
        if (!siblings.has(name)) siblings.set(name, node(name));
        current = siblings.get(name);
        if (visible) { current.count++; if (core.isIndependent(problem.status)) current.solved++; }
        siblings = current.children;
      }
      if (visible) current.problems.push(problem);
    }
    if (includeEmpty) for (const problem of allProblems) add(problem, false);
    const seen = new Set();
    for (const problem of problems) if (!seen.has(problem.id)) { seen.add(problem.id); add(problem, true); }
    const finish = n => ({ ...n, children: [...n.children.values()].map(finish) });
    return [...roots.values()].map(finish);
  }

  function reflection(problem, records) {
    if (problem.key) return { text: problem.key, excerpt: false };
    const candidates = records.filter(r => r.problemId === problem.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.order - a.order);
    for (const r of candidates) {
      const prose = r.body.replace(/^\s*(`{3,}|~{3,})[\s\S]*?^\s*\1[^\n]*$/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).filter(line => line.trim() && !/^\s*(?:#|>|!\[|\$\$|\\\[|\\\])/.test(line))
        .map(line => line.replace(/^\s*(?:>\s*|[-*+]\s+|\d+[.)]\s*)+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').trim())
        .filter(Boolean).join('\n');
      if (prose) return { text: prose, excerpt: true };
    }
    return { text: '还没有解题感想，点击题号查看记录。', excerpt: true };
  }
  return { build, reflection };
});
