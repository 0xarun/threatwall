const { BrowserView } = require('electron');
const LayoutManager = require('./layoutManager');

class PanelManager {
  constructor(mainWindow, sessionManager, refreshEngine, sendState) {
    this.mainWindow = mainWindow;
    this.sessionManager = sessionManager;
    this.refreshEngine = refreshEngine;
    this.sendState = sendState;
    this.panels = [];
    this.layout = '2x2';
    this.focusedId = null;
    this.maximizedId = null;
  }

  loadPanels(layoutName, configs) {
    this.clear();
    this.layout = LayoutManager.normalize(layoutName);
    this.panels = configs.map((config, index) => this.createPanel(config, index));
    this.applyLayout();
    this.broadcast();
  }

  createPanel(config, index) {
    const panelId = `panel-${Date.now()}-${index}`;
    const ses = this.sessionManager.getSession(config.session);

    const view = new BrowserView({
      webPreferences: {
        session: ses,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        preload: undefined,
        backgroundThrottling: false,
        javascript: true,
        images: true,
        devTools: true
      }
    });

    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.loadURL(config.url).catch(() => {});
    this.mainWindow.addBrowserView(view);

    const panel = {
      id: panelId,
      name: config.name,
      url: config.url,
      refresh: Number(config.refresh || 60),
      session: config.session,
      view
    };

    this.refreshEngine.start(panel.id, panel.refresh, () => {
      if (!view.webContents.isDestroyed()) {
        view.webContents.reloadIgnoringCache();
      }
    });

    return panel;
  }

  applyLayout() {
    if (this.maximizedId) {
      this.applyMaximized();
      return;
    }

    const { width, height } = this.mainWindow.getContentBounds();
    const bounds = LayoutManager.getGeometry(this.layout, width, height, this.panels.length);

    this.panels.forEach((panel, index) => {
      const rect = bounds[index];
      if (!rect) {
        panel.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        return;
      }

      panel.view.setBounds(rect);
      panel.view.setAutoResize({ width: true, height: true });
    });
  }

  applyMaximized() {
    const target = this.panels.find((panel) => panel.id === this.maximizedId);
    const { width, height } = this.mainWindow.getContentBounds();

    this.panels.forEach((panel) => {
      if (panel.id === target?.id) {
        panel.view.setBounds({ x: 0, y: 0, width, height });
      } else {
        panel.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    });
  }

  resize() {
    this.applyLayout();
  }

  clear() {
    this.refreshEngine.stopAll();
    this.panels.forEach((panel) => {
      if (!panel.view.webContents.isDestroyed()) {
        panel.view.webContents.destroy();
      }
      this.mainWindow.removeBrowserView(panel.view);
    });
    this.panels = [];
    this.focusedId = null;
    this.maximizedId = null;
  }

  addPanel(config) {
    const panel = this.createPanel(config, this.panels.length);
    this.panels.push(panel);
    this.applyLayout();
    this.broadcast();
  }

  removePanel(panelId) {
    const idx = this.panels.findIndex((panel) => panel.id === panelId);
    if (idx === -1) {
      return;
    }

    const [panel] = this.panels.splice(idx, 1);
    this.refreshEngine.stop(panel.id);
    this.mainWindow.removeBrowserView(panel.view);
    panel.view.webContents.destroy();

    if (this.maximizedId === panel.id) {
      this.maximizedId = null;
    }

    if (this.focusedId === panel.id) {
      this.focusedId = null;
    }

    this.applyLayout();
    this.broadcast();
  }

  movePanel(panelId, targetId) {
    const sourceIndex = this.panels.findIndex((panel) => panel.id === panelId);
    const targetIndex = this.panels.findIndex((panel) => panel.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
      return;
    }

    const [moved] = this.panels.splice(sourceIndex, 1);
    this.panels.splice(targetIndex, 0, moved);
    this.applyLayout();
    this.broadcast();
  }

  focusByNumber(n) {
    const index = n - 1;
    const panel = this.panels[index];
    if (!panel) {
      return;
    }

    panel.view.webContents.focus();
    this.focusedId = panel.id;
    this.broadcast();
  }

  refreshAll() {
    this.panels.forEach((panel) => {
      if (!panel.view.webContents.isDestroyed()) {
        panel.view.webContents.reloadIgnoringCache();
      }
    });
  }

  refreshPanel(panelId) {
    const panel = this.panels.find((entry) => entry.id === panelId);
    if (!panel || panel.view.webContents.isDestroyed()) {
      return;
    }

    panel.view.webContents.reloadIgnoringCache();
  }

  cycleLayout() {
    this.layout = LayoutManager.next(this.layout);
    this.maximizedId = null;
    this.applyLayout();
    this.broadcast();
    return this.layout;
  }

  toggleMaximize(panelId) {
    this.maximizedId = this.maximizedId === panelId ? null : panelId;
    this.applyLayout();
    this.broadcast();
  }

  exitMaximize() {
    this.maximizedId = null;
    this.applyLayout();
    this.broadcast();
  }

  getPublicPanels() {
    const timers = this.refreshEngine.getState();
    return this.panels.map((panel) => ({
      id: panel.id,
      name: panel.name,
      url: panel.url,
      refresh: panel.refresh,
      session: panel.session,
      focused: panel.id === this.focusedId,
      maximized: panel.id === this.maximizedId,
      remaining: timers[panel.id]?.remaining ?? panel.refresh
    }));
  }

  broadcast() {
    this.sendState({
      layout: this.layout,
      panels: this.getPublicPanels(),
      fullscreen: this.mainWindow.isFullScreen(),
      maximized: this.maximizedId
    });
  }
}

module.exports = PanelManager;
