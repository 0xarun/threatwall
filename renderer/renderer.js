'use strict';

/* ─── App State ──────────────────────────────────────────────────────────── */
const state = {
  mode:        'setup',
  panels:      [],
  layout:      '2x2',
  fullscreen:  false,
  maximized:   null,
  currentPage: 0,
  totalPages:  1,
  savedPanels: []
};

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const els = {
  topbar:           $('topbar'),
  navSetup:         $('navSetup'),
  navWallboard:     $('navWallboard'),
  tabStrip:         $('tabStrip'),
  tabList:          $('tabList'),
  pageNav:          $('pageNav'),
  pagePrevBtn:      $('pagePrevBtn'),
  pageNextBtn:      $('pageNextBtn'),
  pageDots:         $('pageDots'),
  pageLabel:        $('pageLabel'),
  setupView:        $('setupView'),
  layoutLabel:      $('layoutLabel'),
  addPanelForm:     $('addPanelForm'),
  setupPanelList:   $('setupPanelList'),
  emptyState:       $('emptyState'),
  launchBtn:        $('launchBtn'),
  panelCountBadge:  $('panelCountBadge'),
  layoutSelect:     $('layoutSelect'),
  launchWallboardBtn: $('launchWallboardBtn'),
  addPanelNavBtn:   $('addPanelNavBtn'),
  layoutBtn:        $('layoutBtn'),
  refreshAllBtn:    $('refreshAllBtn'),
  fullscreenBtn:    $('fullscreenBtn'),
  setupNavBtn:      $('setupNavBtn'),
  helpBtn:          $('helpBtn'),
  exitBtn:          $('exitBtn'),
  editDialog:       $('editDialog'),
  editPanelForm:    $('editPanelForm'),
  editPanelId:      $('editPanelId'),
  addDialog:        $('addDialog'),
  addDialogForm:    $('addDialogForm'),
  helpDialog:       $('helpDialog'),
  splitterContainer:$('splitterContainer')
};

let setupPanels = [];
let draggedTabId = null;

/* ─── Utility ────────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtTime(s) {
  const n = Math.max(0, Math.round(s));
  return n >= 60 ? `${Math.floor(n / 60)}m${n % 60 ? `${n % 60}s` : ''}` : `${n}s`;
}
function autoSession(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}
function sanitizeUrl(u) {
  const t = (u || '').trim();
  return /^https?:\/\//i.test(t) ? t : '';
}

/* ─── Page Navigation UI ─────────────────────────────────────────────────── */
function renderPageNav() {
  const { currentPage, totalPages } = state;
  const multiPage = totalPages > 1;

  // Show/hide the whole page nav section
  if (els.pageNav) els.pageNav.classList.toggle('hidden', !multiPage);
  if (!multiPage) return;

  // Label e.g. "2 / 3"
  if (els.pageLabel) els.pageLabel.textContent = `${currentPage + 1} / ${totalPages}`;

  // Dots
  if (els.pageDots) {
    els.pageDots.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('button');
      dot.className = `page-dot${i === currentPage ? ' active' : ''}`;
      dot.title = `Page ${i + 1}`;
      dot.dataset.page = i;
      dot.addEventListener('click', () => window.tw.setPage(i));
      els.pageDots.appendChild(dot);
    }
  }

  // Disable prev/next at boundaries
  if (els.pagePrevBtn) els.pagePrevBtn.disabled = currentPage === 0;
  if (els.pageNextBtn) els.pageNextBtn.disabled = currentPage >= totalPages - 1;
}

/* ─── Mode ───────────────────────────────────────────────────────────────── */
function applyMode(mode) {
  state.mode = mode;
  const isSetup = mode === 'setup';
  els.navSetup.classList.toggle('hidden', !isSetup);
  els.navWallboard.classList.toggle('hidden', isSetup);
  els.setupNavBtn.classList.toggle('hidden', isSetup);
  els.setupView.classList.toggle('hidden', !isSetup);
  els.tabStrip.classList.toggle('hidden', isSetup);
  if (els.splitterContainer) els.splitterContainer.classList.toggle('hidden', isSetup);
}

/* ─── Fullscreen auto-hide topbar ────────────────────────────────────────── */
function applyFullscreen(isFs) {
  state.fullscreen = isFs;
  document.body.classList.toggle('fullscreen', isFs);
}

// Show topbar on mouse approach at top
let _fsHideTimer = null;
let _isFsHovering = false;

document.addEventListener('mousemove', (e) => {
  if (!state.fullscreen || state.mode !== 'wallboard') return;
  const inZone = e.clientY < 6 || (e.clientY < 88 && _isFsHovering); // Keep open while hovering within the 88px block
  
  clearTimeout(_fsHideTimer);
  
  if (inZone && !_isFsHovering) {
    _isFsHovering = true;
    els.topbar.classList.add('fs-visible');
    els.tabStrip.classList.add('fs-visible');
    window.tw.fsHover(true);
  } else if (!inZone && _isFsHovering) {
    _fsHideTimer = setTimeout(() => {
      _isFsHovering = false;
      els.topbar.classList.remove('fs-visible');
      els.tabStrip.classList.remove('fs-visible');
      window.tw.fsHover(false);
    }, 600);
  }
});

/* ─── Smart Tab Renderer ─────────────────────────────────────────────────── */
// Renders tabs without full innerHTML rebuild — avoids flicker/reflow on every broadcast

const _tabCache = new Map(); // panelId → {element, lastKey}

function renderTabs() {
  const list = els.tabList;

  if (state.panels.length === 0) {
    list.innerHTML = '<div class="tab-empty">No panels — click Add Panel</div>';
    _tabCache.clear();
    return;
  }

  // Filter to only show panels assigned to the current page
  const pagePanels = state.panels.filter(p => p.pageIndex === state.currentPage);
  const liveIds = new Set(pagePanels.map((p) => p.id));

  // Remove tabs that are no longer on this page or were deleted
  for (const [id, entry] of _tabCache) {
    if (!liveIds.has(id)) { entry.el.remove(); _tabCache.delete(id); }
  }

  // Build ordered fragment
  pagePanels.forEach((panel, i) => {
    const pct = Math.round((panel.remaining / panel.refresh) * 100);
    const key = `${panel.name}|${panel.status}|${panel.focused}|${panel.maximized}|${panel.remaining}`;

    let entry = _tabCache.get(panel.id);

    if (!entry) {
      // Create fresh tab element
      const el = document.createElement('div');
      el.className = 'tab';
      el.draggable = true;
      el.dataset.id = panel.id;
      el.innerHTML = _tabHTML(panel, pct, i);
      _bindTabEvents(el, panel);
      _tabCache.set(panel.id, { el, lastKey: key });
      entry = { el, lastKey: key };
    } else if (entry.lastKey !== key) {
      // Only update the parts that changed
      const dot = entry.el.querySelector('.tab-dot');
      const timer = entry.el.querySelector('.tab-timer');
      const bar   = entry.el.querySelector('.tab-progress');
      const maxBtn = entry.el.querySelector('.tab-btn.maximize');
      const nameEl = entry.el.querySelector('.tab-name');
      if (dot)    { dot.className = `tab-dot ${panel.status || 'loading'}`; }
      if (timer)  { timer.textContent = fmtTime(panel.remaining); }
      if (bar)    { bar.style.width = `${pct}%`; }
      if (nameEl) { nameEl.textContent = panel.name; nameEl.title = panel.name; }
      if (maxBtn) {
        maxBtn.title = panel.maximized ? 'Restore' : 'Maximize';
        maxBtn.innerHTML = panel.maximized ? _iconRestore() : _iconMaximize();
      }
      entry.el.classList.toggle('focused', panel.focused);
      entry.lastKey = key;
    }

    // Maintain order in DOM
    const inDom = list.children[i];
    if (inDom !== entry.el) list.insertBefore(entry.el, inDom || null);
  });
}

function _tabHTML(panel, pct, i) {
  return `
    <span class="tab-dot ${panel.status || 'loading'}"></span>
    <div class="tab-info">
      <div class="tab-name" title="${esc(panel.name)}">${esc(panel.name)}</div>
      <div class="tab-timer">${fmtTime(panel.remaining)}</div>
    </div>
    <div class="tab-actions">
      <button class="tab-btn maximize" title="${panel.maximized ? 'Restore' : 'Maximize'}">
        ${panel.maximized ? _iconRestore() : _iconMaximize()}
      </button>
      <button class="tab-btn" data-action="refresh" data-id="${panel.id}" title="Refresh">
        ${_iconRefresh()}
      </button>
      <button class="tab-btn remove" data-action="remove" data-id="${panel.id}" title="Remove">
        ${_iconX()}
      </button>
    </div>
    <div class="tab-progress" style="width:${pct}%"></div>`;
}

function _bindTabEvents(el, panel) {
  // Drag-and-drop reorder
  el.addEventListener('dragstart', (e) => {
    draggedTabId = panel.id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => el.classList.add('dragging'), 0);
  });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); draggedTabId = null; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (draggedTabId && draggedTabId !== panel.id) await window.tw.movePanel(draggedTabId, panel.id);
  });

  // Clicks
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      const idx = state.panels.findIndex((p) => p.id === panel.id);
      if (idx >= 0) window.tw.focusPanel(idx + 1);
      return;
    }
    if (btn.dataset.action === 'refresh') window.tw.refreshOne(panel.id);
    else if (btn.dataset.action === 'remove') window.tw.removePanel(panel.id);
  });

  el.querySelector('.tab-btn.maximize')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tw.toggleMaximize(panel.id);
  });
}

// Icons
function _iconRefresh() { return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>`; }
function _iconX()       { return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`; }
function _iconMaximize(){ return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clip-rule="evenodd"/></svg>`; }
function _iconRestore() { return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4a1 1 0 00-1 1v4a1 1 0 002 0V6.414l2.293 2.293a1 1 0 001.414-1.414L7.414 5H9a1 1 0 000-2H5zm10 10a1 1 0 001-1v-4a1 1 0 10-2 0v2.586l-2.293-2.293a1 1 0 00-1.414 1.414L12.586 13H11a1 1 0 100 2h4z" clip-rule="evenodd"/></svg>`; }

/* ─── Splitter Resizers ───────────────────────────────────────────────────── */
// Thin draggable lines between panels for resizing
let _splitterState = null;

function initSplitters() {
  const cont = els.splitterContainer;
  if (!cont) return;
  rebuildSplitters();
}

function rebuildSplitters() {
  const cont = els.splitterContainer;
  if (!cont) return;
  cont.innerHTML = '';
  if (state.mode !== 'wallboard' || state.panels.length < 2) return;

  const def = getLayoutDef(state.layout);
  const cols = def.cols;
  const rows = def.rows;

  if (!_splitterState || !_splitterState.colFractions || _splitterState.colFractions.length !== cols) {
    _splitterState = {
      colFractions: Array(cols).fill(1 / cols),
      rowFractions: Array(rows).fill(1 / rows)
    };
  }

  const TOPBAR = 44 + 44; // topbar + strip

  // Vertical splitters between columns
  for (let c = 1; c < cols; c++) {
    const el = document.createElement('div');
    el.className = 'splitter splitter-v';
    el.style.left = `${_splitterState.colFractions.slice(0, c).reduce((a, b) => a + b, 0) * 100}%`;
    el.style.top  = `${TOPBAR}px`;
    el.style.bottom = '0';
    bindSplitter(el, 'col', c, cols, rows);
    cont.appendChild(el);
  }

  // Horizontal splitters between rows
  for (let r = 1; r < rows; r++) {
    const el = document.createElement('div');
    el.className = 'splitter splitter-h';
    el.style.left  = '0';
    el.style.right = '0';
    const fracAbove = _splitterState.rowFractions.slice(0, r).reduce((a, b) => a + b, 0);
    const topH = TOPBAR + fracAbove * (window.innerHeight - TOPBAR);
    el.style.top = `${topH}px`;
    bindSplitter(el, 'row', r, cols, rows);
    cont.appendChild(el);
  }
}

function bindSplitter(el, axis, idx, cols, rows) {
  let startPos, startFracs;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    startPos = axis === 'col' ? e.clientX : e.clientY;
    startFracs = axis === 'col'
      ? [..._splitterState.colFractions]
      : [..._splitterState.rowFractions];

    const onMove = (e2) => {
      const pos  = axis === 'col' ? e2.clientX : e2.clientY;
      const total = axis === 'col' ? window.innerWidth : (window.innerHeight - (44 + 44));
      const delta = (pos - startPos) / total;
      const fracs = [...startFracs];
      const prev  = fracs[idx - 1];
      const next  = fracs[idx];
      const minF  = 0.1; // minimum 10% per panel
      const newPrev = Math.max(minF, Math.min(prev + next - minF, prev + delta));
      const newNext = prev + next - newPrev;
      fracs[idx - 1] = newPrev;
      fracs[idx]     = newNext;

      if (axis === 'col') _splitterState.colFractions = fracs;
      else                _splitterState.rowFractions = fracs;

      // Reposition this splitter immediately (visual feedback)
      if (axis === 'col') {
        el.style.left = `${fracs.slice(0, idx).reduce((a, b) => a + b, 0) * 100}%`;
      } else {
        const TOPBAR = 44 + 44;
        const fracAbove = fracs.slice(0, idx).reduce((a, b) => a + b, 0);
        el.style.top = `${TOPBAR + fracAbove * (window.innerHeight - TOPBAR)}px`;
      }

      // Send to main for live panel resize
      window.tw.setSizes({ ..._splitterState });
    };

    const onUp = (e3) => {
      el.releasePointerCapture(e3.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup',  onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup',  onUp);
  });
}

function getLayoutDef(layout) {
  const defs = { '1x1':{cols:1,rows:1},'1x2':{cols:2,rows:1},'2x2':{cols:2,rows:2} };
  return defs[layout] || { cols: 2, rows: 2 };
}

/* ─── Setup View ─────────────────────────────────────────────────────────── */
function renderSetupList() {
  const list = els.setupPanelList;
  [...list.querySelectorAll('.setup-panel-item')].forEach((n) => n.remove());
  els.emptyState.classList.toggle('hidden', setupPanels.length > 0);

  setupPanels.forEach((panel, idx) => {
    const item = document.createElement('div');
    item.className = 'setup-panel-item';
    item.draggable = true;
    item.dataset.idx = idx;
    item.innerHTML = `
      <span class="spi-drag">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-6zm0 6a2 2 0 100 4 2 2 0 000-4zm6-12a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z"/>
        </svg>
      </span>
      <span class="spi-dot"></span>
      <div class="spi-info">
        <div class="spi-name">${esc(panel.name)}</div>
        <div class="spi-url" title="${esc(panel.url)}">${esc(panel.url)}</div>
        <div class="spi-meta">Session: ${esc(panel.session)} · ${panel.refresh}s</div>
      </div>
      <div class="spi-actions">
        <button class="spi-btn edit" data-action="edit" data-idx="${idx}" title="Edit">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
        </button>
        <button class="spi-btn del" data-action="del" data-idx="${idx}" title="Remove">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </div>`;

    // Drag-reorder in setup list
    item.addEventListener('dragstart',  (e) => { e.dataTransfer.setData('text/plain', idx); setTimeout(() => item.classList.add('dragging'), 0); });
    item.addEventListener('dragend',    ()  => item.classList.remove('dragging'));
    item.addEventListener('dragover',   (e) => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave',  ()  => item.classList.remove('drag-over'));
    item.addEventListener('drop',       (e) => {
      e.preventDefault(); item.classList.remove('drag-over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (from !== idx) { const [m] = setupPanels.splice(from, 1); setupPanels.splice(idx, 0, m); renderSetupList(); }
    });

    list.appendChild(item);
  });

  els.panelCountBadge.textContent = setupPanels.length;
  els.launchBtn.disabled = setupPanels.length === 0;
  els.launchWallboardBtn.disabled = setupPanels.length === 0;
}

/* ─── Dialogs: push panels out, restore them on close ────────────────────── */
async function openModal(dialog, focusEl) {
  await window.tw.dialogOpen();   // push BrowserViews offscreen
  dialog.showModal();
  focusEl?.focus();
}

function closeModal(dialog) {
  dialog.close();
  window.tw.dialogClose();        // restore BrowserViews
}

// Intercept dialog close via backdrop click or Escape
['editDialog','addDialog','helpDialog'].forEach((id) => {
  const dlg = $(id);
  if (!dlg) return;
  dlg.addEventListener('close', () => window.tw.dialogClose());
});

/* ─── Nav bindings ───────────────────────────────────────────────────────── */
function bindNav() {
  els.addPanelNavBtn.addEventListener('click', () => {
    els.addDialogForm.reset();
    openModal(els.addDialog, els.addDialogForm.querySelector('#ad-name'));
  });
  els.layoutBtn.addEventListener('click', () => window.tw.cycleLayout());
  els.refreshAllBtn.addEventListener('click', () => window.tw.refreshAll());
  els.fullscreenBtn.addEventListener('click', () => window.tw.setFullscreen(!state.fullscreen));
  els.setupNavBtn.addEventListener('click', async () => {
    const cfg = await window.tw.goSetup();
    setupPanels = (cfg.panels || []).map((p) => ({ ...p }));
    state.layout = cfg.layout || state.layout;
    if (els.layoutSelect) els.layoutSelect.value = state.layout;
    renderSetupList();
  });
  els.launchWallboardBtn.addEventListener('click', launchWallboard);
  els.helpBtn.addEventListener('click', () => openModal(els.helpDialog));
  els.exitBtn.addEventListener('click', () => window.tw.closeWindow());
}

/* ─── Setup form ─────────────────────────────────────────────────────────── */
function bindSetup() {
  const form = els.addPanelForm;
  form.querySelector('#f-name').addEventListener('input', (e) => {
    const s = form.querySelector('#f-session');
    if (!s.dataset.touched) s.value = autoSession(e.target.value);
  });
  form.querySelector('#f-session').addEventListener('input', (e) => {
    e.target.dataset.touched = e.target.value ? '1' : '';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const url = sanitizeUrl(d.get('url'));
    if (!url) { alert('Please enter a valid https:// URL'); return; }
    setupPanels.push({
      name:    String(d.get('name')).slice(0, 80),
      url,
      session: String(d.get('session') || autoSession(d.get('name'))).slice(0, 80),
      refresh: Math.max(5, Math.min(3600, Number(d.get('refresh')) || 60))
    });
    form.reset();
    form.querySelector('#f-session').dataset.touched = '';
    renderSetupList();
  });

  els.setupPanelList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    if (btn.dataset.action === 'del')  { setupPanels.splice(idx, 1); renderSetupList(); }
    if (btn.dataset.action === 'edit') openEditSetup(idx);
  });

  els.layoutSelect.addEventListener('change', (e) => { state.layout = e.target.value; });
  els.launchBtn.addEventListener('click', launchWallboard);
}

async function launchWallboard() {
  if (setupPanels.length === 0) return;
  window.tw.dialogClose(); // Guarantee panels pop back onto the screen
  const res = await window.tw.launchWallboard({ layout: state.layout, panels: setupPanels });
  if (!res.ok) alert(`Failed to launch: ${res.error}`);
}

/* ─── Edit panel ─────────────────────────────────────────────────────────── */
function openEditSetup(idx) {
  const p = setupPanels[idx];
  if (!p) return;
  const f = els.editPanelForm;
  els.editPanelId.value           = String(idx);
  f.querySelector('#e-name').value    = p.name;
  f.querySelector('#e-url').value     = p.url;
  f.querySelector('#e-session').value = p.session;
  f.querySelector('#e-refresh').value = p.refresh;
  openModal(els.editDialog, f.querySelector('#e-name'));
}

function bindEditDialog() {
  els.editPanelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f   = els.editPanelForm;
    const url = sanitizeUrl(f.querySelector('#e-url').value);
    if (!url) { alert('Please enter a valid https:// URL'); return; }

    if (state.mode === 'setup') {
      const idx = Number(els.editPanelId.value);
      const p   = setupPanels[idx];
      if (p) {
        p.name = String(f.querySelector('#e-name').value).slice(0, 80);
        p.url  = url;
        p.session = String(f.querySelector('#e-session').value).slice(0, 80);
        p.refresh = Math.max(5, Math.min(3600, Number(f.querySelector('#e-refresh').value) || 60));
        renderSetupList();
      }
    } else {
      window.tw.updatePanel(els.editPanelId.value, {
        name:    f.querySelector('#e-name').value,
        url,
        session: f.querySelector('#e-session').value,
        refresh: Number(f.querySelector('#e-refresh').value)
      });
    }
    closeModal(els.editDialog);
  });
}

/* ─── Add panel dialog (wallboard) ──────────────────────────────────────── */
function bindAddDialog() {
  const form = els.addDialogForm;
  form.querySelector('#ad-name').addEventListener('input', (e) => {
    const s = form.querySelector('#ad-session');
    if (!s.dataset.touched) s.value = autoSession(e.target.value);
  });
  form.querySelector('#ad-session').addEventListener('input', (e) => {
    e.target.dataset.touched = e.target.value ? '1' : '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const url = sanitizeUrl(d.get('url'));
    if (!url) { alert('Please enter a valid https:// URL'); return; }
    await window.tw.addPanel({
      name:    String(d.get('name')).slice(0, 80), url,
      session: String(d.get('session') || autoSession(d.get('name'))).slice(0, 80),
      refresh: Math.max(5, Math.min(3600, Number(d.get('refresh')) || 60))
    });
    form.reset();
    form.querySelector('#ad-session').dataset.touched = '';
    closeModal(els.addDialog);
  });

  // Close buttons that use form[method=dialog] — intercept to also restore panels
  els.addDialog.querySelectorAll('form[method="dialog"] button').forEach((btn) =>
    btn.addEventListener('click', () => { els.addDialog.close(); window.tw.dialogClose(); })
  );
  els.editDialog.querySelectorAll('form[method="dialog"] button').forEach((btn) =>
    btn.addEventListener('click', () => { els.editDialog.close(); window.tw.dialogClose(); })
  );
  els.helpDialog.querySelectorAll('form[method="dialog"] button').forEach((btn) =>
    btn.addEventListener('click', () => { els.helpDialog.close(); window.tw.dialogClose(); })
  );
}

/* ─── Shortcuts (renderer side — when setup form is focused) ────────────── */
function bindShortcuts() {
  window.tw.onShortcut((name) => {
    if (name === 'new-panel' && state.mode === 'wallboard') {
      els.addDialogForm.reset();
      openModal(els.addDialog, els.addDialogForm.querySelector('#ad-name'));
    }
  });
}

/* ─── Layout label ───────────────────────────────────────────────────────── */
function renderLayoutLabel() {
  const pretty = state.layout.replace('x', '×');
  if (els.layoutLabel)  els.layoutLabel.textContent  = pretty;
  if (els.layoutSelect) els.layoutSelect.value        = state.layout;
}

/* ─── State update ────────────────────────────────────────────────────────── */
function applyState(next) {
  let layoutChanged = false;
  if (next.mode        !== undefined && next.mode        !== state.mode)       state.mode       = next.mode;
  if (next.panels      !== undefined)                                           state.panels     = next.panels;
  if (next.layout      !== undefined && next.layout      !== state.layout)    { state.layout     = next.layout; layoutChanged = true; }
  if (next.fullscreen  !== undefined && next.fullscreen  !== state.fullscreen)  applyFullscreen(next.fullscreen);
  if (next.maximized   !== undefined)                                           state.maximized  = next.maximized;
  if (next.currentPage !== undefined)                                           state.currentPage = next.currentPage;
  if (next.totalPages  !== undefined)                                           state.totalPages  = next.totalPages;

  if (state.mode === 'wallboard') {
    renderTabs();
    renderPageNav();
    renderLayoutLabel();
    if (layoutChanged) { _splitterState = null; rebuildSplitters(); }
  }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */
async function bootstrap() {
  window.tw.onBootstrap((data) => {
    if (data.panels)      state.panels      = data.panels;
    if (data.layout)      state.layout      = data.layout;
    if (data.fullscreen)  applyFullscreen(data.fullscreen);
    if (data.maximized)   state.maximized   = data.maximized;
    if (data.currentPage !== undefined) state.currentPage = data.currentPage;
    if (data.totalPages  !== undefined) state.totalPages  = data.totalPages;
    setupPanels = (data.savedPanels || []).map((p) => ({ ...p }));
    if (els.layoutSelect && data.layout) els.layoutSelect.value = data.layout;

    applyMode(data.mode || 'setup');
    renderSetupList();
    renderLayoutLabel();
    if (data.mode === 'wallboard') { renderTabs(); renderPageNav(); initSplitters(); }
  });

  window.tw.onState(applyState);

  window.tw.onMode((mode) => {
    applyMode(mode);
    if (mode === 'wallboard') {
      renderTabs();
      renderPageNav();
      initSplitters();
    } else {
      window.tw.getSavedConfig().then((cfg) => {
        setupPanels     = (cfg.panels || []).map((p) => ({ ...p }));
        state.layout    = cfg.layout || state.layout;
        if (els.layoutSelect) els.layoutSelect.value = state.layout;
        renderSetupList();
        renderLayoutLabel();
      });
    }
  });

  window.tw.onFullscreen(applyFullscreen);

  // Bind page nav buttons
  els.pagePrevBtn?.addEventListener('click', () => window.tw.prevPage());
  els.pageNextBtn?.addEventListener('click', () => window.tw.nextPage());

  bindNav();
  bindSetup();
  bindEditDialog();
  bindAddDialog();
  bindShortcuts();
}

bootstrap();
