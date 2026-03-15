'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tw', {
  // State
  getState:      () => ipcRenderer.invoke('state:get'),
  getSavedConfig:() => ipcRenderer.invoke('config:get-saved'),

  // Mode
  launchWallboard: (cfg) => ipcRenderer.invoke('app:launch-wallboard', cfg),
  goSetup:         ()    => ipcRenderer.invoke('app:go-setup'),

  // Panels
  addPanel:       (panel)           => ipcRenderer.invoke('panel:add', panel),
  removePanel:    (panelId)         => ipcRenderer.invoke('panel:remove', panelId),
  updatePanel:    (panelId, patch)  => ipcRenderer.invoke('panel:update', panelId, patch),
  movePanel:      (panelId, toId)   => ipcRenderer.invoke('panel:move', panelId, toId),
  refreshAll:     ()                => ipcRenderer.invoke('panel:refresh-all'),
  refreshOne:     (panelId)         => ipcRenderer.invoke('panel:refresh-one', panelId),
  focusPanel:     (n)               => ipcRenderer.invoke('panel:focus-number', n),
  toggleMaximize: (panelId)         => ipcRenderer.invoke('panel:toggle-maximize', panelId),
  exitMaximize:   ()                => ipcRenderer.invoke('panel:exit-maximize'),
  setSizes:       (sizes)           => ipcRenderer.invoke('panel:set-sizes', sizes),

  // Layout
  cycleLayout: ()     => ipcRenderer.invoke('layout:cycle'),
  setLayout:   (name) => ipcRenderer.invoke('layout:set', name),

  // Window
  setFullscreen: (on) => ipcRenderer.invoke('window:set-fullscreen', on),
  closeWindow:   ()   => ipcRenderer.invoke('window:close'),
  fsHover:       (v)  => ipcRenderer.invoke('window:fs-hover', v),

  // Page navigation
  nextPage:       ()  => ipcRenderer.invoke('page:next'),
  prevPage:       ()  => ipcRenderer.invoke('page:prev'),
  setPage:        (n) => ipcRenderer.invoke('page:set', n),

  // Dialog panel-visibility
  dialogOpen:  () => ipcRenderer.invoke('dialog:open'),
  dialogClose: () => ipcRenderer.invoke('dialog:close'),

  // Events from main
  onBootstrap:     (cb) => ipcRenderer.once('bootstrap',         (_e, d) => cb(d)),
  onState:         (cb) => ipcRenderer.on('state:update',        (_e, d) => cb(d)),
  onMode:          (cb) => ipcRenderer.on('mode:change',         (_e, m) => cb(m)),
  onFullscreen:    (cb) => ipcRenderer.on('fullscreen:change',   (_e, v) => cb(v)),
  onShortcut:      (cb) => ipcRenderer.on('shortcut:new-panel',  ()      => cb('new-panel'))
});
