# ThreatWall – SOC Wallboard Dashboard

ThreatWall is a production-oriented Electron desktop application for SOC teams to monitor multiple security platforms in a single, lightweight wallboard application.

## Features

- Multi-panel layouts (`1x1`, `1x2`, `2x2`, `2x3`, `3x3`, `3x4`)
- Dedicated Electron persistent session partition per panel
- Per-panel refresh timers with isolated reload behavior
- Keyboard-first operations for wallboard workflows
- Dark SOC-friendly control plane UI
- Config persistence via `config/panels.json`
- Config hot-reload support
- Packaging with `electron-builder` for Windows Portable + NSIS installer

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

## Run (development)

```bash
npm start
```

## Build (Windows)

```bash
npm run build
```

Build output includes:
- Portable EXE
- NSIS installer

## Keyboard Shortcuts

- `F` → Toggle fullscreen
- `ESC` → Exit fullscreen
- `1-9` → Focus panel by index
- `R` → Refresh all panels
- `Ctrl+N` → Add panel
- `Ctrl+D` → Remove last panel
- `Ctrl+L` → Change layout

## Example Panel Config

See `config/panels.json`.

## Security Posture

- `nodeIntegration: false` in BrowserViews
- `contextIsolation: true`
- `sandbox: true`
- URL sanitization and refresh/session bounds validation
- New windows blocked via `setWindowOpenHandler`
