/* global JournalCore, JournalMatrix, JournalReview, JournalMarkdown */
(() => {
  'use strict';
  const C = JournalCore, $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fields = ['url', 'title', 'date', 'status', 'action', 'collections', 'tags', 'kind', 'key', 'body', 'pitfall'];
  const filterFields = ['query', 'collection', 'tag', 'kind', 'status', 'from', 'to', 'sort', 'light-filter'];
  const views = { log: ['日常手记', '沿着日期，回看思路如何一步步清晰。'], problems: ['题目总览', '把关键转化放在眼前，给下一次解题留一点线索。'], collections: ['比赛与集合', '同一场比赛，同一个专题，都在这里重新串联。'], algorithms: ['算法索引', '从一个方法，找到所有遇见过它的题目。'] };
  let data = { problems: [], records: [], documents: [], warnings: [] }, token = '', view = 'log', editMeta = {}, saving = false;
  const draftKey = 'problem-journal:draft:v2';
  let activeDraftKey = draftKey;
  const matrixSettingsKey = 'problem-journal:matrix:v2';
  const reviewStorageKey = 'problem-journal:review:v1';
  let reviewState = readReviewState(), reviewDate = '', reviewMap = new Map(), readerContext = null;
  function readReviewState() {
    try { return JournalReview.cleanState(JSON.parse(localStorage.getItem(reviewStorageKey))); }
    catch { return JournalReview.cleanState(null); }
  }
  function updateReview(change) {
    const latest = readReviewState();
    change(latest);
    try { localStorage.setItem(reviewStorageKey, JSON.stringify(latest)); }
    catch { message('浏览器无法保存点亮状态，本次修改未保存。'); return false; }
    reviewState = latest;
    refreshLights();
    return true;
  }
  function reviewEntry(state, id) {
    return state.problems[id] ||= { starred: false, completed: [], dueDate: '' };
  }
  function refreshLights() {
    const scroll = document.querySelector('.matrix-scroll');
    const position = scroll ? [scroll.scrollLeft, scroll.scrollTop] : null;
    const opened = new Set([...document.querySelectorAll('.matrix-note:has(.reflection-more[open]) [data-problem]')].map(el => el.dataset.problem));
    const focus = document.activeElement?.dataset;
    const readerScroll = $('reader').scrollTop;
    render();
    const current = document.querySelector('.matrix-scroll');
    if (position && current) { current.scrollLeft = position[0]; current.scrollTop = position[1]; }
    document.querySelectorAll('.matrix-note').forEach(el => { if (opened.has(el.querySelector('[data-problem]')?.dataset.problem)) el.querySelector('.reflection-more')?.setAttribute('open', ''); });
    if ($('reader').open && readerContext) { readProblem(readerContext.id, readerContext.recordId); $('reader').scrollTop = readerScroll; }
    if (focus?.star) [...document.querySelectorAll('[data-star]')].find(el => el.dataset.star === focus.star)?.focus({ preventScroll: true });
  }
  function lightControls(p) {
    const state = reviewMap.get(p.id) || {};
    const label = state.starred ? '取消收藏点亮' : '收藏点亮';
    const dueTitle = state.due ? `${state.dueDate} 应复习${state.overdue ? `，已逾期 ${state.overdue} 天` : '，今天到期'}` : '';
    return `<span class="problem-lights"><button type="button" class="star-button${state.starred ? ' is-starred' : ''}" data-star="${esc(p.id)}" aria-pressed="${!!state.starred}" aria-label="${label}：${esc(p.title)}" title="${label}">${state.starred ? '★' : '☆'}</button>${state.due ? `<span class="due-indicator" role="img" aria-label="${esc(dueTitle)}" title="${esc(dueTitle)}">◷</span><button type="button" class="review-check" data-review-done="${esc(p.id)}" title="标记今天已复习" aria-label="今天已复习：${esc(p.title)}">✓</button>` : ''}</span>`;
  }
  function lightingData(f) {
    const mode = f['light-filter'];
    if (!mode) return data;
    const ids = new Set(data.problems.filter(p => {
      const s = reviewMap.get(p.id);
      return mode === 'starred' ? s.starred : mode === 'due' ? s.due : s.starred || s.due;
    }).map(p => p.id));
    return { ...data, problems: data.problems.filter(p => ids.has(p.id)), records: data.records.filter(r => ids.has(r.problemId)) };
  }
  try {
    const settings = JSON.parse(localStorage.getItem(matrixSettingsKey) || '{}');
    $('matrix-empty').checked = settings.empty === true;
    $('matrix-expanded').checked = settings.expanded === true;
    if (['auto', '200', '260'].includes(settings.columns)) $('matrix-columns').value = settings.columns;
  } catch { /* Table preferences are optional. */ }
  function message(text) { $('message').textContent = text; }
  function filters() { return Object.fromEntries(filterFields.map(k => [k, $(k).value])); }
  function chip(tag) { return `<button class="chip" data-tag="${esc(tag)}">${esc(tag)}</button>`; }
  function kindBadge(p) { return C.kinds.includes(p.kind) ? `<span class="kind-badge" data-kind-label="${esc(p.kind)}" title="题型：${esc(p.kind)}">${esc(p.kind)}</span>` : ''; }
  function syncKindButtons() {
    document.querySelectorAll('#editor [data-kind]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.kind === $('edit-kind').value)));
  }
  function options(element, values, first) {
    const old = element.value;
    element.innerHTML = (first ? `<option value="">${first}</option>` : '') + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (values.includes(old)) element.value = old;
  }
  function populate() {
    const tags = C.list(data.problems.flatMap(p => p.tags)).sort((a, b) => a.localeCompare(b, 'zh'));
    const collections = C.list(data.problems.flatMap(p => p.collections)).sort((a, b) => a.localeCompare(b, 'zh'));
    options($('tag'), tags, '全部算法'); options($('collection'), collections, '全部集合');
    options($('tag-options'), tags); options($('collection-options'), collections);
    syncTagSuggestions();
    $('stats').innerHTML = [[data.problems.length, '道题目'], [data.records.length, '次学习'], [collections.length, '个集合'], [tags.length, '个算法标签']].map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
    $('warnings').hidden = !data.warnings.length;
    $('warnings').querySelector('summary').textContent = `${data.warnings.length} 条记录待核对`;
    $('warnings').querySelector('ul').innerHTML = data.warnings.map(w => `<li>${esc(w.source)}：${esc(w.message)}</li>`).join('');
  }
  function problemButton(p) { return `<span class="problem-title"><button class="problem-link" data-problem="${esc(p.id)}">${esc(p.title)}</button>${kindBadge(p)}${lightControls(p)}</span>`; }
  function noteContent(p, records, expanded = false) {
    const latest = records.filter(r => r.problemId === p.id && r.body?.trim()).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.order || 0) - (a.order || 0))[0];
    const full = markdown(latest?.body || '');
    const preview = document.createElement('template');
    preview.innerHTML = full;
    // Missing metadata is visibly an excerpt, never silently saved as the author's key point.
    const first = [...preview.content.querySelectorAll('p')].find(el => !el.closest('blockquote') && el.textContent.trim());
    const key = p.key ? markdown(p.key) : first?.outerHTML || '<p>关键点待补充</p>';
    if (!p.key && first) first.remove();
    // Code remains available in the expanded solution; the overview prioritizes reasoning.
    preview.content.querySelectorAll('pre, img').forEach(el => el.remove());
    return `<div class="note-key prose${p.key ? '' : ' is-excerpt'}">${key}</div>${full ? `<div class="note-body"><div class="note-preview prose">${preview.innerHTML}</div><details class="reflection-more"${expanded ? ' open' : ''}><summary aria-label="展开或收起完整题解"></summary><article class="note-full prose">${full}</article></details></div>` : ''}`;
  }
  let layoutFrame;
  function scheduleMatrixLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(fitMatrixDetails);
  }
  function fitMatrixDetails() {
    const scroll = document.querySelector('.matrix-scroll');
    if (!scroll) return;
    const available = Math.min(parseFloat(getComputedStyle(scroll).maxHeight) || innerHeight, innerHeight - scroll.getBoundingClientRect().top - 12);
    for (const column of scroll.querySelectorAll('.matrix-column')) {
      const previews = [...column.querySelectorAll('.note-preview')].filter(el => !el.nextElementSibling.open);
      previews.forEach(el => { el.style.maxHeight = '0px'; el.classList.remove('has-preview', 'is-clipped'); });
      const base = column.querySelector('.matrix-column-label').offsetHeight + column.querySelector('.matrix-cells').offsetHeight;
      let budget = Math.max(0, available - base);
      const allocations = previews.map(el => ({ el, size: 0, wanted: Math.min(180, el.scrollHeight) }));
      // Share spare height across notes, redistributing unused space from shorter excerpts.
      for (let pass = 0; pass < allocations.length && budget > 0; pass++) {
        const pending = allocations.filter(a => a.wanted > a.size);
        if (!pending.length) break;
        const share = budget / pending.length;
        pending.forEach(a => { const add = Math.min(share, a.wanted - a.size); a.size += add; budget -= add; });
      }
      allocations.forEach(({ el, size }) => {
        const height = size >= 28 ? Math.floor(size - 4) : 0;
        el.style.maxHeight = `${height}px`;
        el.classList.toggle('has-preview', height > 0);
        el.classList.toggle('is-clipped', el.scrollHeight > height + 1);
      });
    }
  }
  function table(problems, records) {
    return `<div class="table-wrap"><table><thead><tr><th>题目 / 最近学习</th><th>关键点 / 易错点</th><th>算法标签</th><th>集合</th><th>状态</th></tr></thead><tbody>${problems.map(p => `<tr><td>${problemButton(p)}<div class="muted">${esc(p.latestDate || '日期待核对')} · ${p.recordIds.length} 次记录</div></td><td class="key-cell">${noteContent(p, records)}${p.pitfall ? `<div class="muted prose">${markdown('易错：' + p.pitfall)}</div>` : ''}</td><td><div class="chips">${p.tags.map(chip).join('<span aria-hidden="true"> → </span>') || '<span class="muted">待标注</span>'}</div></td><td>${p.collections.map(c => `<button class="text-button" data-collection="${esc(c)}">${esc(c)}</button>`).join('')}</td><td class="state">${C.statuses[p.status]}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function algorithmMatrix(selected) {
    const rows = JournalMatrix.build(selected.problems, $('matrix-empty').checked, data.problems);
    document.body.style.setProperty('--matrix-group-count', Math.max(1, rows.length));
    const maxCount = Math.max(1, ...rows.map(row => row.count));
    const notes = new Map(selected.problems.map(p => [p.id, noteContent(p, selected.records, $('matrix-expanded').checked)]));
    const card = p => {
      return `<article class="matrix-note">
        <div class="matrix-note-head"><button class="problem-link matrix-problem-name" data-problem="${esc(p.id)}" title="${esc([p.title, p.tags.join(' · '), p.collections.join(' / ')].join('\n'))}"><span class="matrix-problem-collections">${esc(p.collections.join(' / ') || '未归属集合')}</span><span>${esc(p.title)}</span></button>${kindBadge(p)}${lightControls(p)}<span class="matrix-status" role="img" data-status="${esc(p.status)}" title="${C.statuses[p.status]}" aria-label="${C.statuses[p.status]}"></span>${!p.key ? '<span class="excerpt-label" title="摘自原笔记；点击题目查看完整记录">摘录</span>' : ''}</div>
        ${notes.get(p.id)}
        ${p.pitfall ? `<div class="matrix-pitfall prose">${markdown('易错 · ' + p.pitfall)}</div>` : ''}
      </article>`;
    };
    const branch = (node, depth = 1) => `<section class="matrix-cell matrix-tree-node${node.count ? '' : ' matrix-cell-empty'}"><header style="padding-left:${6 + Math.min(depth - 1, 6) * 8}px"><h3>${esc(node.name)}</h3><span title="包含所有下级：${node.count} 道题，${node.solved} 道独立完成">${node.count}<small> 题</small></span></header><div class="matrix-meter"><i style="width:${node.count / maxCount * 100}%"></i></div>${node.problems.length ? `<div class="matrix-note-list">${node.problems.map(card).join('')}</div>` : ''}${node.children.map(child => branch(child, depth + 1)).join('')}</section>`;
    return `<div class="matrix-caption"><span>第一标签为列 ｜ 后续标签逐层展开，题目放在路径末端</span><span>父分类统计包含所有下级 · 点击题目读全文</span></div>
      <div class="matrix-scroll" tabindex="0" aria-label="算法分类表，可横向滚动"><div class="algorithm-matrix" aria-label="按算法大类分列的题目要点">${rows.map((row, i) => `<section class="matrix-column" aria-labelledby="matrix-heading-${i}">
        <header class="matrix-column-label" id="matrix-heading-${i}"><div><strong>${esc(row.name)}</strong><span><b>${row.count}</b> 题</span></div><div class="matrix-group-meter" title="当前筛选中 ${row.count} 道题"><i style="width:${selected.problems.length ? row.count / selected.problems.length * 100 : 0}%"></i></div></header>
        <div class="matrix-cells">${row.problems.length ? `<div class="matrix-note-list">${row.problems.map(card).join('')}</div>` : ''}${row.children.map(node => branch(node)).join('')}</div>
      </section>`).join('')}</div></div>`;
  }
  function render() {
    const date = reviewDate || C.today();
    reviewMap = new Map(data.problems.map(p => [p.id, JournalReview.schedule(p.id, data.records, reviewState, date)]));
    const f = filters(), selected = C.select(lightingData(f), f), pm = new Map(data.problems.map(p => [p.id, p]));
    $('review-count').textContent = `${reviewDate ? '预览 ' + date + ' · ' : ''}★ ${[...reviewMap.values()].filter(s => s.starred).length} · ◷ ${[...reviewMap.values()].filter(s => s.due).length}`;
    $('review-count').title = '全题库：收藏数 · 到期复习数；可使用左侧下拉框筛选';
    $('view-title').textContent = views[view][0]; $('view-description').textContent = views[view][1];
    document.body.classList.toggle('matrix-view', view === 'algorithms');
    $('matrix-tools').hidden = view !== 'algorithms';
    document.body.classList.toggle('matrix-focus', view === 'algorithms' && $('matrix-focus').getAttribute('aria-pressed') === 'true');
    document.body.style.setProperty('--matrix-column-width', $('matrix-columns').value === 'auto' ? '180px' : `${$('matrix-columns').value}px`);
    document.body.style.setProperty('--matrix-column-max', $('matrix-columns').value === 'auto' ? '1fr' : `${$('matrix-columns').value}px`);
    document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); el.setAttribute('aria-current', el.dataset.view === view ? 'page' : 'false'); });
    $('result-count').textContent = `${selected.problems.length} 道题目 · ${selected.records.length} 条记录`;
    if (view === 'algorithms') {
      const active = [f.query, f.collection, f.tag, f.kind === 'unmarked' ? '题型未标注' : f.kind, C.statuses[f.status], f.from, f.to].filter(Boolean);
      if (active.length) $('result-count').textContent += ' · 筛选：' + active.join(' / ');
      $('matrix-filters').textContent = active.length ? `筛选 (${active.length})` : '筛选';
    }
    $('export').disabled = !selected.records.length;
    if (!selected.records.length) $('content').innerHTML = '<div class="empty">这个范围里还没有题目。<br>试试调整筛选，或记下今天的一道题。</div>';
    else if (view === 'problems') $('content').innerHTML = table(selected.problems, selected.records);
    else if (view === 'log') {
      const groups = new Map();
      selected.records.forEach(r => { const date = r.date || ''; if (!groups.has(date)) groups.set(date, []); groups.get(date).push(r); });
      $('content').innerHTML = [...groups].map(([date, records]) => `<section class="day"><div class="day-date"><strong>${date ? esc(date.slice(5).replace('-', ' / ')) : '待核对'}</strong>${date ? esc(date.slice(0, 4)) : '未确定日期'}<p>${records.length} 条记录</p></div><div class="day-records">${records.map(r => { const p = pm.get(r.problemId); return `<article class="record-card"><div class="card-top">${problemButton(p)}<span class="state">${C.statuses[r.status]}</span></div><div class="prose">${markdown(r.key || '关键点待补充 · 点击题目阅读原笔记')}</div><div class="chips">${p.tags.map(chip).join('')}</div><div class="meta"><span>${r.action === 'review' ? '复习' : r.action === 'attempt' ? '尝试' : '学习 / 补题'}</span><button class="text-button" data-document="${esc(r.source)}">${esc(r.source.split('/').pop())} ↗</button><button class="text-button" data-record="${esc(r.id)}">阅读本次记录 →</button></div></article>`; }).join('')}</div></section>`).join('');
    } else if (view === 'collections') {
      if (f.collection) $('content').innerHTML = `<h3>${esc(f.collection)}</h3>` + table(selected.problems, selected.records);
      else {
        const names = C.list(selected.problems.flatMap(p => p.collections));
        $('content').innerHTML = '<div class="cards">' + names.map(name => { const ps = selected.problems.filter(p => p.collections.includes(name)); return `<button class="collection-card" data-collection="${esc(name)}"><div class="eyebrow">COLLECTION</div><h3>${esc(name)}</h3><p>${ps.length} 道题目 · ${ps.filter(p => C.isIndependent(p.status)).length} 道独立完成 <span>↗</span></p></button>`; }).join('') + '</div>';
      }
    } else {
      $('content').innerHTML = algorithmMatrix(selected);
    }
    document.querySelectorAll('#content [data-problem]').forEach(el => {
      const container = el.closest('.matrix-note, .record-card, tr'), state = reviewMap.get(el.dataset.problem);
      if (container && state) {
        container.classList.toggle('is-starred', state.starred);
        container.classList.toggle('is-review-due', state.due);
      }
    });
    const params = new URLSearchParams({ view });
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
    history.replaceState(null, '', '#' + params.toString());
    scheduleMatrixLayout();
  }
  function markdown(text) { return JournalMarkdown.render(text); }
  function readProblem(id, recordId) {
    const p = data.problems.find(p => p.id === id); if (!p) return;
    readerContext = { id, recordId };
    $('reader-title').textContent = p.title;
    const records = data.records.filter(r => r.problemId === id && (!recordId || r.id === recordId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('reader-content').innerHTML = `<div class="chips">${kindBadge(p)}${p.tags.map(chip).join('')}</div><div class="prose">${markdown(p.key || '关键点待补充')}</div><div class="reader-actions">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">打开原题 ↗</a><button data-review="${esc(p.id)}">＋ 追加学习 / 复习记录</button>` : ''}</div>` + records.map(r => `<section class="reader-record"><div class="card-top"><span class="muted">${esc(r.date || '日期待核对')} · ${C.statuses[r.status]}</span><button type="button" data-copy-record="${esc(r.id)}">复制 Markdown</button>${r.editable ? `<button data-edit="${esc(r.id)}">编辑这次记录</button>` : ''}</div><p class="hint">${esc(r.source)}</p><article class="prose">${markdown(r.body)}</article></section>`).join('');
    const s = reviewMap.get(id) || JournalReview.schedule(id, data.records, reviewState, reviewDate || C.today());
    $('reader-content').insertAdjacentHTML('afterbegin', `<section class="review-panel">${lightControls(p)}<span>${s.due ? `该复习了 · ${esc(s.dueDate)} 到期` : s.dueDate ? `下次复习：${esc(s.dueDate)}` : '缺少学习日期，可手动指定提醒日期'}</span><button type="button" data-review-done="${esc(id)}">今天已复习 ✓</button>${(reviewState.problems[id]?.completed || []).includes(C.today()) ? `<button type="button" data-review-undo="${esc(id)}">撤销今天的快捷标记</button>` : ''}<label>指定提醒日期<input type="date" id="problem-review-date" value="${esc(reviewState.problems[id]?.dueDate || '')}"></label><button type="button" data-review-date="${esc(id)}">设置日期</button><span class="hint">日期留空恢复间隔计划；已保存的复习笔记也会计入计划。</span></section>`);
    if (!$('reader').open) $('reader').showModal();
  }
  function readDocument(source) {
    const doc = data.documents.find(d => d.source === source); if (!doc) return;
    readerContext = null;
    $('reader-title').textContent = doc.title;
    $('reader-content').innerHTML = `<p class="hint">${esc(doc.source)}</p><article class="prose">${markdown(doc.body)}</article>`;
    $('reader').showModal();
  }
  function readDraft(key = activeDraftKey) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function collect() { return { ...editMeta, ...Object.fromEntries(fields.map(k => [k, $('edit-' + k).value])) }; }
  function syncTagSuggestions() {
    const path = C.tagPath($('edit-tags').value);
    const next = C.list(data.problems.map(p => p.tags).filter(tags => path.every((tag, i) => tags[i] === tag)).map(tags => tags[path.length]).filter(Boolean));
    $('tag-suggestions').innerHTML = `<span class="hint">${path.length ? '下一级：' : '选择大类：'}</span>` + next.map(t => `<button type="button" class="chip" data-add-tag="${esc(t)}">＋ ${esc(t)}</button>`).join('') + (next.length ? '' : '<span class="hint">可继续输入自定义子分类</span>');
  }
  function stash() {
    if (!$('editor').open || saving) return;
    syncTagSuggestions();
    const current = collect();
    try {
      if (!(current.url || current.body || current.title || current.key)) { localStorage.removeItem(activeDraftKey); $('new-record').textContent = '＋ 记一道题'; return; }
      localStorage.setItem(activeDraftKey, JSON.stringify(current)); $('draft-status').textContent = '本条记录的草稿已保存在此浏览器';
    }
    catch { $('draft-status').textContent = '浏览器暂时无法保存草稿，请下载 Markdown 备份'; }
  }
  function fill(input) {
    cancelIdentification(); autoCollectionName = '';
    fields.forEach(k => delete $('edit-' + k).dataset.autofill);
    editMeta = { id: input.id || '', version: input.version || '' };
    fields.forEach(k => { $('edit-' + k).value = Array.isArray(input[k]) ? input[k].join('，') : input[k] || ''; });
    syncTagSuggestions();
    $('edit-date').value ||= C.today(); $('edit-status').value ||= 'attempted'; $('edit-action').value ||= 'learn';
    syncKindButtons();
    delete $('edit-title').dataset.autofill;
    $('editor-title').textContent = editMeta.version ? '编辑学习记录' : '记一道题';
    $('identity-hint').textContent = ''; $('editor-message').textContent = '';
    $('preview-pane').hidden = false;
    $('toggle-preview').textContent = '收起预览';
    $('toggle-preview').setAttribute('aria-pressed', 'true');
    updatePreview();
  }
  function openEditor(input) {
    if ($('editor').open) stash();
    // Migrate old edit drafts without overwriting a newer per-record draft.
    const legacy = readDraft(draftKey);
    if (legacy?.id && legacy.version) {
      const key = draftKey + ':record:' + legacy.id;
      try {
        if (!readDraft(key)) { localStorage.setItem(key, JSON.stringify(legacy)); localStorage.removeItem(draftKey); }
      } catch { /* Keep the original draft if storage is unavailable. */ }
    }
    activeDraftKey = input?.id ? draftKey + ':record:' + input.id : input?.url ? draftKey + ':review:' + encodeURIComponent(C.identify(input.url)?.id || input.url) : draftKey;
    const draft = readDraft();
    fill(draft || input || { date: C.today(), collections: $('collection').value });
    $('reader').close(); $('editor').showModal();
    $('save-mode').textContent = token ? '保存到博客的 Markdown 文件；标签与关键点可稍后补。Ctrl / ⌘ + Enter 快速保存。' : '当前是静态网页：可以写草稿并下载 Markdown。启动本地博客后可直接保存。';
    $('save-record').disabled = !token; $('save-next').disabled = !token;
    $('draft-status').textContent = draft ? '已恢复本条记录的草稿' : input ? '正在编辑所选记录，其他题目的草稿已保留' : '';
    $('edit-url').focus();
  }
  let identitySequence = 0, identityRequest, identityTimer, autoCollectionName = '';
  function cancelIdentification() {
    clearTimeout(identityTimer);
    identitySequence++;
    identityRequest?.abort();
    identityRequest = null;
  }
  function autoField(name, value) {
    const el = $('edit-' + name);
    if (!el.value || el.value === el.dataset.autofill) {
      el.value = value || '';
      el.dataset.autofill = el.value;
    }
  }
  function autoCollection(name) {
    const el = $('edit-collections');
    // A manual edit made after the lookup started takes precedence.
    if (autoCollectionName && el.value !== el.dataset.autofill) return;
    const values = C.list(el.value);
    const at = autoCollectionName ? values.indexOf(autoCollectionName) : -1;
    if (at >= 0) values.splice(at, 1, ...(name ? [name] : []));
    else if (name) values.push(name);
    autoCollectionName = name || '';
    el.value = C.list(values).join('，');
    el.dataset.autofill = el.value;
  }
  async function identifyInput() {
    cancelIdentification();
    const sequence = identitySequence, rawUrl = $('edit-url').value.trim();
    const identity = C.identify(rawUrl);
    if (!identity) { $('identity-hint').textContent = ''; return; }
    const p = data.problems.find(p => p.id === identity.id);
    autoField('title', p?.title || identity.short);
    if (p) {
      for (const field of ['tags', 'collections', 'kind', 'key', 'pitfall']) if (!$('edit-' + field).value) $('edit-' + field).value = Array.isArray(p[field]) ? p[field].join('，') : p[field] || '';
    }
    autoCollection(identity.collection);
    const hint = (identity.short ? '已识别题号 ' + identity.short + '。' : '已识别原题链接。') + (p ? '已有 ' + p.recordIds.length + ' 次学习记录，本次保存会追加记录。' : '');
    $('identity-hint').textContent = hint + (identity.collection ? '比赛：' + identity.collection + '。' : identity.short ? '链接未指明唯一比赛，可手动补充集合。' : '');
    syncKindButtons();
    stash();
    if (!token || !(['codeforces', 'atcoder'].includes(identity.contest?.platform) || /^(luogu:|qoj:)/.test(identity.id))) return;
    $('identity-hint').textContent = hint + '正在获取题目与比赛信息…';
    const controller = identityRequest = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('../manage/api/journal/identify?url=' + encodeURIComponent(rawUrl), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Lookup failed');
      const result = await response.json();
      if (!result.ok || result.id !== identity.id) throw new Error('Invalid lookup response');
      if (sequence !== identitySequence || $('edit-url').value.trim() !== rawUrl || !$('editor').open || saving) return;
      autoCollection(result.collection);
      if (result.title && (!p || p.title === identity.short || p.title === p.url)) {
        if ($('edit-title').value === identity.short) $('edit-title').dataset.autofill = identity.short;
        autoField('title', result.title);
      }
      $('identity-hint').textContent = hint + (result.title ? '已获取题名。' : '') + (result.contestName ? '比赛：' + result.contestName + '。' : result.notice || '') + (result.titleNotice || '');
      stash();
    } catch {
      if (sequence === identitySequence && $('editor').open) $('identity-hint').textContent = hint + '暂时无法获取比赛名称，已保留比赛编号，可以继续记录。';
    } finally { clearTimeout(timeout); }
  }
  function download(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename.replace(/[<>:"/\\|?*]/g, '-'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function load() {
    let result;
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      try { const response = await fetch('../manage/api/journal', { cache: 'no-store' }); if (response.ok) result = await response.json(); } catch { /* Static fallback remains available. */ }
    }
    if (result?.data) { data = result.data; token = result.token; }
    else { const response = await fetch('./journal.json', { cache: 'no-store' }); if (!response.ok) throw new Error('索引加载失败，请先运行 npm run build'); data = await response.json(); token = ''; }
    populate();
  }
  async function save(next) {
    if (saving || !token) return;
    if (!$('record-form').reportValidity()) return;
    stash(); saving = true;
    try {
      // Recheck the live server instead of trusting the page's initial version/token.
      // A restart can upgrade the schema and rotates the save session token.
      const response = await fetch('../manage/api/journal', { cache: 'no-store' });
      if (!response.ok) throw new Error('暂时无法连接保存端，请确认本地 Hexo 服务正在运行');
      const session = await response.json();
      if (!(session.data?.schemaVersion >= 3)) throw new Error('保存端尚未加载题型字段，请重启本地 Hexo 服务（npm run journal）后再次保存');
      if (!session.token) throw new Error('保存会话获取失败，请确认本地 Hexo 服务正在运行');
      token = session.token;
      $('editor-message').textContent = '';
    } catch (error) {
      $('editor-message').textContent = error.message + '；编辑内容已保留。';
      return;
    } finally {
      saving = false;
      stash();
    }
    if (!$('record-form').reportValidity()) return;
    let record;
    try { record = C.normalize(collect()); } catch (e) { $('editor-message').textContent = e.message; return; }
    editMeta.id ||= crypto.randomUUID();
    record.id = editMeta.id;
    record.version = editMeta.version;
    stash(); saving = true; $('save-record').disabled = true; $('save-next').disabled = true;
    // Freeze fields while writing so a successful save never clears newer typing.
    $('record-form').querySelectorAll('input,textarea,select,button').forEach(el => { el.disabled = true; });
    let saved = false;
    try {
      const response = await fetch('../manage/api/journal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Journal-Token': token }, body: JSON.stringify(record) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || '保存失败');
      saved = true; editMeta = { id: result.id, version: result.version };
      try { localStorage.removeItem(activeDraftKey); } catch { /* Storage may be unavailable. */ }
      $('new-record').textContent = '＋ 记一道题';
      message('已保存：' + result.filename);
      try { await load(); render(); } catch { message('记录已经保存，列表刷新失败，请刷新网页查看。'); }
      if (next) { activeDraftKey = draftKey; const draft = readDraft(); fill(draft || { date: record.date, collections: record.collections }); $('draft-status').textContent = draft ? '上一题已保存，已恢复新题草稿' : '上一题已保存，集合和日期已沿用'; }
      else $('editor').close();
    } catch (e) { $('editor-message').textContent = e.message + '。内容仍保留，可下载 Markdown。'; }
    finally {
      saving = false; $('save-record').disabled = !token; $('save-next').disabled = !token;
      $('record-form').querySelectorAll('input,textarea,select,button').forEach(el => { el.disabled = false; });
      $('save-record').disabled = !token; $('save-next').disabled = !token;
      if (saved && next) $('edit-url').focus();
      if (!saved) stash();
    }
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    const d = target.dataset;
    if (d.close) { if (d.close === 'editor') { if (saving) return; stash(); } $(d.close).close(); }
    else if (d.star) updateReview(state => { const p = reviewEntry(state, d.star); p.starred = !p.starred; });
    else if (d.reviewDone) updateReview(state => JournalReview.complete(state, d.reviewDone, C.today()));
    else if (d.reviewUndo) updateReview(state => JournalReview.undo(state, d.reviewUndo, C.today()));
    else if (d.reviewDate) {
      const value = $('problem-review-date').value;
      if (value && !C.validDate(value)) { $('problem-review-date').reportValidity(); return; }
      updateReview(state => { reviewEntry(state, d.reviewDate).dueDate = value; });
    }
    else if (d.view) { view = d.view; render(); }
    else if (d.tag) { $('tag').value = d.tag; $('reader').close(); view = 'problems'; render(); }
    else if (d.collection) { $('collection').value = d.collection; view = 'collections'; render(); }
    else if (d.copyRecord) { const r = data.records.find(r => r.id === d.copyRecord); const p = r && data.problems.find(p => p.id === r.problemId); if (p) JournalCopy.write(JournalCopy.problem(p, r), event.target.closest('button')); }
    else if (d.problem) readProblem(d.problem);
    else if (d.record) { const r = data.records.find(r => r.id === d.record); if (r) readProblem(r.problemId, r.id); }
    else if (d.document) readDocument(d.document);
    else if (d.review) { const p = data.problems.find(p => p.id === d.review); if (p) openEditor({ ...p, id: '', date: C.today(), action: 'review', body: '' }); }
    else if (d.edit) { const r = data.records.find(r => r.id === d.edit); if (r) openEditor(r); }
    else if (d.kind) { $('edit-kind').value = $('edit-kind').value === d.kind ? '' : d.kind; syncKindButtons(); stash(); }
    else if (d.addTag) { $('edit-tags').value = [...C.tagPath($('edit-tags').value), d.addTag].join('，'); stash(); }
  });
  $('new-record').onclick = () => openEditor();
  $('review-settings').onclick = () => {
    $('review-intervals').value = reviewState.intervals.join(', ');
    $('review-date').value = reviewDate || C.today();
    $('review-settings-message').textContent = '';
    $('review-dialog').showModal();
  };
  $('review-settings-form').onsubmit = event => {
    event.preventDefault();
    try {
      const intervals = JournalReview.intervals($('review-intervals').value);
      if (!C.validDate($('review-date').value)) throw new Error('请选择有效的预览日期');
      const previousDate = reviewDate;
      reviewDate = $('review-date').value === C.today() ? '' : $('review-date').value;
      if (updateReview(state => { state.intervals = intervals; })) $('review-dialog').close();
      else { reviewDate = previousDate; $('review-settings-message').textContent = '浏览器无法保存设置，请检查存储权限。'; }
    } catch (error) { $('review-settings-message').textContent = error.message; }
  };
  $('review-today').onclick = () => {
    reviewDate = '';
    $('review-date').value = C.today();
    refreshLights();
  };
  $('matrix-filters').onclick = () => {
    const expanded = $('matrix-filters').getAttribute('aria-expanded') !== 'true';
    $('matrix-filters').setAttribute('aria-expanded', String(expanded));
    document.body.classList.toggle('matrix-filtering', expanded);
  };
  for (const id of ['matrix-empty', 'matrix-expanded', 'matrix-columns']) $(id).addEventListener('change', () => {
    try { localStorage.setItem(matrixSettingsKey, JSON.stringify({ empty: $('matrix-empty').checked, expanded: $('matrix-expanded').checked, columns: $('matrix-columns').value })); } catch { /* Still usable without browser storage. */ }
    render();
  });
  $('matrix-focus').onclick = () => {
    const enabled = $('matrix-focus').getAttribute('aria-pressed') !== 'true';
    $('matrix-focus').setAttribute('aria-pressed', String(enabled));
    $('matrix-focus').textContent = enabled ? '退出专注 ↙' : '专注表格 ↗';
    render();
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('reader').open && !$('editor').open && document.body.classList.contains('matrix-focus')) $('matrix-focus').click();
  });
  $('clear-draft').onclick = () => {
    if (($('edit-body').value || $('edit-url').value) && !confirm('清空当前草稿？已经保存的学习记录不受影响。')) return;
    try { localStorage.removeItem(activeDraftKey); } catch { /* No persistent draft. */ }
    activeDraftKey = draftKey;
    const remaining = readDraft();
    fill(remaining || { date: C.today() }); $('draft-status').textContent = remaining ? '所选记录草稿已清空，已恢复新题草稿' : '草稿已清空'; $('edit-url').focus();
    $('new-record').textContent = '＋ 记一道题';
  };
  $('record-form').addEventListener('input', stash);
  let previewTimer, composing = false;
  function updatePreview() {
    clearTimeout(previewTimer);
    const preview = $('edit-preview'), top = preview.scrollTop;
    preview.innerHTML = $('edit-body').value.trim() ? markdown($('edit-body').value) : '<p class="hint">在左边写下思路，这里会实时显示 Markdown 和公式。</p>';
    preview.scrollTop = top;
  }
  $('edit-body').addEventListener('input', () => {
    clearTimeout(previewTimer);
    if (!composing) previewTimer = setTimeout(updatePreview, 180);
  });
  $('edit-body').addEventListener('compositionstart', () => { composing = true; clearTimeout(previewTimer); });
  $('edit-body').addEventListener('compositionend', () => { composing = false; updatePreview(); });
  $('content').addEventListener('toggle', event => { if (event.target.matches('.reflection-more')) scheduleMatrixLayout(); }, true);
  $('content').addEventListener('load', scheduleMatrixLayout, true);
  window.addEventListener('resize', scheduleMatrixLayout);
  document.fonts?.addEventListener('loadingdone', scheduleMatrixLayout);
  $('edit-url').addEventListener('input', () => { cancelIdentification(); identityTimer = setTimeout(identifyInput, 450); });
  $('editor').addEventListener('close', cancelIdentification);
  $('edit-url').addEventListener('change', identifyInput);
  $('edit-url').addEventListener('paste', () => setTimeout(identifyInput, 0));
  $('record-form').addEventListener('submit', event => { event.preventDefault(); save(false); });
  $('save-next').onclick = () => save(true);
  $('editor').addEventListener('cancel', event => { if (saving) event.preventDefault(); else stash(); });
  $('editor').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(false); } });
  $('insert-code').onclick = () => {
    const el = $('edit-body');
    const start = el.selectionStart; el.setRangeText('\n```cpp\n\n```\n', start, el.selectionEnd, 'end'); el.focus(); el.setSelectionRange(start + 8, start + 8); stash(); updatePreview();
  };
  $('toggle-preview').onclick = () => {
    const pane = $('preview-pane'); pane.hidden = !pane.hidden;
    $('toggle-preview').textContent = pane.hidden ? '显示预览' : '收起预览';
    $('toggle-preview').setAttribute('aria-pressed', String(!pane.hidden));
    if (!pane.hidden) updatePreview();
  };
  $('download-record').onclick = () => {
    try { const r = collect(); r.id ||= crypto.randomUUID(); download(C.markdown(r), r.id + '.md'); $('editor-message').textContent = '已下载。将文件放入 daily/journal/，重新构建后就会显示。'; } catch (e) { $('editor-message').textContent = e.message; }
  };
  $('export').onclick = () => download(C.exportMarkdown(lightingData(filters()), filters(), $('export-mode').value), `${$('collection').value || '刷题记录'}-${C.today()}.md`);
  filterFields.forEach(k => $(k).addEventListener(k === 'query' ? 'input' : 'change', render));
  $('reset').onclick = () => { filterFields.forEach(k => { $(k).value = k === 'sort' ? 'desc' : ''; }); render(); };
  for (const id of ['status', 'edit-status']) $(id).innerHTML = (id === 'status' ? '<option value="">全部状态</option>' : '') + Object.entries(C.statuses).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  window.addEventListener('pagehide', stash);
  window.addEventListener('storage', event => {
    if (event.key === reviewStorageKey || event.key === null) { reviewState = readReviewState(); refreshLights(); }
  });
  let lastToday = C.today();
  function checkReviewDate() {
    const today = C.today();
    if (today !== lastToday) { lastToday = today; refreshLights(); }
  }
  setInterval(checkReviewDate, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReviewDate(); });
  load().then(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    view = views[params.get('view')] ? params.get('view') : 'log';
    filterFields.forEach(k => { if (params.has(k)) $(k).value = params.get(k); });
    render();
    if (readDraft()) $('new-record').textContent = '继续上次草稿';
  }).catch(e => { message(e.message); $('content').innerHTML = '<p class="empty">暂时无法加载题目。你仍然可以记下新草稿。</p>'; });
})();
