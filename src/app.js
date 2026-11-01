/* global Planner */
const P = Planner;
const bridge = window.api; // exposed by preload
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const START_H = 7, END_H = 24;
const hrs = (m) => (m / 60).toFixed(m % 60 ? 1 : 0);

let data, key;
const curKey = () => P.weekKey(new Date());
const colorOf = (cat) => (P.CATEGORIES[cat] || P.FIXED_STYLES[cat] || P.FIXED_STYLES.other).color;

const ICONS = {
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// ---------------------------------------------------------------- persistence
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => bridge.save(data), 150); }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* After goals / deadlines / fixed schedule change: re-plan the current week
   (keeping check-offs) and let untouched future weeks regenerate on view. */
function replan() {
  const cur = curKey();
  for (const k of Object.keys(data.weeks))
    if (k > cur && !Object.keys(data.weeks[k].done || {}).length) delete data.weeks[k];
  const target = key >= cur ? key : cur;
  P.planWeek(data, target, new Date());
  if (target !== cur) P.planWeek(data, cur, new Date());
  persist(); render();
}

// ---------------------------------------------------------------- rendering
function render() {
  P.ensureWeek(data, key, new Date());
  renderScore(); renderGoals(); renderDeadlines(); renderGrid();
  $('aiLabel').textContent = data.settings.provider === 'claude' ? `Claude · ${data.settings.claudeModel}` : `Ollama · ${data.settings.ollamaModel}`;
}

function arcPath(r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = 60 + r * Math.cos(rad(a0)), y0 = 60 + r * Math.sin(rad(a0));
  const x1 = 60 + r * Math.cos(rad(a1)), y1 = 60 + r * Math.sin(rad(a1));
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function renderScore() {
  const sc = P.score(data, key, new Date());
  const cats = Object.keys(P.CATEGORIES);
  $('catList').innerHTML = cats.map((c) => `<div class="cat-row"><b style="color:${P.CATEGORIES[c].color}">${P.CATEGORIES[c].label}</b><span>${sc.cats[c].done}/${sc.cats[c].total}</span></div>`).join('');

  // NeetCode-style ring: 270° sweep, one segment per category sized by planned time
  const R = 50, START = 135, SWEEP = 270, GAP = 9;
  const active = cats.filter((c) => sc.cats[c].totalMin > 0);
  const avail = SWEEP - GAP * Math.max(0, active.length - 1);
  let a = START, svg = '';
  for (const c of active) {
    const seg = (avail * sc.cats[c].totalMin) / sc.totalMin;
    const col = P.CATEGORIES[c].color;
    svg += `<path d="${arcPath(R, a, a + seg)}" stroke="${col}" stroke-opacity=".22" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    const frac = sc.cats[c].doneMin / sc.cats[c].totalMin;
    const end = a + seg * frac;
    if (frac > 0.002) svg += `<path d="${arcPath(R, a, end)}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    const dx = 60 + R * Math.cos((end * Math.PI) / 180), dy = 60 + R * Math.sin((end * Math.PI) / 180);
    svg += `<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="4.2" fill="${col}"/>`;
    a += seg + GAP;
  }
  if (!active.length) svg = `<path d="${arcPath(R, START, START + SWEEP)}" stroke="#34343a" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  $('ring').innerHTML = svg;
  $('ringDone').textContent = sc.doneN;
  $('ringTotal').textContent = `/${sc.totalN}`;

  // Lose It style: over / under pace for the week
  let paceHtml;
  const cur = curKey();
  if (!sc.totalMin) paceHtml = 'Nothing planned this week';
  else if (key > cur) paceHtml = `<b>${hrs(sc.totalMin)}h</b> planned · starts ${P.keyToDate(key).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
  else {
    const d = sc.diff;
    const status = key < cur
      ? `<span class="${sc.pct >= 80 ? 'ok' : sc.pct >= 50 ? 'mid' : 'bad'}">Final score <b>${sc.pct}%</b></span>`
      : d >= -15 ? (d > 15 ? `<span class="ok"><b>${hrs(d)}h</b> ahead of pace</span>` : '<span class="ok">On pace</span>')
      : `<span class="${d > -60 ? 'mid' : 'bad'}"><b>${hrs(-d)}h</b> behind pace</span>`;
    paceHtml = `<b>${hrs(sc.doneMin)}h</b> of <b>${hrs(sc.totalMin)}h</b> done · <b>${sc.pct}%</b><br>${status}`;
  }
  $('pace').innerHTML = paceHtml;
  const s = P.keyToDate(key), e = P.dayDate(key, 6);
  $('weekPill').textContent = key === cur ? '📅 This week' : `📅 ${s.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;

  // weekly history bars
  if (key <= cur && sc.totalMin) { if (data.history[key] !== sc.pct) { data.history[key] = sc.pct; persist(); } }
  const keys = Object.keys(data.history).sort().slice(-6);
  $('history').innerHTML = keys.map((k) => {
    const v = data.history[k];
    const col = v >= 80 ? 'var(--school)' : v >= 50 ? 'var(--code)' : 'var(--life)';
    const kd = P.keyToDate(k), lbl = `${kd.getMonth() + 1}/${kd.getDate()}`;
    return `<div class="bar ${k === key ? 'now' : ''}" title="Week of ${k}: ${v}%" style="height:${Math.max(4, v * 0.34)}px;background:${col}"><i>${lbl}</i></div>`;
  }).join('');
  $('history').style.marginBottom = keys.length ? '14px' : '0';
}

function renderGoals() {
  const w = data.weeks[key];
  const blocks = w.blocks;
  $('goalList').innerHTML = data.goals.map((g) => {
    const mine = blocks.filter((b) => b.goalId === g.id);
    const plan = mine.reduce((a, b) => a + b.end - b.start, 0);
    const done = mine.filter((b) => w.done[b.id]).reduce((a, b) => a + b.end - b.start, 0);
    const t = P.goalTarget(data, g, key);
    const pct = t.minutes ? Math.min(100, (done / t.minutes) * 100) : 0;
    const sub = g.topics ? `Topic: ${esc(g.topics[g.topicIndex || 0])} (${(g.topicIndex || 0) + 1}/${g.topics.length})`
      : `${mine.length} session${mine.length === 1 ? '' : 's'} · ${g.sessionMin} min`;
    return `<div class="goal" data-goal="${g.id}">
      <div class="goal-head"><span class="dot" style="background:${colorOf(g.category)}"></span>
        <span class="goal-title">${esc(g.title)}</span>
        ${t.mult > 1 ? `<span class="boost">×${t.mult} deadline</span>` : ''}
        <span class="goal-hrs">${hrs(done)}/${hrs(Math.max(plan, t.minutes))}h</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colorOf(g.category)}"></div></div>
      <div class="goal-sub">${sub}</div></div>`;
  }).join('') || '<div class="empty">No goals yet — tell me something you want to do.</div>';
  document.querySelectorAll('[data-goal]').forEach((el) => (el.onclick = () => goalModal(data.goals.find((g) => g.id === el.dataset.goal))));

  const un = w.unplaced || {};
  const names = Object.keys(un);
  $('unplaced').textContent = names.length && key >= curKey()
    ? `⚠ Couldn't fit: ${names.map((n) => `${un[n]}× ${n}`).join(', ')} — lower hours or widen your windows` : '';
}

function renderDeadlines() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = [...data.deadlines].sort((a, b) => a.date.localeCompare(b.date));
  $('deadlineList').innerHTML = list.map((d) => {
    const days = Math.round((P.keyToDate(d.date) - today) / 864e5);
    const g = data.goals.find((x) => x.id === d.goalId);
    const lbl = days < 0 ? 'passed' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`;
    return `<div class="deadline"><div><div>${esc(d.title)}</div><div class="muted">${P.keyToDate(d.date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}${g ? ' · ' + esc(g.title) : ''}</div></div>
      <div style="display:flex;gap:6px;align-items:center"><span class="days-left ${days <= 7 && days >= 0 ? 'hot' : ''}">${lbl}</span><button class="x" data-del-dl="${d.id}" title="Remove">✕</button></div></div>`;
  }).join('') || '<div class="empty">Add exams and project due dates — study time ramps up as they get close.</div>';
  document.querySelectorAll('[data-del-dl]').forEach((b) => (b.onclick = () => {
    data.deadlines = data.deadlines.filter((d) => d.id !== b.dataset.delDl); replan();
  }));
}

function renderGrid() {
  const grid = $('grid');
  const now = new Date();
  const cur = curKey();
  const todayIdx = key === cur ? (now.getDay() + 6) % 7 : -1;
  const s = P.keyToDate(key), e = P.dayDate(key, 6);
  const mo = (d) => d.toLocaleDateString('en-CA', { month: 'long' });
  $('weekTitle').textContent = s.getMonth() === e.getMonth()
    ? `${mo(s)} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
    : `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}, ${e.getFullYear()}`;

  const w = data.weeks[key];
  const blocks = P.weekBlocks(data, key);
  const nowDay = Math.floor((now - s) / 864e5), nowMin = now.getHours() * 60 + now.getMinutes();

  let html = '<div class="day-head"></div>';
  for (let d = 0; d < 7; d++) {
    const dt = P.dayDate(key, d);
    const dls = data.deadlines.filter((x) => x.date === P.dateKey(dt));
    const load = blocks.filter((b) => b.day === d && b.kind === 'goal').reduce((a, b) => a + b.end - b.start, 0);
    html += `<div class="day-head ${d === todayIdx ? 'today' : ''}"><div class="dn">${DAYS[d]}</div><div class="dd">${dt.getDate()}</div>
      <div class="chips">${dls.map((x) => `<span class="chip">⚑ ${esc(x.title)}</span>`).join('')}</div>
      ${load ? `<div class="load">${hrs(load)}h planned</div>` : ''}</div>`;
  }
  html += '<div class="hours">';
  for (let h = START_H; h < END_H; h++) html += `<div class="hour-label">${h === START_H ? '' : P.fmt12(h * 60)}</div>`;
  html += '</div>';
  const hourPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
  const y = (m) => ((Math.max(m, START_H * 60) - START_H * 60) / 60) * hourPx;

  for (let d = 0; d < 7; d++) {
    html += `<div class="col ${d === todayIdx ? 'today' : ''}">`;
    for (let h = START_H; h < END_H; h++) html += '<div class="slot"></div>';
    for (const b of blocks.filter((x) => x.day === d && x.end > START_H * 60)) {
      const top = y(b.start), height = Math.max(18, y(b.end) - top - 2);
      const done = w.done[b.id];
      const missed = b.scored && !done && (d < nowDay || (d === nowDay && b.end < nowMin)) && key <= cur;
      const cls = ['blk', b.kind, b.category === 'work' ? 'work' : '', done ? 'done' : '', missed ? 'missed' : ''].join(' ');
      const sub = b.kind === 'free' ? '' : `${P.fmt12(b.start)} – ${P.fmt12(b.end)}${b.topic ? ' · ' + esc(b.topic) : ''}`;
      html += `<div class="${cls}" data-blk="${b.id}" style="top:${top}px;height:${height}px;--c:${colorOf(b.category)}">
        <div class="t">${esc(b.title)}</div>${height > 30 ? `<div class="s">${sub}</div>` : ''}
        ${b.scored ? `<div class="chk">${done ? '✓' : ''}</div>` : ''}</div>`;
    }
    if (d === todayIdx && nowMin >= START_H * 60) html += `<div class="now-line" style="top:${y(nowMin)}px"></div>`;
    html += '</div>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('[data-blk]').forEach((el) => {
    const b = blocks.find((x) => x.id === el.dataset.blk);
    if (b.kind === 'free') return;
    el.onclick = (ev) => { ev.stopPropagation(); if (ev.target.classList.contains('chk')) toggleDone(b); else blockPopover(b, el); };
  });
}

// ---------------------------------------------------------------- interactions
function toggleDone(b) {
  const w = data.weeks[key];
  if (w.done[b.id]) delete w.done[b.id]; else w.done[b.id] = true;
  persist(); render();
  if (w.done[b.id]) toast(`✓ ${b.title} done`);
}

function linksHtml(links) {
  return (links || []).length ? `<div class="links">${links.map((l) => `<a data-url="${esc(l.url)}">${esc(l.title)} <span>↗</span></a>`).join('')}</div>` : '';
}
function wireLinks(root) { root.querySelectorAll('[data-url]').forEach((a) => (a.onclick = () => bridge.openUrl(a.dataset.url))); }

function blockPopover(b, el) {
  const pop = $('popover');
  const w = data.weeks[key];
  const g = b.goalId && data.goals.find((x) => x.id === b.goalId);
  const day = P.dayDate(key, b.day).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
  let h = `<h3>${esc(b.title)}</h3><div class="meta">${day} · ${P.fmt12(b.start)} – ${P.fmt12(b.end)}</div>`;
  if (g) {
    if (g.topics) h += `<div class="topic">▸ ${esc(g.topics[g.topicIndex || 0])}</div>`;
    if (g.note) h += `<div class="note">${esc(g.note)}</div>`;
    h += linksHtml(g.links);
  }
  h += '<div class="pop-actions">';
  if (b.scored) h += `<button class="btn primary" id="popDone">${w.done[b.id] ? 'Undo' : '✓ Mark done'}</button>`;
  if (g && g.topics) h += '<button class="btn" id="popTopic">Topic finished →</button>';
  if (b.kind === 'goal') h += '<button class="btn" id="popSkip">Skip</button>';
  if (b.kind === 'event') h += '<button class="btn danger" id="popDelEv">Delete event</button>';
  h += '</div>';
  pop.innerHTML = h; pop.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  const left = r.right + 310 < window.innerWidth ? r.right + 8 : r.left - 308;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 10, Math.max(10, r.top))}px`;
  wireLinks(pop);
  if ($('popDone')) $('popDone').onclick = () => { toggleDone(b); closePop(); };
  if ($('popTopic')) $('popTopic').onclick = () => {
    g.topicIndex = Math.min(g.topics.length - 1, (g.topicIndex || 0) + 1);
    for (const x of Object.values(data.weeks)) for (const bb of x.blocks) if (bb.goalId === g.id && !x.done[bb.id]) bb.topic = g.topics[g.topicIndex];
    persist(); render(); closePop(); toast(`Next up: ${g.topics[g.topicIndex]}`);
  };
  if ($('popSkip')) $('popSkip').onclick = () => { w.blocks = w.blocks.filter((x) => x.id !== b.id); persist(); render(); closePop(); };
  if ($('popDelEv')) $('popDelEv').onclick = () => { data.events = data.events.filter((x) => x.id !== b.eventId); closePop(); replan(); };
}
function closePop() { $('popover').classList.add('hidden'); }

function openModal(html) { $('modal').innerHTML = html; $('overlay').classList.remove('hidden'); }
function closeModal() { $('overlay').classList.add('hidden'); }

const catOptions = (sel) => Object.entries(P.CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.label}</option>`).join('');
const parseLinks = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [a, b] = l.split('|').map((x) => x.trim());
  return b ? { title: a, url: b } : { title: a.replace(/^https?:\/\//, ''), url: a };
}).filter((l) => /^https?:\/\//.test(l.url));

function goalModal(g) {
  const isNew = !g;
  g = g || { id: P.uid(), title: '', category: 'code', hoursPerWeek: 2, sessionMin: 60, priority: 2, note: '', links: [] };
  openModal(`<h2>${isNew ? 'New goal' : 'Edit goal'}</h2>
    <div class="field"><label>Title</label><input id="gTitle" value="${esc(g.title)}"></div>
    <div class="row3"><div class="field"><label>Category</label><select id="gCat">${catOptions(g.category)}</select></div>
      <div class="field"><label>Hours / week</label><input id="gHrs" type="number" min="0.5" step="0.5" value="${g.hoursPerWeek}"></div>
      <div class="field"><label>Session (min)</label><input id="gLen" type="number" min="15" step="15" value="${g.sessionMin}"></div></div>
    <div class="row"><div class="field"><label>Priority</label><select id="gPri">
      ${[[1, 'High — school / deadlines'], [2, 'Medium'], [3, 'Low — nice to have']].map(([v, l]) => `<option value="${v}" ${g.priority === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${g.topics ? `<div class="field"><label>Current topic</label><select id="gTopic">${g.topics.map((t, i) => `<option value="${i}" ${i === (g.topicIndex || 0) ? 'selected' : ''}>${i + 1}. ${esc(t)}</option>`).join('')}</select></div>` : '<div></div>'}</div>
    <div class="field"><label>How to get into it (shown on each session)</label><textarea id="gNote" rows="2">${esc(g.note)}</textarea></div>
    <div class="field"><label>Links — one per line: Title | https://…</label><textarea id="gLinks" rows="3">${esc((g.links || []).map((l) => `${l.title} | ${l.url}`).join('\n'))}</textarea></div>
    <div class="muted" id="gAiMsg"></div>
    <div class="modal-actions"><div>${isNew ? '' : '<button class="btn danger" id="gDel">Delete</button>'} <button class="btn" id="gAi">✨ Suggest links</button></div>
      <div class="r"><button class="btn" id="gCancel">Cancel</button><button class="btn primary" id="gSave">Save</button></div></div>`);
  $('gCancel').onclick = closeModal;
  if ($('gDel')) $('gDel').onclick = () => {
    if (!confirm(`Delete "${g.title}"?`)) return;
    data.goals = data.goals.filter((x) => x.id !== g.id);
    for (const w of Object.values(data.weeks)) w.blocks = w.blocks.filter((b) => b.goalId !== g.id || w.done[b.id]);
    closeModal(); replan();
  };
  $('gAi').onclick = async () => {
    const title = $('gTitle').value.trim(); if (!title) return;
    $('gAi').disabled = true; $('gAiMsg').textContent = 'Asking AI for starter resources…';
    const r = await bridge.suggestLinks({ title, note: $('gNote').value });
    $('gAi').disabled = false;
    if (r.error) { $('gAiMsg').textContent = r.error; return; }
    const cur = $('gLinks').value.trim();
    $('gLinks').value = [cur, ...(r.links || []).map((l) => `${l.title} | ${l.url}`)].filter(Boolean).join('\n');
    if (r.note && !$('gNote').value.trim()) $('gNote').value = r.note;
    $('gAiMsg').textContent = 'Added — double-check the links before relying on them.';
  };
  $('gSave').onclick = () => {
    const title = $('gTitle').value.trim(); if (!title) return $('gTitle').focus();
    Object.assign(g, { title, category: $('gCat').value, hoursPerWeek: +$('gHrs').value || 1,
      sessionMin: Math.max(15, +$('gLen').value || 60), priority: +$('gPri').value, note: $('gNote').value.trim(), links: parseLinks($('gLinks').value) });
    if ($('gTopic')) g.topicIndex = +$('gTopic').value;
    for (const w of Object.values(data.weeks)) for (const b of w.blocks) if (b.goalId === g.id) { b.title = g.title; b.category = g.category; }
    if (isNew) data.goals.push(g);
    closeModal(); replan();
  };
}

function deadlineModal() {
  const today = P.dateKey(new Date());
  openModal(`<h2>New deadline</h2>
    <div class="field"><label>What's due</label><input id="dTitle" placeholder="e.g. Mobile Devices final exam"></div>
    <div class="row"><div class="field"><label>Date</label><input id="dDate" type="date" value="${today}"></div>
      <div class="field"><label>Ramp up study time for</label><select id="dGoal"><option value="">— nothing —</option>
      ${data.goals.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select></div></div>
    <div class="muted">Linked goals get 1.5× their hours two weeks out and 2× in the final week, scheduled before the due date.</div>
    <div class="modal-actions"><div></div><div class="r"><button class="btn" id="dCancel">Cancel</button><button class="btn primary" id="dSave">Add</button></div></div>`);
  $('dCancel').onclick = closeModal;
  $('dSave').onclick = () => {
    const title = $('dTitle').value.trim(); if (!title || !$('dDate').value) return;
    data.deadlines.push({ id: P.uid(), title, date: $('dDate').value, goalId: $('dGoal').value || null });
    closeModal(); replan();
  };
}

function eventModal() {
  openModal(`<h2>One-off event</h2>
    <div class="field"><label>Title</label><input id="eTitle" placeholder="e.g. Dentist, group meeting"></div>
    <div class="row3"><div class="field"><label>Date</label><input id="eDate" type="date" value="${P.dateKey(new Date())}"></div>
      <div class="field"><label>Start</label><input id="eStart" type="time" value="18:00"></div>
      <div class="field"><label>End</label><input id="eEnd" type="time" value="19:00"></div></div>
    <div class="muted">Anything planned that clashes gets moved.</div>
    <div class="modal-actions"><div></div><div class="r"><button class="btn" id="eCancel">Cancel</button><button class="btn primary" id="eSave">Add</button></div></div>`);
  $('eCancel').onclick = closeModal;
  $('eSave').onclick = () => {
    const title = $('eTitle').value.trim(); if (!title) return;
    data.events.push({ id: P.uid(), title, date: $('eDate').value, start: $('eStart').value, end: $('eEnd').value });
    closeModal(); replan();
  };
}

function scheduleRows(list, withCat) {
  return list.map((f, i) => `<div class="fx-row" data-i="${i}">
    <input class="f-title" value="${esc(f.title)}">
    <div class="daybox">${DAYS.map((dn, d) => `<label><input type="checkbox" class="f-day" value="${d}" ${f.days.includes(d) ? 'checked' : ''}><span>${dn[0]}</span></label>`).join('')}</div>
    <input class="f-start" type="time" value="${f.start === '24:00' ? '23:59' : f.start}"><input class="f-end" type="time" value="${f.end === '24:00' ? '23:59' : f.end}">
    ${withCat ? `<select class="f-cat">${[['work', 'Work'], ['class', 'Class'], ...Object.entries(P.CATEGORIES).map(([k, v]) => [k, v.label])].map(([k, l]) => `<option value="${k}" ${f.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="chk-inline" title="Counts toward your weekly score"><input type="checkbox" class="f-scored" ${f.scored ? 'checked' : ''}>★</label>` : '<span></span><span></span>'}
    <button class="btn ghost f-del" title="Remove">✕</button></div>`).join('');
}
function readRows(container, withCat) {
  return [...container.querySelectorAll('.fx-row')].map((r) => {
    const fix = (t) => (t === '23:59' ? '24:00' : t);
    const o = { id: P.uid(), title: r.querySelector('.f-title').value.trim() || 'Untitled',
      days: [...r.querySelectorAll('.f-day:checked')].map((x) => +x.value),
      start: r.querySelector('.f-start').value, end: fix(r.querySelector('.f-end').value) };
    if (withCat) { o.category = r.querySelector('.f-cat').value; o.scored = r.querySelector('.f-scored').checked; }
    return o;
  }).filter((o) => o.days.length && o.start < o.end);
}

function settingsModal() {
  const s = data.settings;
  openModal(`<h2>Settings</h2>
    <h4>AI</h4>
    <div class="row"><div class="field"><label>Provider</label><select id="sProv"><option value="ollama" ${s.provider === 'ollama' ? 'selected' : ''}>Ollama (local, free)</option><option value="claude" ${s.provider === 'claude' ? 'selected' : ''}>Claude API</option></select></div>
      <div class="field"><label>Ollama model</label><input id="sOModel" value="${esc(s.ollamaModel)}"></div></div>
    <div class="row"><div class="field"><label>Ollama URL</label><input id="sOUrl" value="${esc(s.ollamaUrl)}"></div>
      <div class="field"><label>Claude model</label><input id="sCModel" value="${esc(s.claudeModel)}"></div></div>
    <div class="field"><label>Claude API key (stored only on this PC)</label><input id="sCKey" type="password" value="${esc(s.claudeKey)}" placeholder="sk-ant-…"></div>
    <h4>Notifications</h4>
    <div class="row3"><div class="field"><label>Remind me (min before)</label><input id="sLead" type="number" min="0" value="${s.notifyLead}"></div>
      <div class="field"><label>Nightly check-in</label><input id="sCheck" type="time" value="${s.checkinTime}"></div>
      <div class="field"><label>&nbsp;</label><button class="btn" id="sTest">Send test</button></div></div>
    <label class="chk-inline"><input type="checkbox" id="sLogin" ${s.launchAtLogin ? 'checked' : ''}> Start Cadence in the tray when Windows starts</label>
    <h4>When I can be scheduled</h4>
    <div class="row"><div class="field"><label>Weekdays</label><div class="row"><input id="sWdS" type="time" value="${s.windows.weekday.start}"><input id="sWdE" type="time" value="${s.windows.weekday.end}"></div></div>
      <div class="field"><label>Weekends</label><div class="row"><input id="sWeS" type="time" value="${s.windows.weekend.start}"><input id="sWeE" type="time" value="${s.windows.weekend.end}"></div></div></div>
    <div class="row3"><div class="field"><label>Max planned / weekday (h)</label><input id="sCapD" type="number" step="0.5" value="${s.dailyCap.weekday / 60}"></div>
      <div class="field"><label>Max planned / weekend day (h)</label><input id="sCapE" type="number" step="0.5" value="${s.dailyCap.weekend / 60}"></div>
      <div class="field"><label>Break between blocks (min)</label><input id="sBuf" type="number" step="5" value="${s.buffer}"></div></div>
    <h4>Fixed schedule <span class="muted" style="text-transform:none;letter-spacing:0">★ = counts toward score</span></h4>
    <div id="fxRows">${scheduleRows(data.fixed, true)}</div><button class="link-btn" id="fxAdd">+ Add fixed block</button>
    <h4>Protected free time</h4>
    <div id="frRows">${scheduleRows(data.free, false)}</div><button class="link-btn" id="frAdd">+ Add free time</button>
    <div class="modal-actions"><div></div><div class="r"><button class="btn" id="sCancel">Cancel</button><button class="btn primary" id="sSave">Save & replan</button></div></div>`);
  const wireDel = () => document.querySelectorAll('.f-del').forEach((b) => (b.onclick = () => b.closest('.fx-row').remove()));
  wireDel();
  $('fxAdd').onclick = () => { $('fxRows').insertAdjacentHTML('beforeend', scheduleRows([{ title: 'New block', days: [0], start: '12:00', end: '13:00', category: 'class', scored: false }], true)); wireDel(); };
  $('frAdd').onclick = () => { $('frRows').insertAdjacentHTML('beforeend', scheduleRows([{ title: 'Free time', days: [6], start: '18:00', end: '24:00' }], false)); wireDel(); };
  $('sTest').onclick = () => bridge.testNotify();
  $('sCancel').onclick = closeModal;
  $('sSave').onclick = () => {
    Object.assign(s, { provider: $('sProv').value, ollamaModel: $('sOModel').value.trim(), ollamaUrl: $('sOUrl').value.trim(),
      claudeModel: $('sCModel').value.trim(), claudeKey: $('sCKey').value.trim(), notifyLead: +$('sLead').value || 0,
      checkinTime: $('sCheck').value, launchAtLogin: $('sLogin').checked, buffer: +$('sBuf').value || 0,
      windows: { weekday: { start: $('sWdS').value, end: $('sWdE').value }, weekend: { start: $('sWeS').value, end: $('sWeE').value } },
      dailyCap: { weekday: Math.round((+$('sCapD').value || 2.5) * 60), weekend: Math.round((+$('sCapE').value || 5) * 60) } });
    data.fixed = readRows($('fxRows'), true).map((f, i) => ({ ...f, id: data.fixed[i] && data.fixed[i].title === f.title ? data.fixed[i].id : f.id }));
    data.free = readRows($('frRows'), false);
    bridge.setLogin(s.launchAtLogin);
    closeModal(); replan(); toast('Saved — week replanned');
  };
}

function helpModal() {
  openModal(`<h2>How Cadence works</h2><div class="help">
    <p><b>Planning.</b> Your fixed schedule (work, lectures, lab, gym) and protected free time are blocked first. Each goal's weekly hours are then split into sessions and spread across the open evening and weekend windows, respecting a daily max so you still have downtime.</p>
    <p><b>Deadlines.</b> Link a deadline to a goal and that goal gets 1.5× hours two weeks out and 2× in the final week, all before the due date.</p>
    <p><b>Score.</b> Tick the box on a block (or open it → Mark done). The ring fills by time completed in each category, and the line under it tells you if you're on pace, ahead, or behind for the week — like a calorie budget, but for hours.</p>
    <p><b>Fell behind?</b> Hit ⤮ Reshuffle: finished work stays, everything missed is re-placed in the time left this week.</p>
    <p><b>Tell me box.</b> Type plain English — new goals, deadlines, or one-off events — and the AI adds them with starter links. Works with Ollama running locally or a Claude API key.</p>
    <p><b>Notifications.</b> Closing the window keeps Cadence in the tray; you get a heads-up before each block, a ping at start, and a nightly check-in.</p></div>
    <div class="modal-actions"><div></div><button class="btn primary" id="hClose">Got it</button></div>`);
  $('hClose').onclick = closeModal;
}

// ---- AI "tell me" box
function findGoal(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  return data.goals.find((g) => g.title.toLowerCase() === t) || data.goals.find((g) => g.title.toLowerCase().includes(t) || t.includes(g.title.toLowerCase()));
}
function applyActions(actions) {
  const done = [];
  for (const a of actions || []) {
    if (a.type === 'add_goal' && a.title) {
      if (findGoal(a.title)) { done.push(`"${a.title}" already exists`); continue; }
      data.goals.push({ id: P.uid(), title: a.title, category: P.CATEGORIES[a.category] ? a.category : 'life',
        hoursPerWeek: Math.min(10, +a.hoursPerWeek || 2), sessionMin: Math.min(180, Math.max(15, +a.sessionMin || 60)),
        priority: [1, 2, 3].includes(+a.priority) ? +a.priority : 2, note: a.note || '',
        links: (a.links || []).filter((l) => l && /^https?:\/\//.test(l.url)) });
      done.push(`+ goal: ${a.title}`);
    } else if (a.type === 'update_goal') {
      const g = findGoal(a.goalTitle); if (!g) continue;
      if (a.hoursPerWeek) g.hoursPerWeek = +a.hoursPerWeek;
      if (a.sessionMin) g.sessionMin = +a.sessionMin;
      done.push(`~ updated: ${g.title}`);
    } else if (a.type === 'add_deadline' && a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
      const g = findGoal(a.goalTitle);
      data.deadlines.push({ id: P.uid(), title: a.title || 'Deadline', date: a.date, goalId: g ? g.id : null });
      done.push(`⚑ deadline: ${a.title} (${a.date})`);
    } else if (a.type === 'add_event' && a.date && a.start && a.end) {
      data.events.push({ id: P.uid(), title: a.title || 'Event', date: a.date, start: a.start, end: a.end });
      done.push(`+ event: ${a.title} ${a.date} ${a.start}`);
    }
  }
  return done;
}
function fallbackParse(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)\b/i);
  if (!m) return [];
  const title = text.replace(m[0], '').replace(/\b(i want to|a week|per week|each week|every week|weekly)\b/gi, '').replace(/\s+/g, ' ').trim();
  return title ? [{ type: 'add_goal', title: title[0].toUpperCase() + title.slice(1), hoursPerWeek: +m[1], sessionMin: 60, category: 'life' }] : [];
}
async function tell() {
  const text = $('tellInput').value.trim(); if (!text) return;
  $('tellBtn').disabled = true; $('tellReply').textContent = 'Thinking…';
  const r = await bridge.tell(text);
  $('tellBtn').disabled = false;
  let msg;
  if (r.error) {
    const changes = applyActions(fallbackParse(text));
    msg = r.error + (changes.length ? `\nAdded without AI:\n${changes.join('\n')}` : '');
    if (changes.length) replan();
  } else {
    const changes = applyActions(r.actions);
    msg = [r.reply, ...changes].filter(Boolean).join('\n') || "I couldn't turn that into a change — try rephrasing.";
    if (changes.length) { $('tellInput').value = ''; replan(); }
  }
  $('tellReply').textContent = msg;
}

// ---------------------------------------------------------------- boot
async function init() {
  data = await bridge.load();
  key = curKey();
  P.ensureWeek(data, key, new Date());
  persist();
  $('btnShuffle').innerHTML = ICONS.shuffle; $('btnRefresh').innerHTML = ICONS.refresh;
  $('btnClear').innerHTML = ICONS.trash; $('btnHelp').innerHTML = ICONS.help; $('btnSettings').innerHTML = ICONS.gear;

  $('prevWeek').onclick = () => { key = P.shiftWeek(key, -1); render(); };
  $('nextWeek').onclick = () => { key = P.shiftWeek(key, 1); render(); };
  $('todayBtn').onclick = () => { key = curKey(); render(); scrollToNow(); };
  $('btnShuffle').onclick = () => {
    if (key < curKey()) return toast("Can't reshuffle a past week");
    P.planWeek(data, key, new Date()); persist(); render(); toast('Reshuffled the rest of the week');
  };
  $('btnRefresh').onclick = async () => { data = await bridge.load(); render(); toast('Reloaded'); };
  $('btnClear').onclick = () => { if (confirm("Clear this week's check-offs?")) { data.weeks[key].done = {}; persist(); render(); } };
  $('btnHelp').onclick = helpModal;
  $('btnSettings').onclick = settingsModal;
  $('addGoal').onclick = () => goalModal(null);
  $('addDeadline').onclick = deadlineModal;
  $('addEvent').onclick = eventModal;
  $('tellBtn').onclick = tell;
  $('tellInput').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tell(); } };
  $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeModal(); };
  document.addEventListener('click', (e) => { if (!$('popover').contains(e.target)) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeModal(); } });
  $('gridWrap').addEventListener('scroll', closePop);

  bridge.onFocusBlock((id) => {
    key = curKey(); render();
    const el = document.querySelector(`[data-blk="${id}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.click(), 300); }
  });
  bridge.onDataChanged(async () => { data = await bridge.load(); render(); });

  render(); scrollToNow();
  setInterval(() => { if ($('overlay').classList.contains('hidden')) render(); }, 60 * 1000);
}
function scrollToNow() {
  const h = new Date().getHours();
  const hourPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
  $('gridWrap').scrollTop = Math.max(0, (Math.min(h, 17) - START_H - 1) * hourPx);
}
init();
