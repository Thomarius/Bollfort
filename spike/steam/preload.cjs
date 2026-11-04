// The control page's way to the main process: the spike's buttons and its log.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  host: (type) => ipcRenderer.invoke('host', type),
  join: (id) => ipcRenderer.invoke('join', id),
  invite: () => ipcRenderer.invoke('invite'),
  overlayInvite: () => ipcRenderer.invoke('overlayInvite'),
  friends: () => ipcRenderer.invoke('friends'),
  list: () => ipcRenderer.invoke('list'),
  leave: () => ipcRenderer.invoke('leave'),
  keyboard: () => ipcRenderer.invoke('keyboard'),
  onLog: (fn) => ipcRenderer.on('log', (_e, line) => fn(line)),
  onState: (fn) => ipcRenderer.on('state', (_e, state) => fn(state)),
});
