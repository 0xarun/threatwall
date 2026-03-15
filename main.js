const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const PanelManager = require('./core/panelManager');
const SessionManager = require('./core/sessionManager');
const RefreshEngine = require('./core/refreshEngine');

const configPath = path.join(__dirname, 'config', 'panels.json');

let mainWindow;
let panelManager;
const sessionManager = new SessionManager();
const refreshEngine = new RefreshEngine();

function secureDefaults() {
  app.commandLine.appendSwitch('disable-features', 'TranslateUI,BackForwardCache,MediaRouter,OptimizationHints');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

function sanitizePanel(panel) {
  const normalizedUrl = typeof panel.url === 'string' ? panel.url.trim() : '';
  const url = /^https?:\/\//i.test(normalizedUrl) ? normalizedUrl : '';
  if (!url) {
    throw new Error('Invalid URL');
  }

  const name = String(panel.name || 'Untitled Panel').slice(0, 80);
  const refresh = Math.max(5, Math.min(3600, Number(panel.refresh || 60)));
  const session = String(panel.session || name.toLowerCase().replace(/\s+/g, '-')).slice(0, 80);

  return { name, url, refresh, session };
}

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  const panels = (parsed.panels || []).map(sanitizePanel);
  const layout = typeof parsed.layout === 'string' ? parsed.layout : '2x2';
  return { layout, panels };
}

function saveConfig(layout, panels) {
  const payload = {
    layout,
    panels: panels.map((panel) => ({
      name: panel.name,
      url: panel.url,
      refresh: panel.refresh,
      session: panel.session
    }))
  };

  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true
    }
  });

  panelManager = new PanelManager(mainWindow, sessionManager, refreshEngine, (state) => {
    mainWindow.webContents.send('state:update', state);
  });

  const cfg = loadConfig();
  panelManager.loadPanels(cfg.layout, cfg.panels);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('resize', () => panelManager.resize());

  fs.watchFile(configPath, { interval: 2000 }, () => {
    try {
      const updated = loadConfig();
      panelManager.loadPanels(updated.layout, updated.panels);
    } catch (_error) {}
  });
}

function getStatePayload() {
  return {
    layout: panelManager.layout,
    panels: panelManager.getPublicPanels(),
    fullscreen: mainWindow.isFullScreen(),
    maximized: panelManager.maximizedId
  };
}

function persistPanels() {
  saveConfig(panelManager.layout, panelManager.getPublicPanels());
}

ipcMain.handle('state:get', () => getStatePayload());

ipcMain.handle('panel:add', (_event, panel) => {
  const cleanPanel = sanitizePanel(panel);
  panelManager.addPanel(cleanPanel);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:remove', (_event, panelId) => {
  panelManager.removePanel(panelId);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:move', (_event, panelId, targetId) => {
  panelManager.movePanel(panelId, targetId);
  persistPanels();
  return panelManager.getPublicPanels();
});

ipcMain.handle('panel:toggle-maximize', (_event, panelId) => {
  panelManager.toggleMaximize(panelId);
  return true;
});

ipcMain.handle('panel:exit-maximize', () => {
  panelManager.exitMaximize();
  return true;
});

ipcMain.handle('panel:refresh-all', () => {
  panelManager.refreshAll();
  return true;
});

ipcMain.handle('panel:refresh-one', (_event, panelId) => {
  panelManager.refreshPanel(panelId);
  return true;
});

ipcMain.handle('panel:focus-number', (_event, number) => {
  panelManager.focusByNumber(Number(number));
  return true;
});

ipcMain.handle('layout:cycle', () => {
  const layout = panelManager.cycleLayout();
  persistPanels();
  return layout;
});

ipcMain.handle('window:set-fullscreen', (_event, enabled) => {
  mainWindow.setFullScreen(Boolean(enabled));
  panelManager.broadcast();
  return mainWindow.isFullScreen();
});

ipcMain.handle('window:close', () => {
  mainWindow.close();
  return true;
});

app.whenReady().then(() => {
  secureDefaults();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  refreshEngine.stopAll();
  fs.unwatchFile(configPath);
});
