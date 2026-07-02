import {formatDevToolsTextContent} from './dev-tools-text-renderer.js';

const LOCAL_STR_PRODUCTION = 'production';
const LOCAL_STR_STATE = 'state';
const LOCAL_NUM_100 = 100;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_CACHE_UPDATE = 'cache:update';
const LOCAL_STR_VIEW_RENDERED = 'view:rendered';
const LOCAL_STR_ASTERISK = '*';
const LOCAL_STR_DEVTOOLS_SHOW = 'devtools:show';
const LOCAL_STR_DEVTOOLS_HIDE = 'devtools:hide';
const LOCAL_STR_1YTYF = 'devtools:tabChanged';
const LOCAL_STR_1_STATE = '1: State';
const LOCAL_STR_EVENTS = 'events';
const LOCAL_STR_2_EVENTS = '2: Events';
const LOCAL_STR_COMPONENTS = 'components';
const LOCAL_STR_3_COMPONENTS = '3: Components';
const LOCAL_STR_CDC = 'cdc';
const LOCAL_STR_4_CDC_STREAM = '4: CDC Stream';
const LOCAL_STR_PERFORMANCE = 'performance';
const LOCAL_STR_5_PERFORMANCE = '5: Performance';
const LOCAL_STR_EMPTY_2 = 'empty';
const LOCAL_STR_UNKNOWN_TAB = 'Unknown tab';
const LOCAL_STR_1C7M6 = 'StateManager not available';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_NULL = 'null';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_W7K42 = '[]';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_UNDEFINED = 'undefined';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_50 = 50;
const LOCAL_NUM_47 = 47;
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_1IZU7 = 'EventBus not available';
const LOCAL_NUM_11 = 11;
const LOCAL_NUM_23 = 23;
const LOCAL_NUM_80 = 80;
const LOCAL_NUM_77 = 77;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_1TJRQ = 'ComponentRegistry not available';
const LOCAL_NUM_10 = 10;
const LOCAL_NUM_10000 = 10000;
const LOCAL_STR_OYQ6J = 'devtools:snapshotCreated';
const LOCAL_STR_12PTN = 'devtools:snapshotRestored';
const LOCAL_STR_1 = '1';
const LOCAL_STR_2 = '2';
const LOCAL_STR_3 = '3';
const LOCAL_STR_4 = '4';
const LOCAL_STR_5 = '5';
const LOCAL_STR_ESCAPE = 'escape';
const LOCAL_STR_Q = 'q';
const LOCAL_STR_S = 's';
const LOCAL_STR_C = 'c';
const LOCAL_STR_DEVTOOLS_DESTROYED = 'devtools:destroyed';

/**
 * DevTools - Development and debugging overlay for the Admin CLI
 *
 * Provides debugging capabilities including state inspection, event logging,
 * component registry visualization, CDC event stream, and performance metrics.
 *
 * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8
 */

/**
 * @typedef {'state'|'events'|'components'|'cdc'|'performance'} DevToolsTab
 */

/**
 * @typedef {Object} PerformanceMetrics
 * @property {number[]} renderTimes - Recent render times in ms
 * @property {number[]} eventLatencies - Recent event latencies in ms
 * @property {number} maxSamples - Maximum samples to keep
 */

/**
 * @typedef {Object} CDCEventEntry
 * @property {number} timestamp - Event timestamp
 * @property {string} table - Table name
 * @property {string} operation - Operation type
 * @property {string} key - Row key
 * @property {Object} [data] - Event data
 */

/**
 * Check if running in production mode
 * @returns {boolean}
 */
function isProduction() {
  return process.env.NODE_ENV === LOCAL_STR_PRODUCTION;
}

/**
 * DevTools class for development and debugging
 */
export class DevTools {
  /**
   * Creates a new DevTools instance
   * @param {Object} options - Configuration options
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State mgr
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./component-registry.js').ComponentRegistry} [options.componentRegistry]
   * @param {boolean} [options.enabled=true] - Whether DevTools is enabled
   */
  constructor(options = {}) {
    this.stateManager = options.stateManager || null;
    this.eventBus = options.eventBus || null;
    this.componentRegistry = options.componentRegistry || null;

    // Disable in production unless explicitly enabled
    this.enabled = options.enabled !== undefined ?
      options.enabled :
      !isProduction();

    /** @type {boolean} */
    this.visible = false;

    /** @type {DevToolsTab} */
    this.currentTab = LOCAL_STR_STATE;

    /** @type {PerformanceMetrics} */
    this.metrics = {
      renderTimes: [],
      eventLatencies: [],
      maxSamples: LOCAL_NUM_100,
    };

    /** @type {CDCEventEntry[]} */
    this.cdcEvents = [];
    this.maxCDCEvents = LOCAL_NUM_100;

    /** @type {string} */
    this.cdcFilter = LOCAL_STR_EMPTY;

    // Event log from event bus
    this.eventLogSubscription = null;

    // Setup event tracking if enabled
    if (this.enabled) {
      this.setupEventTracking();
    }
  }

  /**
   * Setup event tracking for CDC events
   */
  setupEventTracking() {
    if (!this.eventBus) return;

    // Track CDC events
    this.eventBus.on(LOCAL_STR_CACHE_UPDATE, (data) => {
      this.trackCDCEvent({
        timestamp: Date.now(),
        table: data.table,
        operation: data.operation,
        key: data.key,
        data: data,
      });
    });

    // Track render times
    this.eventBus.on(LOCAL_STR_VIEW_RENDERED, (data) => {
      if (data.duration !== undefined) {
        this.trackRenderTime(data.duration);
      }
    });

    // Track event latencies
    this.eventBus.on(LOCAL_STR_ASTERISK, (_data, eventName) => {
      if (this.visible && eventName) {
        const latency = Date.now() - (this.lastEventTime || Date.now());
        this.trackEventLatency(latency);
        this.lastEventTime = Date.now();
      }
    });
  }

  /**
   * Check if DevTools is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Check if DevTools is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Show the DevTools overlay
   * Requirements: 26.1
   */
  show() {
    if (!this.enabled) return;

    this.visible = true;
    this.lastEventTime = Date.now();

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_DEVTOOLS_SHOW, {
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Hide the DevTools overlay
   */
  hide() {
    this.visible = false;

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_DEVTOOLS_HIDE, {
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Toggle DevTools visibility
   * Requirements: 26.1
   * @returns {boolean} New visibility state
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
    return this.visible;
  }

  /**
   * Get current tab
   * @returns {DevToolsTab}
   */
  getCurrentTab() {
    return this.currentTab;
  }

  /**
   * Switch to a different tab
   * @param {DevToolsTab} tab - Tab to switch to
   */
  switchTab(tab) {
    const validTabs = ['state', 'events', 'components', 'cdc', 'performance'];
    if (validTabs.includes(tab)) {
      this.currentTab = tab;

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_1YTYF, {tab});
      }
    }
  }

  /**
   * Get available tabs
   * @returns {Array<{id: DevToolsTab, label: string}>}
   */
  getTabs() {
    return [
      {id: LOCAL_STR_STATE, label: LOCAL_STR_1_STATE},
      {id: LOCAL_STR_EVENTS, label: LOCAL_STR_2_EVENTS},
      {id: LOCAL_STR_COMPONENTS, label: LOCAL_STR_3_COMPONENTS},
      {id: LOCAL_STR_CDC, label: LOCAL_STR_4_CDC_STREAM},
      {id: LOCAL_STR_PERFORMANCE, label: LOCAL_STR_5_PERFORMANCE},
    ];
  }

  /**
   * Get content for the current tab
   * @returns {Object} Tab content
   */
  getTabContent() {
    switch (this.currentTab) {
    case LOCAL_STR_STATE:
      return this.getStateContent();
    case LOCAL_STR_EVENTS:
      return this.getEventsContent();
    case LOCAL_STR_COMPONENTS:
      return this.getComponentsContent();
    case LOCAL_STR_CDC:
      return this.getCDCContent();
    case LOCAL_STR_PERFORMANCE:
      return this.getPerformanceContent();
    default:
      return {type: LOCAL_STR_EMPTY_2, content: LOCAL_STR_UNKNOWN_TAB};
    }
  }

  /**
   * Get state tab content
   * Requirements: 26.2
   * @returns {Object} State content
   */
  getStateContent() {
    if (!this.stateManager) {
      return {
        type: LOCAL_STR_STATE,
        state: null,
        snapshots: [],
        error: LOCAL_STR_1C7M6,
      };
    }

    const state = this.stateManager.getState();
    const snapshots = this.stateManager.getSnapshots();

    return {
      type: LOCAL_STR_STATE,
      state,
      snapshots,
      stateTree: this.formatStateTree(state),
    };
  }

  /**
   * Format state as a tree structure
   * Requirements: 26.2
   * @param {Object} obj - Object to format
   * @param {number} [indent=0] - Current indentation level
   * @returns {string} Formatted tree string
   */
  formatStateTree(obj, indent = LOCAL_NUM_ZERO) {
    if (obj === null || obj === undefined) {
      return LOCAL_STR_NULL;
    }

    const spaces = '  '.repeat(indent);
    const lines = [];

    if (typeof obj !== LOCAL_STR_OBJECT) {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === LOCAL_NUM_ZERO) {
        return LOCAL_STR_W7K42;
      }
      lines.push(`Array(${obj.length})`);
      // Show first few items
      const preview = obj.slice(0, 3);
      for (let i = LOCAL_NUM_ZERO; i < preview.length; i++) {
        const value = this.formatValue(preview[i]);
        lines.push(`${spaces}  [${i}]: ${value}`);
      }
      if (obj.length > LOCAL_NUM_THREE) {
        lines.push(`${spaces}  ... ${obj.length - LOCAL_NUM_THREE} more items`);
      }
      return lines.join(LOCAL_STR_NEWLINE);
    }

    const entries = Object.entries(obj);
    for (const [key, value] of entries) {
      if (value && typeof value === LOCAL_STR_OBJECT && !Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        lines.push(this.formatStateTree(value, indent + LOCAL_NUM_ONE));
      } else {
        const formattedValue = this.formatValue(value);
        lines.push(`${spaces}${key}: ${formattedValue}`);
      }
    }

    return lines.join(LOCAL_STR_NEWLINE);
  }

  /**
   * Format a single value for display
   * @param {*} value - Value to format
   * @returns {string} Formatted value
   */
  formatValue(value) {
    if (value === null) return LOCAL_STR_NULL;
    if (value === undefined) return LOCAL_STR_UNDEFINED;
    if (typeof value === LOCAL_STR_STRING) {
      return value.length > LOCAL_NUM_50 ? `"${value.substring(LOCAL_NUM_ZERO, LOCAL_NUM_47)}..."` : `"${value}"`;
    }
    if (typeof value === LOCAL_STR_NUMBER || typeof value === LOCAL_STR_BOOLEAN) {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    if (typeof value === LOCAL_STR_OBJECT) {
      return `Object(${Object.keys(value).length} keys)`;
    }
    return String(value);
  }

  /**
   * Get events tab content
   * Requirements: 26.3
   * @returns {Object} Events content
   */
  getEventsContent() {
    if (!this.eventBus) {
      return {
        type: LOCAL_STR_EVENTS,
        events: [],
        error: LOCAL_STR_1IZU7,
      };
    }

    const eventLog = this.eventBus.getEventLog();
    const recentEvents = eventLog.slice(-50).reverse();

    return {
      type: LOCAL_STR_EVENTS,
      events: recentEvents.map((event) => ({
        timestamp: event.timestamp,
        time: this.formatTimestamp(event.timestamp),
        type: event.type,
        event: event.event || event.type,
        data: event.data,
        dataPreview: this.formatDataPreview(event.data),
      })),
      totalCount: eventLog.length,
    };
  }

  /**
   * Format timestamp for display
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted time
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().substring(LOCAL_NUM_11, LOCAL_NUM_23); // HH:mm:ss.SSS
  }

  /**
   * Format data preview for display
   * @param {*} data - Data to preview
   * @returns {string} Preview string
   */
  formatDataPreview(data) {
    if (data === undefined || data === null) {
      return LOCAL_STR_EMPTY;
    }
    const str = JSON.stringify(data);
    return str.length > LOCAL_NUM_80 ?
      str.substring(LOCAL_NUM_ZERO, LOCAL_NUM_77) + LOCAL_STR_2ZI04 :
      str;
  }

  /**
   * Get components tab content
   * Requirements: 26.4
   * @returns {Object} Components content
   */
  getComponentsContent() {
    if (!this.componentRegistry) {
      return {
        type: LOCAL_STR_COMPONENTS,
        components: [],
        dependencyGraph: {},
        initOrder: [],
        error: LOCAL_STR_1TJRQ,
      };
    }

    const componentNames = this.componentRegistry.getComponentNames();
    const dependencyGraph = this.componentRegistry.getDependencyGraph();
    const initOrder = this.componentRegistry.getInitializationOrder();

    return {
      type: LOCAL_STR_COMPONENTS,
      components: componentNames,
      dependencyGraph,
      initOrder,
      componentCount: componentNames.length,
    };
  }

  /**
   * Get CDC stream tab content
   * Requirements: 26.5
   * @returns {Object} CDC content
   */
  getCDCContent() {
    let filteredEvents = this.cdcEvents;

    // Apply filter if set
    if (this.cdcFilter) {
      const filter = this.cdcFilter.toLowerCase();
      filteredEvents = this.cdcEvents.filter((event) =>
        event.table.toLowerCase().includes(filter) ||
        event.operation.toLowerCase().includes(filter) ||
        event.key.toLowerCase().includes(filter),
      );
    }

    return {
      type: LOCAL_STR_CDC,
      events: filteredEvents.slice(-LOCAL_NUM_50).reverse(),
      totalCount: this.cdcEvents.length,
      filteredCount: filteredEvents.length,
      filter: this.cdcFilter,
    };
  }

  /**
   * Set CDC event filter
   * Requirements: 26.5
   * @param {string} filter - Filter string
   */
  setCDCFilter(filter) {
    this.cdcFilter = filter;
  }

  /**
   * Track a CDC event
   * @param {CDCEventEntry} event - CDC event to track
   */
  trackCDCEvent(event) {
    this.cdcEvents.push(event);

    // Trim old events
    if (this.cdcEvents.length > this.maxCDCEvents) {
      this.cdcEvents = this.cdcEvents.slice(-this.maxCDCEvents);
    }
  }

  /**
   * Get performance tab content
   * Requirements: 26.8
   * @returns {Object} Performance content
   */
  getPerformanceContent() {
    const renderStats = this.calculateStats(this.metrics.renderTimes);
    const latencyStats = this.calculateStats(this.metrics.eventLatencies);

    return {
      type: LOCAL_STR_PERFORMANCE,
      render: {
        samples: this.metrics.renderTimes.length,
        avg: renderStats.avg,
        min: renderStats.min,
        max: renderStats.max,
        recent: this.metrics.renderTimes.slice(-LOCAL_NUM_10),
      },
      eventLatency: {
        samples: this.metrics.eventLatencies.length,
        avg: latencyStats.avg,
        min: latencyStats.min,
        max: latencyStats.max,
        recent: this.metrics.eventLatencies.slice(-LOCAL_NUM_10),
      },
    };
  }

  /**
   * Calculate statistics for an array of numbers
   * @param {number[]} values - Values to analyze
   * @returns {Object} Statistics
   */
  calculateStats(values) {
    if (values.length === LOCAL_NUM_ZERO) {
      return {avg: LOCAL_NUM_ZERO, min: LOCAL_NUM_ZERO, max: LOCAL_NUM_ZERO};
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round((sum / values.length) * LOCAL_NUM_100) / LOCAL_NUM_100,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  /**
   * Track render time
   * Requirements: 26.8
   * @param {number} duration - Render duration in ms
   */
  trackRenderTime(duration) {
    this.metrics.renderTimes.push(duration);

    if (this.metrics.renderTimes.length > this.metrics.maxSamples) {
      this.metrics.renderTimes.shift();
    }
  }

  /**
   * Track event latency
   * Requirements: 26.8
   * @param {number} latency - Event latency in ms
   */
  trackEventLatency(latency) {
    // Only track reasonable latencies (filter out initial/invalid values)
    if (latency >= LOCAL_NUM_ZERO && latency < LOCAL_NUM_10000) {
      this.metrics.eventLatencies.push(latency);

      if (this.metrics.eventLatencies.length > this.metrics.maxSamples) {
        this.metrics.eventLatencies.shift();
      }
    }
  }

  /**
   * Create a state snapshot
   * Requirements: 26.6
   * @param {string} [name] - Optional snapshot name
   * @returns {number|null} Snapshot index or null if failed
   */
  createSnapshot(name) {
    if (!this.stateManager) return null;

    const index = this.stateManager.createSnapshot(name);

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_OYQ6J, {
        index,
        name: name || `snapshot_${index}`,
      });
    }

    return index;
  }

  /**
   * Restore a state snapshot
   * Requirements: 26.6
   * @param {number} index - Snapshot index
   * @returns {boolean} Whether restoration succeeded
   */
  restoreSnapshot(index) {
    if (!this.stateManager) return false;

    try {
      this.stateManager.restoreSnapshot(index);

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_12PTN, {index});
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all snapshots
   * Requirements: 26.6
   * @returns {Array<{name: string, timestamp: number}>}
   */
  getSnapshots() {
    if (!this.stateManager) return [];
    return this.stateManager.getSnapshots();
  }

  /**
   * Get performance metrics
   * @returns {PerformanceMetrics}
   */
  getMetrics() {
    return {
      ...this.metrics,
      renderTimes: [...this.metrics.renderTimes],
      eventLatencies: [...this.metrics.eventLatencies],
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    this.metrics.renderTimes = [];
    this.metrics.eventLatencies = [];
  }

  /**
   * Clear CDC event history
   */
  clearCDCEvents() {
    this.cdcEvents = [];
  }

  /**
   * Handle keyboard input
   * @param {Object} key - Key event
   * @returns {boolean} Whether key was handled
   */
  handleKey(key) {
    if (!this.visible) return false;

    // Tab switching with number keys
    if (key.name === LOCAL_STR_1 || key.ch === LOCAL_STR_1) {
      this.switchTab(LOCAL_STR_STATE);
      return true;
    }
    if (key.name === LOCAL_STR_2 || key.ch === LOCAL_STR_2) {
      this.switchTab(LOCAL_STR_EVENTS);
      return true;
    }
    if (key.name === LOCAL_STR_3 || key.ch === LOCAL_STR_3) {
      this.switchTab(LOCAL_STR_COMPONENTS);
      return true;
    }
    if (key.name === LOCAL_STR_4 || key.ch === LOCAL_STR_4) {
      this.switchTab(LOCAL_STR_CDC);
      return true;
    }
    if (key.name === LOCAL_STR_5 || key.ch === LOCAL_STR_5) {
      this.switchTab(LOCAL_STR_PERFORMANCE);
      return true;
    }

    // Close with escape or q
    if (key.name === LOCAL_STR_ESCAPE || key.name === LOCAL_STR_Q || key.ch === LOCAL_STR_Q) {
      this.hide();
      return true;
    }

    // Create snapshot with 's'
    if (key.name === LOCAL_STR_S || key.ch === LOCAL_STR_S) {
      this.createSnapshot();
      return true;
    }

    // Clear metrics/events with 'c'
    if (key.name === LOCAL_STR_C || key.ch === LOCAL_STR_C) {
      if (this.currentTab === LOCAL_STR_PERFORMANCE) {
        this.resetMetrics();
      } else if (this.currentTab === LOCAL_STR_CDC) {
        this.clearCDCEvents();
      }
      return true;
    }

    return false;
  }

  /**
   * Format content for text display
   * @returns {string} Formatted text content
   */
  formatTextContent() {
    return formatDevToolsTextContent({
      content: this.getTabContent(),
      tabs: this.getTabs(),
      currentTab: this.currentTab,
      formatTimestamp: (timestamp) => this.formatTimestamp(timestamp),
    });
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.visible = false;
    this.cdcEvents = [];
    this.metrics.renderTimes = [];
    this.metrics.eventLatencies = [];

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_DEVTOOLS_DESTROYED, {});
    }
  }
}
