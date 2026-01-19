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
  return process.env.NODE_ENV === 'production';
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
    this.currentTab = 'state';

    /** @type {PerformanceMetrics} */
    this.metrics = {
      renderTimes: [],
      eventLatencies: [],
      maxSamples: 100,
    };

    /** @type {CDCEventEntry[]} */
    this.cdcEvents = [];
    this.maxCDCEvents = 100;

    /** @type {string} */
    this.cdcFilter = '';

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
    this.eventBus.on('cache:update', (data) => {
      this.trackCDCEvent({
        timestamp: Date.now(),
        table: data.table,
        operation: data.operation,
        key: data.key,
        data: data,
      });
    });

    // Track render times
    this.eventBus.on('view:rendered', (data) => {
      if (data.duration !== undefined) {
        this.trackRenderTime(data.duration);
      }
    });

    // Track event latencies
    this.eventBus.on('*', (_data, eventName) => {
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
      this.eventBus.emit('devtools:show', {
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
      this.eventBus.emit('devtools:hide', {
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
        this.eventBus.emit('devtools:tabChanged', {tab});
      }
    }
  }

  /**
   * Get available tabs
   * @returns {Array<{id: DevToolsTab, label: string}>}
   */
  getTabs() {
    return [
      {id: 'state', label: '1: State'},
      {id: 'events', label: '2: Events'},
      {id: 'components', label: '3: Components'},
      {id: 'cdc', label: '4: CDC Stream'},
      {id: 'performance', label: '5: Performance'},
    ];
  }

  /**
   * Get content for the current tab
   * @returns {Object} Tab content
   */
  getTabContent() {
    switch (this.currentTab) {
    case 'state':
      return this.getStateContent();
    case 'events':
      return this.getEventsContent();
    case 'components':
      return this.getComponentsContent();
    case 'cdc':
      return this.getCDCContent();
    case 'performance':
      return this.getPerformanceContent();
    default:
      return {type: 'empty', content: 'Unknown tab'};
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
        type: 'state',
        state: null,
        snapshots: [],
        error: 'StateManager not available',
      };
    }

    const state = this.stateManager.getState();
    const snapshots = this.stateManager.getSnapshots();

    return {
      type: 'state',
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
  formatStateTree(obj, indent = 0) {
    if (obj === null || obj === undefined) {
      return 'null';
    }

    const spaces = '  '.repeat(indent);
    const lines = [];

    if (typeof obj !== 'object') {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return '[]';
      }
      lines.push(`Array(${obj.length})`);
      // Show first few items
      const preview = obj.slice(0, 3);
      for (let i = 0; i < preview.length; i++) {
        const value = this.formatValue(preview[i]);
        lines.push(`${spaces}  [${i}]: ${value}`);
      }
      if (obj.length > 3) {
        lines.push(`${spaces}  ... ${obj.length - 3} more items`);
      }
      return lines.join('\n');
    }

    const entries = Object.entries(obj);
    for (const [key, value] of entries) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        lines.push(this.formatStateTree(value, indent + 1));
      } else {
        const formattedValue = this.formatValue(value);
        lines.push(`${spaces}${key}: ${formattedValue}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single value for display
   * @param {*} value - Value to format
   * @returns {string} Formatted value
   */
  formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    if (typeof value === 'object') {
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
        type: 'events',
        events: [],
        error: 'EventBus not available',
      };
    }

    const eventLog = this.eventBus.getEventLog();
    const recentEvents = eventLog.slice(-50).reverse();

    return {
      type: 'events',
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
    return date.toISOString().substring(11, 23); // HH:mm:ss.SSS
  }

  /**
   * Format data preview for display
   * @param {*} data - Data to preview
   * @returns {string} Preview string
   */
  formatDataPreview(data) {
    if (data === undefined || data === null) {
      return '';
    }
    const str = JSON.stringify(data);
    return str.length > 80 ? str.substring(0, 77) + '...' : str;
  }

  /**
   * Get components tab content
   * Requirements: 26.4
   * @returns {Object} Components content
   */
  getComponentsContent() {
    if (!this.componentRegistry) {
      return {
        type: 'components',
        components: [],
        dependencyGraph: {},
        initOrder: [],
        error: 'ComponentRegistry not available',
      };
    }

    const componentNames = this.componentRegistry.getComponentNames();
    const dependencyGraph = this.componentRegistry.getDependencyGraph();
    const initOrder = this.componentRegistry.getInitializationOrder();

    return {
      type: 'components',
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
      type: 'cdc',
      events: filteredEvents.slice(-50).reverse(),
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
      type: 'performance',
      render: {
        samples: this.metrics.renderTimes.length,
        avg: renderStats.avg,
        min: renderStats.min,
        max: renderStats.max,
        recent: this.metrics.renderTimes.slice(-10),
      },
      eventLatency: {
        samples: this.metrics.eventLatencies.length,
        avg: latencyStats.avg,
        min: latencyStats.min,
        max: latencyStats.max,
        recent: this.metrics.eventLatencies.slice(-10),
      },
    };
  }

  /**
   * Calculate statistics for an array of numbers
   * @param {number[]} values - Values to analyze
   * @returns {Object} Statistics
   */
  calculateStats(values) {
    if (values.length === 0) {
      return {avg: 0, min: 0, max: 0};
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round((sum / values.length) * 100) / 100,
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
    if (latency >= 0 && latency < 10000) {
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
      this.eventBus.emit('devtools:snapshotCreated', {
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
        this.eventBus.emit('devtools:snapshotRestored', {index});
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
    if (key.name === '1' || key.ch === '1') {
      this.switchTab('state');
      return true;
    }
    if (key.name === '2' || key.ch === '2') {
      this.switchTab('events');
      return true;
    }
    if (key.name === '3' || key.ch === '3') {
      this.switchTab('components');
      return true;
    }
    if (key.name === '4' || key.ch === '4') {
      this.switchTab('cdc');
      return true;
    }
    if (key.name === '5' || key.ch === '5') {
      this.switchTab('performance');
      return true;
    }

    // Close with escape or q
    if (key.name === 'escape' || key.name === 'q' || key.ch === 'q') {
      this.hide();
      return true;
    }

    // Create snapshot with 's'
    if (key.name === 's' || key.ch === 's') {
      this.createSnapshot();
      return true;
    }

    // Clear metrics/events with 'c'
    if (key.name === 'c' || key.ch === 'c') {
      if (this.currentTab === 'performance') {
        this.resetMetrics();
      } else if (this.currentTab === 'cdc') {
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
    const lines = [];
    const content = this.getTabContent();

    // Header
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                        DEV TOOLS                           ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Tab bar
    const tabs = this.getTabs();
    const tabLine = tabs.map((t) =>
      t.id === this.currentTab ? `[${t.label}]` : ` ${t.label} `,
    ).join(' ');
    lines.push(tabLine);
    lines.push('─'.repeat(60));
    lines.push('');

    // Content based on tab
    switch (content.type) {
    case 'state':
      lines.push('Current State:');
      lines.push('');
      if (content.stateTree) {
        lines.push(content.stateTree);
      } else if (content.error) {
        lines.push(`Error: ${content.error}`);
      }
      lines.push('');
      lines.push(`Snapshots: ${content.snapshots?.length || 0}`);
      break;

    case 'events':
      lines.push(`Recent Events (${content.totalCount} total):`);
      lines.push('');
      for (const event of content.events.slice(0, 20)) {
        lines.push(`${event.time} ${event.type || event.event}`);
        if (event.dataPreview) {
          lines.push(`  ${event.dataPreview}`);
        }
      }
      break;

    case 'components':
      lines.push(`Components (${content.componentCount}):`);
      lines.push('');
      lines.push('Initialization Order:');
      for (const name of content.initOrder || []) {
        const info = content.dependencyGraph?.[name];
        const deps = info?.dependencies?.length ?
          ` → [${info.dependencies.join(', ')}]` : '';
        lines.push(`  ${name}${deps}`);
      }
      break;

    case 'cdc':
      lines.push(`CDC Events (${content.filteredCount}/${content.totalCount}):`);
      if (content.filter) {
        lines.push(`Filter: "${content.filter}"`);
      }
      lines.push('');
      for (const event of content.events.slice(0, 20)) {
        const time = this.formatTimestamp(event.timestamp);
        lines.push(`${time} ${event.operation} ${event.table}:${event.key}`);
      }
      break;

    case 'performance':
      lines.push('Performance Metrics:');
      lines.push('');
      lines.push('Render Times:');
      lines.push(`  Samples: ${content.render.samples}`);
      lines.push(`  Average: ${content.render.avg}ms`);
      lines.push(`  Min: ${content.render.min}ms`);
      lines.push(`  Max: ${content.render.max}ms`);
      lines.push('');
      lines.push('Event Latency:');
      lines.push(`  Samples: ${content.eventLatency.samples}`);
      lines.push(`  Average: ${content.eventLatency.avg}ms`);
      lines.push(`  Min: ${content.eventLatency.min}ms`);
      lines.push(`  Max: ${content.eventLatency.max}ms`);
      break;

    default:
      lines.push(content.content || 'No content');
    }

    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('Keys: 1-5:Tabs | s:Snapshot | c:Clear | q/Esc:Close');

    return lines.join('\n');
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
      this.eventBus.emit('devtools:destroyed', {});
    }
  }
}
