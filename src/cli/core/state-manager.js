const LOCAL_NUM_10 = 10;
const LOCAL_STR_DISCONNECTED = 'disconnected';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_HOME = 'Home';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_ASC = 'asc';
const LOCAL_NUM_5000 = 5000;
const LOCAL_STR_DEFAULT = 'default';
const LOCAL_STR_STATE_CHANGED = 'state:changed';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_DESC = 'desc';
const LOCAL_NUM_1000 = 1000;
const LOCAL_STR_STATE_SNAPSHOT = 'state:snapshot';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_STATE_RESTORED = 'state:restored';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STATE_RESET = 'state:reset';
const LOCAL_STR_1CRED = 'EventBus required for subscriptions';

/**
 * StateManager - Centralized state management with immutable snapshots
 * Single source of truth for all application state
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */

/**
 * @typedef {Object} AppState
 * @property {string} connectionStatus - Connection status string
 * @property {Object} navigation - Navigation state
 * @property {Object} cache - Cache data
 * @property {Object} ui - UI state
 * @property {Object} config - Configuration
 */

/**
 * Valid connection statuses
 */
const VALID_CONNECTION_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
  'failed',
];

/**
 * Valid view names
 */
const VALID_VIEWS = [
  'nodes',
  'services',
  'replicas',
  'tables',
  'partitions',
  'message_groups',
  'sql',
  'logs',
  'config',
  'contexts',
];

export class StateManager {
  /**
   * @param {import('./event-bus.js').EventBus} eventBus - Event bus for notifications
   * @param {Object} options - Configuration options
   */
  constructor(eventBus, options = {}) {
    this.eventBus = eventBus;
    this.options = options;

    /** @type {AppState} */
    this.state = this.getInitialState();

    /** @type {AppState[]} */
    this.snapshots = [];
    this.maxSnapshots = options.maxSnapshots || LOCAL_NUM_10;
  }

  /**
   * Get initial application state
   * @returns {AppState}
   */
  getInitialState() {
    return {
      connectionStatus: LOCAL_STR_DISCONNECTED,
      nodeAddress: null,
      navigation: {
        currentView: LOCAL_STR_NODES,
        context: null,
        stack: [],
        breadcrumb: LOCAL_STR_HOME,
      },
      cache: {
        nodes: [],
        services: [],
        tables: [],
        partitions: [],
        messageGroups: [],
        logs: [],
        config: [],
        contexts: [],
        lastUpdate: null,
        cdcLag: LOCAL_NUM_ZERO,
      },
      ui: {
        selectedIndex: LOCAL_NUM_ZERO,
        filter: LOCAL_STR_EMPTY,
        sortColumn: null,
        sortDirection: LOCAL_STR_ASC,
        detailPanelVisible: false,
        helpVisible: false,
        commandMode: false,
      },
      config: {
        refreshInterval: LOCAL_NUM_5000,
        defaultView: LOCAL_STR_NODES,
        colorScheme: LOCAL_STR_DEFAULT,
        readOnlyMode: false,
      },
    };
  }

  /**
   * Get current state (read-only copy)
   * @returns {AppState}
   */
  getState() {
    return this.deepClone(this.state);
  }

  /**
   * Get a specific part of the state
   * @param {string} path - Dot-separated path (e.g., 'navigation.currentView')
   * @returns {*}
   */
  get(path) {
    const parts = path.split('.');
    let value = this.state;

    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }

    return this.deepClone(value);
  }

  /**
   * Set state with validation
   * @param {Object} updates - Partial state updates
   * @throws {Error} If state transition is invalid
   */
  setState(updates) {
    const newState = this.mergeState(this.state, updates);

    // Validate the new state
    const validationError = this.validateState(newState);
    if (validationError) {
      throw new Error(`Invalid state transition: ${validationError}`);
    }

    const oldState = this.state;
    this.state = newState;

    // Emit state change event
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_STATE_CHANGED, {
        oldState: this.deepClone(oldState),
        newState: this.deepClone(newState),
        updates,
      });
    }
  }

  /**
   * Batch multiple state updates atomically
   * @param {Function} updater - Function that receives current state and returns updates
   */
  batchUpdate(updater) {
    const currentState = this.getState();
    const updates = updater(currentState);
    this.setState(updates);
  }

  /**
   * Validate state transitions
   * @param {AppState} state - State to validate
   * @returns {string|null} Error message or null if valid
   */
  validateState(state) {
    // Validate connection status
    if (!VALID_CONNECTION_STATUSES.includes(state.connectionStatus)) {
      return `Invalid connection status: ${state.connectionStatus}`;
    }

    // Validate navigation view
    if (!VALID_VIEWS.includes(state.navigation.currentView)) {
      return `Invalid view: ${state.navigation.currentView}`;
    }

    // Validate UI state
    if (typeof state.ui.selectedIndex !== LOCAL_STR_NUMBER ||
        state.ui.selectedIndex < LOCAL_NUM_ZERO) {
      return `Invalid selected index: ${state.ui.selectedIndex}`;
    }

    // Validate sort direction
    if (state.ui.sortDirection &&
        ![LOCAL_STR_ASC, LOCAL_STR_DESC].includes(state.ui.sortDirection)) {
      return `Invalid sort direction: ${state.ui.sortDirection}`;
    }

    // Validate config
    if (typeof state.config.refreshInterval !== LOCAL_STR_NUMBER ||
        state.config.refreshInterval < LOCAL_NUM_1000) {
      return `Invalid refresh interval: ${state.config.refreshInterval}`;
    }

    return null;
  }

  /**
   * Create a state snapshot
   * @param {string} [name] - Optional snapshot name
   * @returns {number} Snapshot index
   */
  createSnapshot(name) {
    const snapshot = {
      name: name || `snapshot_${Date.now()}`,
      timestamp: Date.now(),
      state: this.deepClone(this.state),
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_STATE_SNAPSHOT, {name: snapshot.name});
    }

    return this.snapshots.length - LOCAL_NUM_ONE;
  }

  /**
   * Restore state from a snapshot
   * @param {number} index - Snapshot index
   * @throws {Error} If snapshot doesn't exist
   */
  restoreSnapshot(index) {
    if (index < LOCAL_NUM_ZERO || index >= this.snapshots.length) {
      throw new Error(`Snapshot at index ${index} does not exist`);
    }

    const snapshot = this.snapshots[index];
    const oldState = this.state;
    this.state = this.deepClone(snapshot.state);

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_STATE_RESTORED, {
        snapshotName: snapshot.name,
        oldState: this.deepClone(oldState),
        newState: this.deepClone(this.state),
      });
    }
  }

  /**
   * Get all snapshots
   * @returns {Array<{name: string, timestamp: number}>}
   */
  getSnapshots() {
    return this.snapshots.map((s) => ({
      name: s.name,
      timestamp: s.timestamp,
    }));
  }

  /**
   * Deep merge state objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object with updates
   * @returns {Object} Merged object
   */
  mergeState(target, source) {
    const result = this.deepClone(target);

    for (const key of Object.keys(source)) {
      if (source[key] !== null &&
          typeof source[key] === LOCAL_STR_OBJECT &&
          !Array.isArray(source[key]) &&
          target[key] !== null &&
          typeof target[key] === LOCAL_STR_OBJECT &&
          !Array.isArray(target[key])) {
        result[key] = this.mergeState(target[key], source[key]);
      } else {
        result[key] = this.deepClone(source[key]);
      }
    }

    return result;
  }

  /**
   * Deep clone an object
   * @param {*} obj - Object to clone
   * @returns {*} Cloned object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== LOCAL_STR_OBJECT) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item));
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    const cloned = {};
    for (const key of Object.keys(obj)) {
      cloned[key] = this.deepClone(obj[key]);
    }
    return cloned;
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const oldState = this.state;
    this.state = this.getInitialState();

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_STATE_RESET, {
        oldState: this.deepClone(oldState),
      });
    }
  }

  /**
   * Subscribe to state changes for a specific path
   * @param {string} path - State path to watch
   * @param {Function} callback - Callback when path changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    if (!this.eventBus) {
      throw new Error(LOCAL_STR_1CRED);
    }

    return this.eventBus.on(LOCAL_STR_STATE_CHANGED, ({oldState, newState}) => {
      const oldValue = this.getValueAtPath(oldState, path);
      const newValue = this.getValueAtPath(newState, path);

      if (!this.deepEqual(oldValue, newValue)) {
        callback(newValue, oldValue);
      }
    });
  }

  /**
   * Get value at a dot-separated path
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-separated path
   * @returns {*}
   */
  getValueAtPath(obj, path) {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * Deep equality check
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean}
   */
  deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a !== LOCAL_STR_OBJECT) return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => this.deepEqual(item, b[i]));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => this.deepEqual(a[key], b[key]));
  }
}
