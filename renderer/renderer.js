const state = {
  panels: [],
  layout: '2x2',
  fullscreen: false
};

const panelCards = document.getElementById('panelCards');
const dialog = document.getElementById('panelDialog');
const panelForm = document.getElementById('panelForm');

function render() {
  panelCards.innerHTML = '';

  for (const [index, panel] of state.panels.entries()) {
    const card = document.createElement('article');
    card.className = `card ${panel.focused ? 'focused' : ''}`;

    card.innerHTML = `
      <div class="card-head">
        <strong>${panel.name}</strong>
        <span class="badge">● online</span>
      </div>
      <div class="meta">Session: ${panel.session}</div>
      <div class="meta">Refresh: ${panel.refresh}s (${panel.remaining}s remaining)</div>
      <div class="meta">Shortcut: ${index + 1}</div>
      <div class="actions">
        <button data-action="focus" data-id="${index + 1}">Focus</button>
        <button data-action="max" data-id="${panel.id}">${panel.maximized ? 'Restore' : 'Maximize'}</button>
        <button data-action="remove" data-id="${panel.id}">Remove</button>
      </div>
    `;

    panelCards.appendChild(card);
  }
}

function bindActions() {
  document.body.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.id === 'layoutBtn') {
      await window.threatwall.cycleLayout();
      return;
    }

    if (target.id === 'refreshBtn') {
      await window.threatwall.refreshAll();
      return;
    }

    if (target.id === 'fullscreenBtn') {
      await window.threatwall.setFullscreen(!state.fullscreen);
      return;
    }

    if (target.dataset.action === 'focus') {
      await window.threatwall.focusPanel(Number(target.dataset.id));
    }

    if (target.dataset.action === 'max') {
      await window.threatwall.toggleMaximize(target.dataset.id);
    }

    if (target.dataset.action === 'remove') {
      await window.threatwall.removePanel(target.dataset.id);
    }
  });
}

function bindShortcuts() {
  window.addEventListener('keydown', async (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      dialog.showModal();
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
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      await window.threatwall.focusPanel(Number(event.key));
    }
  });
}

function bindDialog() {
  document.getElementById('cancelDialog').addEventListener('click', () => dialog.close());

  panelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(panelForm);

    await window.threatwall.addPanel({
      name: String(formData.get('name')),
      url: String(formData.get('url')),
      refresh: Number(formData.get('refresh')),
      session: String(formData.get('session'))
    });

    panelForm.reset();
    dialog.close();
  });
}

window.threatwall.onState((nextState) => {
  Object.assign(state, nextState);
  render();
});

async function bootstrap() {
  Object.assign(state, await window.threatwall.getState());
  render();
  bindActions();
  bindShortcuts();
  bindDialog();
}

bootstrap();
