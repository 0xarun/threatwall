class LayoutManager {
  static layoutDefinitions = {
    '1x1': { rows: 1, cols: 1 },
    '1x2': { rows: 1, cols: 2 },
    '2x2': { rows: 2, cols: 2 }
  };

  static normalize(layoutName) {
    return this.layoutDefinitions[layoutName] ? layoutName : '2x2';
  }

  static getGeometry(layoutName, width, height, count) {
    const normalized = this.normalize(layoutName);
    const { rows, cols } = this.layoutDefinitions[normalized];
    const maxPanels = Math.min(rows * cols, count);

    if (maxPanels === 0) {
      return [];
    }

    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    const bounds = [];

    for (let index = 0; index < maxPanels; index += 1) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = col * cellWidth;
      const y = row * cellHeight;
      const w = col === cols - 1 ? width - x : cellWidth;
      const h = row === rows - 1 ? height - y : cellHeight;
      bounds.push({ x, y, width: Math.max(w, 0), height: Math.max(h, 0) });
    }

    return bounds;
  }

  static next(layoutName) {
    const keys = Object.keys(this.layoutDefinitions);
    const idx = keys.indexOf(this.normalize(layoutName));
    return keys[(idx + 1) % keys.length];
  }
}

module.exports = LayoutManager;
