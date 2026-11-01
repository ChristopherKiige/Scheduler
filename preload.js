const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (d) => ipcRenderer.invoke('data:save', d),
  openUrl: (u) => ipcRenderer.invoke('open:url', u),
  testNotify: () => ipcRenderer.invoke('notify:test'),
  setLogin: (on) => ipcRenderer.invoke('login:set', on),
  tell: (text) => ipcRenderer.invoke('ai:tell', text),
  suggestLinks: (goal) => ipcRenderer.invoke('ai:links', goal),
  onFocusBlock: (cb) => ipcRenderer.on('focus-block', (_e, id) => cb(id)),
  onDataChanged: (cb) => ipcRenderer.on('data-changed', () => cb()),
});
