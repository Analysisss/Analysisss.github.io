/* global JournalCore, JournalNotes, JournalMarkdown */
(() => {
  const $ = id => document.getElementById(id), esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = { problems: [], records: [], notes: [] }, current = {}, saving = false, timer;
  const draftPrefix = 'algorithm-note:draft:v1:';
  const status = text => { $('note-status').textContent = text; };
  const collect = () => ({ ...current, title: $('note-title').value, body: $('note-body').value });
  function stash() {
    if (saving) return;
    try { localStorage.setItem(draftPrefix + (current.id || 'new'), JSON.stringify(collect())); status('草稿已保存在此浏览器'); }
    catch { status('草稿无法存入浏览器，请下载源文备份'); }
  }
  function render() {
    const blocks = JournalNotes.blocks($('note-body').value, data);
    $('reference-count').textContent = blocks.filter(b => b.type === 'problem').length + ' 处题目引用';
    $('note-preview').innerHTML = '<h1>' + esc($('note-title').value || '未命名笔记') + '</h1>' + blocks.map(b => {
      if (b.type === 'markdown') return JournalMarkdown.render(b.body);
      if (!b.problem) return `<div class="missing-reference">尚未收录：${esc(b.url)}<br>请先在刷题手记记录该题，再点击“更新引用”。</div>`;
      const p = b.problem;
      return `<section class="note-problem"><button type="button" data-copy-problem="${esc(p.id)}">复制本题 Markdown</button><div class="note-collection">${esc(p.collections.join(' / '))}</div><h3><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a></h3><div class="note-key"><strong>一句话总结</strong>${JournalMarkdown.render(p.key || '关键点待补充')}</div>${JournalMarkdown.render(b.record?.body || '题解待补充')}<p class="hint">题解记录：${esc(b.record?.date || '日期未标注')}</p></section>`;
    }).join('');
  }
  function list() {
    const q = $('note-search').value.toLowerCase();
    $('notes-list').innerHTML = (data.notes || []).filter(n => n.title.toLowerCase().includes(q)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(n => `<button data-note="${esc(n.id)}" class="${current.id === n.id ? 'active' : ''}">${esc(n.title)}</button>`).join('') || '<p class="hint">暂无笔记，点击右上角新建。</p>';
  }
  function open(note = {}) {
    if (saving) return;
    current = note; let draft;
    try { draft = JSON.parse(localStorage.getItem(draftPrefix + (note.id || 'new')) || 'null'); } catch {}
    if (draft) current = draft;
    $('note-title').value = current.title || ''; $('note-body').value = current.body || '';
    history.replaceState(null, '', current.id ? '#note=' + encodeURIComponent(current.id) : location.pathname);
    status(draft ? '已恢复草稿；引用显示当前题库内容' : current.id ? '已打开笔记；引用显示当前题库内容' : '新笔记，写讲解或插入题目');
    render(); list();
  }
  function choices() {
    const q = $('problem-search').value.trim().toLowerCase(), identity = JournalCore.identify(q);
    const matches = data.problems.filter(p => !q || p.id === identity?.id || [p.title, p.url, p.key, ...p.collections, ...p.tags].join(' ').toLowerCase().includes(q));
    $('problem-choice').innerHTML = matches.map(p => `<option value="${esc(p.id)}">${esc(p.title)} · ${esc(p.collections.join(' / '))}</option>`).join('');
  }
  async function getData() {
    try {
      const response = await fetch('../manage/api/journal', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error();
      const session = await response.json();
      if (!session.data?.notes) throw new Error();
      return session;
    } catch {
      const response = await fetch('./journal.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('无法读取题库，请检查本地服务或网站构建');
      return { data: await response.json() };
    }
  }
  async function save() {
    if (saving) return;
    stash(); const input = collect();
    if (!input.title.trim() || !input.body.trim()) { status('请填写笔记标题和正文'); return; }
    saving = true;
    for (const el of document.querySelectorAll('button,input,textarea,select')) el.disabled = true;
    status('正在保存…');
    try {
      const session = await getData();
      if (!session.token) throw new Error('保存需要本地 Hexo 服务；草稿保留，可下载引用源文');
      const response = await fetch('../manage/api/journal/notes', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-Journal-Token':session.token }, body:JSON.stringify(input), signal:AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '保存失败');
      current = result;
      data = session.data; data.notes = [...(data.notes || []).filter(n => n.id !== result.id), result];
      try { localStorage.removeItem(draftPrefix + (input.id || 'new')); } catch {}
      history.replaceState(null, '', '#note=' + result.id);
      list(); render(); status('已保存到 ' + result.source);
    } catch(error) { status(error.message + '；草稿仍保留'); }
    finally { saving = false; for (const el of document.querySelectorAll('button,input,textarea,select')) el.disabled = false; }
  }
  function download(text, suffix) {
    const url = URL.createObjectURL(new Blob([text], {type:'text/markdown;charset=utf-8'})), a = document.createElement('a');
    a.href=url; a.download=($('note-title').value.trim() || '算法笔记').replace(/[<>:"/\\|?*]/g,'-') + suffix + '.md'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('note-title').oninput = $('note-body').oninput = () => { stash(); clearTimeout(timer); timer = setTimeout(render, 200); };
  $('new-note').onclick = () => { stash(); open(); };
  $('notes-list').onclick = e => { const id=e.target.closest('[data-note]')?.dataset.note; if(id && !saving) { stash(); open(data.notes.find(n=>n.id===id)); } };
  $('note-search').oninput=list; $('problem-search').oninput=choices;
  $('insert-problem').onclick = () => {
    const p=data.problems.find(p=>p.id===$('problem-choice').value), url=p?.url || $('problem-search').value.trim();
    if (!JournalCore.identify(url)) { status('请选择题目或输入有效原题链接'); return; }
    const el=$('note-body'); el.setRangeText('\n\n'+url+'\n\n',el.selectionStart,el.selectionEnd,'end'); el.focus(); stash(); render();
  };
  $('toggle-write').onclick = () => { const read=document.body.classList.toggle('note-reading'); $('toggle-write').textContent=read?'继续编辑':'阅读模式'; render(); };
  $('refresh-problems').onclick = async () => { try { data=(await getData()).data; choices(); list(); render(); status('引用已更新，讲解草稿保持不变'); } catch(e) { status(e.message); } };
  $('save-note').onclick=save;
  $('copy-note').onclick=()=>JournalCopy.write('# '+$('note-title').value+'\n\n'+JournalNotes.expand($('note-body').value,data), $('copy-note'));
  $('note-preview').addEventListener('click', event => { const button = event.target.closest('[data-copy-problem]'); if (!button) return; const block = JournalNotes.blocks($('note-body').value,data).find(b => b.problem?.id === button.dataset.copyProblem); if (block) JournalCopy.write(JournalCopy.problem(block.problem,block.record),button); });
  $('export-note').onclick=()=>download('# '+$('note-title').value+'\n\n'+JournalNotes.expand($('note-body').value,data),'');
  $('source-note').onclick=()=> { const n=collect(); download('---\nalgorithm_note: 1\nnote_id: '+JSON.stringify(n.id || crypto.randomUUID())+'\ntitle: '+JSON.stringify(n.title)+'\nupdated_at: '+JSON.stringify(new Date().toISOString())+'\n---\n\n'+n.body,'-引用源文'); };
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();save();}});
  (async()=>{try{data=(await getData()).data;choices();const id=new URLSearchParams(location.hash.slice(1)).get('note');open(data.notes?.find(n=>n.id===id) || {});}catch(e){status(e.message);}})();
})();
