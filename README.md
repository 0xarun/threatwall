# ThreatWall 🛡️
**Universal Multi-Dashboard Manager**
<p align="center">
  <i>Simplify your monitoring. Streamline your screens.</i><br>
  Built by <b>Arun Kumar (0xarun)</b>
</p>

---

## 🚀 What is ThreatWall?

ThreatWall is a standalone native desktop application built on Electron that lets you embed, aggregate, and manage multiple web dashboards into single, beautifully crafted "wall-board" grids. 

Whether you are monitoring complex network architecture, tracking live infrastructure health in a Server operations center (NOC), analyzing marketing funnels, or displaying financial metrics on an office TV, ThreatWall gives you granular control over what you display and how you display it. 

No more drowning in 50 active browser tabs or dealing with clunky browser extensions. Add your URL, define your refresh interval, build your layout, and launch. 

## ✨ Key Features

- **Grid Freedom**: Build perfect `1x1`, `1x2`, or `2x2` dashboard grids dynamically.
- **Smart Paging**: Adding more than 4 panels? ThreatWall natively splits your panels into logical background pages, allowing you to instantly hot-swap between multiple 4-panel screens without reloading or refreshing. 
- **Isolated Sessions**: Every panel runs securely in its own isolated browser session. Login to AWS perfectly cleanly 4 separate times on 4 separate accounts. 
- **SSL Error Bypassing**: Perfect for internal networks and secure environments: ThreatWall cleanly bypasses `ERR_CERT_AUTHORITY_INVALID` errors and loads self-signed URLs natively. 
- **Live Splitter Re-sizing**: Effortlessly drag and stretch your layout fractions symmetrically while viewing live data.
- **Auto-Refresh Engine**: Configure hard refresh intervals per-panel (e.g. refresh Grafana every 30s, refresh AWS every 5m) via silent background thread drops. 
- **Zero-Friction Fullscreen (F11)**: Native OS Fullscreen completely auto-hides the Navigation header and tabs, expanding your dashboard to 100% borderless display real estate. Mouse over the top to quickly reveal controls. 

## 📦 Installation & Setup

1. **Clone the Repo**
   ```bash
   git clone https://github.com/0xarun/threatwall.git
   cd threatwall
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Locally in Dev Mode**
   ```bash
   npm start
   ```

## 🔨 Packaging for Production

If you want to package ThreatWall into a portable `.exe` that you can hand to your team or put on a USB stick to run on TVs without needing Node.js:

```bash
npm run build
```
*(The finished native installer & portable executable will appear inside the `dist` or `out` folder)*

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `F11` | Toggle Fullscreen |
| `Esc` | Exit Fullscreen / Restore Panel |
| `Ctrl+Shift+L` | Cycle Grid Layouts (`1x1` → `1x2` → `2x2`) |
| `Ctrl+Shift+R` | Hard Refresh All Panels on Screen |
| `Ctrl+Shift+N` | Open "Add New Panel" Modal on Wallboard |
| `Ctrl+Left/Right` | Swipe Left or Right between Pages |
| `Ctrl+[1-9]` | Quickly target focus to a specific panel |

## 🤝 Need Help?
Inside the application, click the **Help ( ? )** icon in the upper right.


---
Made with ☕ by **[Arun Kumar / 0xarun](https://github.com/0xarun)**
