const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('threatwall', {
  getState: () => ipcRenderer.invoke('state:get'),
  addPanel: (panel) => ipcRenderer.invoke('panel:add', panel),
  removePanel: (panelId) => ipcRenderer.invoke('panel:remove', panelId),
  movePanel: (panelId, targetId) => ipcRenderer.invoke('panel:move', panelId, targetId),
  toggleMaximize: (panelId) => ipcRenderer.invoke('panel:toggle-maximize', panelId),
  exitMaximize: () => ipcRenderer.invoke('panel:exit-maximize'),
  cycleLayout: () => ipcRenderer.invoke('layout:cycle'),
  refreshAll: () => ipcRenderer.invoke('panel:refresh-all'),
  refreshOne: (panelId) => ipcRenderer.invoke('panel:refresh-one', panelId),
  focusPanel: (number) => ipcRenderer.invoke('panel:focus-number', number),
  setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', enabled),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onState: (cb) => {
    ipcRenderer.on('state:update', (_event, data) => cb(data));
  }
});
