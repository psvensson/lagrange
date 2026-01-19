/**
 * CDCStreamHandler - Handles CDC stream subscription and event processing
 *
 * Manages the CDC stream connection, processes events, updates the cache,
 * and coordinates with the view manager for UI updates.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.9
 */

/**
 * @typedef {'disconnected'|'connecting'|'connected'|'paused'|'error'} CDCStreamStatus
 */

/**
 * @typedef {Object} CDCStreamStats
 * @property {number} eventsReceived - Total events received
 * @property {number} eventsPerSecond - Current events per second rate
 * @property {number} lastEventTime - Timestamp of last event
 * @property {number} lag - Current CDC lag in milliseconds
 */

/**
 * CDCStreamHandler class for managing CDC stream subscription and events
 */
export class CDCStreamHandler {
  /**
   * Creates a new CDCStreamHandler
   * @param {Object} options - Handler options
   * @param {import('./connection-manager.js').ConnectionManager} options.connectionManager -
   *   Connection manager
   * @param {import('./remote-cache.js').RemoteCache} options.cache - Remote cache
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State manager
   */
  constructor(options = {}) {
    this.connectionManager = options.connectionManager;
    this.cache = options.cache;
    this.eventBus = options.eventBus || null;
    this.stateManager = options.stateManager || null;

    /** @type {CDCStreamStatus} */
    this.status = 'disconnected';

    /** @type {boolean} */
    this.paused = false;

    /** @type {CDCStreamStats} */
    this.stats = {
      eventsReceived: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      lag: 0,
    };

    // Event rate calculation
    this.eventTimestamps = [];
    this.rateWindowMs = 5000; // 5 second window for rate calculation

    // Changed rows tracking for highlighting
    this.changedRows = new Map(); // key -> {timestamp, table}
    this.highlightDurationMs = 2000;

    // Bind handlers
    this.handleCacheDump = this.handleCacheDump.bind(this);
    this.handleCDCEvent = this.handleCDCEvent.bind(this);
    this.handleStatusChange = this.handleStatusChange.bind(this);

    // Setup connection manager callbacks
    this.setupConnectionCallbacks();
  }

  /**
   * Setup callbacks on the connection manager
   */
  setupConnectionCallbacks() {
    if (!this.connectionManager) return;

    this.connectionManager.onCacheDump = this.handleCacheDump;
    this.connectionManager.onCDCEvent = this.handleCDCEvent;

    // Store original status change handler to chain
    const originalStatusChange = this.connectionManager.onStatusChange;
    this.connectionManager.onStatusChange = (status, ...args) => {
      this.handleStatusChange(status, ...args);
      if (originalStatusChange) {
        originalStatusChange(status, ...args);
      }
    };
  }

  /**
   * Handle initial cache dump from server
   * Requirements: 12.1, 13.1
   * @param {Object} dump - Full cache dump data
   */
  handleCacheDump(dump) {
    if (!this.cache) return;

    this.cache.loadFromDump(dump);
    this.status = 'connected';

    // Emit cache initialized event
    if (this.eventBus) {
      this.eventBus.emit('cdc:initialized', {
        timestamp: Date.now(),
        tableCount: Object.keys(dump).length,
      });
    }

    // Update state manager
    if (this.stateManager) {
      this.stateManager.setState({
        cache: {
          lastUpdate: Date.now(),
          cdcLag: 0,
        },
      });
    }

    this.emitStatusUpdate();
  }

  /**
   * Handle incoming CDC event
   * Requirements: 12.2, 12.3, 12.4
   * @param {Object} event - CDC event
   */
  handleCDCEvent(event) {
    if (!this.cache) return;

    // If paused, don't process events
    if (this.paused) {
      return;
    }

    // Apply event to cache
    const change = this.cache.applyCDCEvent(event);

    // Update stats
    this.stats.eventsReceived++;
    this.stats.lastEventTime = Date.now();
    this.stats.lag = this.cache.cdcLag;

    // Track event for rate calculation
    this.eventTimestamps.push(Date.now());
    this.updateEventRate();

    // Track changed row for highlighting
    if (change.applied) {
      this.trackChangedRow(change.key, change.table);
    }

    // Emit CDC update event
    if (this.eventBus) {
      this.eventBus.emit('cache:update', {
        table: change.table,
        key: change.key,
        operation: change.operation,
        timestamp: Date.now(),
        affectedTableId: change.affectedTableId,
      });

      // Emit specific table event
      this.eventBus.emit(`cdc:${change.table}`, {
        key: change.key,
        operation: change.operation,
        data: event.data,
      });
    }

    // Update state manager with cache stats
    if (this.stateManager) {
      this.stateManager.setState({
        cache: {
          lastUpdate: Date.now(),
          cdcLag: this.stats.lag,
        },
      });
    }
  }

  /**
   * Handle connection status changes
   * @param {string} status - New connection status
   * @param {number} [_delay] - Reconnection delay (if reconnecting)
   */
  handleStatusChange(status, _delay) {
    switch (status) {
    case 'connected':
      this.status = 'connected';
      break;
    case 'disconnected':
    case 'reconnecting':
      this.status = 'disconnected';
      break;
    case 'failed':
      this.status = 'error';
      break;
    default:
      break;
    }

    this.emitStatusUpdate();
  }

  /**
   * Update event rate calculation
   */
  updateEventRate() {
    const now = Date.now();
    const cutoff = now - this.rateWindowMs;

    // Remove old timestamps
    this.eventTimestamps = this.eventTimestamps.filter((t) => t > cutoff);

    // Calculate rate
    if (this.eventTimestamps.length > 0) {
      this.stats.eventsPerSecond =
        (this.eventTimestamps.length / this.rateWindowMs) * 1000;
    } else {
      this.stats.eventsPerSecond = 0;
    }
  }

  /**
   * Track a changed row for highlighting
   * Requirements: 12.4
   * @param {string} key - Row key
   * @param {string} table - Table name
   */
  trackChangedRow(key, table) {
    const timestamp = Date.now();
    this.changedRows.set(key, {timestamp, table});

    // Schedule highlight removal
    setTimeout(() => {
      this.clearChangedRow(key, timestamp);
    }, this.highlightDurationMs);
  }

  /**
   * Clear a changed row highlight
   * @param {string} key - Row key
   * @param {number} originalTimestamp - Original change timestamp
   */
  clearChangedRow(key, originalTimestamp) {
    const entry = this.changedRows.get(key);
    // Only clear if this is the same change (not a newer one)
    if (entry && entry.timestamp === originalTimestamp) {
      this.changedRows.delete(key);

      if (this.eventBus) {
        this.eventBus.emit('cdc:highlightCleared', {
          key,
          table: entry.table,
        });
      }
    }
  }

  /**
   * Check if a row is currently highlighted as changed
   * @param {string} key - Row key
   * @return {boolean}
   */
  isRowChanged(key) {
    return this.changedRows.has(key);
  }

  /**
   * Get all currently changed rows
   * @return {Map<string, {timestamp: number, table: string}>}
   */
  getChangedRows() {
    return new Map(this.changedRows);
  }

  /**
   * Emit status update event
   * Requirements: 12.5
   */
  emitStatusUpdate() {
    if (this.eventBus) {
      this.eventBus.emit('cdc:status', {
        status: this.status,
        paused: this.paused,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Get current CDC stream status
   * @return {CDCStreamStatus}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get current CDC stream statistics
   * Requirements: 12.5
   * @return {CDCStreamStats}
   */
  getStats() {
    // Update rate before returning
    this.updateEventRate();

    return {
      ...this.stats,
      eventsPerSecond: Math.round(this.stats.eventsPerSecond * 100) / 100,
    };
  }

  /**
   * Check if CDC stream is paused
   * @return {boolean}
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Check if CDC stream is connected
   * @return {boolean}
   */
  isConnected() {
    return this.status === 'connected' && !this.paused;
  }

  /**
   * Pause CDC stream processing
   * Requirements: 12.6, 12.7
   */
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.status = 'paused';
      this.emitStatusUpdate();

      if (this.eventBus) {
        this.eventBus.emit('cdc:paused', {
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Resume CDC stream processing
   * Requirements: 12.6
   */
  resume() {
    if (this.paused) {
      this.paused = false;
      // Restore status based on connection state
      if (this.connectionManager && this.connectionManager.isConnected()) {
        this.status = 'connected';
      } else {
        this.status = 'disconnected';
      }
      this.emitStatusUpdate();

      if (this.eventBus) {
        this.eventBus.emit('cdc:resumed', {
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Toggle pause state
   * @return {boolean} New paused state
   */
  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.paused;
  }

  /**
   * Request a manual refresh (full cache dump)
   * Requirements: 12.8, 13.6
   * @return {boolean} Whether request was sent
   */
  requestRefresh() {
    if (!this.connectionManager) return false;

    const sent = this.connectionManager.requestCacheDump();

    if (sent && this.eventBus) {
      this.eventBus.emit('cdc:refreshRequested', {
        timestamp: Date.now(),
      });
    }

    return sent;
  }

  /**
   * Get status bar display information
   * Requirements: 12.5, 12.9
   * @return {Object} Status bar info
   */
  getStatusBarInfo() {
    const stats = this.getStats();

    let statusText;
    let statusColor;

    switch (this.status) {
    case 'connected':
      statusText = 'CDC: Connected';
      statusColor = 'green';
      break;
    case 'paused':
      statusText = 'CDC: Paused (stale)';
      statusColor = 'yellow';
      break;
    case 'disconnected':
      statusText = 'CDC: Disconnected';
      statusColor = 'red';
      break;
    case 'error':
      statusText = 'CDC: Error';
      statusColor = 'red';
      break;
    default:
      statusText = 'CDC: Unknown';
      statusColor = 'gray';
    }

    // Add rate info if connected
    if (this.status === 'connected') {
      statusText += ` | ${stats.eventsPerSecond.toFixed(1)} evt/s`;
    }

    // Add lag info if significant
    if (stats.lag > 1000) {
      statusText += ` | Lag: ${Math.round(stats.lag / 1000)}s`;
      if (stats.lag > 5000) {
        statusColor = 'yellow';
      }
    }

    // Add last update time
    if (stats.lastEventTime) {
      const secondsAgo = Math.round((Date.now() - stats.lastEventTime) / 1000);
      if (secondsAgo > 0) {
        statusText += ` | Last: ${secondsAgo}s ago`;
      }
    }

    return {
      text: statusText,
      color: statusColor,
      status: this.status,
      paused: this.paused,
      stats,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      eventsReceived: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      lag: 0,
    };
    this.eventTimestamps = [];
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.changedRows.clear();
    this.eventTimestamps = [];

    // Clear connection manager callbacks
    if (this.connectionManager) {
      this.connectionManager.onCacheDump = null;
      this.connectionManager.onCDCEvent = null;
    }

    if (this.eventBus) {
      this.eventBus.emit('cdc:destroyed', {});
    }
  }
}
