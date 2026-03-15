'use strict';

const { BrowserView, app } = require('electron');
const LayoutManager = require('./layoutManager');

const TOPBAR_H = 44;   // main top bar
const STRIP_H  = 44;   // tab + page strip

class PanelManager {
  constructor(mainWindow, sessionManager, refreshEngine, sendState) {
    this.mainWindow     = mainWindow;
    this.sessionManager = sessionManager;
    this.refreshEngine  = refreshEngine;
    this._sendState     = sendState;
    this.panels         = [];
    this.layout         = '2x2';
    this.focusedId      = null;
    this.maximizedId    = null;
    this._currentPage   = 0;
    this._loadStates    = new Map();
    this._customSizes   = null;
    this._offscreen     = false;
    this.mainWindow.setMaxListeners(100);
  }

  /* ── Page helpers ──────────────────────────────────────────────────────── */
  get pageSize() {
    const def = LayoutManager.layoutDefinitions[LayoutManager.normalize(this.layout)];
    return def ? (def.cols * def.rows) : 4;
  }

  get totalPages() { return Math.max(1, Math.ceil(this.panels.length / this.pageSize)); }
  get currentPage() { return this._currentPage; }

  setPage(n) {
    const p = Math.max(0, Math.min(this.totalPages - 1, n));
    if (p === this._currentPage) return;
    this._currentPage = p;
    this._applyLayout();
    this.broadcast();
  }
  nextPage() { this.setPage(this._currentPage + 1); }
  prevPage() { this.setPage(this._currentPage - 1); }

  /* ── Page-aware panel slice ─────────────────────────────────────────────── */
  _pageSlice(pageIndex) {
    const start = pageIndex * this.pageSize;
    return this.panels.slice(start, start + this.pageSize);
  }

  /* ── Public panel CRUD ──────────────────────────────────────────────────── */
  loadPanels(layoutName, configs) {
    const newLayout = LayoutManager.normalize(layoutName);
    const configSig = JSON.stringify(configs.map((c) => `${c.name}|${c.url}|${c.session}|${c.refresh}`));
    const oldSig    = JSON.stringify(this.panels.map((p) => `${p.name}|${p.url}|${p.session}|${p.refresh}`));
    const same = newLayout === this.layout && configSig === oldSig && this.panels.length === configs.length;
    if (same) { this._applyLayout(); this.broadcast(); return; }

    this._clear();
    this.layout       = newLayout;
    this._customSizes = null;
    this._currentPage = 0;
    this.panels       = configs.map((cfg, i) => this._createPanel(cfg, i));
    this._applyLayout();
    this.broadcast();
  }

  addPanel(config) {
    const panel = this._createPanel(config, this.panels.length);
    this.panels.push(panel);
    // Automatically navigate to the page containing the new panel
    this._currentPage = Math.floor((this.panels.length - 1) / this.pageSize);
    this._customSizes = null;
    this._applyLayout();
    this.broadcast();
  }

  removePanel(panelId) {
    const idx = this.panels.findIndex((p) => p.id === panelId);
    if (idx === -1) return;
    const [panel] = this.panels.splice(idx, 1);
    this._destroyPanel(panel);
    if (this.maximizedId === panelId) this.maximizedId = null;
    if (this.focusedId   === panelId) this.focusedId   = null;
    // Clamp page to valid range
    this._currentPage = Math.min(this._currentPage, Math.max(0, this.totalPages - 1));
    this._customSizes = null;
    this._applyLayout();
    this.broadcast();
  }

  updatePanel(panelId, partial) {
    const panel = this.panels.find((p) => p.id === panelId);
    if (!panel) return;
    if (partial.name)    panel.name    = String(partial.name).slice(0, 80);
    if (partial.refresh) panel.refresh = Math.max(5, Math.min(3600, Number(partial.refresh)));
    if (partial.url) {
      const url = String(partial.url).trim();
      if (/^https?:\/\//i.test(url)) {
        panel.url = url;
        if (!panel.view.webContents.isDestroyed()) panel.view.webContents.loadURL(url).catch(() => {});
      }
    }
    this.refreshEngine.stop(panel.id);
    this.refreshEngine.start(panel.id, panel.refresh, () => {
      if (!panel.view.webContents.isDestroyed()) panel.view.webContents.reloadIgnoringCache();
    });
    this.broadcast();
  }

  movePanel(panelId, targetId) {
    const si = this.panels.findIndex((p) => p.id === panelId);
    const ti = this.panels.findIndex((p) => p.id === targetId);
    if (si === -1 || ti === -1 || si === ti) return;
    const [moved] = this.panels.splice(si, 1);
    this.panels.splice(ti, 0, moved);
    this._applyLayout();
    this.broadcast();
  }

  cycleLayout() {
    const firstIdx = this._currentPage * this.pageSize;
    this.layout       = LayoutManager.next(this.layout);
    this._currentPage = Math.min(Math.floor(firstIdx / this.pageSize), this.totalPages - 1);
    this.maximizedId  = null;
    this._customSizes = null;
    this._applyLayout();
    this.broadcast();
    return this.layout;
  }

  setLayout(name) {
    const n = LayoutManager.normalize(name);
    if (n === this.layout && !this._customSizes) return this.layout;
    const firstIdx = this._currentPage * this.pageSize;
    this.layout       = n;
    this._currentPage = Math.min(Math.floor(firstIdx / this.pageSize), this.totalPages - 1);
    this.maximizedId  = null;
    this._customSizes = null;
    this._applyLayout();
    this.broadcast();
    return this.layout;
  }

  toggleMaximize(panelId) {
    this.maximizedId = this.maximizedId === panelId ? null : panelId;
    this._applyLayout();
    this.broadcast();
  }

  exitMaximize() {
    if (!this.maximizedId) return;
    this.maximizedId = null;
    this._applyLayout();
    this.broadcast();
  }

  focusByNumber(n) {
    // Focus within current page
    const pageStart = this._currentPage * this.pageSize;
    const panel = this.panels[pageStart + n - 1];
    if (!panel) return;
    panel.view.webContents.focus();
    this.focusedId = panel.id;
    this.broadcast();
  }

  refreshAll() {
    this.panels.forEach((p) => {
      if (!p.view.webContents.isDestroyed()) p.view.webContents.reloadIgnoringCache();
    });
  }

  refreshPanel(panelId) {
    const panel = this.panels.find((p) => p.id === panelId);
    if (!panel || panel.view.webContents.isDestroyed()) return;
    panel.view.webContents.reloadIgnoringCache();
  }

  /* ── Splitter ──────────────────────────────────────────────────────────── */
  setSizes(sizes) {
    this._customSizes = sizes;
    this._applyLayout();
  }

  /* ── Dialog visibility ─────────────────────────────────────────────────── */
  pushOffscreen() {
    this._offscreen = true;
    this.panels.forEach((p) => p.view.setBounds({ x: 0, y: -9999, width: 1, height: 1 }));
  }

  popOffscreen() {
    this._offscreen = false;
    this._applyLayout();
  }

  resize() {
    if (!this._offscreen) this._applyLayout();
  }

  clear() { this._clear(); this.broadcast(); }

  getPublicPanels() {
    const timers = this.refreshEngine.getState();
    return this.panels.map((p, i) => ({
      id:         p.id,
      name:       p.name,
      url:        p.url,
      refresh:    p.refresh,
      session:    p.session,
      focused:    p.id === this.focusedId,
      maximized:  p.id === this.maximizedId,
      remaining:  timers[p.id]?.remaining ?? p.refresh,
      status:     this._loadStates.get(p.id) ?? 'loading',
      pageIndex:  Math.floor(i / this.pageSize),     // which page this panel is on
      slotIndex:  i % this.pageSize                  // position within its page
    }));
  }

  broadcast() {
    this._sendState({
      layout:      this.layout,
      panels:      this.getPublicPanels(),
      fullscreen:  this.mainWindow.isFullScreen(),
      maximized:   this.maximizedId,
      currentPage: this._currentPage,
      totalPages:  this.totalPages
    });
  }

  /* ── Private ────────────────────────────────────────────────────────────── */
  _createPanel(config, index) {
    const panelId = `p-${Date.now()}-${index}`;
    const ses     = this.sessionManager.getSession(config.session);

    const view = new BrowserView({
      webPreferences: {
        session:                     ses,
        nodeIntegration:             false,
        contextIsolation:            true,
        sandbox:                     true,
        webSecurity:                 false,
        allowRunningInsecureContent: true,
        backgroundThrottling:        false,
        javascript:                  true,
        images:                      true,
        devTools:                    !app.isPackaged
      }
    });

    view.webContents.setMaxListeners(30);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this._loadStates.set(panelId, 'loading');
    view.webContents.on('did-start-loading', () => this._setLoadState(panelId, 'loading'));
    view.webContents.on('did-finish-load',   () => this._setLoadState(panelId, 'ok'));
    view.webContents.on('did-fail-load', (_e, code) => {
      if (code !== -3) this._setLoadState(panelId, 'error');
    });
    view.webContents.on('certificate-error', (_e, _u, _err, _cert, cb) => cb(true));

    view.webContents.loadURL(config.url).catch(() => {});
    this.mainWindow.addBrowserView(view);

    const panel = {
      id: panelId, name: config.name, url: config.url,
      refresh: Number(config.refresh || 60), session: config.session, view
    };

    this.refreshEngine.start(panel.id, panel.refresh, () => {
      if (!view.webContents.isDestroyed()) view.webContents.reloadIgnoringCache();
    });

    return panel;
  }

  _destroyPanel(panel) {
    this.refreshEngine.stop(panel.id);
    this._loadStates.delete(panel.id);
    try { this.mainWindow.removeBrowserView(panel.view); } catch { /* ok */ }
    try { if (!panel.view.webContents.isDestroyed()) panel.view.webContents.destroy(); } catch { /* ok */ }
  }

  _setLoadState(panelId, st) {
    if (this._loadStates.get(panelId) === st) return;
    this._loadStates.set(panelId, st);
    this.broadcast();
  }

  _clear() {
    this.refreshEngine.stopAll();
    this.panels.forEach((p) => this._destroyPanel(p));
    this.panels       = [];
    this.focusedId    = null;
    this.maximizedId  = null;
    this._currentPage = 0;
    this._loadStates.clear();
    this._offscreen   = false;
  }

  /* ── Layout: only current page panels are visible ──────────────────────── */
  _applyLayout() {
    if (this._offscreen) return;
    if (this.maximizedId) { this._applyMaximized(); return; }

    const { width, height } = this.mainWindow.getContentBounds();
    const isFS = this.mainWindow.isFullScreen();
    // 2px gap ensures the main HTML window can still detect the mouse hitting the top edge!
    const topH = (isFS && !this._isFsHovering) ? 2 : TOPBAR_H + STRIP_H;
    const usableH = Math.max(0, height - topH);

    const currentSlice = this._pageSlice(this._currentPage);

    this.panels.forEach((panel) => {
      const slotIdx = currentSlice.indexOf(panel);
      if (slotIdx === -1) {
        // Not on current page — hide (but keep alive for refresh)
        panel.view.setBounds({ x: 0, y: -2000, width: 1, height: 1 });
        return;
      }

      if (this._customSizes) {
        this._applyCustomSlot(panel.view, slotIdx, width, usableH, topH, currentSlice.length);
      } else {
        const bounds = LayoutManager.getGeometry(this.layout, width, usableH, currentSlice.length);
        const rect   = bounds[slotIdx];
        if (!rect) { panel.view.setBounds({ x: 0, y: topH, width: 0, height: 0 }); return; }
        panel.view.setBounds({ x: rect.x, y: rect.y + topH, width: rect.width, height: rect.height });
        panel.view.setAutoResize({ width: true, height: true });
      }
    });
  }

  _applyMaximized() {
    const { width, height } = this.mainWindow.getContentBounds();
    const isFS = this.mainWindow.isFullScreen();
    const topH = (isFS && !this._isFsHovering) ? 2 : TOPBAR_H + STRIP_H;
    this.panels.forEach((p) => {
      if (p.id === this.maximizedId) {
        p.view.setBounds({ x: 0, y: topH, width, height: Math.max(0, height - topH) });
      } else {
        p.view.setBounds({ x: 0, y: -2000, width: 1, height: 1 });
      }
    });
  }

  _applyCustomSlot(view, slotIdx, totalW, totalH, topOffset, count) {
    const def = LayoutManager.layoutDefinitions[LayoutManager.normalize(this.layout)];
    const cols = def.cols;
    const rows = def.rows;
    const cs   = this._customSizes || {};
    const colFracs = (cs.colFractions?.length === cols) ? cs.colFractions : Array(cols).fill(1 / cols);
    const rowFracs = (cs.rowFractions?.length === rows) ? cs.rowFractions : Array(rows).fill(1 / rows);
    const col = slotIdx % cols;
    const row = Math.floor(slotIdx / cols);
    const x   = Math.round(colFracs.slice(0, col).reduce((a, b) => a + b, 0) * totalW);
    const y   = Math.round(rowFracs.slice(0, row).reduce((a, b) => a + b, 0) * totalH);
    const w   = Math.round(colFracs[col] * totalW);
    const h   = Math.round(rowFracs[row] * totalH);
    view.setBounds({ x, y: y + topOffset, width: w, height: h });
    view.setAutoResize({ width: false, height: false });
  }
}

module.exports = PanelManager;
