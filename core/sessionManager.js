const { session } = require('electron');

class SessionManager {
  constructor() {
    this.cache = new Map();
  }

  getPartition(sessionName) {
    const sanitized = String(sessionName || 'default')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');
    return `persist:${sanitized}`;
  }

  getSession(sessionName) {
    const partition = this.getPartition(sessionName);

    if (this.cache.has(partition)) {
      return this.cache.get(partition);
    }

    const ses = session.fromPartition(partition, { cache: true });
    this.hardenSession(ses);
    this.cache.set(partition, ses);
    return ses;
  }

  hardenSession(ses) {
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
  }
}

module.exports = SessionManager;
