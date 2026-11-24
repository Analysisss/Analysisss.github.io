(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JournalCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const statuses = { attempted: '尝试中', understood: '已理解', solved_1a: '独立完成（1A）', solved_debug: '独立完成（DEBUG）', assisted_debug: '看思路后DEBUG', assisted_solved: '看思路后完成', solved: '独立完成', review: '待复习', unknown: '未标注' };
  const isIndependent = status => ['solved', 'solved_1a', 'solved_debug'].includes(status);
  const kinds = ['板子', '思维', '进阶'];
  function tagPath(value) {
    const aliases = { '状压': '状态压缩DP', '状压dp': '状态压缩DP', '状态压缩dp': '状态压缩DP', 'dp': '动态规划', '01 trie': '01 Trie', '01trie': '01 Trie', '博弈': '博弈论' };
    const parts = Array.isArray(value) ? value : String(value || '').split(/\s*(?:→|>|，|,|\n)\s*/);
    return parts.map(x => String(x).trim()).filter(Boolean).map(x => aliases[x.toLowerCase()] || x);
  }
  function list(value) {
    let values = value;
    if (!Array.isArray(values)) {
      values = []; let part = ''; const closing = [], pairs = { '(': ')', '（': '）', '[': ']', '【': '】' };
      for (const ch of String(value || '')) {
        if (ch === '\n' || !closing.length && /[,，、]/.test(ch)) {
          values.push(part); part = ''; if (ch === '\n') closing.length = 0;
          continue;
        }
        if (pairs[ch]) closing.push(pairs[ch]);
        else if (ch === closing[closing.length - 1]) closing.pop();
        part += ch;
      }
      values.push(part);
    }
    return [...new Set(values.map(String).map(x => x.trim()).filter(Boolean))];
  }
  function identify(value) {
    let u;
    try { u = new URL(String(value).trim()); } catch { return null; }
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let match;
    if (host === 'codeforces.com') {
      match = u.pathname.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z]\d*)\/?$/) || u.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)\/?$/);
      if (match) return { id: 'cf:' + match[1] + ':' + match[2].toUpperCase(), short: match[1] + match[2].toUpperCase(), url: 'https://codeforces.com/' + (u.pathname.startsWith('/gym/') ? 'gym/' : 'contest/') + match[1] + '/problem/' + match[2].toUpperCase(), collection: 'Codeforces · ' + match[1], contest: { platform: 'codeforces', id: match[1], gym: u.pathname.startsWith('/gym/') } };
    }
    if (host === 'luogu.com.cn' && (match = u.pathname.match(/^\/problem\/([A-Za-z0-9_]+)\/?$/))) return { id: 'luogu:' + match[1].toUpperCase(), short: match[1].toUpperCase(), url: 'https://www.luogu.com.cn/problem/' + match[1].toUpperCase(), collection: '' };
    if (host === 'qoj.ac' && (match = u.pathname.match(/^(?:\/contest\/(\d+))?\/problem\/(\d+)\/?$/))) return { id: 'qoj:' + match[2], short: 'QOJ ' + match[2], url: 'https://qoj.ac/problem/' + match[2], collection: match[1] ? 'QOJ contest ' + match[1] : '', ...(match[1] ? { contest: { platform: 'qoj', id: match[1] } } : {}) };
    if (host === 'atcoder.jp' && (match = u.pathname.match(/^\/contests\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)\/?$/))) {
      u.hash = ''; u.search = ''; u.hostname = host;
      // Keep the original URL identity so existing stars and review history survive.
      return { id: 'url:' + u.href.replace(/\/$/, ''), url: u.href, short: /^[a-z]+\d*_[a-z]$/i.test(match[2]) ? match[2].replace('_', ' ').toUpperCase() : match[2], collection: 'AtCoder · ' + match[1].toUpperCase(), contest: { platform: 'atcoder', id: match[1], task: match[2] } };
    }
    u.hash = ''; u.search = ''; u.hostname = host;
    return { id: 'url:' + u.href.replace(/\/$/, ''), short: '', url: u.href, collection: '' };
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1970 && Number(value.slice(0, 4)) <= 2100;
  }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function normalize(input) {
    const problem = identify(input.url);
    if (!problem) throw new Error('请填写有效的 HTTP(S) 原题链接');
    if (!validDate(input.date)) throw new Error('请填写有效的学习日期');
    if (!String(input.body || '').trim()) throw new Error('写一点思路、代码或卡住的地方，再保存记录');
    if (input.kind && !kinds.includes(input.kind)) throw new Error('题型请选择板子、思维或进阶');
    const title = String(input.title || problem.short || problem.url).trim().slice(0, 300);
    return { id: input.id || '', url: problem.url, title, date: input.date, tags: tagPath(input.tags), kind: input.kind || '', collections: list(input.collections), key: String(input.key || '').trim(), pitfall: String(input.pitfall || '').trim(), status: statuses[input.status] ? input.status : 'attempted', action: ['attempt', 'learn', 'review'].includes(input.action) ? input.action : 'learn', body: String(input.body).trim() };
  }
  function markdown(input) {
    const r = normalize(input);
    // JSON is valid YAML; quoting also protects multiline titles and Markdown delimiters.
    const meta = { journal: 1, record_id: r.id, date: r.date, updated_at: input.updatedAt || '', title: r.title, url: r.url, tags: r.tags, kind: r.kind, collections: r.collections, key: r.key, pitfall: r.pitfall, status: r.status, action: r.action };
    return '---\n' + Object.entries(meta).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n\n' + r.body + '\n';
  }
  function select(data, filters) {
    const q = (filters.query || '').toLowerCase().trim();
    const pm = new Map(data.problems.map(p => [p.id, p]));
    let records = data.records.filter(r => {
      const p = pm.get(r.problemId);
      return p && (!filters.tag || p.tags.includes(filters.tag)) && (!filters.kind || (filters.kind === 'unmarked' ? !p.kind : p.kind === filters.kind)) && (!filters.collection || p.collections.includes(filters.collection)) && (!filters.status || p.status === filters.status) && (!filters.from || r.date && r.date >= filters.from) && (!filters.to || r.date && r.date <= filters.to) && (!q || [p.title, p.id, p.key, p.pitfall, p.kind, ...p.tags, ...p.collections, r.body].join(' ').toLowerCase().includes(q));
    });
    records.sort((a, b) => {
      if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : a.id.localeCompare(b.id);
      const cmp = a.date.localeCompare(b.date) || a.order - b.order || a.id.localeCompare(b.id);
      return filters.sort === 'asc' ? cmp : -cmp;
    });
    const seen = new Set();
    const problems = records.flatMap(r => { if (seen.has(r.problemId)) return []; seen.add(r.problemId); return [pm.get(r.problemId)]; });
    if (filters.sort === 'number') {
      problems.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      records.sort((a, b) => a.problemId.localeCompare(b.problemId, undefined, { numeric: true }) || (a.date || '').localeCompare(b.date || '') || a.order - b.order);
    }
    return { problems, records };
  }
  function exportMarkdown(data, filters, mode) {
    const selected = select(data, filters);
    const pm = new Map(data.problems.map(p => [p.id, p]));
    let out = '# ' + (filters.collection || '刷题记录') + '\n\n';
    out += '范围：' + (filters.from || '不限') + ' — ' + (filters.to || '不限') + '；标签：' + (filters.tag || '全部') + '；题型：' + (filters.kind === 'unmarked' ? '未标注' : filters.kind || '全部') + '\n\n';
    if (mode === 'history') {
      let date;
      selected.records.forEach(r => {
        if (date !== r.date) { date = r.date; out += '\n## ' + (date || '日期待核对') + '\n\n'; }
        const p = pm.get(r.problemId);
        out += '### ' + p.title + '\n\n原题：' + p.url + '\n\n题型：' + ((r.kind ?? p.kind) || '未标注') + '\n\n完成情况：' + (statuses[r.status] || statuses.unknown) + '\n\n来源：' + r.source + '\n\n' + r.body + '\n\n';
      });
    } else {
      selected.problems.forEach(p => {
        out += '## ' + p.title + '\n\n原题：' + p.url + '\n\n题型：' + (p.kind || '未标注') + '\n\n完成情况：' + (statuses[p.status] || statuses.unknown) + '\n\n标签：' + p.tags.join(' → ') + '\n\n关键点：' + (p.key || '待补充') + '\n\n';
        if (p.pitfall) out += '易错点：' + p.pitfall + '\n\n';
        if (mode === 'full') {
          // Choose a record inside the selected date range, never silently export outside it.
          const records = selected.records.filter(r => r.problemId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.order - a.order);
          out += records[0].body + '\n\n';
        }
      });
    }
    return out;
  }
  return { statuses, isIndependent, kinds, list, tagPath, identify, validDate, today, normalize, markdown, select, exportMarkdown };
});
