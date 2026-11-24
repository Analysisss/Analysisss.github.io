(() => {
  'use strict';
  const area = document.getElementById('edit-body') || document.getElementById('note-body');
  if (!area) return;
  const workspace = area.closest('.editor-workspace, .note-workspace');
  const dialog = area.closest('dialog');
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'find-toggle'; toggle.textContent = '查找 / 替换 · Ctrl+F / Ctrl+H';
  const bar = document.createElement('section');
  bar.className = 'markdown-find'; bar.hidden = true; bar.setAttribute('aria-label', 'Markdown 查找替换');
  bar.innerHTML = '<label>查找<input class="find-query" type="search" aria-label="查找文本"></label><label>替换为<input class="find-replacement" aria-label="替换文本"></label><label class="find-case"><input type="checkbox">区分大小写</label><button type="button" data-find="prev">上一个</button><button type="button" data-find="next">下一个</button><button type="button" data-find="replace">替换</button><button type="button" data-find="all">全部替换</button><span class="find-count" role="status" aria-live="polite"></span><button type="button" data-find="close" aria-label="关闭查找替换">×</button>';
  workspace.before(toggle, bar);
  const query = bar.querySelector('.find-query'), replacement = bar.querySelector('.find-replacement'), sensitive = bar.querySelector('[type=checkbox]'), count = bar.querySelector('.find-count');
  let matches = [], index = -1, scannedText = '';
  function scan() {
    matches = []; index = -1; scannedText = area.value;
    if (query.value) {
      const escaped = query.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, sensitive.checked ? 'g' : 'gi');
      for (const m of area.value.matchAll(regex)) matches.push({ start: m.index, end: m.index + m[0].length });
    }
    count.textContent = query.value ? matches.length + ' 处匹配' : '输入要查找的文本';
  }
  function select(i) {
    if (!matches.length) return;
    index = (i + matches.length) % matches.length;
    const m = matches[index];
    area.focus(); area.setSelectionRange(m.start, m.end);
    // Reveal the selected line in a plain textarea, including long notes.
    const line = area.value.slice(0, m.start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 22;
    area.scrollTop = Math.max(0, line * lineHeight - area.clientHeight / 2);
    count.textContent = (index + 1) + ' / ' + matches.length;
  }
  function open(replace = false) {
    if (area.disabled) return;
    const selection = area.value.slice(area.selectionStart, area.selectionEnd);
    if (selection && !selection.includes('\n')) query.value = selection;
    bar.hidden = false; toggle.setAttribute('aria-expanded', 'true'); scan();
    (replace ? replacement : query).focus(); (replace ? replacement : query).select();
  }
  function close() { bar.hidden = true; toggle.setAttribute('aria-expanded', 'false'); area.focus(); }
  function change(start, end, value) {
    area.focus(); area.setSelectionRange(start, end);
    // insertText participates in the browser's undo stack; retain a fallback.
    if (!document.execCommand('insertText', false, value)) area.setRangeText(value, start, end, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true })); scan();
  }
  function action(name) {
    if (name === 'close') { close(); return; }
    if (area.disabled) return;
    if (area.value !== scannedText) scan();
    if (name === 'next' || name === 'prev') { select(index < 0 ? (name === 'prev' ? matches.length - 1 : 0) : index + (name === 'next' ? 1 : -1)); return; }
    if (!matches.length) return;
    if (name === 'all') {
      const total = matches.length, parts = []; let pos = 0;
      for (const m of matches) { parts.push(area.value.slice(pos, m.start), replacement.value); pos = m.end; }
      parts.push(area.value.slice(pos)); change(0, area.value.length, parts.join(''));
      count.textContent = '已替换 ' + total + ' 处';
    } else if (name === 'replace') {
      const m = matches[index < 0 ? 0 : index], end = m.start + replacement.value.length;
      change(m.start, m.end, replacement.value);
      const next = matches.findIndex(item => item.start >= end);
      if (matches.length) select(next < 0 ? 0 : next); else count.textContent = '已替换，没有剩余匹配';
    }
  }
  toggle.onclick = () => open();
  query.oninput = sensitive.onchange = scan;
  area.addEventListener('input', () => { if (!bar.hidden) scan(); });
  bar.addEventListener('click', event => { const button = event.target.closest('[data-find]'); if (button) action(button.dataset.find); });
  document.addEventListener('keydown', event => {
    const active = dialog ? dialog.open : !document.body.classList.contains('note-reading') && !!event.target.closest('.notes-main');
    if (!active) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'f' || key === 'h')) { event.preventDefault(); event.stopImmediatePropagation(); open(key === 'h'); }
    else if (!bar.hidden && key === 'escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    else if (!bar.hidden && key === 'enter' && bar.contains(event.target) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); const focus = event.target; action(event.shiftKey ? 'prev' : 'next'); focus.focus(); }
  }, true);
  dialog?.addEventListener('close', () => { bar.hidden = true; });
})();
