const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const P = require('./src/planner');
const ai = require('./ai');

app.setAppUserModelId('me.cadence.planner'); // needed for Windows toast notifications
if (!app.requestSingleInstanceLock()) app.quit();

const DATA_FILE = () => path.join(app.getPath('userData'), 'cadence-data.json');
let win = null, tray = null, quitting = false;

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    const def = P.defaultData();
    d.settings = { ...def.settings, ...d.settings };
    for (const k of ['free', 'deadlines', 'events', 'weeks', 'history']) d[k] = d[k] || def[k];
    return d;
  } catch {
    return P.defaultData();
  }
}
function save(d) {
  fs.mkdirSync(path.dirname(DATA_FILE()), { recursive: true });
  const tmp = DATA_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DATA_FILE());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700,
    backgroundColor: '#18181b', title: 'Cadence', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // closing hides to the tray so reminders keep coming
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function showWindow(blockId) {
  if (!win) createWindow();
  win.show(); win.focus();
  if (blockId) win.webContents.send('focus-block', blockId);
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Cadence');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Cadence', click: () => showWindow() },
    { label: 'Test notification', click: () => notify('Cadence is running', 'Reminders will show up like this.') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWindow());
}

function notify(title, body, blockId) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
  n.on('click', () => showWindow(blockId));
  n.show();
}

// ---- reminder loop -------------------------------------------------------
const sent = new Set();
function tick() {
  const now = new Date();
  const data = load();
  const key = P.weekKey(now);
  if (!data.weeks[key]) { P.ensureWeek(data, key, now); save(data); win && win.webContents.send('data-changed'); }
  const today = (now.getDay() + 6) % 7;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lead = Number(data.settings.notifyLead) || 10;
  const stamp = P.dateKey(now);
  const blocks = P.weekBlocks(data, key).filter((b) => b.day === today && b.kind !== 'free');
  const done = data.weeks[key].done;

  for (const b of blocks) {
    if (b.category === 'work') continue; // you already know you're at work
    const what = b.topic ? `${b.title} — ${b.topic}` : b.title;
    const when = `${P.fmt12(b.start)}–${P.fmt12(b.end)}`;
    const soonId = `${stamp}|${b.id}|soon`, nowId = `${stamp}|${b.id}|now`;
    if (nowMin >= b.start - lead && nowMin < b.start && !sent.has(soonId)) {
      sent.add(soonId); notify(`In ${b.start - nowMin} min: ${what}`, when, b.id);
    }
    if (nowMin >= b.start && nowMin < b.start + 5 && !sent.has(nowId) && !done[b.id]) {
      sent.add(nowId); notify(`Starting now: ${what}`, `${when} · click to open`, b.id);
    }
  }
  const ci = P.toMin(data.settings.checkinTime || '22:30');
  const ciId = `${stamp}|checkin`;
  if (nowMin >= ci && nowMin < ci + 5 && !sent.has(ciId)) {
    sent.add(ciId);
    const scored = blocks.filter((b) => b.scored);
    const d = scored.filter((b) => done[b.id]).length;
    if (scored.length) notify('Daily check-in', `You've checked off ${d}/${scored.length} today. Tick off what you finished.`);
  }
}

// ---- IPC -----------------------------------------------------------------
ipcMain.handle('data:load', () => load());
ipcMain.handle('data:save', (_e, d) => { save(d); return true; });
ipcMain.handle('open:url', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('notify:test', () => notify('Cadence', 'Notifications are working.'));
ipcMain.handle('login:set', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; });
ipcMain.handle('ai:tell', async (_e, text) => {
  const d = load(); const now = new Date();
  try {
    return await ai.tell(d.settings, text, {
      today: P.dateKey(now), weekday: now.toLocaleDateString('en-CA', { weekday: 'long' }),
      goals: d.goals.map((g) => g.title),
    });
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('ai:links', async (_e, goal) => {
  try { return await ai.suggestLinks(load().settings, goal); } catch (err) { return { error: err.message }; }
});

app.on('second-instance', () => showWindow());
app.whenReady().then(() => {
  createTray();
  if (!process.argv.includes('--hidden')) createWindow();
  tick();
  setInterval(tick, 30 * 1000);
});
app.on('window-all-closed', (e) => e.preventDefault()); // stay alive in the tray
app.on('before-quit', () => { quitting = true; });
