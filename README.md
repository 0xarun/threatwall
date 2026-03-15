# ThreatWall – SOC Wallboard Dashboard

ThreatWall is a production-oriented Electron desktop application for SOC teams to monitor multiple security platforms in one efficient wallboard.

## Features

- BrowserView multi-panel monitoring with dynamic layouts (`1x1`, `1x2`, `2x2`, `2x3`, `3x3`, `3x4`)
- Isolated persistent sessions per panel using Electron partitions (`persist:<session>`)
- Per-panel refresh timers + panel-only reloads
- Fast top controls: **New Session / Switch Layout / Exit Panel View / Full Screen / Help**
- Thin tab strip with panel focus, maximize, panel refresh, and remove buttons
- Drag-and-drop tab reorder to move panel positions in the live grid
- Global refresh-all control
- Keyboard-first SOC operation model
- Config persistence and hot-reload from `config/panels.json`

## Project Structure

```text
project-root/
├── package.json
├── main.js
├── preload.js
├── config/
│   └── panels.json
├── core/
│   ├── panelManager.js
│   ├── layoutManager.js
│   ├── sessionManager.js
│   └── refreshEngine.js
├── renderer/
│   ├── index.html
│   ├── renderer.js
│   └── styles.css
└── assets/
    ├── icons/
    └── logo/
```

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

## Build

```bash
npm run build
```

Build targets:
- Windows Portable EXE
- Windows NSIS installer

## Keyboard Shortcuts

- `F` → Toggle fullscreen
- `ESC` → Exit fullscreen and exit maximized panel
- `1-9` → Focus panel by index
- `R` → Refresh all panels
- `Ctrl+N` → Focus quick add form
- `Ctrl+D` → Remove last panel
- `Ctrl+L` → Switch layout

## Security Posture

- `nodeIntegration: false` and `contextIsolation: true`
- `sandbox: true` for window and panel contexts
- Permission request denial for panel sessions
- URL sanitization and bounded refresh interval validation
- New windows blocked via `setWindowOpenHandler`
