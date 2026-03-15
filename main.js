'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const fs = require('fs');
const path = require('path');
const PanelManager = require('./core/panelManager');
const SessionManager = require('./core/sessionManager');
const RefreshEngine = require('./core/refreshEngine');

let configPath;

app.whenReady().then(() => {
  // Store config in userData (vital for packaged ASAR builds which are read-only)
  const userDataPath = app.getPath('userData');
  configPath = path.join(userDataPath, 'panels.json');

  // If running for the first time in packaged app, or if not packaged, migrate local config
  const localConfig = path.join(__dirname, 'config', 'panels.json');
  if (!fs.existsSync(configPath) || !app.isPackaged) {
    if (fs.existsSync(localConfig)) {
      try { fs.copyFileSync(localConfig, configPath); } catch { /* ignore */ }
    }
  }

  applyChromiumFlags();
  createWindow();
  registerShortcuts();
});
let mainWindow;
let panelManager;
const sessionManager = new SessionManager();
const refreshEngine = new RefreshEngine();

// ─── Chromium flags ───────────────────────────────────────────────────────────
function applyChromiumFlags() {
  app.commandLine.appendSwitch('disable-features',
    'TranslateUI,BackForwardCache,MediaRouter,OptimizationHints,AutofillServerCommunication');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-hang-monitor');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  // Ignore certificate errors globally for self-signed/internal certs
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('ignore-ssl-errors');
  app.commandLine.appendSwitch('ignore-certificate-errors-spki-list', '');
  app.commandLine.appendSwitch('allow-insecure-localhost');
}

// ─── Config helpers ───────────────────────────────────────────────────────────
function sanitizePanel(panel) {
  const raw = typeof panel.url === 'string' ? panel.url.trim() : '';
  const url = /^https?:\/\//i.test(raw) ? raw : '';
  if (!url) throw new Error('Invalid URL');
  const name    = String(panel.name || 'Untitled Panel').slice(0, 80);
  const refresh = Math.max(5, Math.min(3600, Number(panel.refresh) || 60));
  const session = String(
    panel.session || name.toLowerCase().replace(/\s+/g, '-')
  ).slice(0, 80).replace(/[^a-z0-9-_]/g, '-');
  return { name, url, refresh, session };
}

function loadConfig() {
  try {
    const raw    = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const panels = (Array.isArray(parsed.panels) ? parsed.panels : [])
      .map((p) => { try { return sanitizePanel(p); } catch { return null; } })
      .filter(Boolean);
    const layout   = typeof parsed.layout === 'string' ? parsed.layout : '2x2';
    const firstRun = parsed.firstRun !== false;
    return { layout, panels, firstRun };
  } catch {
    return { layout: '2x2', panels: [], firstRun: true };
  }
}

function saveConfig({ layout, panels, firstRun = false }) {
  const payload = {
    firstRun,
    layout,
    panels: panels.map(({ name, url, refresh, session }) => ({ name, url, refresh, session }))
  };
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf8');
}

// ─── App state ────────────────────────────────────────────────────────────────
let appMode = 'setup';
// Track if panels are hidden for dialog visibility
let panelsHiddenForDialog = false;

function setMode(mode) {
  appMode = mode;
  safeWebContentsSend('mode:change', mode);
}

function safeWebContentsSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function getStatePayload() {
  return {
    mode:       appMode,
    layout:     panelManager.layout,
    panels:     panelManager.getPublicPanels(),
    fullscreen: mainWindow.isFullScreen(),
    maximized:  panelManager.maximizedId
  };
}

function persistPanels() {
  saveConfig({
    layout:   panelManager.layout,
    panels:   panelManager.getPublicPanels(),
    firstRun: false
  });
}

// ─── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1600,
    height:          900,
    minWidth:        800,
    minHeight:       500,
    backgroundColor: '#030712',
    autoHideMenuBar: true,
    frame:           true,
    icon:            path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,
      devTools:         !app.isPackaged
    }
  });

  // Fix MaxListeners warning (BrowserView attaches closed listeners internally)
  mainWindow.setMaxListeners(100);

  // ── SSL: bypass certificate errors on all sessions ──────────────────────────
  // This handles self-signed/internal certs (Wazuh, private dashboards, etc.)
  app.on('certificate-error', (_event, _webContents, _url, _error, _cert, callback) => {
    // Allow all certificate errors (internal SOC deployment only)
    callback(true);
  });

  panelManager = new PanelManager(
    mainWindow,
    sessionManager,
    refreshEngine,
    (state) => safeWebContentsSend('state:update', { ...state, mode: appMode })
  );

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    const cfg       = loadConfig();
    const startMode = (cfg.firstRun || cfg.panels.length === 0) ? 'setup' : 'wallboard';
    appMode         = startMode;

    if (startMode === 'wallboard') {
      panelManager.loadPanels(cfg.layout, cfg.panels);
    }

    safeWebContentsSend('bootstrap', {
      mode:        startMode,
      layout:      panelManager.layout,
      panels:      panelManager.getPublicPanels(),
      fullscreen:  false,
      maximized:   null,
      savedPanels: cfg.panels
    });
  });

  mainWindow.on('resize',            () => panelManager.resize());
  mainWindow.on('enter-full-screen', () => safeWebContentsSend('fullscreen:change', true));
  mainWindow.on('leave-full-screen', () => safeWebContentsSend('fullscreen:change', false));

  // Hot-reload panels.json when edited externally
  let watchDebounce = null;
  fs.watchFile(configPath, { interval: 2000 }, () => {
    clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      if (appMode !== 'wallboard') return;
      try { 
        const cfg = loadConfig();
        panelManager.loadPanels(cfg.layout, cfg.panels); 
      } catch { /* ignore */ }
    }, 300);
  });
}

// ─── Panel visibility for dialogs ─────────────────────────────────────────────
// BrowserViews are native layers above HTML — dialogs get hidden behind them.
// Solution: push all BrowserViews offscreen when a modal opens, restore on close.
function hidePanelsForDialog() {
  if (panelsHiddenForDialog) return;
  panelsHiddenForDialog = true;
  panelManager.pushOffscreen();
}

function restorePanelsAfterDialog() {
  if (!panelsHiddenForDialog) return;
  panelsHiddenForDialog = false;
  panelManager.popOffscreen();
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────
function registerShortcuts() {
  function handle(action) {
    switch (action) {
      case 'fullscreen':
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        break;
      case 'esc':
        if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
        panelManager.exitMaximize();
        break;
      case 'refresh-all':
        if (appMode === 'wallboard') panelManager.refreshAll();
        break;
      case 'layout':
        if (appMode === 'wallboard') { panelManager.cycleLayout(); persistPanels(); }
        break;
      case 'new-panel':
        safeWebContentsSend('shortcut:new-panel');
        break;
      case 'remove-last': {
        if (appMode === 'wallboard') {
          const panels = panelManager.getPublicPanels();
          if (panels.length > 0) { panelManager.removePanel(panels[panels.length - 1].id); persistPanels(); }
        }
        break;
      }
      default:
        if (/^\d$/.test(action) && appMode === 'wallboard') panelManager.focusByNumber(Number(action));
    }
  }

  globalShortcut.register('F11',                          () => handle('fullscreen'));
  globalShortcut.register('Escape',                       () => handle('esc'));
  globalShortcut.register('CommandOrControl+Shift+R',     () => handle('refresh-all'));
  globalShortcut.register('CommandOrControl+Shift+L',     () => handle('layout'));
  globalShortcut.register('CommandOrControl+Shift+N',     () => handle('new-panel'));
  globalShortcut.register('CommandOrControl+Shift+D',     () => handle('remove-last'));
  // Page navigation: Ctrl+Right / Ctrl+Left  (works even when BrowserView has focus)
  globalShortcut.register('CommandOrControl+Right', () => { if (appMode === 'wallboard') panelManager.nextPage(); });
  globalShortcut.register('CommandOrControl+Left',  () => { if (appMode === 'wallboard') panelManager.prevPage(); });
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => handle(String(i)));
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('state:get', () => getStatePayload());

ipcMain.handle('app:launch-wallboard', (_e, { layout, panels }) => {
  try {
    const clean = panels.map(sanitizePanel);
    panelManager.loadPanels(layout || '2x2', clean);
    saveConfig({ layout: panelManager.layout, panels: clean, firstRun: false });
    setMode('wallboard');
    // Force a resize/pop to ensure they are brought back from -9999 y-space 
    // if the user had previously opened a dialog or the setup view
    panelManager.popOffscreen(); 
    panelManager.resize();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:go-setup', () => {
  panelManager.clear();
  setMode('setup');
  return loadConfig();
});

ipcMain.handle('panel:add', (_e, panel) => {
  const clean = sanitizePanel(panel);
  panelManager.addPanel(clean);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:remove', (_e, panelId) => {
  panelManager.removePanel(panelId);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:update', (_e, panelId, partial) => {
  panelManager.updatePanel(panelId, partial);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:move', (_e, panelId, targetId) => {
  panelManager.movePanel(panelId, targetId);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:resize', (_e, panelId, delta) => {
  panelManager.resizePanel(panelId, delta);
  persistPanels();
  return true;
});

ipcMain.handle('panel:toggle-maximize', (_e, panelId) => { panelManager.toggleMaximize(panelId); return true; });
ipcMain.handle('panel:exit-maximize',   ()             => { panelManager.exitMaximize();         return true; });
ipcMain.handle('panel:refresh-all',     ()             => { panelManager.refreshAll();           return true; });
ipcMain.handle('panel:refresh-one',     (_e, id)       => { panelManager.refreshPanel(id);       return true; });
ipcMain.handle('panel:focus-number',    (_e, n)        => { panelManager.focusByNumber(Number(n)); return true; });

ipcMain.handle('layout:cycle', ()      => { const l = panelManager.cycleLayout(); persistPanels(); return l; });
ipcMain.handle('layout:set',   (_e, n) => { const l = panelManager.setLayout(n);  persistPanels(); return l; });

ipcMain.handle('window:set-fullscreen', (_e, on) => {
  mainWindow.setFullScreen(Boolean(on));
  return mainWindow.isFullScreen();
});
ipcMain.handle('window:close', () => { mainWindow.close(); return true; });
ipcMain.handle('window:fs-hover', (_e, isHovering) => {
  if (!mainWindow.isFullScreen()) return true;
  panelManager._isFsHovering = isHovering;
  panelManager.resize();
  return true;
});

ipcMain.handle('config:get-saved', () => loadConfig());

// Dialog panel-visibility toggles
ipcMain.handle('dialog:open',  () => { hidePanelsForDialog();    return true; });
ipcMain.handle('dialog:close', () => { restorePanelsAfterDialog(); return true; });

ipcMain.handle('page:next',    () => { panelManager.nextPage(); persistPanels(); return { page: panelManager.currentPage, total: panelManager.totalPages }; });
ipcMain.handle('page:prev',    () => { panelManager.prevPage(); persistPanels(); return { page: panelManager.currentPage, total: panelManager.totalPages }; });
ipcMain.handle('page:set',     (_e, n) => { panelManager.setPage(n); persistPanels(); return { page: panelManager.currentPage, total: panelManager.totalPages }; });

// Panel splitter/resize
ipcMain.handle('panel:set-sizes', (_e, sizes) => {
  panelManager.setSizes(sizes);
  return true;
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  refreshEngine.stopAll();
  fs.unwatchFile(configPath);
});
