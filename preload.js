const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('threatwall', {
  getState: () => ipcRenderer.invoke('state:get'),
  addPanel: (panel) => ipcRenderer.invoke('panel:add', panel),
  removePanel: (panelId) => ipcRenderer.invoke('panel:remove', panelId),
  toggleMaximize: (panelId) => ipcRenderer.invoke('panel:toggle-maximize', panelId),
  cycleLayout: () => ipcRenderer.invoke('layout:cycle'),
  refreshAll: () => ipcRenderer.invoke('panel:refresh-all'),
  focusPanel: (number) => ipcRenderer.invoke('panel:focus-number', number),
  setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', enabled),
  onState: (cb) => {
    ipcRenderer.on('state:update', (_event, data) => cb(data));
  }
});
