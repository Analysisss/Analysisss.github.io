(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JournalCopy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const label = value => String(value || '').replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
  function problem(p, record = {}) {
    const tags = record.tags?.length ? record.tags : p.tags || [];
    const category = tags[tags.length - 1];
    let body = String(record.body || '').trim();
    const key = String(record.key || p.key || '').trim();
    // Keep source Markdown intact, and avoid repeating a summary already in the solution.
    if (key && !body.replace(/\r\n/g, '\n').includes(key.replace(/\r\n/g, '\n'))) {
      const quote = body.match(/^(?:>[^\n]*(?:\n|$))+/);
      if (quote) body = quote[0].trimEnd() + '\n\n' + key + '\n\n' + body.slice(quote[0].length).trimStart();
      else body = key + (body ? '\n\n' + body : '');
    }
    return (category ? '### ' + label(category) + '\n\n' : '') + '#### ' + (p.url ? '[' + label(p.title) + '](' + p.url + ')' : label(p.title)) + '\n\n' + body + '\n';
  }
  async function write(text, button) {
    const original = button?.textContent;
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
      } catch {
        const el = document.createElement('textarea'), focus = document.activeElement;
        el.value = text; el.style.cssText = 'position:fixed;left:-9999px;top:0';
        (button?.closest('dialog[open]') || document.body).append(el);
        el.focus(); el.select();
        let ok;
        try { ok = document.execCommand('copy'); } finally { el.remove(); focus?.focus({preventScroll:true}); }
        if (!ok) throw new Error('浏览器未允许复制，请使用下载 Markdown');
      }
      if (button) button.textContent = '已复制 ✓';
    } catch(error) { if (button) { button.textContent = '复制失败，请下载 Markdown'; button.title = error.message; } }
    if (button) setTimeout(() => { button.textContent = original; }, 2500);
  }
  return { problem, write };
});
