/* Cadence planner — shared by the main process (notifications) and the UI.
   Days are 0=Mon … 6=Sun. Times are minutes from midnight (1440 = 24:00). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const uid = () => Math.random().toString(36).slice(2, 10);

  function weekStart(date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekKey = (date) => dateKey(weekStart(date));
  const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayDate = (key, i) => { const d = keyToDate(key); d.setDate(d.getDate() + i); return d; };
  const shiftWeek = (key, n) => dateKey(dayDate(key, n * 7));
  const fmt12 = (m) => {
    const h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return mm ? `${h12}:${pad(mm)}${ap}` : `${h12}${ap}`;
  };

  const CATEGORIES = {
    school: { label: 'School', color: '#00b8a3' },
    code:   { label: 'Code',   color: '#ffc01e' },
    life:   { label: 'Life',   color: '#ef4743' },
  };
  const FIXED_STYLES = {
    work:  { label: 'Work',  color: '#4b5563' },
    class: { label: 'Class', color: '#7c5cff' },
    other: { label: 'Other', color: '#3b82f6' },
  };

  const NEETCODE_TOPICS = [
    'Arrays & Hashing', 'Two Pointers', 'Stack', 'Binary Search', 'Sliding Window',
    'Linked List', 'Trees', 'Tries', 'Heap / Priority Queue', 'Backtracking',
    'Graphs', 'Advanced Graphs', '1-D Dynamic Programming', '2-D Dynamic Programming',
    'Intervals', 'Greedy', 'Math & Geometry', 'Bit Manipulation',
  ];

  function defaultData() {
    const wk = [0, 1, 2, 3, 4];
    return {
      version: 1,
      settings: {
        provider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1',
        claudeKey: '', claudeModel: 'claude-sonnet-5-5',
        notifyLead: 10, checkinTime: '22:30', launchAtLogin: false,
        windows: { weekday: { start: '17:30', end: '22:45' }, weekend: { start: '10:00', end: '21:00' } },
        dailyCap: { weekday: 150, weekend: 300 }, buffer: 15,
      },
      fixed: [
        { id: 'work', title: 'Bravella (work)', days: wk, start: '09:00', end: '17:00', category: 'work', scored: false },
        { id: 'lecture', title: 'Mobile Devices lecture', days: [0, 3], start: '20:00', end: '21:30', category: 'class', scored: false },
        { id: 'lab', title: 'Mobile Devices lab', days: [1], start: '17:00', end: '18:30', category: 'class', scored: false },
        { id: 'gym', title: 'Gym', days: wk, start: '23:00', end: '24:00', category: 'life', scored: true },
      ],
      free: [
        { id: 'dinner', title: 'Dinner', days: [0, 1, 2, 3, 4, 5, 6], start: '18:30', end: '19:15' },
        { id: 'frinight', title: 'Free night', days: [4], start: '17:00', end: '24:00' },
        { id: 'satnight', title: 'Free evening', days: [5], start: '18:00', end: '24:00' },
      ],
      goals: [
        { id: 'exams', title: 'Exam prep', category: 'school', hoursPerWeek: 3, sessionMin: 60, priority: 1,
          note: 'December exams — add each exam as a deadline once the schedule is posted so study time ramps up.', links: [] },
        { id: 'wayfarer', title: 'Wayfarer project', category: 'school', hoursPerWeek: 4, sessionMin: 90, priority: 1,
          note: 'Add the Part 2 / final due dates as deadlines.', links: [{ title: 'Flutter docs', url: 'https://docs.flutter.dev' }] },
        { id: 'neetcode', title: 'NeetCode roadmap', category: 'code', hoursPerWeek: 3, sessionMin: 45, priority: 2,
          note: 'Work through the roadmap topic by topic.', topics: NEETCODE_TOPICS, topicIndex: 0,
          links: [{ title: 'NeetCode roadmap', url: 'https://neetcode.io/roadmap' }] },
        { id: 'animelog', title: 'Anime Log', category: 'code', hoursPerWeek: 2, sessionMin: 60, priority: 3,
          note: 'Pick one feature or fix per session.', links: [{ title: 'animelog.me', url: 'https://animelog.me' }] },
        { id: 'invest', title: 'Investing research', category: 'life', hoursPerWeek: 1.5, sessionMin: 45, priority: 3,
          note: 'Learn the basics before putting money in: TFSA vs RRSP vs FHSA, ETFs, fees.',
          links: [
            { title: 'Wealthsimple Learn', url: 'https://www.wealthsimple.com/en-ca/learn' },
            { title: 'GetSmarterAboutMoney (Ontario)', url: 'https://www.getsmarteraboutmoney.ca' },
          ] },
      ],
      deadlines: [],
      events: [],
      weeks: {},
      history: {},
    };
  }

  // ---- block generation -------------------------------------------------
  function recurringBlocks(data, key) {
    const out = [];
    for (const f of data.fixed) for (const d of f.days) {
      const cat = CATEGORIES[f.category] ? f.category : null;
      out.push({ id: `fx_${f.id}_${d}`, kind: 'fixed', fixedId: f.id, title: f.title, day: d,
        start: toMin(f.start), end: toMin(f.end), category: cat || f.category, scored: !!f.scored });
    }
    for (const f of data.free || []) for (const d of f.days) {
      out.push({ id: `fr_${f.id}_${d}`, kind: 'free', title: f.title, day: d,
        start: toMin(f.start), end: toMin(f.end), category: 'free', scored: false });
    }
    const first = keyToDate(key), last = dayDate(key, 6);
    for (const e of data.events || []) {
      const ed = keyToDate(e.date);
      if (ed < first || ed > last) continue;
      out.push({ id: `ev_${e.id}`, kind: 'event', eventId: e.id, title: e.title,
        day: Math.round((ed - first) / 864e5), start: toMin(e.start), end: toMin(e.end),
        category: 'other', scored: false });
    }
    return out;
  }

  function weekBlocks(data, key) {
    const w = data.weeks[key];
    return [...recurringBlocks(data, key), ...(w ? w.blocks : [])].sort((a, b) => a.day - b.day || a.start - b.start);
  }

  // minutes for a goal this week, boosted by upcoming deadlines
  function goalTarget(data, goal, key) {
    const start = keyToDate(key);
    let mult = 1, lastDay = 6;
    for (const dl of data.deadlines) {
      if (dl.goalId !== goal.id) continue;
      const days = (keyToDate(dl.date) - start) / 864e5;
      if (days < 0) continue;
      if (days <= 6) { mult = Math.max(mult, 2); lastDay = Math.min(lastDay, days); }
      else if (days <= 13) mult = Math.max(mult, 1.5);
    }
    return { minutes: Math.round(goal.hoursPerWeek * 60 * mult), lastDay, mult };
  }

  function freeSlots(busy, winStart, winEnd, buffer) {
    const iv = busy.map((b) => [b.start - buffer, b.end + buffer]).sort((a, b) => a[0] - b[0]);
    const slots = []; let cur = winStart;
    for (const [s, e] of iv) {
      if (e <= cur) continue;
      if (s > cur) slots.push([cur, Math.min(s, winEnd)]);
      cur = Math.max(cur, e);
      if (cur >= winEnd) break;
    }
    if (cur < winEnd) slots.push([cur, winEnd]);
    return slots.filter(([s, e]) => e > s);
  }

  /* (Re)plan a week. Done blocks are kept; everything not done that hasn't
     started yet is re-placed. Missed past blocks are dropped on reshuffle. */
  function planWeek(data, key, now = new Date()) {
    const s = data.settings;
    const prev = data.weeks[key] || { blocks: [], done: {} };
    const startD = keyToDate(key);
    const nowDay = Math.floor((now - startD) / 864e5);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isPast = (b) => b.day < nowDay || (b.day === nowDay && b.start < nowMin);

    // keep finished work; anything missed or upcoming gets re-placed in the time left
    const kept = prev.blocks.filter((b) => prev.done[b.id]);
    void isPast;
    const busyBase = [...recurringBlocks(data, key), ...kept];
    const placed = [...kept];
    const load = Array(7).fill(0);
    for (const b of kept) load[b.day] += b.end - b.start;

    // build session list, interleaved by priority so every goal gets a turn
    const queues = [];
    for (const g of [...data.goals].sort((a, b) => a.priority - b.priority)) {
      const t = goalTarget(data, g, key);
      const doneMin = kept.filter((b) => b.goalId === g.id).reduce((a, b) => a + b.end - b.start, 0);
      const n = Math.max(0, Math.round((t.minutes - doneMin) / g.sessionMin));
      queues.push({ g, n, lastDay: t.lastDay });
    }
    const sessions = [];
    for (let round = 0; queues.some((q) => q.n > round); round++)
      for (const q of queues) if (q.n > round) sessions.push(q);

    // goals racing a deadline this week get first pick of the slots
    sessions.sort((a, b) => a.lastDay - b.lastDay);
    const unplaced = {};
    const tryPlace = (q, len) => {
      const g = q.g;
      const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => d >= Math.max(0, nowDay) && d <= q.lastDay);
      days.sort((a, b) => {
        const sa = placed.some((p) => p.day === a && p.goalId === g.id) ? 1 : 0;
        const sb = placed.some((p) => p.day === b && p.goalId === g.id) ? 1 : 0;
        return sa - sb || load[a] - load[b] || a - b;
      });
      let ok = false;
      for (const d of days) {
        const weekend = d >= 5;
        const cap = weekend ? s.dailyCap.weekend : s.dailyCap.weekday;
        if (load[d] + len > cap) continue;
        const win = weekend ? s.windows.weekend : s.windows.weekday;
        let ws = toMin(win.start); const we = toMin(win.end);
        if (d === nowDay) ws = Math.max(ws, Math.ceil((nowMin + 15) / 15) * 15);
        const busy = [...busyBase, ...placed].filter((b) => b.day === d);
        for (const [a, e] of freeSlots(busy, ws, we, s.buffer)) {
          const st = Math.ceil(a / 15) * 15;
          if (st + len <= e) {
            const topic = g.topics ? g.topics[g.topicIndex || 0] : null;
            placed.push({ id: 'g_' + uid(), kind: 'goal', goalId: g.id, title: g.title, topic,
              day: d, start: st, end: st + len, category: g.category, scored: true });
            load[d] += len; ok = true; break;
          }
        }
        if (ok) break;
      }
      return ok;
    };
    for (const q of sessions) {
      if (tryPlace(q, q.g.sessionMin)) continue;
      // can't fit a full session: try two shorter chunks before giving up
      const half = Math.max(30, Math.ceil(q.g.sessionMin / 2 / 15) * 15);
      if (half < q.g.sessionMin && tryPlace(q, half)) { tryPlace(q, half); continue; }
      unplaced[q.g.title] = (unplaced[q.g.title] || 0) + 1;
    }

    const done = {};
    for (const id in prev.done) if (prev.done[id]) done[id] = true; // keeps fixed (gym) check-offs too
    data.weeks[key] = { blocks: placed, done, unplaced, plannedAt: now.toISOString() };
    return data.weeks[key];
  }

  function ensureWeek(data, key, now) {
    if (!data.weeks[key]) planWeek(data, key, now);
    return data.weeks[key];
  }

  // ---- scoring (NeetCode ring + Lose It style pace) ------------------------
  function score(data, key, now = new Date()) {
    const w = data.weeks[key] || { done: {} };
    const blocks = weekBlocks(data, key).filter((b) => b.scored);
    const startD = keyToDate(key);
    const cats = {};
    for (const c in CATEGORIES) cats[c] = { done: 0, total: 0, doneMin: 0, totalMin: 0 };
    let doneMin = 0, totalMin = 0, expectedMin = 0, doneN = 0;
    for (const b of blocks) {
      const c = cats[b.category] || (cats[b.category] = { done: 0, total: 0, doneMin: 0, totalMin: 0 });
      const m = b.end - b.start, isDone = !!w.done[b.id];
      c.total++; c.totalMin += m; totalMin += m;
      if (isDone) { c.done++; c.doneMin += m; doneMin += m; doneN++; }
      const endAt = new Date(startD); endAt.setDate(endAt.getDate() + b.day); endAt.setMinutes(b.end);
      if (endAt <= now) expectedMin += m;
    }
    const pct = totalMin ? Math.round((doneMin / totalMin) * 100) : 0;
    const diff = doneMin - expectedMin; // + ahead, - behind
    return { cats, doneMin, totalMin, expectedMin, diff, pct, doneN, totalN: blocks.length };
  }

  return { toMin, fromMin, fmt12, weekStart, weekKey, dateKey, keyToDate, dayDate, shiftWeek, uid,
    CATEGORIES, FIXED_STYLES, NEETCODE_TOPICS, defaultData, recurringBlocks, weekBlocks,
    goalTarget, planWeek, ensureWeek, score };
});
