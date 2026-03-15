const state = {
  panels: [],
  layout: '2x2',
  fullscreen: false,
  maximized: null
};

const tabStrip = document.getElementById('tabStrip');
const quickAddForm = document.getElementById('quickAddForm');
const layoutText = document.getElementById('layoutText');
const fullscreenText = document.getElementById('fullscreenText');
const panelCountText = document.getElementById('panelCountText');
const helpDialog = document.getElementById('helpDialog');

let draggedPanelId = null;

function renderTabs() {
  tabStrip.innerHTML = '';

  if (state.panels.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab';
    empty.innerHTML = '<div class="tab-title">No panels yet. Add your first SOC dashboard.</div>';
    tabStrip.appendChild(empty);
    return;
  }

  for (const [index, panel] of state.panels.entries()) {
    const tab = document.createElement('article');
    tab.className = `tab ${panel.focused ? 'focused' : ''}`;
    tab.setAttribute('draggable', 'true');
    tab.dataset.panelId = panel.id;

    tab.innerHTML = `
      <div class="tab-head">
        <div class="tab-title" title="${panel.name}">${index + 1}. ${panel.name}</div>
        <div class="tab-actions">
          <button class="icon-btn" data-action="refresh" data-id="${panel.id}" title="Refresh panel">↻</button>
          <button class="icon-btn" data-action="remove" data-id="${panel.id}" title="Remove panel">✕</button>
        </div>
      </div>
      <div class="tab-meta">
        <span>${panel.session}</span>
        <span>${panel.remaining}s</span>
      </div>
      <div class="tab-actions">
        <button class="icon-btn" data-action="focus" data-id="${index + 1}">Focus</button>
        <button class="icon-btn" data-action="maximize" data-id="${panel.id}">${panel.maximized ? 'Restore' : 'Max'}</button>
      </div>
    `;

    tabStrip.appendChild(tab);
  }
}

function renderStatus() {
  layoutText.textContent = state.layout;
  fullscreenText.textContent = state.fullscreen ? 'Enabled' : 'Disabled';
  panelCountText.textContent = String(state.panels.length);
}

function render() {
  renderTabs();
  renderStatus();
}

function onTabAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'refresh') {
    window.threatwall.refreshOne(id);
  } else if (action === 'remove') {
    window.threatwall.removePanel(id);
  } else if (action === 'focus') {
    window.threatwall.focusPanel(Number(id));
  } else if (action === 'maximize') {
    window.threatwall.toggleMaximize(id);
  }
}

function bindButtons() {
  document.body.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.dataset.action) {
      onTabAction(target);
      return;
    }

    if (target.id === 'newSessionBtn') {
      quickAddForm.name.focus();
    } else if (target.id === 'switchLayoutBtn') {
      window.threatwall.cycleLayout();
    } else if (target.id === 'exitMaxBtn') {
      window.threatwall.exitMaximize();
      window.threatwall.setFullscreen(false);
    } else if (target.id === 'fullscreenBtn') {
      window.threatwall.setFullscreen(!state.fullscreen);
    } else if (target.id === 'refreshAllBtn') {
      window.threatwall.refreshAll();
    } else if (target.id === 'helpBtn') {
      helpDialog.showModal();
    }
  });
}

function bindQuickAdd() {
  quickAddForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(quickAddForm);

    await window.threatwall.addPanel({
      name: String(formData.get('name')),
      url: String(formData.get('url')),
      refresh: Number(formData.get('refresh')),
      session: String(formData.get('session'))
    });

    quickAddForm.reset();
  });
}

function bindDnD() {
  tabStrip.addEventListener('dragstart', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tab = target.closest('.tab');
    if (!(tab instanceof HTMLElement)) {
      return;
    }

    draggedPanelId = tab.dataset.panelId;
  });

  tabStrip.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  tabStrip.addEventListener('drop', async (event) => {
    event.preventDefault();
    const target = event.target;
    if (!(target instanceof HTMLElement) || !draggedPanelId) {
      return;
    }

    const targetTab = target.closest('.tab');
    if (!(targetTab instanceof HTMLElement) || !targetTab.dataset.panelId) {
      draggedPanelId = null;
      return;
    }

    const targetPanelId = targetTab.dataset.panelId;
    if (draggedPanelId !== targetPanelId) {
      await window.threatwall.movePanel(draggedPanelId, targetPanelId);
    }

    draggedPanelId = null;
  });
}

function bindShortcuts() {
  window.addEventListener('keydown', async (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      quickAddForm.name.focus();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      const last = state.panels[state.panels.length - 1];
      if (last) {
        await window.threatwall.removePanel(last.id);
      }
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      await window.threatwall.cycleLayout();
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      await window.threatwall.refreshAll();
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      await window.threatwall.setFullscreen(!state.fullscreen);
      return;
    }

    if (event.key === 'Escape') {
      await window.threatwall.setFullscreen(false);
      await window.threatwall.exitMaximize();
      if (helpDialog.open) {
        helpDialog.close();
      }
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      await window.threatwall.focusPanel(Number(event.key));
    }
  });
}

window.threatwall.onState((nextState) => {
  Object.assign(state, nextState);
  render();
});

async function bootstrap() {
  Object.assign(state, await window.threatwall.getState());
  render();
  bindButtons();
  bindQuickAdd();
  bindDnD();
  bindShortcuts();
}

bootstrap();
