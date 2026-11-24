(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./journal-core'));
  else root.JournalReview = factory(root.JournalCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const defaults = [1, 3, 7, 14, 30];
  function intervals(value) {
    const values = Array.isArray(value) ? value : String(value).split(/[,，\s]+/).filter(Boolean);
    const result = values.map(Number);
    if (!result.length || result.length > 12 || result.some((n, i) => !Number.isInteger(n) || n < 1 || n > 365 || i && n <= result[i - 1])) throw new Error('复习间隔请填写递增的整数天数（1–365），例如 1, 3, 7, 14, 30');
    return result;
  }
  function cleanState(raw) {
    const result = { intervals: defaults.slice(), problems: Object.create(null) };
    if (!raw || typeof raw !== 'object') return result;
    try { result.intervals = intervals(raw.intervals); } catch { /* Keep defaults. */ }
    if (raw.problems && typeof raw.problems === 'object') for (const [id, p] of Object.entries(raw.problems)) {
      if (!p || typeof p !== 'object') continue;
      result.problems[id] = {
        starred: p.starred === true,
        completed: [...new Set((Array.isArray(p.completed) ? p.completed : []).filter(C.validDate))].sort(),
        dueDate: C.validDate(p.dueDate) ? p.dueDate : ''
      };
      if (C.validDate(p.lastCompletion?.date)) result.problems[id].lastCompletion = {
        date: p.lastCompletion.date, dueDate: C.validDate(p.lastCompletion.dueDate) ? p.lastCompletion.dueDate : ''
      };
    }
    return result;
  }
  const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  function schedule(problemId, records, state, date) {
    const p = state.problems[problemId] || {};
    const days = state.intervals || defaults, events = new Map();
    function event(day, learn) {
      if (!C.validDate(day) || day > date) return;
      events.set(day, Boolean(events.get(day) || learn));
    }
    records.filter(r => r.problemId === problemId).forEach(r => event(r.date, r.action !== 'review'));
    (p.completed || []).forEach(day => event(day, false));
    let anchor = '', stage = 0;
    for (const [day, learn] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
      if (!anchor || learn) stage = 0;
      else stage = Math.min(stage + 1, days.length - 1);
      anchor = day;
    }
    const dueDate = C.validDate(p.dueDate) ? p.dueDate : anchor ? addDays(anchor, days[stage]) : '';
    return {
      starred: p.starred === true, dueDate, anchor, stage, interval: days[stage],
      due: Boolean(dueDate && dueDate <= date),
      overdue: dueDate && dueDate < date ? Math.round((Date.parse(date) - Date.parse(dueDate)) / 86400000) : 0,
      manualDate: Boolean(p.dueDate), completedToday: (p.completed || []).includes(date)
    };
  }
  function complete(state, problemId, date) {
    if (!C.validDate(date)) throw new Error('复习日期无效');
    const p = state.problems[problemId] ||= { starred: false, completed: [], dueDate: '' };
    if (!p.completed.includes(date)) p.lastCompletion = { date, dueDate: p.dueDate };
    p.completed = [...new Set([...p.completed, date])].sort();
    p.dueDate = '';
  }
  function undo(state, problemId, date) {
    const p = state.problems[problemId];
    if (!p || !p.completed.includes(date)) return;
    p.completed = p.completed.filter(day => day !== date);
    if (p.lastCompletion?.date === date) { p.dueDate = p.lastCompletion.dueDate; delete p.lastCompletion; }
  }
  return { defaults, intervals, cleanState, addDays, schedule, complete, undo };
});
