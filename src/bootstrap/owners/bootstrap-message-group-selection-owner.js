import {
  buildMessageGroupOwnerNotReadyError,
  getBootstrapMessageGroupService,
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
  resolveQueryTransportMessageGroupSelection,
} from '../shared/message-group-selection.js';

class BootstrapMessageGroupSelectionOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getMessageGroupServices() {
    return this.delegates.getMessageGroupServices?.() || null;
  }

  resolveOperationalMessageGroupSelection(options = {}) {
    return resolveOperationalMessageGroupSelection(
      this.getMessageGroupServices(),
      options,
    );
  }

  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    return resolveOperationalMessageGroupSelectionAsync(
      this.getMessageGroupServices(),
      options,
    );
  }

  resolveQueryTransportMessageGroupSelection() {
    return resolveQueryTransportMessageGroupSelection(
      this.getMessageGroupServices(),
    );
  }

  getBootstrapMessageGroupService() {
    return getBootstrapMessageGroupService(
      this.getMessageGroupServices(),
    );
  }

  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    return buildMessageGroupOwnerNotReadyError(selection, options);
  }
}

export {BootstrapMessageGroupSelectionOwner};
