class RefreshEngine {
  constructor() {
    this.timers = new Map();
  }

  start(panelId, intervalSeconds, onRefresh) {
    this.stop(panelId);

    const interval = Math.max(5, Number(intervalSeconds || 60));
    const state = {
      remaining: interval,
      interval,
      timer: null
    };

    state.timer = setInterval(() => {
      state.remaining -= 1;
      if (state.remaining <= 0) {
        state.remaining = state.interval;
        onRefresh();
      }
    }, 1000);

    this.timers.set(panelId, state);
  }

  stop(panelId) {
    const existing = this.timers.get(panelId);
    if (!existing) {
      return;
    }

    clearInterval(existing.timer);
    this.timers.delete(panelId);
  }

  stopAll() {
    for (const panelId of this.timers.keys()) {
      this.stop(panelId);
    }
  }

  getState() {
    const snapshot = {};
    for (const [id, state] of this.timers.entries()) {
      snapshot[id] = {
        remaining: state.remaining,
        interval: state.interval
      };
    }
    return snapshot;
  }
}

module.exports = RefreshEngine;
